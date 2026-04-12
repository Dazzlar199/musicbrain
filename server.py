"""Music Brain — FastAPI backend."""

import json
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, HTMLResponse
from dotenv import load_dotenv

load_dotenv()

# Lazy imports — librosa/sklearn 없어도 서버 시작되게
def _lazy_import(module, name):
    try:
        mod = __import__(module, fromlist=[name])
        return getattr(mod, name)
    except ImportError:
        return None

try:
    from core.analyzer import extract_features
    from core.similarity import ReferenceDatabase, MARKETS
    from core.deep_analyzer import deep_analyze
    from core.gemini_analyst import analyze_market_fit
    from core.gemini_structured import analyze_structured
    from core.benchmark import benchmark_track, find_viral_segment, compare_ab
    from core.hit_analyzer import analyze_hit_potential, analyze_timing
except ImportError as e:
    import warnings
    warnings.warn(f"Some analysis modules unavailable: {e}")
    extract_features = None
    MARKETS = {"kr": "한국", "us": "미국", "jp": "일본", "br": "브라질",
               "latam": "라틴아메리카", "sea": "동남아시아", "europe": "유럽",
               "uk": "영국", "mena": "중동", "africa": "아프리카",
               "india": "인도", "china": "중화권"}
    class ReferenceDatabase:
        def stats(self): return {}
        def find_similar(self, *a, **kw): return []
        def market_scores(self, *a, **kw): return {}
        def score_method(self): return "unavailable"
    deep_analyze = None
    analyze_market_fit = None
    analyze_structured = None
    benchmark_track = None
    find_viral_segment = None
    compare_ab = None
    analyze_hit_potential = None
    analyze_timing = None

from core.gemini_listen import listen_and_analyze
from core.db.database import init_db
from core.api.artists import router as artists_router
from core.api.projects import router as projects_router
from core.api.campaigns import router as campaigns_router
from core.api.scouting import router as scouting_router
from core.api.trends import router as trends_router
from core.api.global_charts import router as charts_router
from core.api.track_stats import router as track_stats_router
from core.api.artist_crawler import router as crawler_router
from core.api.artist_search import router as search_router
from core.api.demos import router as demos_router
from core.api.alerts import router as alerts_router
from core.auth import router as auth_router
from core.api.rights import router as rights_router

app = FastAPI(title="Music Brain", version="0.2.0")

# Initialize database
init_db()

# Register API routers
app.include_router(artists_router)
app.include_router(projects_router)
app.include_router(campaigns_router)
app.include_router(scouting_router)
app.include_router(trends_router)
app.include_router(charts_router)
app.include_router(track_stats_router)
app.include_router(crawler_router)
app.include_router(search_router)
app.include_router(demos_router)
app.include_router(auth_router)
app.include_router(alerts_router)
app.include_router(rights_router)

# Serve static files
STATIC_DIR = Path(__file__).parent / "static"
STATIC_DIR.mkdir(exist_ok=True)
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

FRONTEND_DIST_DIR = Path(__file__).parent / "frontend" / "dist"
FRONTEND_ASSETS_DIR = FRONTEND_DIST_DIR / "assets"
if FRONTEND_ASSETS_DIR.exists():
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_ASSETS_DIR)), name="frontend-assets")

db = ReferenceDatabase()


def _has_frontend_build() -> bool:
    return (FRONTEND_DIST_DIR / "index.html").exists()


def _frontend_index_path() -> Path:
    if _has_frontend_build():
        return FRONTEND_DIST_DIR / "index.html"
    return STATIC_DIR / "index.html"


@app.get("/", response_class=HTMLResponse)
async def index():
    return _frontend_index_path().read_text(encoding="utf-8")


# Stats 캐시 (서버 시작 시 한 번만 계산)
_stats_cache = None

def _build_stats_cache():
    global _stats_cache
    import pickle
    from core.markets import MARKETS, MARKET_DISPLAY

    cache = {
        "markets_config": MARKET_DISPLAY,
        "all_markets": list(MARKETS.keys()),
        "spotify_db_tracks": 0,
        "chart_labeled_tracks": 0,
        "chart_countries": 72,
    }

    model_path = Path(__file__).parent / "data" / "models" / "spotify_classifier_v2.pkl"
    if model_path.exists():
        with open(model_path, "rb") as f:
            model_data = pickle.load(f)
        cache["spotify_db_tracks"] = model_data.get("total_tracks", 0)
        cache["chart_labeled_tracks"] = model_data.get("chart_tracks", 0)
        cache["classifier_markets"] = model_data.get("markets", [])

    _stats_cache = cache

_build_stats_cache()

# 차트 데이터 미리 로드 (첫 호출 9초 방지)
import threading
def _preload():
    try:
        from core.api.trends import _load_charts
        _load_charts()
    except Exception:
        pass
threading.Thread(target=_preload, daemon=True).start()


@app.get("/api/stats")
async def stats():
    s = db.stats()
    s.update(_stats_cache or {})
    return s


@app.post("/api/listen")
async def gemini_listen(
    file: UploadFile = File(...),
    market: str = Form("kr"),
    prompt: str = Form(""),
):
    """Gemini가 곡을 직접 듣고 분석. 메인 분석 엔드포인트."""
    audio_bytes = await file.read()
    result = listen_and_analyze(
        audio_bytes, market,
        user_prompt=prompt,
        audio_mime_type=file.content_type or "audio/mpeg",
    )
    return result


@app.post("/api/hit-analyze")
async def hit_analyze(
    file: UploadFile = File(...),
    market: str = Form("kr"),
):
    if not analyze_hit_potential:
        raise HTTPException(503, "분석 모듈 준비 중")
    audio_bytes = await file.read()
    result = analyze_hit_potential(audio_bytes, market)
    return result


@app.post("/api/hit-timing")
async def hit_timing(
    file: UploadFile = File(...),
    market: str = Form("kr"),
):
    if not analyze_timing:
        raise HTTPException(503, "분석 모듈 준비 중")
    audio_bytes = await file.read()
    result = analyze_timing(audio_bytes, market)
    return result


@app.get("/api/market-profiles")
async def market_profiles():
    """Return per-market audio feature statistics from the 2.8M track DB.

    Used for radar charts, bar comparisons, and market DNA visualization.
    """
    import pickle
    model_path = Path(__file__).parent / "data" / "models" / "spotify_classifier_v2.pkl"
    if not model_path.exists():
        return {"error": "Market model not built yet", "profiles": {}}

    with open(model_path, "rb") as f:
        data = pickle.load(f)

    return {
        "profiles": data.get("market_stats", {}),
        "total_tracks": data.get("total_tracks", 0),
        "chart_tracks": data.get("chart_tracks", 0),
        "markets": data.get("markets", []),
        "features": data.get("feature_names", []),
    }


@app.post("/api/analyze")
async def analyze(
    file: UploadFile = File(...),
    market: str = Form("kr"),
):
    if not extract_features:
        raise HTTPException(503, "오디오 분석 모듈 준비 중")
    if market not in MARKETS:
        raise HTTPException(400, f"Invalid market: {market}")

    audio_bytes = await file.read()
    size_mb = len(audio_bytes) / (1024 * 1024)
    if size_mb > 50:
        raise HTTPException(400, "File too large (max 50MB)")

    # 1. Extract features + deep analysis
    try:
        features = extract_features(audio_bytes=audio_bytes)
        deep = deep_analyze(audio_bytes=audio_bytes)
    except ValueError as e:
        raise HTTPException(400, str(e))

    # 2. Similarity search
    similar = db.find_similar(features, market, top_k=5)
    similar_data = [
        {
            "artist": info.artist,
            "title": info.title,
            "genre": info.genre,
            "market": info.market,
            "similarity": round(score, 3),
            "popularity": info.spotify_popularity,
            "album_art": info.album_art_url or "",
            "spotify_url": info.spotify_url or "",
        }
        for info, score in similar
    ]

    # 3. Market scores (all markets)
    market_scores = {
        code: round(score, 1)
        for code, score in db.market_scores(features).items()
    }

    # 4. Primary market score
    primary_score = market_scores.get(market, 0)

    return {
        "score": primary_score,
        "market": market,
        "market_name": MARKETS[market],
        "market_scores": market_scores,
        "similar_tracks": similar_data,
        "deep_analysis": deep,
        "summary": deep.get("summary", ""),
        "score_method": db.score_method(),
    }


@app.post("/api/gemini")
async def gemini_analysis(
    file: UploadFile = File(...),
    market: str = Form("kr"),
    analysis_json: str = Form("{}"),
    user_prompt: str = Form(""),
):
    if not extract_features:
        raise HTTPException(503, "분석 모듈 준비 중")
    audio_bytes = await file.read()
    deep = json.loads(analysis_json) if analysis_json != "{}" else None

    features = extract_features(audio_bytes=audio_bytes)
    market_scores_data = db.market_scores(features)
    similar = db.find_similar(features, market, top_k=5)

    # hit analyzer 데이터도 추가
    hit_data = analyze_hit_potential(audio_bytes, market)

    result = analyze_market_fit(
        audio_bytes,
        market,
        similar,
        deep_analysis=deep,
        market_scores=market_scores_data,
        audio_mime_type=file.content_type,
        user_prompt=user_prompt if user_prompt else None,
        hit_analysis=hit_data,
    )
    return {"analysis": result}


@app.post("/api/gemini/structured")
async def gemini_structured(
    file: UploadFile = File(...),
    market: str = Form("kr"),
    analysis_json: str = Form("{}"),
):
    """Returns structured JSON for SaaS card/widget rendering."""
    if not extract_features:
        raise HTTPException(503, "분석 모듈 준비 중")
    audio_bytes = await file.read()
    deep = json.loads(analysis_json) if analysis_json != "{}" else None

    features = extract_features(audio_bytes=audio_bytes)
    market_scores_data = db.market_scores(features)
    similar = db.find_similar(features, market, top_k=5)

    result = analyze_structured(
        audio_bytes,
        market,
        similar,
        deep_analysis=deep,
        market_scores=market_scores_data,
        audio_mime_type=file.content_type,
    )
    return result


@app.post("/api/benchmark")
async def run_benchmark(
    file: UploadFile = File(...),
    market: str = Form("kr"),
):
    if not benchmark_track:
        raise HTTPException(503, "벤치마크 모듈 준비 중")
    audio_bytes = await file.read()
    result = benchmark_track(audio_bytes, db, market)
    return result


@app.post("/api/viral")
async def run_viral(
    file: UploadFile = File(...),
):
    if not find_viral_segment:
        raise HTTPException(503, "바이럴 분석 모듈 준비 중")
    audio_bytes = await file.read()
    result = find_viral_segment(audio_bytes)
    return result


@app.post("/api/compare")
async def run_compare(
    file_a: UploadFile = File(...),
    file_b: UploadFile = File(...),
    market: str = Form("kr"),
):
    if not compare_ab:
        raise HTTPException(503, "비교 분석 모듈 준비 중")
    a_bytes = await file_a.read()
    b_bytes = await file_b.read()
    result = compare_ab(a_bytes, b_bytes, db, market)
    return result


@app.get("/{full_path:path}")
async def spa_fallback(full_path: str):
    if full_path.startswith("api/") or full_path.startswith("static/"):
        raise HTTPException(404, "Not found")

    if _has_frontend_build():
        asset_path = FRONTEND_DIST_DIR / full_path
        if full_path and asset_path.exists() and asset_path.is_file():
            return FileResponse(asset_path)
        return FileResponse(FRONTEND_DIST_DIR / "index.html")

    fallback_path = STATIC_DIR / full_path
    if full_path and fallback_path.exists() and fallback_path.is_file():
        return FileResponse(fallback_path)

    return HTMLResponse((STATIC_DIR / "index.html").read_text(encoding="utf-8"))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8502)

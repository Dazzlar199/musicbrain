"""글로벌 차트 API — 멜론, 벅스, Billboard, Spotify (차트 데이터 기반)."""

from pathlib import Path
from fastapi import APIRouter
from datetime import datetime
import pandas as pd

router = APIRouter(prefix="/api/charts", tags=["charts"])

_cache = {}
_cache_ttl = 300

KAGGLE_CHARTS = Path(__file__).parent.parent.parent / "data" / "kaggle" / "charts" / "universal_top_spotify_songs.csv"


def _is_fresh(key: str) -> bool:
    if key not in _cache:
        return False
    return (datetime.utcnow() - _cache[key]["ts"]).seconds < _cache_ttl


# ─── 한국 차트 (실시간) ───

@router.get("/melon")
def melon_chart(limit: int = 50):
    if _is_fresh("melon"):
        return _cache["melon"]["data"]
    try:
        from melon import ChartData
        chart = ChartData()
        entries = [{"rank": e.rank, "title": e.title, "artist": e.artist,
                    "image": getattr(e, "image", None)} for e in chart.entries[:limit]]
        result = {"platform": "멜론", "country": "KR", "entries": entries,
                  "count": len(entries), "updated": datetime.utcnow().isoformat(), "live": True}
        _cache["melon"] = {"data": result, "ts": datetime.utcnow()}
        return result
    except Exception as e:
        return {"platform": "멜론", "error": str(e), "entries": [], "live": False}


@router.get("/bugs")
def bugs_chart(limit: int = 50):
    if _is_fresh("bugs"):
        return _cache["bugs"]["data"]
    try:
        from bugs import ChartData
        chart = ChartData()
        entries = [{"rank": e.rank, "title": e.title, "artist": e.artist,
                    "image": getattr(e, "image", None)} for e in chart.entries[:limit]]
        result = {"platform": "벅스", "country": "KR", "entries": entries,
                  "count": len(entries), "updated": datetime.utcnow().isoformat(), "live": True}
        _cache["bugs"] = {"data": result, "ts": datetime.utcnow()}
        return result
    except Exception as e:
        return {"platform": "벅스", "error": str(e), "entries": [], "live": False}


# ─── Billboard (실시간) ───

@router.get("/billboard")
def billboard_chart(chart_name: str = "hot-100", limit: int = 50):
    cache_key = f"billboard_{chart_name}"
    if _is_fresh(cache_key):
        return _cache[cache_key]["data"]
    try:
        import billboard
        chart = billboard.ChartData(chart_name)
        entries = [{"rank": e.rank, "title": e.title, "artist": e.artist,
                    "weeks": e.weeks, "peak": e.peakPos, "last_week": e.lastPos,
                    "image": getattr(e, "image", None)} for e in chart.entries[:limit]]
        result = {"platform": f"Billboard {chart_name}", "country": "US", "entries": entries,
                  "count": len(entries), "updated": datetime.utcnow().isoformat(), "live": True}
        _cache[cache_key] = {"data": result, "ts": datetime.utcnow()}
        return result
    except Exception as e:
        return {"platform": f"Billboard {chart_name}", "error": str(e), "entries": [], "live": False}


# ─── Spotify 차트 (Kaggle 데이터 기반) ───

@router.get("/spotify/{country}")
def spotify_chart(country: str = "KR", limit: int = 50):
    """Spotify 차트 — 72개국 차트 데이터에서 최신 스냅샷."""
    cache_key = f"spotify_{country}"
    if _is_fresh(cache_key):
        return _cache[cache_key]["data"]

    if not KAGGLE_CHARTS.exists():
        return {"platform": f"Spotify {country}", "error": "차트 데이터 없음", "entries": []}

    try:
        df = pd.read_csv(KAGGLE_CHARTS, low_memory=False)
        cdf = df[df["country"] == country.upper()]

        if cdf.empty:
            return {"platform": f"Spotify {country}", "error": f"{country} 데이터 없음", "entries": []}

        # 가장 최근 날짜
        latest = cdf["snapshot_date"].max()
        latest_df = cdf[cdf["snapshot_date"] == latest].sort_values("daily_rank").head(limit)

        entries = []
        for _, row in latest_df.iterrows():
            entries.append({
                "rank": int(row["daily_rank"]),
                "title": row["name"],
                "artist": row["artists"],
                "popularity": int(row.get("popularity", 0)),
                "danceability": round(float(row.get("danceability", 0)), 3),
                "energy": round(float(row.get("energy", 0)), 3),
                "valence": round(float(row.get("valence", 0)), 3),
                "tempo": round(float(row.get("tempo", 0)), 1),
            })

        result = {"platform": f"Spotify {country}", "country": country.upper(),
                  "snapshot_date": latest, "entries": entries,
                  "count": len(entries), "live": False}
        _cache[cache_key] = {"data": result, "ts": datetime.utcnow()}
        return result
    except Exception as e:
        return {"platform": f"Spotify {country}", "error": str(e), "entries": []}


# ─── Spotify 실시간 (스크래퍼) ───

SPOTIFY_PLAYLISTS = {
    "KR": ("37i9dQZEVXbNxXF4SkHj9F", "Top 50 한국"),
    "US": ("37i9dQZEVXbLRQDuF5jeBp", "Top 50 미국"),
    "JP": ("37i9dQZEVXbKXQ4mDTEBXq", "Top 50 일본"),
    "BR": ("37i9dQZEVXbMXbN3EUUhlg", "Top 50 브라질"),
    "DE": ("37i9dQZEVXbJiZcmkrIHGU", "Top 50 독일"),
    "GB": ("37i9dQZEVXbLnolsZ8PSNw", "Top 50 영국"),
    "FR": ("37i9dQZEVXbIPWwFssbupI", "Top 50 프랑스"),
    "MX": ("37i9dQZEVXbO3qyFxbkOE1", "Top 50 멕시코"),
    "IN": ("37i9dQZEVXbLZ52XmnySJg", "Top 50 인도"),
    "ID": ("37i9dQZEVXbObFQZ3JLcXt", "Top 50 인도네시아"),
    "TH": ("37i9dQZEVXbMnz8KIWsvf9", "Top 50 태국"),
    "PH": ("37i9dQZEVXbNBz9cRCSFkY", "Top 50 필리핀"),
    "NG": ("37i9dQZEVXbKY7jLzlJ11V", "Top 50 나이지리아"),
    "ZA": ("37i9dQZEVXbMH2jvi6jvjk", "Top 50 남아프리카"),
    "SA": ("37i9dQZEVXbLrUBMpSUMeB", "Top 50 사우디"),
    "TR": ("37i9dQZEVXbIVYVBNw9D5K", "Top 50 터키"),
    "TW": ("37i9dQZEVXbMnZEatlMSiu", "Top 50 대만"),
    "Global": ("37i9dQZEVXbMDoHDwVN2tF", "Top 50 글로벌"),
}


@router.get("/spotify-live/{country}")
def spotify_live(country: str = "KR", limit: int = 50):
    """Spotify Top 50 실시간 — API 키 없이 직접 수집."""
    country = country.upper()
    cache_key = f"spotify_live_{country}"
    if _is_fresh(cache_key):
        return _cache[cache_key]["data"]

    if country not in SPOTIFY_PLAYLISTS:
        return {"error": f"{country} 차트 미지원. 지원 국가: {list(SPOTIFY_PLAYLISTS.keys())}"}

    pid, label = SPOTIFY_PLAYLISTS[country]

    try:
        from spotify_scraper import SpotifyClient
        client = SpotifyClient()
        r = client.get_playlist_info(f"https://open.spotify.com/playlist/{pid}")

        entries = []
        for i, t in enumerate(r.get("tracks", [])[:limit]):
            artist = t.get("artist", "")
            if isinstance(artist, list):
                artist = artist[0].get("name", "") if artist else ""
            entries.append({
                "rank": i + 1,
                "title": t.get("name", ""),
                "artist": artist,
                "duration_ms": t.get("duration_ms"),
                "image": t.get("cover_url") or t.get("image"),
            })

        result = {
            "platform": f"Spotify {label}", "country": country,
            "entries": entries, "count": len(entries),
            "updated": datetime.utcnow().isoformat(), "live": True,
        }
        _cache[cache_key] = {"data": result, "ts": datetime.utcnow()}
        return result
    except Exception as e:
        return {"platform": f"Spotify {label}", "error": str(e), "entries": [], "live": False}


@router.get("/spotify-live-countries")
def spotify_live_countries():
    """Spotify 실시간 차트 지원 국가 목록."""
    return {"countries": {k: v[1] for k, v in SPOTIFY_PLAYLISTS.items()}}


# ─── 통합 ───

@router.get("/overview")
def charts_overview():
    """사용 가능한 차트 목록."""
    charts = [
        {"id": "melon", "name": "멜론", "country": "KR", "type": "realtime", "endpoint": "/api/charts/melon"},
        {"id": "bugs", "name": "벅스", "country": "KR", "type": "realtime", "endpoint": "/api/charts/bugs"},
        {"id": "billboard", "name": "Billboard Hot 100", "country": "US", "type": "realtime", "endpoint": "/api/charts/billboard"},
        {"id": "spotify_kr", "name": "Spotify 한국", "country": "KR", "type": "snapshot", "endpoint": "/api/charts/spotify/KR"},
        {"id": "spotify_us", "name": "Spotify 미국", "country": "US", "type": "snapshot", "endpoint": "/api/charts/spotify/US"},
        {"id": "spotify_jp", "name": "Spotify 일본", "country": "JP", "type": "snapshot", "endpoint": "/api/charts/spotify/JP"},
        {"id": "spotify_br", "name": "Spotify 브라질", "country": "BR", "type": "snapshot", "endpoint": "/api/charts/spotify/BR"},
    ]
    # 72개국 Spotify 차트 추가
    if KAGGLE_CHARTS.exists():
        try:
            df = pd.read_csv(KAGGLE_CHARTS, usecols=["country"], low_memory=False)
            countries = sorted(df["country"].unique())
            charts.append({
                "id": "spotify_all", "name": "Spotify 72개국",
                "countries": countries, "type": "snapshot",
            })
        except Exception:
            pass

    return {"charts": charts}

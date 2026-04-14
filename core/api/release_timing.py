"""릴리스 타이밍 옵티마이저 — 최적 발매일 추천.

경쟁 밀도 분석 + 시즌 패턴 + 현재 차트 상황을 종합해서
"언제 내면 좋은지" 데이터 기반 추천.
"""

import os
import json
from datetime import datetime, timedelta
from fastapi import APIRouter

router = APIRouter(prefix="/api/release-timing", tags=["release-timing"])

_cache = {}
_cache_ttl = 3600  # 1시간


def _is_fresh(key: str) -> bool:
    if key not in _cache:
        return False
    return (datetime.utcnow() - _cache[key]["ts"]).seconds < _cache_ttl


def _get_upcoming_releases() -> list[dict]:
    """Spotify New Music Friday에서 최근 릴리스 트렌드 파악."""
    try:
        from spotify_scraper import SpotifyClient
        client = SpotifyClient()

        # New Music Friday 글로벌 + 한국
        playlists = {
            "37i9dQZF1DX4JAvHpjipBk": "New Music Friday (Global)",
            "37i9dQZF1DX5KpP2LN299J": "K-Pop ON!",
        }

        releases = []
        for pid, pname in playlists.items():
            try:
                info = client.get_playlist_info(f"https://open.spotify.com/playlist/{pid}")
                for t in info.get("tracks", [])[:30]:
                    artist = t.get("artist", "")
                    if isinstance(artist, list):
                        artist = ", ".join(a.get("name", "") for a in artist) if artist else ""
                    releases.append({
                        "title": t.get("name", ""),
                        "artist": artist,
                        "playlist": pname,
                    })
            except Exception:
                continue

        return releases
    except Exception:
        return []


def _analyze_timing(market: str, genre: str) -> dict:
    """Gemini로 릴리스 타이밍 분석."""
    try:
        from google import genai
        from google.genai import types

        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            return {}

        # 현재 릴리스 목록
        releases = _get_upcoming_releases()
        release_context = ""
        if releases:
            release_lines = [f"- {r['artist']} — {r['title']} ({r['playlist']})" for r in releases[:20]]
            release_context = f"현재 주요 신곡:\n" + "\n".join(release_lines)

        market_names = {
            "kr": "한국", "us": "미국", "jp": "일본", "br": "브라질",
            "sea": "동남아시아", "europe": "유럽", "global": "글로벌",
        }
        market_name = market_names.get(market, market)
        today = datetime.utcnow().strftime("%Y-%m-%d")

        client = genai.Client(api_key=api_key)
        r = client.models.generate_content(
            model="gemini-3-flash-preview",
            contents=f"""오늘은 {today}이야. {market_name} 시장에 {genre or 'K-pop'} 곡을 발매하려고 해.

{release_context}

아래 JSON으로 향후 8주간의 릴리스 타이밍을 분석해줘. 마크다운 쓰지 마.

{{
  "summary": "지금 발매 상황 요약. 2-3문장.",
  "best_window": "가장 좋은 발매 시점과 이유. 2문장.",
  "weeks": [
    {{
      "week_start": "2026-04-13",
      "competition_score": 7,
      "label": "경쟁 높음",
      "reason": "왜 이 주간이 이 점수인지. 1문장.",
      "major_releases": ["아티스트명 — 곡명"]
    }}
  ],
  "tips": [
    "발매 전략 팁 1",
    "발매 전략 팁 2",
    "발매 전략 팁 3"
  ]
}}

규칙:
- weeks는 오늘부터 8주. 각 주 월요일 기준.
- competition_score: 1(경쟁 거의 없음) ~ 10(매우 치열)
- 실제 K-pop 컴백 스케줄, 글로벌 시상식, 연말 시즌 등 고려
- major_releases: 이미 발표되었거나 예상되는 주요 릴리스
- JSON만 출력""",
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                thinking_config=types.ThinkingConfig(thinking_level="medium"),
            ),
        )

        return json.loads(r.text.strip())
    except Exception as e:
        return {"error": str(e)}


@router.get("/analyze")
def analyze_release_timing(market: str = "kr", genre: str = ""):
    """릴리스 타이밍 분석 — 향후 8주 경쟁 밀도."""
    cache_key = f"timing_{market}_{genre}"
    if _is_fresh(cache_key):
        return _cache[cache_key]["data"]

    result = _analyze_timing(market, genre)
    result["market"] = market
    result["genre"] = genre or "K-pop"
    result["updated"] = datetime.utcnow().isoformat()

    _cache[cache_key] = {"data": result, "ts": datetime.utcnow()}
    return result


@router.get("/current-releases")
def current_releases():
    """현재 주요 플레이리스트의 신곡 목록."""
    cache_key = "current_releases"
    if _is_fresh(cache_key):
        return _cache[cache_key]["data"]

    releases = _get_upcoming_releases()
    result = {"releases": releases, "count": len(releases), "updated": datetime.utcnow().isoformat()}
    _cache[cache_key] = {"data": result, "ts": datetime.utcnow()}
    return result

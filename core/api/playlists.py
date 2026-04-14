"""플레이리스트 생태계 트래커 — Spotify 플레이리스트 모니터링.

아티스트가 어떤 플레이리스트에 있는지 추적, 경쟁사 비교, 변동 알림.
Chartmetric이 연 190만원 받는 기능의 핵심.
"""

import json
from pathlib import Path
from datetime import datetime
from fastapi import APIRouter

router = APIRouter(prefix="/api/playlists", tags=["playlists"])

_cache = {}
_cache_ttl = 1800  # 30분

DATA_DIR = Path(__file__).parent.parent.parent / "data"
PLAYLIST_HISTORY_FILE = DATA_DIR / "playlist_history.json"

# 주요 Spotify 에디토리얼 플레이리스트 — K-pop + 글로벌
TRACKED_PLAYLISTS = {
    # K-pop
    "37i9dQZF1DX9tPFwDMOaN1": {"name": "K-Pop Daebak", "market": "KR", "type": "editorial"},
    "37i9dQZF1DXe5W6diBL5N4": {"name": "K-Pop Rising", "market": "KR", "type": "editorial"},
    "37i9dQZF1DX4FcAKI5Nhzq": {"name": "K-Pop Hits", "market": "KR", "type": "editorial"},
    "37i9dQZF1DWUgX5cUT0GbU": {"name": "K-Pop X-Over", "market": "KR", "type": "editorial"},
    "37i9dQZF1DX5KpP2LN299J": {"name": "K-Pop ON!", "market": "KR", "type": "editorial"},
    # Top 50 주요국
    "37i9dQZEVXbNxXF4SkHj9F": {"name": "Top 50 한국", "market": "KR", "type": "chart"},
    "37i9dQZEVXbLRQDuF5jeBp": {"name": "Top 50 미국", "market": "US", "type": "chart"},
    "37i9dQZEVXbKXQ4mDTEBXq": {"name": "Top 50 일본", "market": "JP", "type": "chart"},
    "37i9dQZEVXbMDoHDwVN2tF": {"name": "Top 50 글로벌", "market": "Global", "type": "chart"},
    # 글로벌 에디토리얼
    "37i9dQZF1DXcBWIGoYBM5M": {"name": "Today's Top Hits", "market": "Global", "type": "editorial"},
    "37i9dQZF1DX0XUsuxWHRQd": {"name": "RapCaviar", "market": "US", "type": "editorial"},
    "37i9dQZF1DX10zKzsJ2jva": {"name": "Viva Latino", "market": "LATAM", "type": "editorial"},
    "37i9dQZF1DWXRqgorJj26U": {"name": "Pop Rising", "market": "Global", "type": "editorial"},
    "37i9dQZF1DX4SBhb3fqCJd": {"name": "Are & Be", "market": "US", "type": "editorial"},
    "37i9dQZF1DX7gIoKXt0gmx": {"name": "Songs to Sing in the Car", "market": "Global", "type": "editorial"},
    "37i9dQZF1DX4JAvHpjipBk": {"name": "New Music Friday", "market": "Global", "type": "editorial"},
    "37i9dQZF1DX5Ejj0EkURtP": {"name": "All Out 2020s", "market": "Global", "type": "editorial"},
    # 아시아
    "37i9dQZF1DX1UNayylTMOT": {"name": "Hot Hits Japan", "market": "JP", "type": "editorial"},
    "37i9dQZF1DX18jTM2l2fJY": {"name": "Pop Hits Asia", "market": "SEA", "type": "editorial"},
}


def _is_fresh(key: str) -> bool:
    if key not in _cache:
        return False
    return (datetime.utcnow() - _cache[key]["ts"]).seconds < _cache_ttl


def _load_history() -> dict:
    if PLAYLIST_HISTORY_FILE.exists():
        return json.loads(PLAYLIST_HISTORY_FILE.read_text())
    return {}


def _save_history(data: dict):
    PLAYLIST_HISTORY_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2))


def _fetch_playlist_tracks(playlist_id: str) -> list[dict]:
    """Spotify 플레이리스트 트랙 목록 가져오기."""
    try:
        from spotify_scraper import SpotifyClient
        client = SpotifyClient()
        info = client.get_playlist_info(f"https://open.spotify.com/playlist/{playlist_id}")
        tracks = []
        for i, t in enumerate(info.get("tracks", [])):
            artist = t.get("artist", "")
            if isinstance(artist, list):
                artist = ", ".join(a.get("name", "") for a in artist) if artist else ""
            tracks.append({
                "position": i + 1,
                "title": t.get("name", ""),
                "artist": artist,
                "duration_ms": t.get("duration_ms"),
            })
        return tracks
    except Exception:
        return []


@router.get("/tracked")
def list_tracked_playlists():
    """추적 중인 플레이리스트 목록."""
    return {
        "playlists": [
            {"id": pid, **info}
            for pid, info in TRACKED_PLAYLISTS.items()
        ],
        "count": len(TRACKED_PLAYLISTS),
    }


@router.get("/scan/{artist_name}")
def scan_artist_placements(artist_name: str):
    """아티스트가 어떤 플레이리스트에 있는지 스캔."""
    cache_key = f"playlist_scan_{artist_name}"
    if _is_fresh(cache_key):
        return _cache[cache_key]["data"]

    placements = []
    scanned = 0
    artist_lower = artist_name.lower()

    for pid, pinfo in TRACKED_PLAYLISTS.items():
        tracks = _fetch_playlist_tracks(pid)
        scanned += 1
        for t in tracks:
            if artist_lower in t["artist"].lower():
                placements.append({
                    "playlist_id": pid,
                    "playlist_name": pinfo["name"],
                    "market": pinfo["market"],
                    "type": pinfo["type"],
                    "position": t["position"],
                    "track": t["title"],
                    "total_tracks": len(tracks),
                })

    # 히스토리 저장
    history = _load_history()
    today = datetime.utcnow().strftime("%Y-%m-%d")
    if artist_name not in history:
        history[artist_name] = {}
    history[artist_name][today] = {
        "count": len(placements),
        "playlists": [p["playlist_name"] for p in placements],
    }
    _save_history(history)

    result = {
        "artist": artist_name,
        "placements": placements,
        "count": len(placements),
        "scanned_playlists": scanned,
        "updated": datetime.utcnow().isoformat(),
    }

    _cache[cache_key] = {"data": result, "ts": datetime.utcnow()}
    return result


@router.get("/compare")
def compare_playlist_presence(artists: str):
    """아티스트 플레이리스트 비교. ?artists=BTS,NewJeans,aespa"""
    names = [a.strip() for a in artists.split(",") if a.strip()][:5]
    if not names:
        return {"error": "artists 파라미터 필요. 예: ?artists=BTS,NewJeans,aespa"}

    results = []
    for name in names:
        cache_key = f"playlist_scan_{name}"
        if _is_fresh(cache_key):
            data = _cache[cache_key]["data"]
        else:
            data = scan_artist_placements(name)

        results.append({
            "artist": name,
            "count": data["count"],
            "playlists": [p["playlist_name"] for p in data["placements"]],
            "editorial": len([p for p in data["placements"] if p["type"] == "editorial"]),
            "chart": len([p for p in data["placements"] if p["type"] == "chart"]),
        })

    # Gap 분석 — 첫 번째 아티스트가 없는데 다른 아티스트가 있는 플레이리스트
    if len(results) >= 2:
        my_playlists = set(results[0]["playlists"])
        gaps = []
        for other in results[1:]:
            for pl in other["playlists"]:
                if pl not in my_playlists and pl not in [g["playlist"] for g in gaps]:
                    gaps.append({"playlist": pl, "artist_on_it": other["artist"]})
        results[0]["gaps"] = gaps

    return {"comparison": results}


@router.get("/history/{artist_name}")
def playlist_history(artist_name: str):
    """아티스트의 플레이리스트 배치 히스토리."""
    history = _load_history()
    artist_data = history.get(artist_name, {})
    points = [
        {"date": date, "count": data["count"], "playlists": data["playlists"]}
        for date, data in sorted(artist_data.items())
    ]
    return {"artist": artist_name, "history": points}

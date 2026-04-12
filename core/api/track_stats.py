"""트랙 스트리밍/조회수 조회 API.

YouTube 조회수: HTML 파싱 (무료, API 키 불필요)
Spotify 재생수: embed 페이지 파싱 시도
플랫폼 링크 생성: 곡명+아티스트로 검색 URL 생성
"""

import re
from fastapi import APIRouter
from datetime import datetime

router = APIRouter(prefix="/api/track-stats", tags=["track-stats"])

_cache = {}
_cache_ttl = 600  # 10분


def _is_fresh(key: str) -> bool:
    if key not in _cache:
        return False
    return (datetime.utcnow() - _cache[key]["ts"]).seconds < _cache_ttl


@router.get("/youtube-views")
def youtube_views(video_id: str):
    """YouTube 동영상 조회수 (API 키 없이)."""
    cache_key = f"yt_{video_id}"
    if _is_fresh(cache_key):
        return _cache[cache_key]["data"]

    try:
        import httpx
        url = f"https://www.youtube.com/watch?v={video_id}"
        headers = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"}
        r = httpx.get(url, headers=headers, follow_redirects=True, timeout=10)

        views = None
        match = re.search(r'"viewCount":"(\d+)"', r.text)
        if match:
            views = int(match.group(1))

        title = None
        title_match = re.search(r'"title":"([^"]+)"', r.text)
        if title_match:
            title = title_match.group(1)

        result = {"video_id": video_id, "views": views, "title": title,
                  "formatted": f"{views:,}" if views else None}
        _cache[cache_key] = {"data": result, "ts": datetime.utcnow()}
        return result
    except Exception as e:
        return {"video_id": video_id, "error": str(e)}


@router.get("/youtube-search")
def youtube_search_views(query: str):
    """곡명+아티스트로 YouTube 검색 → 첫 번째 결과의 조회수."""
    cache_key = f"yts_{query}"
    if _is_fresh(cache_key):
        return _cache[cache_key]["data"]

    try:
        import httpx
        search_url = f"https://www.youtube.com/results?search_query={query.replace(' ', '+')}"
        headers = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"}
        r = httpx.get(search_url, headers=headers, follow_redirects=True, timeout=10)

        # 첫 번째 비디오 ID 추출
        vid_match = re.search(r'"videoId":"([a-zA-Z0-9_-]{11})"', r.text)
        if not vid_match:
            return {"query": query, "error": "검색 결과 없음"}

        video_id = vid_match.group(1)

        # 해당 비디오 조회수
        vid_url = f"https://www.youtube.com/watch?v={video_id}"
        r2 = httpx.get(vid_url, headers=headers, follow_redirects=True, timeout=10)

        views = None
        match = re.search(r'"viewCount":"(\d+)"', r2.text)
        if match:
            views = int(match.group(1))

        title = None
        title_match = re.search(r'"title":"([^"]+)"', r2.text)
        if title_match:
            title = title_match.group(1)

        result = {
            "query": query, "video_id": video_id, "views": views,
            "formatted": f"{views:,}" if views else None,
            "title": title,
            "url": f"https://www.youtube.com/watch?v={video_id}",
        }
        _cache[cache_key] = {"data": result, "ts": datetime.utcnow()}
        return result
    except Exception as e:
        return {"query": query, "error": str(e)}


@router.get("/links")
def platform_links(artist: str, title: str):
    """곡의 각 플랫폼 직접 링크. 검색이 아니라 실제 곡 페이지로 연결."""
    q = f"{artist} {title}"
    q_enc = q.replace(" ", "%20")
    q_plus = q.replace(" ", "+")

    cache_key = f"links_{q}"
    if _is_fresh(cache_key):
        return _cache[cache_key]["data"]

    links = {}

    # 1. YouTube — 직접 영상 URL
    try:
        import httpx
        headers = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"}
        r = httpx.get(f"https://www.youtube.com/results?search_query={q_plus}+official+MV", headers=headers, follow_redirects=True, timeout=8)
        vid_match = re.search(r'"videoId":"([a-zA-Z0-9_-]{11})"', r.text)
        if vid_match:
            links["youtube"] = f"https://www.youtube.com/watch?v={vid_match.group(1)}"
            links["youtube_music"] = f"https://music.youtube.com/watch?v={vid_match.group(1)}"
    except Exception:
        pass
    if "youtube" not in links:
        links["youtube"] = f"https://www.youtube.com/results?search_query={q_plus}+official"
        links["youtube_music"] = f"https://music.youtube.com/search?q={q_enc}"

    # 2. Spotify — 직접 트랙 URL
    try:
        from spotify_scraper import SpotifyClient
        client = SpotifyClient()
        search_result = client.get_track_info(f"https://open.spotify.com/search/{q_enc}")
        if search_result and search_result.get("url"):
            links["spotify"] = search_result["url"]
    except Exception:
        pass
    if "spotify" not in links:
        # 검색 URL로 fallback (Spotify 검색에서 바로 재생 가능)
        links["spotify"] = f"https://open.spotify.com/search/{q_enc}"

    # 3. 한국 플랫폼 — 검색 URL (직접 링크 API 없음)
    links["melon"] = f"https://www.melon.com/search/total/index.htm?q={q_enc}"
    links["genie"] = f"https://www.genie.co.kr/search/searchMain?query={q_enc}"
    links["bugs"] = f"https://music.bugs.co.kr/search/integrated?q={q_enc}"
    links["apple_music"] = f"https://music.apple.com/search?term={q_enc}"

    result = {"artist": artist, "title": title, "links": links}
    _cache[cache_key] = {"data": result, "ts": datetime.utcnow()}
    return result


@router.get("/bulk-views")
def bulk_youtube_views(queries: str):
    """여러 곡의 YouTube 조회수를 한번에 조회. 쉼표로 구분."""
    items = [q.strip() for q in queries.split(",") if q.strip()]
    results = []
    for q in items[:10]:  # 최대 10곡
        result = youtube_search_views(q)
        results.append(result)
    return {"results": results, "count": len(results)}

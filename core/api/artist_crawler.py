"""아티스트 정보 크롤링 API.

YouTube 채널 정보, Spotify 아티스트 정보, 네이버 뉴스를 수집.
Instagram/Twitter는 봇 차단이 심해서 제외.
"""

import re
from fastapi import APIRouter
from datetime import datetime

router = APIRouter(prefix="/api/crawl", tags=["crawler"])

_cache = {}
_cache_ttl = 1800  # 30분


def _is_fresh(key: str) -> bool:
    if key not in _cache:
        return False
    return (datetime.utcnow() - _cache[key]["ts"]).seconds < _cache_ttl


@router.get("/youtube-channel")
def youtube_channel(channel_name: str):
    """YouTube 채널 정보 — 구독자 수, 영상 수, 총 조회수."""
    cache_key = f"ytch_{channel_name}"
    if _is_fresh(cache_key):
        return _cache[cache_key]["data"]

    try:
        import httpx
        headers = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
                   "Accept-Language": "ko-KR,ko;q=0.9"}

        # @handle로 검색
        url = f"https://www.youtube.com/@{channel_name}"
        r = httpx.get(url, headers=headers, follow_redirects=True, timeout=10)

        subs = None
        match = re.search(r'"subscriberCountText":\{"simpleText":"([^"]+)"', r.text)
        if match:
            subs = match.group(1)

        # 영상 수
        videos = None
        vid_match = re.search(r'"videosCountText":\{"runs":\[\{"text":"([^"]+)"', r.text)
        if vid_match:
            videos = vid_match.group(1)

        # 설명
        desc = None
        desc_match = re.search(r'"description":"([^"]{0,500})"', r.text)
        if desc_match:
            desc = desc_match.group(1).encode().decode('unicode_escape', errors='ignore')

        # 프로필 이미지
        avatar = None
        avatar_match = re.search(r'"avatar":\{"thumbnails":\[\{"url":"([^"]+)"', r.text)
        if avatar_match:
            avatar = avatar_match.group(1)

        result = {
            "channel": channel_name,
            "subscribers": subs,
            "videos": videos,
            "description": desc[:200] if desc else None,
            "avatar": avatar,
            "url": url,
        }
        _cache[cache_key] = {"data": result, "ts": datetime.utcnow()}
        return result
    except Exception as e:
        return {"channel": channel_name, "error": str(e)}


@router.get("/spotify-artist")
def spotify_artist(artist_name: str):
    """Spotify 아티스트 정보 — 월간 리스너, 장르, 인기곡."""
    cache_key = f"spart_{artist_name}"
    if _is_fresh(cache_key):
        return _cache[cache_key]["data"]

    try:
        from spotify_scraper import SpotifyClient
        client = SpotifyClient()

        # 아티스트 검색
        info = client.get_artist_info(f"https://open.spotify.com/search/{artist_name}")
        if not info:
            # 직접 검색 URL로 시도
            import httpx
            headers = {"User-Agent": "Mozilla/5.0"}
            r = httpx.get(f"https://open.spotify.com/search/{artist_name.replace(' ', '%20')}/artists",
                         headers=headers, follow_redirects=True, timeout=10)
            # Spotify ID 추출
            artist_match = re.search(r'/artist/([a-zA-Z0-9]+)', r.text)
            if artist_match:
                artist_id = artist_match.group(1)
                info = client.get_artist_info(f"https://open.spotify.com/artist/{artist_id}")

        if info:
            result = {
                "name": info.get("name", artist_name),
                "monthly_listeners": info.get("monthly_listeners") or info.get("monthlyListeners"),
                "followers": info.get("followers"),
                "genres": info.get("genres", []),
                "top_tracks": info.get("top_tracks", [])[:5],
                "image": info.get("image") or info.get("avatar"),
                "url": info.get("url", ""),
            }
        else:
            result = {"name": artist_name, "error": "정보를 찾을 수 없음"}

        _cache[cache_key] = {"data": result, "ts": datetime.utcnow()}
        return result
    except Exception as e:
        return {"name": artist_name, "error": str(e)}


@router.get("/naver-news")
def naver_news(query: str, count: int = 10):
    """네이버 뉴스 검색 — 공식 API 사용."""
    cache_key = f"news_{query}"
    if _is_fresh(cache_key):
        return _cache[cache_key]["data"]

    import os
    client_id = os.getenv("NAVER_CLIENT_ID")
    client_secret = os.getenv("NAVER_CLIENT_SECRET")

    try:
        import httpx

        if client_id and client_secret:
            # 네이버 공식 검색 API
            headers = {
                "X-Naver-Client-Id": client_id,
                "X-Naver-Client-Secret": client_secret,
            }
            url = f"https://openapi.naver.com/v1/search/news.json?query={query}&display={count}&sort=date"
            r = httpx.get(url, headers=headers, timeout=10)
            data = r.json()

            articles = []
            for item in data.get("items", []):
                # HTML 태그 제거
                title = re.sub(r"<[^>]+>", "", item.get("title", ""))
                desc = re.sub(r"<[^>]+>", "", item.get("description", ""))

                articles.append({
                    "title": title,
                    "link": item.get("originallink") or item.get("link", ""),
                    "source": item.get("source", ""),
                    "date": item.get("pubDate", ""),
                    "description": desc[:200],
                })
        else:
            # API 키 없으면 웹 스크래핑 fallback
            from bs4 import BeautifulSoup
            headers = {"User-Agent": "Mozilla/5.0", "Accept-Language": "ko-KR,ko;q=0.9"}
            url = f"https://search.naver.com/search.naver?where=news&query={query.replace(' ', '+')}&sort=1"
            r = httpx.get(url, headers=headers, follow_redirects=True, timeout=10)
            soup = BeautifulSoup(r.text, "html.parser")

            articles = []
            for item in soup.select("div.news_area")[:count]:
                title_el = item.select_one("a.news_tit")
                if not title_el:
                    continue
                articles.append({
                    "title": title_el.get_text(strip=True),
                    "link": title_el.get("href", ""),
                    "source": "",
                    "date": "",
                    "description": "",
                })

        result = {"query": query, "articles": articles, "count": len(articles),
                  "updated": datetime.utcnow().isoformat()}
        _cache[cache_key] = {"data": result, "ts": datetime.utcnow()}
        return result
    except Exception as e:
        return {"query": query, "error": str(e), "articles": []}


@router.get("/artist-profile")
def full_artist_profile(name: str):
    """아티스트 종합 프로필 — YouTube + Spotify + 뉴스를 한번에."""
    yt = youtube_channel(name)
    sp = spotify_artist(name)
    news = naver_news(name, count=5)

    return {
        "name": name,
        "youtube": yt,
        "spotify": sp,
        "news": news.get("articles", []),
        "updated": datetime.utcnow().isoformat(),
    }

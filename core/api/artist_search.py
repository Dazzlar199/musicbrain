"""아티스트 검색 API — Gemini + Spotify 이미지."""

import os
from fastapi import APIRouter
from datetime import datetime
from core.api.cache import SimpleCache

router = APIRouter(prefix="/api/search", tags=["search"])

_cache = SimpleCache(ttl=3600)


def _gemini_search(query: str, limit: int = 6) -> list[dict]:
    """Gemini에게 아티스트 검색 요청. Spotify ID 포함."""
    try:
        from google import genai
        from google.genai import types
        import json

        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            return []

        client = genai.Client(api_key=api_key)
        r = client.models.generate_content(
            model="gemini-3-flash-preview",
            contents=f""""{query}"로 검색했을 때 매칭되는 음악 아티스트를 최대 {limit}명 찾아줘.

JSON 배열로만 답해. 마크다운 쓰지 마.
[
  {{"name": "가장 널리 알려진 아티스트명 (영어)", "local_name": "현지 이름 (한글이면 한글)", "genre": "주요 장르"}}
]

규칙:
- 가장 유명하고 관련도 높은 아티스트부터 정렬
- JSON만 출력""",
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
            ),
        )

        text = r.text.strip()
        data = json.loads(text)
        if isinstance(data, list):
            return data[:limit]
        return []
    except Exception:
        return []


def _fetch_wikipedia_image(name: str) -> str | None:
    """Wikipedia에서 아티스트 이미지 가져오기. 가장 안정적."""
    try:
        import httpx
        # 영어 위키 먼저
        for wiki_name in [name, name.replace(" ", "_")]:
            r = httpx.get(
                f"https://en.wikipedia.org/api/rest_v1/page/summary/{wiki_name}",
                headers={"User-Agent": "MusicBrain/0.2"},
                timeout=8, follow_redirects=True,
            )
            if r.status_code == 200:
                data = r.json()
                thumb = data.get("thumbnail", {}).get("source")
                if thumb:
                    # 더 큰 이미지로 변환 (330px → 500px)
                    return thumb.replace("/330px-", "/500px-")
        # 한국어 위키도 시도
        r = httpx.get(
            f"https://ko.wikipedia.org/api/rest_v1/page/summary/{name}",
            headers={"User-Agent": "MusicBrain/0.2"},
            timeout=8, follow_redirects=True,
        )
        if r.status_code == 200:
            data = r.json()
            thumb = data.get("thumbnail", {}).get("source")
            if thumb:
                return thumb.replace("/330px-", "/500px-")
    except Exception:
        pass
    return None



@router.get("/artist")
def search_artist(q: str, limit: int = 6):
    """아티스트 이름으로 검색."""
    cache_key = f"search_{q}_{limit}"
    if _cache.is_fresh(cache_key):
        return _cache.get(cache_key)

    results = []

    # Gemini로 아티스트 검색
    gemini_results = _gemini_search(q, limit)

    for item in gemini_results:
        name = item.get("name", "")
        local_name = item.get("local_name", "")
        if not name:
            continue

        # Wikipedia에서 이미지 가져오기 (첫 번째 결과만)
        image = None
        if len(results) == 0:  # 첫 결과만 이미지 로드 (속도)
            image = _fetch_wikipedia_image(name)

        results.append({
            "name": local_name or name,
            "name_en": name,
            "spotify_id": "",
            "image": image,
            "genre": item.get("genre", ""),
            "source": "gemini",
        })

    # 결과가 없으면 수동 입력 fallback
    if not results:
        results.append({
            "name": q,
            "spotify_id": "",
            "image": None,
            "genre": "",
            "source": "manual",
        })

    result = {"query": q, "results": results, "count": len(results)}
    _cache.set(cache_key, result)
    return result


@router.get("/artist/{artist_name}/profile")
def get_artist_profile(artist_name: str):
    """아티스트 이름으로 상세 프로필 조회. Spotify 이미지 + Gemini 소개."""
    cache_key = f"profile_{artist_name}"
    if _cache.is_fresh(cache_key):
        return _cache.get(cache_key)

    result = {"name": artist_name, "spotify_id": "", "image": None}

    # Gemini로 소개 + 장르
    try:
        from google import genai
        from google.genai import types
        import json

        api_key = os.getenv("GEMINI_API_KEY")
        if api_key:
            client = genai.Client(api_key=api_key)
            r = client.models.generate_content(
                model="gemini-3-flash-preview",
                contents=f"""{artist_name}에 대해 JSON으로 답해. 마크다운 쓰지 마.
{{
  "bio": "3-4문장 간결한 소개. 장르, 대표곡, 주요 성과. 존댓말 쓰지 마. 마크다운 쓰지 마.",
  "genre": "주요 장르 (예: K-pop, Pop, Hip hop)"
}}""",
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    thinking_config=types.ThinkingConfig(thinking_level="low"),
                ),
            )
            data = json.loads(r.text.strip())
            result["bio"] = data.get("bio", "")
            result["genre"] = data.get("genre", "")
    except Exception:
        pass

    # Wikipedia 이미지
    if not result.get("image"):
        image = _fetch_wikipedia_image(artist_name)
        if image:
            result["image"] = image

    _cache.set(cache_key, result)
    return result

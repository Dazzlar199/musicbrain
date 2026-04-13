"""팬덤 버즈 트래커 — 실시간 아티스트 언급량/관심도 추적.

소스: Google Trends, Reddit, 네이버 뉴스, YouTube, X(추정).
GPT에 물어봐서 절대 안 되는 기능 — 실시간 데이터 수집 + 모니터링.
"""

import os
import httpx
import feedparser
from datetime import datetime, timedelta
from fastapi import APIRouter

router = APIRouter(prefix="/api/buzz", tags=["buzz"])

_cache = {}
_cache_ttl = 1800  # 30분 캐시


def _is_fresh(key: str) -> bool:
    if key not in _cache:
        return False
    return (datetime.utcnow() - _cache[key]["ts"]).seconds < _cache_ttl


# ─── Google Trends ───

def _google_trends(keyword: str, days: int = 30) -> dict:
    """Google Trends 관심도 추이."""
    try:
        from pytrends.request import TrendReq
        pytrends = TrendReq(hl="ko", tz=540, timeout=(5, 10))
        pytrends.build_payload([keyword], timeframe=f"today {days}-d")
        df = pytrends.interest_over_time()
        if df.empty:
            return {"points": [], "avg": 0, "peak": 0}

        points = [
            {"date": str(idx.date()), "value": int(row[keyword])}
            for idx, row in df.iterrows()
        ]
        values = [p["value"] for p in points]
        return {
            "points": points,
            "avg": round(sum(values) / len(values), 1) if values else 0,
            "peak": max(values) if values else 0,
            "peak_date": points[values.index(max(values))]["date"] if values else None,
        }
    except Exception as e:
        return {"points": [], "avg": 0, "peak": 0, "error": str(e)}


# ─── Reddit ───

def _reddit_buzz(keyword: str, limit: int = 20) -> dict:
    """Reddit에서 아티스트 언급 검색. 무료 JSON API."""
    try:
        url = f"https://www.reddit.com/search.json?q={keyword}&sort=new&limit={limit}&t=week"
        r = httpx.get(url, headers={"User-Agent": "MusicBrain/0.2"}, timeout=10)
        data = r.json()

        posts = []
        total_score = 0
        total_comments = 0
        subreddits = {}

        for child in data.get("data", {}).get("children", []):
            p = child["data"]
            sub = p.get("subreddit", "")
            subreddits[sub] = subreddits.get(sub, 0) + 1
            total_score += p.get("score", 0)
            total_comments += p.get("num_comments", 0)
            posts.append({
                "title": p.get("title", ""),
                "subreddit": sub,
                "score": p.get("score", 0),
                "comments": p.get("num_comments", 0),
                "url": f"https://reddit.com{p.get('permalink', '')}",
                "created": datetime.fromtimestamp(p.get("created_utc", 0)).isoformat(),
            })

        top_subs = sorted(subreddits.items(), key=lambda x: -x[1])[:5]
        return {
            "posts": posts,
            "count": len(posts),
            "total_score": total_score,
            "total_comments": total_comments,
            "top_subreddits": [{"name": s, "count": c} for s, c in top_subs],
        }
    except Exception as e:
        return {"posts": [], "count": 0, "error": str(e)}


# ─── 네이버 뉴스 ───

def _naver_news(keyword: str, limit: int = 10) -> dict:
    """네이버 뉴스 검색 (RSS)."""
    try:
        import urllib.parse
        url = f"https://news.google.com/rss/search?q={urllib.parse.quote(keyword)}&hl=ko&gl=KR&ceid=KR:ko"
        feed = feedparser.parse(url)

        articles = []
        for entry in feed.entries[:limit]:
            articles.append({
                "title": entry.get("title", ""),
                "source": entry.get("source", {}).get("title", "") if hasattr(entry, "source") else "",
                "url": entry.get("link", ""),
                "published": entry.get("published", ""),
            })

        return {"articles": articles, "count": len(articles)}
    except Exception as e:
        return {"articles": [], "count": 0, "error": str(e)}


# ─── YouTube ───

def _youtube_buzz(keyword: str, limit: int = 10) -> dict:
    """YouTube 최근 영상 검색."""
    try:
        import urllib.parse
        url = f"https://www.youtube.com/results?search_query={urllib.parse.quote(keyword)}&sp=CAI%253D"
        r = httpx.get(url, headers={"User-Agent": "Mozilla/5.0", "Accept-Language": "ko-KR"}, timeout=10)

        import re, json
        # ytInitialData에서 영상 정보 추출
        match = re.search(r"var ytInitialData = ({.*?});</script>", r.text)
        if not match:
            return {"videos": [], "count": 0}

        yt_data = json.loads(match.group(1))
        contents = (yt_data
            .get("contents", {})
            .get("twoColumnSearchResultsRenderer", {})
            .get("primaryContents", {})
            .get("sectionListRenderer", {})
            .get("contents", [{}])[0]
            .get("itemSectionRenderer", {})
            .get("contents", []))

        videos = []
        for item in contents[:limit]:
            vid = item.get("videoRenderer", {})
            if not vid:
                continue
            title = vid.get("title", {}).get("runs", [{}])[0].get("text", "")
            channel = vid.get("ownerText", {}).get("runs", [{}])[0].get("text", "")
            view_text = vid.get("viewCountText", {}).get("simpleText", "")
            published = vid.get("publishedTimeText", {}).get("simpleText", "")

            videos.append({
                "title": title,
                "channel": channel,
                "views": view_text,
                "published": published,
                "url": f"https://youtube.com/watch?v={vid.get('videoId', '')}",
            })

        return {"videos": videos, "count": len(videos)}
    except Exception as e:
        return {"videos": [], "count": 0, "error": str(e)}


# ─── Gemini 버즈 요약 ───

def _gemini_buzz_summary(keyword: str, reddit_data: dict, news_data: dict) -> str:
    """Gemini가 수집된 데이터를 보고 버즈 요약."""
    try:
        from google import genai
        from google.genai import types

        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            return ""

        context_parts = []
        if reddit_data.get("posts"):
            titles = [p["title"] for p in reddit_data["posts"][:10]]
            context_parts.append(f"Reddit 최근 글 제목:\n" + "\n".join(f"- {t}" for t in titles))

        if news_data.get("articles"):
            titles = [a["title"] for a in news_data["articles"][:10]]
            context_parts.append(f"최근 뉴스:\n" + "\n".join(f"- {t}" for t in titles))

        if not context_parts:
            return ""

        context = "\n\n".join(context_parts)

        client = genai.Client(api_key=api_key)
        r = client.models.generate_content(
            model="gemini-3-flash-preview",
            contents=f"""아래는 "{keyword}"에 대한 최근 온라인 반응이야.

{context}

3-4문장으로 요약해줘:
1. 지금 팬들이 가장 관심 있는 주제
2. 전반적인 분위기 (긍정/부정/중립)
3. 주목할 만한 트렌드나 이슈

마크다운 쓰지 마. 존댓말 쓰지 마. 간결하게.""",
            config=types.GenerateContentConfig(
                thinking_config=types.ThinkingConfig(thinking_level="low"),
            ),
        )
        return r.text.strip()
    except Exception:
        return ""


# ─── API 엔드포인트 ───

@router.get("/{artist_name}")
def get_buzz(artist_name: str):
    """아티스트 버즈 종합 리포트."""
    cache_key = f"buzz_{artist_name}"
    if _is_fresh(cache_key):
        return _cache[cache_key]["data"]

    # 병렬로 하면 좋지만, 동기 코드라 순차 실행
    trends = _google_trends(artist_name)
    reddit = _reddit_buzz(artist_name)
    news = _naver_news(artist_name)
    youtube = _youtube_buzz(artist_name)

    # 버즈 스코어 계산 (0-100)
    score = 0
    score += min(trends.get("avg", 0), 30)  # Google Trends: max 30
    score += min(reddit.get("count", 0) * 3, 25)  # Reddit: max 25
    score += min(news.get("count", 0) * 3, 25)  # News: max 25
    score += min(youtube.get("count", 0) * 2, 20)  # YouTube: max 20
    score = min(score, 100)

    # Gemini 요약
    summary = _gemini_buzz_summary(artist_name, reddit, news)

    result = {
        "artist": artist_name,
        "score": score,
        "summary": summary,
        "trends": trends,
        "reddit": reddit,
        "news": news,
        "youtube": youtube,
        "updated": datetime.utcnow().isoformat(),
    }

    _cache[cache_key] = {"data": result, "ts": datetime.utcnow()}
    return result


@router.get("/{artist_name}/compare")
def compare_buzz(artist_name: str, vs: str = ""):
    """아티스트 버즈 비교. ?vs=NewJeans,aespa"""
    if not vs:
        return {"error": "vs 파라미터 필요. 예: ?vs=NewJeans,aespa"}

    artists = [artist_name] + [a.strip() for a in vs.split(",") if a.strip()]
    results = []

    for name in artists[:5]:  # 최대 5명
        cache_key = f"buzz_{name}"
        if _is_fresh(cache_key):
            data = _cache[cache_key]["data"]
        else:
            trends = _google_trends(name, days=7)
            reddit = _reddit_buzz(name, limit=10)
            news = _naver_news(name, limit=5)

            score = 0
            score += min(trends.get("avg", 0), 30)
            score += min(reddit.get("count", 0) * 3, 25)
            score += min(news.get("count", 0) * 3, 25)
            score = min(score, 100)

            data = {"artist": name, "score": score, "trends": trends}
            _cache[cache_key] = {"data": data, "ts": datetime.utcnow()}

        results.append({
            "artist": data["artist"],
            "score": data["score"],
            "trend_avg": data.get("trends", {}).get("avg", 0),
            "trend_peak": data.get("trends", {}).get("peak", 0),
        })

    return {"comparison": sorted(results, key=lambda x: -x["score"])}

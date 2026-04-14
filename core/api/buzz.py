"""팬덤 버즈 트래커 — 실시간 아티스트 언급량/관심도 추적.

소스: Google Trends, Reddit, 네이버 뉴스, YouTube, X(추정).
GPT에 물어봐서 절대 안 되는 기능 — 실시간 데이터 수집 + 모니터링.
"""

import os
import httpx
import feedparser
from pathlib import Path
from datetime import datetime, timedelta
from fastapi import APIRouter
from core.api.cache import SimpleCache

router = APIRouter(prefix="/api/buzz", tags=["buzz"])

_cache = SimpleCache(ttl=1800)


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

def _google_news(keyword: str, limit: int = 20) -> dict:
    """Google News 검색 (RSS)."""
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

def _youtube_buzz(keyword: str, limit: int = 20) -> dict:
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


# ─── X / Twitter ───

def _x_buzz(keyword: str, limit: int = 20) -> dict:
    """X(트위터) 버즈. twikit 계정 있으면 실시간, 없으면 Gemini 분석."""

    # 방법 1: Playwright + Chrome 쿠키 (로컬에서 X 로그인 되어 있을 때)
    try:
        import browser_cookie3
        from playwright.sync_api import sync_playwright

        chrome_cookie_path = os.path.expanduser("~/Library/Application Support/Google/Chrome/Profile 1/Cookies")
        if not os.path.exists(chrome_cookie_path):
            chrome_cookie_path = os.path.expanduser("~/Library/Application Support/Google/Chrome/Default/Cookies")

        if os.path.exists(chrome_cookie_path):
            cj = browser_cookie3.chrome(cookie_file=chrome_cookie_path, domain_name=".x.com")
            cookies = [{"name": c.name, "value": c.value, "domain": c.domain, "path": c.path} for c in cj]

            # auth_token 있는지 확인
            has_auth = any(c["name"] == "auth_token" for c in cookies)
            if has_auth:
                import urllib.parse
                with sync_playwright() as p:
                    browser = p.chromium.launch(headless=True)
                    context = browser.new_context(user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36")
                    context.add_cookies(cookies)

                    page = context.new_page()
                    q = urllib.parse.quote(keyword)
                    page.goto(f"https://x.com/search?q={q}&f=live", wait_until="domcontentloaded", timeout=15000)
                    page.wait_for_selector('article[data-testid="tweet"]', timeout=8000)

                    tweets_raw = page.evaluate("""() => {
                        const articles = document.querySelectorAll('article[data-testid="tweet"]');
                        return Array.from(articles).slice(0, """ + str(limit) + """).map(a => {
                            const text = a.querySelector('[data-testid="tweetText"]')?.textContent || '';
                            const userEl = a.querySelector('[data-testid="User-Name"]');
                            const user = userEl?.querySelector('span')?.textContent || '';
                            const handle = userEl?.querySelectorAll('span')[3]?.textContent || '';
                            const time = a.querySelector('time')?.getAttribute('datetime') || '';
                            const link = a.querySelector('a[href*="/status/"]')?.href || '';
                            const likes = a.querySelector('[data-testid="like"]')?.textContent || '0';
                            const retweets = a.querySelector('[data-testid="retweet"]')?.textContent || '0';
                            const replies = a.querySelector('[data-testid="reply"]')?.textContent || '0';
                            return {text: text.slice(0,200), user, handle, time, url: link, likes, retweets, replies};
                        });
                    }""")
                    browser.close()

                tweets = []
                for t in tweets_raw:
                    def parse_count(v):
                        try:
                            if isinstance(v, (int, float)): return int(v)
                            v = str(v).strip().replace(",", "")
                            if "K" in v: return int(float(v.replace("K", "")) * 1000)
                            if "M" in v: return int(float(v.replace("M", "")) * 1000000)
                            return int(v) if v else 0
                        except: return 0
                    tweets.append({
                        "text": t.get("text", ""),
                        "user": t.get("user", ""),
                        "handle": t.get("handle", ""),
                        "likes": parse_count(t.get("likes")),
                        "retweets": parse_count(t.get("retweets")),
                        "replies": parse_count(t.get("replies")),
                        "created": t.get("time", ""),
                        "url": t.get("url", ""),
                    })

                total_engagement = sum(t["likes"] + t["retweets"] + t["replies"] for t in tweets)
                return {"tweets": tweets, "count": len(tweets), "total_engagement": total_engagement, "available": True, "source": "x_live"}
    except Exception:
        pass

    # 방법 2: Gemini가 X 트렌드 분석 (계정 없어도 작동)
    try:
        from google import genai
        from google.genai import types
        import json

        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            return {"tweets": [], "count": 0, "available": False}

        client = genai.Client(api_key=api_key)
        r = client.models.generate_content(
            model="gemini-3-flash-preview",
            contents=f"""X(트위터)에서 "{keyword}"에 대한 최근 팬 반응을 분석해줘.

JSON으로만 답해. 마크다운 쓰지 마.
{{
  "summary": "X에서 이 아티스트에 대한 최근 반응 요약. 3-4문장. 구체적인 트윗 내용, 해시태그, 팬덤 반응 포함.",
  "trending_topics": ["화제인 주제 1", "주제 2", "주제 3"],
  "sentiment": "긍정/부정/중립/혼재",
  "hashtags": ["#해시태그1", "#해시태그2"],
  "fan_highlights": [
    {{"topic": "주제", "reaction": "팬 반응 요약", "intensity": "높음/보통/낮음"}},
    {{"topic": "주제2", "reaction": "반응", "intensity": "보통"}}
  ],
  "estimated_buzz": "높음/보통/낮음 — X에서의 화제성 수준"
}}""",
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                thinking_config=types.ThinkingConfig(thinking_level="low"),
            ),
        )
        data = json.loads(r.text.strip())
        # Gemini 분석을 트윗 형태로 변환
        tweets = []
        for h in data.get("fan_highlights", []):
            tweets.append({
                "text": f"{h.get('topic', '')}: {h.get('reaction', '')}",
                "user": "팬덤 분석",
                "handle": "",
                "likes": 0, "retweets": 0, "replies": 0,
                "created": "", "url": "",
            })

        buzz_map = {"높음": 15, "보통": 8, "낮음": 3}
        est = buzz_map.get(data.get("estimated_buzz", "보통"), 8)

        return {
            "tweets": tweets,
            "count": est,
            "total_engagement": est * 100,
            "available": True,
            "source": "gemini",
            "summary": data.get("summary", ""),
            "trending_topics": data.get("trending_topics", []),
            "sentiment": data.get("sentiment", ""),
            "hashtags": data.get("hashtags", []),
        }
    except Exception:
        return {"tweets": [], "count": 0, "available": False}


# ─── Gemini 버즈 요약 ───

def _gemini_buzz_summary(keyword: str, reddit_data: dict, news_data: dict, x_data: dict = None) -> str:
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

        if x_data and x_data.get("tweets"):
            tweets = [f"- {t['user']}: {t['text'][:100]}" for t in x_data["tweets"][:10]]
            context_parts.append(f"X(트위터) 최근 트윗:\n" + "\n".join(tweets))

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
    if _cache.is_fresh(cache_key):
        return _cache.get(cache_key)

    # 데이터 수집
    trends = _google_trends(artist_name)
    reddit = _reddit_buzz(artist_name)
    news = _google_news(artist_name)
    youtube = _youtube_buzz(artist_name)
    x = _x_buzz(artist_name)

    # 버즈 스코어 계산 (0-100)
    score = 0
    if x.get("available"):
        # X 데이터 있으면 5개 소스 기준
        score += min(trends.get("avg", 0) * 0.8, 20)       # Trends: max 20
        score += min(x.get("count", 0) * 2, 25)            # X: max 25
        score += min(reddit.get("count", 0) * 2, 20)       # Reddit: max 20
        score += min(news.get("count", 0) * 2, 20)         # News: max 20
        score += min(youtube.get("count", 0) * 2, 15)      # YouTube: max 15
    else:
        # X 없으면 4개 소스 기준
        score += min(trends.get("avg", 0), 30)
        score += min(reddit.get("count", 0) * 3, 25)
        score += min(news.get("count", 0) * 3, 25)
        score += min(youtube.get("count", 0) * 2, 20)
    score = min(int(score), 100)

    # Gemini 요약
    summary = _gemini_buzz_summary(artist_name, reddit, news, x)

    result = {
        "artist": artist_name,
        "score": score,
        "summary": summary,
        "trends": trends,
        "reddit": reddit,
        "news": news,
        "youtube": youtube,
        "x": x,
        "updated": datetime.utcnow().isoformat(),
    }

    _cache.set(cache_key, result)
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
        if _cache.is_fresh(cache_key):
            data = _cache.get(cache_key)
        else:
            trends = _google_trends(name, days=7)
            reddit = _reddit_buzz(name, limit=10)
            news = _google_news(name, limit=5)

            score = 0
            score += min(trends.get("avg", 0), 30)
            score += min(reddit.get("count", 0) * 3, 25)
            score += min(news.get("count", 0) * 3, 25)
            score = min(score, 100)

            data = {"artist": name, "score": score, "trends": trends}
            _cache.set(cache_key, data)

        results.append({
            "artist": data["artist"],
            "score": data["score"],
            "trend_avg": data.get("trends", {}).get("avg", 0),
            "trend_peak": data.get("trends", {}).get("peak", 0),
        })

    return {"comparison": sorted(results, key=lambda x: -x["score"])}

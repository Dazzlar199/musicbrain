"""콘텐츠 캘린더 — SNS 포스팅 스케줄 자동 생성.

아티스트 발매일 기준 D-14 ~ D+30 콘텐츠 플랜을
Gemini AI가 플랫폼별로 생성. 틱톡/인스타/유튜브/X 포함.
"""

import os
import json
from datetime import datetime, timedelta
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/api/content-calendar", tags=["content-calendar"])

_cache = {}
_cache_ttl = 3600  # 1시간


def _is_fresh(key: str) -> bool:
    if key not in _cache:
        return False
    return (datetime.utcnow() - _cache[key]["ts"]).seconds < _cache_ttl


# ─── 요청 모델 ───

class CalendarRequest(BaseModel):
    artist_name: str
    track_title: str
    release_date: str  # YYYY-MM-DD
    market: str = "kr"
    platforms: list[str] = ["tiktok", "instagram", "youtube", "x"]


# ─── Gemini 콘텐츠 캘린더 생성 ───

def _generate_calendar(req: CalendarRequest) -> dict:
    """Gemini로 D-14 ~ D+30 콘텐츠 캘린더 생성."""
    try:
        from google import genai
        from google.genai import types

        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            return {"error": "GEMINI_API_KEY 환경변수가 설정되지 않았습니다."}

        platform_names = {
            "tiktok": "틱톡",
            "instagram": "인스타그램",
            "youtube": "유튜브",
            "x": "X(트위터)",
        }
        platform_str = ", ".join(platform_names.get(p, p) for p in req.platforms)

        market_names = {
            "kr": "한국",
            "us": "미국",
            "jp": "일본",
            "br": "브라질",
            "sea": "동남아시아",
            "global": "글로벌",
        }
        market_name = market_names.get(req.market, req.market)

        client = genai.Client(api_key=api_key)
        r = client.models.generate_content(
            model="gemini-3-flash-preview",
            contents=f"""아티스트 "{req.artist_name}"의 신곡 "{req.track_title}" 발매일은 {req.release_date}이야.
타겟 시장: {market_name}
활용 플랫폼: {platform_str}

D-14부터 D+30까지의 SNS 콘텐츠 캘린더를 만들어줘.
모든 텍스트는 한국어로 작성해.

아래 JSON 형식으로만 답해. 마크다운 쓰지 마.

{{
  "artist_name": "{req.artist_name}",
  "track_title": "{req.track_title}",
  "release_date": "{req.release_date}",
  "market": "{req.market}",
  "summary": "전체 캘린더 전략 요약. 2-3문장.",
  "total_posts": 45,
  "calendar": [
    {{
      "date": "2026-04-01",
      "d_day": "D-14",
      "platform": "tiktok",
      "content_type": "티저 클립",
      "description": "15초 음원 스니펫으로 궁금증 유발. 가사 일부 자막 포함.",
      "hashtags": ["#아티스트명", "#컴백", "#신곡제목"],
      "timing": "18:00",
      "priority": "high"
    }},
    {{
      "date": "2026-04-01",
      "d_day": "D-14",
      "platform": "instagram",
      "content_type": "무드보드 스토리",
      "description": "신곡 콘셉트 힌트 이미지 3장 스토리 업로드.",
      "hashtags": ["#아티스트명", "#컴백D14"],
      "timing": "20:00",
      "priority": "medium"
    }}
  ],
  "phase_summary": {{
    "pre_release": "D-14 ~ D-1: 기대감 조성 전략 요약",
    "release_day": "D-Day: 발매일 폭발적 노출 전략",
    "post_release": "D+1 ~ D+30: 롱런 전략 요약"
  }}
}}

규칙:
- calendar 배열에 최소 40개 이상의 포스트 포함
- D-14, D-13, ..., D-1, D-Day, D+1, ..., D+30 전체 커버
- 각 날짜마다 1~3개의 포스트 (중요한 날은 더 많이)
- 플랫폼은 {platform_str} 중에서 배분
- content_type 종류: 티저 클립, 비하인드, 챌린지 영상, 팬 참여 포스트, 라이브 방송, 차트 인증, 커버 영상, 리액션 모음, 스포일러, 카운트다운, 콘셉트 포토, MV 비하인드, 안무 영상, 팬 감사 포스트, 밈 콘텐츠
- timing: 해당 시장 기준 최적 게시 시간 (HH:MM)
- priority: high (필수), medium (권장), low (선택)
- D-Day와 D-1은 모든 플랫폼에 high priority
- hashtags: 3-5개, 실제 사용 가능한 해시태그
- JSON만 출력""",
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                thinking_config=types.ThinkingConfig(thinking_level="medium"),
            ),
        )

        return json.loads(r.text.strip())
    except Exception as e:
        return {"error": str(e)}


# ─── 템플릿 ───

_TEMPLATES = {
    "single": {
        "name": "싱글 발매",
        "description": "디지털 싱글 1곡 발매용 기본 캘린더",
        "duration": "D-7 ~ D+14",
        "total_posts": 25,
        "phases": [
            {
                "phase": "사전 티징",
                "days": "D-7 ~ D-3",
                "posts_per_day": 1,
                "platforms": ["instagram", "x"],
                "content_types": ["콘셉트 포토", "스포일러", "카운트다운"],
            },
            {
                "phase": "집중 홍보",
                "days": "D-2 ~ D-Day",
                "posts_per_day": 3,
                "platforms": ["tiktok", "instagram", "youtube", "x"],
                "content_types": ["티저 클립", "MV 공개", "라이브 방송", "챌린지 영상"],
            },
            {
                "phase": "사후 관리",
                "days": "D+1 ~ D+14",
                "posts_per_day": 1,
                "platforms": ["tiktok", "instagram"],
                "content_types": ["차트 인증", "팬 감사 포스트", "비하인드", "리액션 모음"],
            },
        ],
    },
    "album": {
        "name": "정규/미니앨범 발매",
        "description": "앨범 단위 대규모 프로모션 캘린더",
        "duration": "D-14 ~ D+30",
        "total_posts": 50,
        "phases": [
            {
                "phase": "앨범 프리뷰",
                "days": "D-14 ~ D-8",
                "posts_per_day": 1,
                "platforms": ["instagram", "youtube"],
                "content_types": ["콘셉트 포토", "트랙리스트 공개", "무드보드"],
            },
            {
                "phase": "집중 티징",
                "days": "D-7 ~ D-1",
                "posts_per_day": 2,
                "platforms": ["tiktok", "instagram", "x"],
                "content_types": ["티저 클립", "하이라이트 메들리", "카운트다운", "스포일러"],
            },
            {
                "phase": "발매일",
                "days": "D-Day",
                "posts_per_day": 5,
                "platforms": ["tiktok", "instagram", "youtube", "x"],
                "content_types": ["MV 공개", "라이브 방송", "챌린지 론칭", "팬 이벤트"],
            },
            {
                "phase": "포스트 프로모",
                "days": "D+1 ~ D+30",
                "posts_per_day": 1,
                "platforms": ["tiktok", "instagram", "youtube"],
                "content_types": ["안무 영상", "비하인드", "차트 인증", "팬 리액션", "밈 콘텐츠"],
            },
        ],
    },
    "comeback": {
        "name": "컴백 프로모션",
        "description": "활동 공백 후 컴백 시 대대적 프로모션",
        "duration": "D-21 ~ D+30",
        "total_posts": 60,
        "phases": [
            {
                "phase": "컴백 암시",
                "days": "D-21 ~ D-15",
                "posts_per_day": 1,
                "platforms": ["instagram", "x"],
                "content_types": ["의미심장 포스트", "힌트 이미지", "팬 기대감 유도"],
            },
            {
                "phase": "공식 발표",
                "days": "D-14 ~ D-8",
                "posts_per_day": 2,
                "platforms": ["instagram", "youtube", "x"],
                "content_types": ["컴백 공지", "콘셉트 포토", "트랙리스트", "스케줄러"],
            },
            {
                "phase": "집중 티징",
                "days": "D-7 ~ D-1",
                "posts_per_day": 3,
                "platforms": ["tiktok", "instagram", "youtube", "x"],
                "content_types": ["MV 티저", "음원 스니펫", "안무 스포", "카운트다운"],
            },
            {
                "phase": "컴백 D-Day",
                "days": "D-Day",
                "posts_per_day": 6,
                "platforms": ["tiktok", "instagram", "youtube", "x"],
                "content_types": ["MV 공개", "라이브 방송", "챌린지 론칭", "실시간 소통"],
            },
            {
                "phase": "활동 기간",
                "days": "D+1 ~ D+30",
                "posts_per_day": 2,
                "platforms": ["tiktok", "instagram", "youtube"],
                "content_types": ["음방 비하인드", "팬캠", "차트 인증", "밈 콘텐츠", "팬 감사"],
            },
        ],
    },
    "collaboration": {
        "name": "콜라보레이션",
        "description": "피처링/콜라보 곡 발매용 듀얼 프로모션",
        "duration": "D-10 ~ D+14",
        "total_posts": 30,
        "phases": [
            {
                "phase": "콜라보 힌트",
                "days": "D-10 ~ D-5",
                "posts_per_day": 1,
                "platforms": ["instagram", "x"],
                "content_types": ["실루엣 티저", "힌트 포스트", "양쪽 아티스트 교차 포스팅"],
            },
            {
                "phase": "공식 공개",
                "days": "D-4 ~ D-1",
                "posts_per_day": 2,
                "platforms": ["tiktok", "instagram", "youtube", "x"],
                "content_types": ["콜라보 공지", "음원 스니펫", "케미 영상", "카운트다운"],
            },
            {
                "phase": "발매일",
                "days": "D-Day",
                "posts_per_day": 4,
                "platforms": ["tiktok", "instagram", "youtube", "x"],
                "content_types": ["MV 공개", "듀엣 챌린지", "합동 라이브", "크로스 프로모"],
            },
            {
                "phase": "후속 프로모",
                "days": "D+1 ~ D+14",
                "posts_per_day": 1,
                "platforms": ["tiktok", "instagram"],
                "content_types": ["비하인드", "팬 리액션", "차트 인증", "감사 포스트"],
            },
        ],
    },
}


# ─── API 엔드포인트 ───

@router.post("/generate")
def generate_calendar(req: CalendarRequest):
    """콘텐츠 캘린더 생성 — D-14 ~ D+30 SNS 플랜."""
    cache_key = f"calendar_{req.artist_name}_{req.track_title}_{req.release_date}_{req.market}"
    if _is_fresh(cache_key):
        return _cache[cache_key]["data"]

    result = _generate_calendar(req)
    result["updated"] = datetime.utcnow().isoformat()

    _cache[cache_key] = {"data": result, "ts": datetime.utcnow()}
    return result


@router.get("/templates")
def get_templates():
    """사전 정의된 콘텐츠 캘린더 템플릿 목록."""
    return {
        "templates": _TEMPLATES,
        "available_types": list(_TEMPLATES.keys()),
        "description": "발매 유형별 콘텐츠 캘린더 템플릿. /generate에서 AI가 구체적인 일정을 생성합니다.",
    }

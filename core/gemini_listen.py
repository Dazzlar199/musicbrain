"""Gemini 직접 청취 분석 — 곡 분석의 메인 엔진.

librosa 수치가 아니라 Gemini가 곡을 직접 듣고 판단.
사람처럼 듣고, A&R처럼 판단.
"""

import os
import json
from google import genai
from google.genai import types
from dotenv import load_dotenv

load_dotenv()

_CLIENT = None
MODEL_ID = "gemini-3-flash-preview"


def _get_client():
    global _CLIENT
    if _CLIENT is None:
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise RuntimeError("GEMINI_API_KEY not set")
        _CLIENT = genai.Client(api_key=api_key)
    return _CLIENT


def _get_chart_context(target_market: str) -> str:
    """타겟 시장 + 글로벌 주요 시장의 차트곡 목록."""
    try:
        from pathlib import Path
        import pandas as pd
        from core.markets import COUNTRY_TO_MARKET

        charts_file = Path(__file__).parent.parent / "data" / "kaggle" / "charts" / "universal_top_spotify_songs.csv"
        if not charts_file.exists():
            return ""

        if not hasattr(_get_chart_context, "_df"):
            _get_chart_context._df = pd.read_csv(
                charts_file,
                usecols=["name", "artists", "country", "daily_rank", "popularity"],
                low_memory=False,
            )
            _get_chart_context._df["market"] = _get_chart_context._df["country"].map(COUNTRY_TO_MARKET)

        if not hasattr(_get_chart_context, "_cache"):
            _get_chart_context._cache = {}

        if target_market in _get_chart_context._cache:
            return _get_chart_context._cache[target_market]

        df = _get_chart_context._df
        lines = []

        # 타겟 시장 200곡
        target = df[df["market"] == target_market].sort_values("popularity", ascending=False).drop_duplicates("name").head(200)
        if not target.empty:
            lines.append(f"[{target_market.upper()} 차트곡 {len(target)}곡]")
            for _, r in target.iterrows():
                lines.append(f"- {r['artists']} — {r['name']} (pop:{r.get('popularity',0)})")

        # 글로벌 주요 시장에서 추가 (타겟과 다른 시장)
        other_markets = [m for m in ["us", "kr", "jp", "br", "europe", "sea"] if m != target_market]
        for m in other_markets[:3]:
            other = df[df["market"] == m].sort_values("popularity", ascending=False).drop_duplicates("name").head(50)
            if not other.empty:
                lines.append(f"\n[{m.upper()} 차트곡 {len(other)}곡]")
                for _, r in other.iterrows():
                    lines.append(f"- {r['artists']} — {r['name']} (pop:{r.get('popularity',0)})")

        result = "\n".join(lines)
        _get_chart_context._cache[target_market] = result
        return result
    except Exception:
        return ""


def listen_and_analyze(audio_bytes: bytes, target_market: str = "kr",
                       user_prompt: str = "",
                       audio_mime_type: str = "audio/mpeg") -> dict:
    """Gemini가 곡을 직접 듣고 분석.

    Returns structured JSON — 프론트가 카드로 렌더링.
    """
    client = _get_client()

    chart_context = _get_chart_context(target_market)

    market_names = {
        "kr": "한국", "us": "미국", "jp": "일본", "br": "브라질",
        "latam": "라틴아메리카", "sea": "동남아시아", "europe": "유럽",
        "uk": "영국", "mena": "중동", "africa": "아프리카",
        "india": "인도", "china": "중화권",
    }
    market_name = market_names.get(target_market, target_market.upper())

    user_section = ""
    if user_prompt:
        user_section = f"""
사용자가 이렇게 물었어:
"{user_prompt}"
이 질문에 맞춰서 answer 필드에 답변해줘. 이게 가장 중요해.
"""

    chart_section = ""
    if chart_context:
        chart_section = f"""
아래는 여러 시장의 실제 차트곡 목록이야 (타겟: {market_name}).
경쟁 곡 분석에서 이 곡들 중에서 골라도 되고, 여기 없지만 네가 아는 곡 중 더 적합한 게 있으면 그걸 써도 돼.
국내/해외 가리지 마. 장르나 사운드가 비슷하면 다른 시장 곡이어도 상관없어.
중요한 건 왜 비슷한지, 그 곡이 왜 성공했는지, 우리 곡이 어떻게 차별화할 수 있는지야.

{chart_context}
"""

    prompt = f"""이 곡을 처음부터 끝까지 들어줘.

{user_section}

타겟 시장: {market_name}
{chart_section}

아래 JSON 형식으로만 답해. 마크다운이나 설명 텍스트 없이 JSON만.
곡을 실제로 들은 느낌을 기반으로 솔직하게 평가해.
"좋다", "나쁘다"가 아니라 "이 시장에서 이런 곡이 먹히는 이유"를 말해줘.

{{
  "answer": "{user_prompt if user_prompt else '사용자 질문 없음 — 이 필드는 비워둬'}에 대한 답변. 2-3문장으로 핵심만.",

  "first_impression": "처음 10초를 듣고 든 느낌. 한 문장.",

  "genre": "이 곡의 장르를 하나로 말하면",
  "sub_genre": "좀 더 구체적인 서브장르",
  "mood": "이 곡의 분위기를 한 단어로",
  "energy_level": "1-10 사이 숫자. 1=매우 차분, 10=매우 강렬",

  "what_works": [
    "이 곡에서 잘 된 부분 1",
    "잘 된 부분 2",
    "잘 된 부분 3"
  ],
  "what_needs_work": [
    "개선이 필요한 부분 1",
    "개선이 필요한 부분 2"
  ],

  "market_fit": {{
    "score": 7,
    "reason": "이 시장에서 이 곡이 통할/안 통할 이유. 2문장.",
    "best_market": "이 곡이 가장 잘 맞는 시장 코드 (kr/us/jp/br/sea 등)",
    "best_market_reason": "왜 그 시장이 가장 맞는지. 1문장."
  }},

  "production": {{
    "quality": "1-10 사이. 프로덕션 퀄리티.",
    "mixing_note": "믹싱에 대한 한 줄 코멘트",
    "arrangement_note": "편곡에 대한 한 줄 코멘트"
  }},

  "vocal": {{
    "style": "보컬 스타일 한 단어",
    "note": "보컬에 대한 한 줄 평가"
  }},

  "hook": {{
    "has_hook": true,
    "timestamp": "가장 귀에 남는 구간. 예: 0:45-1:02",
    "description": "그 구간이 왜 좋은지. 한 문장."
  }},

  "shortform": {{
    "best_clip": "TikTok/Reels에 쓸 7-15초 구간. 예: 0:32-0:44",
    "reason": "왜 이 구간인지. 한 문장."
  }},

  "competitors": [
    {{
      "artist": "아티스트명",
      "track": "곡명",
      "why_similar": "어떤 점이 비슷한지. 사운드? 타겟? 콘셉트?",
      "what_they_did_well": "그 곡이 성공한 이유 한 줄",
      "how_to_differentiate": "우리 곡이 차별화하려면 어떻게 해야 하는지"
    }},
    {{
      "artist": "아티스트명 2",
      "track": "곡명 2",
      "why_similar": "비슷한 점",
      "what_they_did_well": "성공 이유",
      "how_to_differentiate": "차별화 포인트"
    }}
  ],

  "release_advice": "이 곡을 {market_name} 시장에 낸다면, 구체적으로 어떻게 해야 하는지. 2-3문장. 예산 추정이나 숫자는 넣지 마. 전략 방향만.",

  "one_line": "이 곡을 한 줄로 요약하면"
}}

규칙:
- JSON만. 마크다운이나 ``` 쓰지 마.
- 모든 텍스트는 한국어.
- 모호하게 쓰지 마. "좋은 멜로디"가 아니라 "1절 후반의 상행 멜로디가 코러스로의 전환을 효과적으로 만든다" 수준.
- timestamp는 실제 곡을 들은 기준으로. 대충 쓰지 마.
- 있는 그대로 평가해. 칭찬을 위한 칭찬 하지 마."""

    try:
        audio_part = types.Part.from_bytes(data=audio_bytes, mime_type=audio_mime_type)

        response = client.models.generate_content(
            model=MODEL_ID,
            contents=[prompt, audio_part],
            config=types.GenerateContentConfig(
                thinking_config=types.ThinkingConfig(thinking_level="medium"),
                response_mime_type="application/json",
            ),
        )

        text = response.text.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1] if "\n" in text else text[3:]
        if text.endswith("```"):
            text = text[:-3]

        return json.loads(text.strip())

    except json.JSONDecodeError:
        return {"error": "JSON 파싱 실패", "raw": response.text if 'response' in dir() else ""}
    except Exception as e:
        return {"error": str(e)}

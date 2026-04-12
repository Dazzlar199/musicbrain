"""Gemini Structured Response — returns JSON, not markdown.

This module makes Gemini return machine-parseable JSON that the frontend
can render as SaaS-style cards, widgets, charts, and action items.
The markdown report is still available as a fallback.
"""

import json
import os

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


MARKET_PROFILES = {
    "kr": "Korean (K-pop, K-R&B, K-hip-hop). 초정밀 프로덕션, 훅 중심, 장르 하이브리드, 코레오 적합성.",
    "us": "US (Pop, Hip-hop, R&B, Country). 스트리밍 최적화, 진정성 중시, TikTok 바이럴, 장르 크로스오버.",
    "jp": "Japan (J-pop, Anime, J-Rock, City Pop). 멜로디 복잡도, 감정적 보컬, 애니 타이업, 긴 인트로 허용.",
    "br": "Brazil (Funk, Sertanejo, MPB, Forró, Trap BR). 리듬 중심, 바운스, 포르투갈어 선호, Baile funk.",
}


def analyze_structured(audio_bytes: bytes, market: str,
                       similar_tracks: list[tuple] | None = None,
                       deep_analysis: dict | None = None,
                       market_scores: dict[str, float] | None = None,
                       audio_mime_type: str | None = None) -> dict:
    """Get structured JSON analysis from Gemini.

    Returns a dict with typed sections that the frontend renders as widgets.
    """
    client = _get_client()

    market_desc = MARKET_PROFILES.get(market, MARKET_PROFILES.get("kr", ""))

    context_parts = []
    if market_scores:
        scores_str = ", ".join(f"{k.upper()}: {v:.1f}" for k, v in
                               sorted(market_scores.items(), key=lambda x: x[1], reverse=True))
        context_parts.append(f"시장 분류 모델 점수: {scores_str}")

    if deep_analysis:
        t = deep_analysis.get("tempo", {})
        tonality = deep_analysis.get("tonality", {})
        energy = deep_analysis.get("energy", {})
        rhythm = deep_analysis.get("rhythm", {})
        vocal = deep_analysis.get("vocal", {})
        mood = deep_analysis.get("mood", {})
        prod = deep_analysis.get("production", {})
        context_parts.append(
            f"오디오: {t.get('bpm')} BPM, {tonality.get('key_name')}, "
            f"에너지 {energy.get('category')}, 댄서빌리티 {rhythm.get('danceability', 0):.0%}, "
            f"보컬 {vocal.get('vocal_presence')}, 무드 {mood.get('primary_mood')}, "
            f"폴리시 {prod.get('polish_score')}/10"
        )

    if similar_tracks:
        sim_str = "; ".join(f"{info.artist}-{info.title}({score:.0%})"
                           for info, score in similar_tracks[:5])
        context_parts.append(f"유사 트랙: {sim_str}")

    context = "\n".join(context_parts)

    prompt = f"""당신은 시니어 A&R 디렉터입니다. 업로드된 곡을 듣고, 아래 데이터를 참고하여 분석하세요.

타겟 시장: {market.upper()} — {market_desc}
{context}

반드시 아래 JSON 스키마에 맞게 응답하세요. JSON만 반환하세요. 마크다운이나 설명 텍스트를 JSON 바깥에 쓰지 마세요.

{{
  "profile": {{
    "genre": "1차 장르",
    "sub_genre": "2차 장르",
    "bpm_feel": "BPM과 그루브 느낌 한 줄",
    "key_feel": "키와 조성 느낌 한 줄",
    "structure": "곡 구조 요약 (예: 인트로-벌스-프리코러스-코러스-브릿지-코러스-아웃트로)",
    "production_style": "프로덕션 스타일 한 줄",
    "vocal_style": "보컬 스타일 한 줄",
    "reference_artists": ["유사 아티스트/곡 1", "유사 아티스트/곡 2", "유사 아티스트/곡 3"]
  }},
  "market_fit": {{
    "score": 7,
    "verdict": "적합도 한 줄 요약",
    "strengths": [
      {{"point": "강점 1", "detail": "왜 통하는지 구체적 근거"}},
      {{"point": "강점 2", "detail": "근거"}},
      {{"point": "강점 3", "detail": "근거"}}
    ],
    "weaknesses": [
      {{"point": "약점 1", "detail": "왜 문제인지 + 비교 사례"}},
      {{"point": "약점 2", "detail": "근거"}},
      {{"point": "약점 3", "detail": "근거"}}
    ],
    "risks": [
      {{"risk": "리스크 설명", "probability": "높음/중간/낮음", "impact": "높음/중간/낮음", "mitigation": "대응 전략"}}
    ]
  }},
  "chart_potential": {{
    "chart_entry_pct": 25,
    "viral_potential": "높음/중간/낮음",
    "viral_reason": "바이럴 포텐셜 이유 한 줄",
    "radio_fit": "높음/중간/낮음",
    "longevity": "초동폭발형/꾸준형/슬로우번",
    "longevity_reason": "이유 한 줄"
  }},
  "production_advice": [
    {{"area": "믹싱", "action": "구체적 조언", "priority": "높음/중간/낮음"}},
    {{"area": "편곡", "action": "구체적 조언", "priority": "높음/중간/낮음"}},
    {{"area": "보컬", "action": "구체적 조언", "priority": "높음/중간/낮음"}},
    {{"area": "구조", "action": "구체적 조언", "priority": "높음/중간/낮음"}}
  ],
  "success_cases": [
    {{"artist": "아티스트명", "track": "곡명", "reason": "왜 이 곡이 레퍼런스인지 한 줄"}},
    {{"artist": "아티스트명", "track": "곡명", "reason": "이유"}}
  ],
  "cross_market": [
    {{"market": "JP", "fit_score": 6, "reason": "이 시장에서 통할 수 있는 이유"}},
    {{"market": "US", "fit_score": 4, "reason": "이유"}}
  ],
  "roadmap": {{
    "pre_release": [
      {{"week": "D-56~D-42", "title": "사전 준비", "actions": ["액션 1", "액션 2", "액션 3"]}},
      {{"week": "D-42~D-28", "title": "프리프로모션", "actions": ["액션 1", "액션 2"]}},
      {{"week": "D-28~D-14", "title": "빌드업", "actions": ["액션 1", "액션 2"]}}
    ],
    "release": [
      {{"week": "D-7~D-Day", "title": "릴리즈", "actions": ["액션 1", "액션 2"]}}
    ],
    "post_release": [
      {{"week": "D+1~D+14", "title": "모멘텀", "actions": ["액션 1", "액션 2"]}},
      {{"week": "D+14~D+28", "title": "롱테일", "actions": ["액션 1", "액션 2"]}}
    ]
  }},
  "marketing": {{
    "platforms": [
      {{"name": "TikTok", "strategy": "구체적 전략", "priority": "상/중/하", "budget": "$200-500", "viral_clip": "0:32-0:44 구간 사용"}},
      {{"name": "Instagram Reels", "strategy": "전략", "priority": "상/중/하", "budget": "$150-300"}},
      {{"name": "YouTube", "strategy": "전략", "priority": "상/중/하", "budget": "$500-2000"}},
      {{"name": "Spotify", "strategy": "플레이리스트 피칭 전략", "priority": "상/중/하", "budget": "$200-500"}}
    ],
    "target_playlists": [
      {{"name": "플레이리스트 이름", "type": "editorial/user", "followers": "50K+", "fit_reason": "이유"}}
    ],
    "budget_scenarios": [
      {{"tier": "미니멀", "budget": "$1,000-3,000", "focus": "핵심 항목 2-3개", "expected_streams": "5K-20K"}},
      {{"tier": "스탠다드", "budget": "$5,000-15,000", "focus": "풀 캠페인", "expected_streams": "50K-200K"}},
      {{"tier": "프리미엄", "budget": "$30,000+", "focus": "메이저 레벨", "expected_streams": "500K+"}}
    ],
    "kpis": [
      {{"metric": "Spotify 스트림", "week1": "5,000", "week4": "20,000"}},
      {{"metric": "TikTok 사용", "week1": "500", "week4": "5,000"}},
      {{"metric": "플레이리스트 추가", "week1": "3개", "week4": "10개"}}
    ]
  }}
}}

규칙:
- JSON만 반환. 마크다운/설명 텍스트 금지.
- 모호한 표현 금지. 구체적 수치, 이름, 타임스탬프 사용.
- 시장 분류 모델 점수를 해석하되 덮어쓰지 말 것.
- 모든 텍스트는 한국어.
- 예산은 USD 2026년 기준."""

    try:
        audio_part = types.Part.from_bytes(
            data=audio_bytes,
            mime_type=audio_mime_type or "audio/mpeg",
        )

        response = client.models.generate_content(
            model=MODEL_ID,
            contents=[prompt, audio_part],
            config=types.GenerateContentConfig(
                thinking_config=types.ThinkingConfig(thinking_level="medium"),
                response_mime_type="application/json",
            ),
        )

        text = response.text.strip()
        # Clean potential markdown code fences
        if text.startswith("```"):
            text = text.split("\n", 1)[1] if "\n" in text else text[3:]
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()

        return json.loads(text)

    except json.JSONDecodeError as e:
        return {"error": f"JSON 파싱 실패: {e}", "raw": response.text if 'response' in dir() else ""}
    except Exception as e:
        return {"error": f"Gemini 분석 실패: {e}"}

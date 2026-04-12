"""Gemini 3 Flash — explanation-oriented market fit analysis.

Uses model scores, deep analysis data, and reference matches to explain
why a song may or may not fit a target market.
"""

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
    "kr": """한국 음악 시장 (K-pop, K-R&B, K-hip-hop, K-ballad, K-indie)

차트 성공 요인:
- 프로덕션 퀄리티가 최상위 (글로벌 탑 수준의 믹싱/마스터링 기대)
- 후크 중심: 첫 30초 안에 킬링파트/이어캐치가 있어야 함
- 장르 하이브리드가 표준 (EDM+hip-hop+pop, R&B+trap 등)
- 보컬 테크닉 중시: 고음, 애드리브, 파트 배분의 밸런스
- 코레오 적합성: 포인트 안무에 맞는 비트 구조
- MelOn, Genie, Bugs 차트 구조 이해 필요
- 팬덤 기반 초동 vs 대중성 기반 롱런의 차이

최근 트렌드 (2024-2025):
- Y2K/뉴진스 이후 미니멀 프로덕션 유행
- 하이퍼팝 요소 감소, 그루비/펑키 사운드 부상
- 4세대 걸그룹 간 경쟁 심화 → 차별화된 컨셉 필수
- 숏폼(릴스/쇼츠) 적합성이 차트 성과와 직결""",

    "us": """미국 음악 시장 (Pop, Hip-hop, R&B, Country, Rock, Latin)

차트 성공 요인:
- 스트리밍 최적화: 인트로 5초 이내, 스킵 방지 구조
- 진정성(authenticity) 중시: 과도하게 프로듀싱된 사운드는 역효과
- TikTok/Reels 바이럴 포텐셜: 15초 클립으로 잘리는 구간 필요
- 장르 다양성: Country+Pop, Latin+Pop 크로스오버 강세
- 라디오 플레이: 3분 이내, 깔끔한 구조 (verse-chorus-verse-chorus-bridge-chorus)
- Billboard Hot 100 = streaming 50% + radio 25% + sales 25%

최근 트렌드 (2024-2025):
- Country 크로스오버 대유행 (Beyoncé, Post Malone, Shaboozey)
- Bedroom pop/indie pop 메인스트림화
- 여성 팝 르네상스 (Sabrina Carpenter, Chappell Roan, Billie Eilish)
- Lo-fi, 미니멀 프로덕션 선호 (과도한 레이어링 기피)
- Latin 영향력 확대 (Reggaeton, Bachata 요소)""",

    "jp": """일본 음악 시장 (J-pop, J-Rock, City Pop, Anime OST, Vocaloid 영향)

차트 성공 요인:
- 멜로디 복잡도가 높아도 수용됨 (전조, 복잡한 코드 진행)
- 감정적 보컬 딜리버리 중시 (기교보다 감정 전달)
- 애니메이션 타이업이 최대 마케팅 채널
- 긴 인트로 허용 (15-20초도 OK)
- 피지컬 판매(CD) 비중이 여전히 높음
- Line Music, Apple Music Japan, Oricon 차트 구조

최근 트렌드 (2024-2025):
- YOASOBI/Ado 이후 "보카로P 출신" 프로듀서 메인스트림
- 초고속 BPM (160+) J-pop이 글로벌 히트
- City Pop 리바이벌 지속
- K-pop 스타일 J-pop 그룹 증가 (XG, BE:FIRST)
- 애니메이션 OST가 Spotify Global 차트 진입""",

    "br": """브라질 음악 시장 (Funk, Sertanejo, MPB, Pagode, Trap BR, Pop)

차트 성공 요인:
- 리듬이 모든 것: 바운스, 그루브, 몸이 움직이는 비트
- Baile Funk의 특유 리듬 패턴 (150 BPM 전후, 타우키/콘템포라네우)
- 포르투갈어 가사 선호 (영어 곡도 히트하지만 현지어가 유리)
- Sertanejo = 브라질의 Country, 가장 큰 장르
- Spotify Brazil = 세계 3위 시장
- 카니발/여름 시즌 곡 사이클

최근 트렌드 (2024-2025):
- Funk 장르 세분화 (Funk Rave, Funk Pop, Funk Melody)
- Trap BR이 Funk과 합류
- Sertanejo + Pop 크로스오버
- K-pop 팬덤 브라질 내 급성장
- 로컬 아티스트 스트리밍 수 폭발적 증가""",

    "global": """글로벌 메인스트림 시장

차트 성공 요인:
- 언어 장벽 최소화: 영어 또는 반복적 훅으로 비영어권도 따라 부를 수 있어야
- Spotify Global Top 50, Apple Music Global 기준
- 크로스컬처 어필: 특정 문화에 깊게 뿌리내리면서도 보편적 감정
- 프로덕션 퀄리티 최상위
- 숏폼 바이럴 포텐셜 필수""",
}


def analyze_market_fit(audio_bytes: bytes, market: str,
                       similar_tracks: list[tuple] | None = None,
                       deep_analysis: dict | None = None,
                       market_scores: dict[str, float] | None = None,
                       audio_mime_type: str | None = None,
                       user_prompt: str | None = None,
                       hit_analysis: dict | None = None) -> str:
    """Explain market fit using the model output plus audio evidence."""
    client = _get_client()

    market_profile = MARKET_PROFILES.get(market, MARKET_PROFILES["global"])

    similar_info = ""
    if similar_tracks:
        similar_info = "\n레퍼런스 DB 유사도 결과:\n"
        for info, score in similar_tracks[:5]:
            similar_info += f"- {info.artist} - {info.title} ({info.genre}, {info.market.upper()}) — 유사도: {score:.0%}\n"

    analysis_info = ""
    if deep_analysis:
        t = deep_analysis.get("tonality", {})
        tempo = deep_analysis.get("tempo", {})
        energy = deep_analysis.get("energy", {})
        rhythm = deep_analysis.get("rhythm", {})
        spec = deep_analysis.get("spectral", {})
        vocal = deep_analysis.get("vocal", {})
        mood = deep_analysis.get("mood", {})
        prod = deep_analysis.get("production", {})
        struct = deep_analysis.get("structure", {})
        balance = spec.get("low_mid_high", {})

        analysis_info = f"""
오디오 분석 데이터:
- 템포: {tempo.get('bpm')} BPM ({tempo.get('category')})
- 키: {t.get('key_name')} (신뢰도 {t.get('confidence', 0):.0%})
- 에너지: {energy.get('category')} (다이나믹 레인지 {energy.get('dynamic_range_db')} dB)
- 댄서빌리티: {rhythm.get('danceability', 0):.0%}
- 보컬 존재감: {vocal.get('vocal_presence')} ({vocal.get('vocal_prominence', 0):.2f})
- 톤: {spec.get('brightness')} | 밸런스: {balance.get('balance')}
- 무드: {mood.get('primary_mood')} (Valence {mood.get('valence', 0):.2f}, Arousal {mood.get('arousal', 0):.2f})
- 프로덕션 폴리시: {prod.get('polish_score')}/10
- 인트로: {struct.get('intro_sec')}초 ({struct.get('intro_category')})
- 빌드업: {'있음' if energy.get('has_buildup') else '없음'} | 드롭: {'있음' if energy.get('has_drop') else '없음'}
- 하모닉/퍼커시브 비율: {vocal.get('harmonic_ratio', 0):.0%} / {vocal.get('percussive_ratio', 0):.0%}
- 주파수: Low {balance.get('low_pct')}% / Mid {balance.get('mid_pct')}% / High {balance.get('high_pct')}%
"""

    model_info = ""
    if market_scores:
        ordered_scores = sorted(market_scores.items(), key=lambda item: item[1], reverse=True)
        model_info = "\n시장 분류 모델 점수 (0-100):\n"
        for code, score in ordered_scores:
            model_info += f"- {code.upper()}: {score:.1f}\n"

    # 사용자 질문이 있으면 최우선 반영
    user_context = ""
    if user_prompt:
        user_context = f"""
━━━ 사용자 요청 (최우선) ━━━
{user_prompt}
위 요청에 맞춰서 분석하세요. 사용자가 묻는 방향에 집중해서 답변하세요.
"""

    # 히트 분석 데이터
    hit_context = ""
    if hit_analysis and not hit_analysis.get("error"):
        verdict = hit_analysis.get("verdict", "")
        detail = hit_analysis.get("verdict_detail", "")
        similar = hit_analysis.get("similar_chart_songs", [])[:3]
        sim_str = "\n".join([f"- {s['artist']} - {s['title']} (차트 {s['rank']}위, 유사도 {s['similarity']:.0%})" for s in similar])
        hit_context = f"""
━━━ 차트 기반 히트 분석 결과 ━━━
판정: {verdict}
상세: {detail}
비슷한 차트곡:
{sim_str}
"""

    prompt = f"""당신은 엔터테인먼트 업계에서 15년간 일한 A&R 전문가입니다.
곡을 직접 듣고, 아래 데이터를 참고해서 실질적인 A&R 판단과 제안을 해주세요.
{user_context}
━━━ 타겟 시장 프로파일 ━━━
{market_profile}
{hit_context}
━━━ 시장 분류 모델 ━━━
{model_info}

━━━ 정량 분석 데이터 ━━━
{analysis_info}
{similar_info}

━━━ 리포트 형식 ━━━

## 1. 곡 프로파일링

| 항목 | 분석 |
|------|------|
| 장르/서브장르 | (1차, 2차 장르 + K-pop 내 포지셔닝) |
| BPM & 그루브 | (정확한 BPM + 리듬 패턴 특성) |
| 키 & 조성 | (키 + major/minor + 전조 여부) |
| 곡 구조 | (인트로-벌스-프리코러스-코러스-브릿지 등 구조 분석) |
| 프로덕션 스타일 | (사용된 사운드 디자인, 레이어링 특징) |
| 보컬 분석 | (보컬 스타일, 레인지, 처리 방식, 하모니) |
| 레퍼런스 아티스트 | (이 곡과 가장 유사한 기존 아티스트/곡 2-3개) |

## 2. 시장 적합도 평가 ({market.upper()})

**종합 점수: X/10** (1-3: 부적합, 4-5: 조건부 가능, 6-7: 적합, 8-10: 히트 포텐셜)

### 강점 (이 시장에서 통할 수 있는 요소)
- (구체적 요소 1 — 왜 통하는지 근거 포함)
- (구체적 요소 2)
- (구체적 요소 3)

### 약점 (이 시장에서 걸리는 요소)
- (구체적 요소 1 — 왜 문제인지 + 비교 사례)
- (구체적 요소 2)
- (구체적 요소 3)

### 리스크
- (시장 진입 시 예상되는 구체적 리스크)

## 3. 차트 포텐셜 예측

- **차트 진입 가능성:** X% (Spotify {market.upper()} Top 200 기준)
- **바이럴 포텐셜:** 높음/중간/낮음 (TikTok/Reels 적합성)
- **라디오 적합성:** 높음/중간/낮음 (해당 시장 라디오 포맷 기준)
- **롱런 vs 초동:** (이 곡이 초반 폭발형인지 꾸준한 스트리밍형인지)

## 4. 프로덕션 추천사항

### 이 곡을 {market.upper()} 시장에 맞게 수정한다면:
1. (믹싱/마스터링 관점 — 구체적 주파수 대역, 라우드니스 타겟 등)
2. (편곡 관점 — 추가/제거할 악기, 레이어, 사운드 디자인)
3. (보컬 관점 — 보컬 처리, 하모니 추가, 애드리브 등)
4. (구조 관점 — 인트로 길이 조절, 코러스 반복 등)

### 비슷한 성공 사례:
- (이 시장에서 비슷한 사운드/전략으로 성공한 구체적 곡/아티스트 2-3개, 왜 성공했는지 1줄 이유 포함)

### 크로스마켓 포텐셜:
- (이 곡이 다른 시장에서도 통할 수 있는지, 어디가 가장 유리한지, 구체적 이유)

---

## 5. 릴리즈 로드맵 (8주 플랜)

이 곡의 특성과 {market.upper()} 시장에 최적화된 구체적 타임라인:

### D-56 ~ D-42 (8~6주 전): 사전 준비
- (아티스트 브랜딩/비주얼 준비 — 이 곡에 맞는 구체적 컨셉 방향)
- (티저 콘텐츠 기획 — 어떤 형태의 티저가 이 곡에 효과적인지)
- (콜라보/피처링 전략 — 이 곡에 맞는 아티스트 타입)

### D-42 ~ D-28 (6~4주 전): 프리프로모션
- (Spotify for Artists 피칭 — 이 곡에 적합한 피칭 키워드/무드/장르 태그)
- (SNS 티징 전략 — 이 곡의 어떤 구간을 어떻게 티징할지)
- (프리세이브 캠페인 전략)

### D-28 ~ D-14 (4~2주 전): 빌드업
- (숏폼 콘텐츠 전략 — 이 곡의 7-15초 바이럴 구간 특정, TikTok/Reels 포맷)
- (인플루언서/크리에이터 시딩 — {market.upper()} 시장에 맞는 크리에이터 타입과 규모)
- (미디어/PR 전략 — 타겟 매체 리스트)

### D-7 ~ D-Day (1주 전 ~ 릴리즈일):
- (릴리즈 당일 전략 — 시간대, 플랫폼별 동시 행동)
- (팬 참여 이벤트 — 이 곡에 맞는 챌린지/이벤트 아이디어)
- (라이브 이벤트 — 쇼케이스, V-Live, 인스타 라이브 등)

### D+1 ~ D+14 (릴리즈 후 2주): 모멘텀 유지
- (차트 액션 — 이 시장에서 차트 진입을 위한 구체적 전략)
- (2차 콘텐츠 — 비하인드, 챌린지 확산, 리믹스 등)
- (플레이리스트 후속 피칭 — 에디토리얼 외 유저 큐레이션 플레이리스트 공략)

### D+14 ~ D+28 (릴리즈 후 2~4주): 롱테일
- (해외 시장 확장 타이밍 — 다음 타겟 시장과 진입 전략)
- (라이브 퍼포먼스/음악 방송 스케줄링)
- (다음 릴리즈 연결 전략)

---

## 6. 마케팅 전략 & 예산 가이드

### 플랫폼별 전략

| 플랫폼 | 전략 | 우선순위 | 예상 비용 |
|--------|------|----------|-----------|
| TikTok | (이 곡에 맞는 구체적 TikTok 전략 — 챌린지 아이디어, 사운드 클립 구간, 해시태그) | 상/중/하 | $X~$Y |
| Instagram Reels | (Reels 전략 — 비주얼 스타일, 콘텐츠 유형) | 상/중/하 | $X~$Y |
| YouTube | (MV/콘텐츠 전략 — Shorts vs 풀MV vs 비하인드) | 상/중/하 | $X~$Y |
| Spotify | (플레이리스트 피칭 전략 — 타겟 플레이리스트 이름 5개 이상) | 상/중/하 | $X~$Y |
| {market.upper()} 로컬 플랫폼 | (해당 시장의 로컬 플랫폼 전략 — MelOn/Genie/Bugs, Line Music, Deezer 등) | 상/중/하 | $X~$Y |

### 타겟 플레이리스트 (구체적 이름)

Spotify 에디토리얼:
- (이 곡이 들어갈 수 있는 Spotify 에디토리얼 플레이리스트 이름 3-5개)

유저 큐레이션:
- (팔로워 수 만 단위 이상의 큰 유저 큐레이션 플레이리스트 3-5개)

### 예산 시나리오

| 규모 | 총 예산 | 핵심 집행 항목 | 기대 결과 |
|------|---------|----------------|-----------|
| 미니멀 | $1,000-3,000 | (이 예산에서 가장 효과적인 2-3가지) | (현실적 기대치) |
| 스탠다드 | $5,000-15,000 | (이 예산에서의 풀 캠페인) | (현실적 기대치) |
| 프리미엄 | $30,000+ | (메이저 레벨 캠페인) | (현실적 기대치) |

### KPI & 성과 측정

| 지표 | 1주차 목표 | 4주차 목표 | 측정 방법 |
|------|-----------|-----------|-----------|
| Spotify 스트림 | X | X | Spotify for Artists |
| TikTok 사용 수 | X | X | TikTok Analytics |
| Shazam 횟수 | X | X | Shazam for Artists |
| 플레이리스트 추가 | X개 | X개 | Chartmetric/Spotify |
| SNS 팔로워 증가 | X% | X% | 플랫폼 인사이트 |

---

## 7. 리스크 & 대응 전략

| 리스크 | 발생 가능성 | 영향도 | 대응 전략 |
|--------|------------|--------|-----------|
| (이 곡/시장 특유의 리스크 1) | 높음/중간/낮음 | 높음/중간/낮음 | (구체적 대응) |
| (리스크 2) | | | |
| (리스크 3) | | | |

━━━ 작성 규칙 ━━━
- 모든 답변은 한국어로
- 모호한 표현 절대 금지. "좋은 멜로디"가 아니라 "프리코러스에서 4도 상행하는 훅이 코러스 진입을 효과적으로 만든다" 수준
- 정량 데이터를 근거로 활용하되, 귀로 들은 정성적 판단을 우선
- 시장 분류 모델 점수와 정면으로 모순되는 결론을 내리지 말고, 왜 점수가 높거나 낮게 나온 것인지 해석할 것
- 실제 차트 데이터/아티스트/플레이리스트 이름을 레퍼런스로 사용
- 예산은 USD 기준, 현실적 수치만 (2026년 기준)
- 로드맵은 이 곡의 구체적 특성에 맞춤 (일반론 금지)
- TikTok 바이럴 구간은 곡의 정확한 타임스탬프로 지정
- A&R 미팅에서 바로 실행 가능한 수준의 액션 아이템
- 숫자가 필요한 곳에는 반드시 숫자를 넣을 것 (KPI, 예산, 기간, 목표치)"""

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
            ),
        )
        return response.text
    except Exception as e:
        return f"Gemini 분석 실패: {e}\n\n(API 키를 확인하거나 나중에 다시 시도하세요)"

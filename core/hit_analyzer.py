"""히트 분석 엔진 — 실제 차트 데이터 기반.

435곡 librosa 레퍼런스가 아니라, 30,000곡 실제 차트 데이터를 기준으로
"이 곡의 특성이 실제 히트곡들과 얼마나 맞는지"를 판단.

핵심: "예측"이 아니라 "근거 제시".
"이 곡이 히트한다"가 아니라 "이 시장에서 히트한 곡들은 이런 특성이 있고,
당신의 곡은 여기에 해당한다/안 한다"를 보여줌.
"""

import io
from pathlib import Path
import numpy as np
import pandas as pd
import librosa
from scipy.stats import percentileofscore

from core.markets import COUNTRY_TO_MARKET, MARKETS
from core.config import ANALYSIS_DURATION_SECONDS

CHARTS_FILE = Path(__file__).parent.parent / "data" / "kaggle" / "charts" / "universal_top_spotify_songs.csv"

_cache = {}


def _load_charts():
    if "charts" not in _cache:
        if CHARTS_FILE.exists():
            df = pd.read_csv(CHARTS_FILE, low_memory=False)
            df["market"] = df["country"].map(COUNTRY_TO_MARKET)
            _cache["charts"] = df
        else:
            _cache["charts"] = pd.DataFrame()
    return _cache["charts"]


def _extract_spotify_compatible_features(audio_bytes: bytes) -> dict:
    """librosa에서 Spotify 호환 피처를 추출.

    Spotify의 danceability, energy, valence 등과 직접 비교 가능한
    수치를 librosa로 근사 계산.
    """
    y, sr = librosa.load(io.BytesIO(audio_bytes), sr=22050, duration=ANALYSIS_DURATION_SECONDS)

    # Energy (RMS 기반, 0-1로 정규화)
    rms = librosa.feature.rms(y=y)[0]
    energy = float(np.clip(np.mean(rms) * 8, 0, 1))

    # Loudness (dBFS)
    loudness = float(20 * np.log10(np.mean(rms) + 1e-10))

    # Tempo
    tempo = float(np.atleast_1d(librosa.beat.beat_track(y=y, sr=sr)[0])[0])

    # Danceability (템포 안정성 + 비트 강도 기반 근사)
    onset_env = librosa.onset.onset_strength(y=y, sr=sr)
    _, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
    if len(beat_frames) > 2:
        beat_intervals = np.diff(beat_frames)
        beat_regularity = 1.0 - float(np.std(beat_intervals) / (np.mean(beat_intervals) + 1e-6))
    else:
        beat_regularity = 0.5
    tempo_score = 1.0 - abs(tempo - 120) / 80
    danceability = float(np.clip(0.4 * max(0, tempo_score) + 0.3 * max(0, beat_regularity) + 0.3 * min(1, np.mean(onset_env) / 3), 0, 1))

    # Valence (밝기. spectral centroid + major/minor 기반 근사)
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
    chroma_mean = np.mean(chroma, axis=1)
    # Major key profile correlation
    major_profile = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
    major_corr = max(np.corrcoef(np.roll(chroma_mean, -i), major_profile)[0, 1] for i in range(12))
    centroid = float(np.mean(librosa.feature.spectral_centroid(y=y, sr=sr)))
    brightness = min(1, centroid / 5000)
    valence = float(np.clip(0.4 * (major_corr + 1) / 2 + 0.3 * brightness + 0.3 * energy, 0, 1))

    # Speechiness (음성 비율 근사)
    zcr = float(np.mean(librosa.feature.zero_crossing_rate(y)))
    speechiness = float(np.clip(zcr * 3, 0, 1))

    # Acousticness
    S = np.abs(librosa.stft(y))
    spectral_flatness = float(np.mean(librosa.feature.spectral_flatness(y=y)))
    acousticness = float(np.clip(1.0 - energy * 0.5 - spectral_flatness * 2, 0, 1))

    # Instrumentalness (보컬 영역 에너지로 근사)
    freqs = librosa.fft_frequencies(sr=sr)
    vocal_mask = (freqs >= 300) & (freqs <= 3400)
    vocal_ratio = float(np.mean(S[vocal_mask, :]) / (np.mean(S) + 1e-10))
    instrumentalness = float(np.clip(1.0 - vocal_ratio * 0.5, 0, 1))

    # Liveness
    liveness = float(np.clip(np.std(rms) / (np.mean(rms) + 1e-6) * 0.3, 0, 1))

    # Duration
    duration_ms = int(len(y) / sr * 1000)

    return {
        "danceability": round(danceability, 3),
        "energy": round(energy, 3),
        "loudness": round(loudness, 1),
        "speechiness": round(speechiness, 3),
        "acousticness": round(acousticness, 3),
        "instrumentalness": round(instrumentalness, 3),
        "liveness": round(liveness, 3),
        "valence": round(valence, 3),
        "tempo": round(tempo, 1),
        "duration_ms": duration_ms,
    }


def analyze_hit_potential(audio_bytes: bytes, target_market: str = "kr") -> dict:
    """실제 차트 데이터 기반 히트 가능성 분석.

    반환하는 것:
    1. 시장별 히트곡 대비 피처 위치 (백분위)
    2. 가장 비슷한 실제 차트곡
    3. 근거 기반 판단 (왜 맞는지/안 맞는지)
    """
    charts = _load_charts()
    if charts.empty:
        return {"error": "차트 데이터 없음"}

    # 1. Spotify 호환 피처 추출
    track_features = _extract_spotify_compatible_features(audio_bytes)

    # 2. 타겟 시장의 차트곡들
    market_df = charts[charts["market"] == target_market].drop_duplicates("spotify_id")
    if len(market_df) < 10:
        return {"error": f"{target_market} 시장 데이터 부족"}

    top10_df = charts[(charts["market"] == target_market) & (charts["daily_rank"] <= 10)].drop_duplicates("spotify_id")

    FEATURES = ["danceability", "energy", "loudness", "speechiness", "acousticness",
                 "instrumentalness", "liveness", "valence", "tempo"]

    # 3. 각 피처의 백분위 계산 (이 시장에서 내 곡이 어디에 위치하는지)
    percentiles = {}
    comparisons = []
    for feat in FEATURES:
        market_vals = market_df[feat].dropna()
        top10_vals = top10_df[feat].dropna()
        my_val = track_features[feat]

        pct = percentileofscore(market_vals, my_val)
        top10_mean = float(top10_vals.mean()) if len(top10_vals) > 0 else 0
        market_mean = float(market_vals.mean())
        diff_from_hit = my_val - top10_mean

        percentiles[feat] = round(pct, 1)

        # 판단 생성
        status = "적합" if abs(pct - 50) < 30 else ("높음" if pct > 80 else "낮음")
        if feat in ["danceability", "energy", "valence"]:
            # 이 피처들은 Top 10과의 차이가 중요
            if abs(diff_from_hit) < 0.1:
                status = "적합"
            elif diff_from_hit > 0.1:
                status = "높음"
            else:
                status = "낮음"

        comparisons.append({
            "feature": feat,
            "my_value": my_val,
            "market_avg": round(market_mean, 3),
            "top10_avg": round(top10_mean, 3),
            "diff_from_hit": round(diff_from_hit, 3),
            "percentile": round(pct, 1),
            "status": status,
        })

    # 4. 가장 비슷한 실제 차트곡 찾기 (Spotify 피처 기반)
    chart_features = market_df[FEATURES].dropna()
    if len(chart_features) > 0:
        my_vec = np.array([track_features[f] for f in FEATURES])
        # 정규화
        from sklearn.preprocessing import StandardScaler
        scaler = StandardScaler().fit(chart_features.values)
        my_norm = scaler.transform(my_vec.reshape(1, -1))
        chart_norm = scaler.transform(chart_features.values)

        from sklearn.metrics.pairwise import cosine_similarity
        sims = cosine_similarity(my_norm, chart_norm)[0]
        top_indices = np.argsort(sims)[::-1][:10]

        similar_chart_songs = []
        for idx in top_indices:
            row = market_df.iloc[idx]
            similar_chart_songs.append({
                "title": row.get("name", ""),
                "artist": row.get("artists", ""),
                "similarity": round(float(sims[idx]), 3),
                "rank": int(row.get("daily_rank", 0)),
                "popularity": int(row.get("popularity", 0)),
                "danceability": round(float(row.get("danceability", 0)), 3),
                "energy": round(float(row.get("energy", 0)), 3),
                "valence": round(float(row.get("valence", 0)), 3),
            })
    else:
        similar_chart_songs = []

    # 5. 전체 시장 스코어 (모든 12개 시장)
    all_market_scores = {}
    for market in MARKETS:
        if market == "global":
            continue
        mdf = charts[(charts["market"] == market) & (charts["daily_rank"] <= 20)].drop_duplicates("spotify_id")
        if len(mdf) < 5:
            continue
        mfeat = mdf[FEATURES].dropna()
        if len(mfeat) == 0:
            continue
        # 해당 시장의 Top 20과의 평균 유사도
        sc = StandardScaler().fit(mfeat.values)
        my_n = sc.transform(my_vec.reshape(1, -1))
        m_n = sc.transform(mfeat.values)
        sim = cosine_similarity(my_n, m_n)[0]
        all_market_scores[market] = round(float(np.mean(np.sort(sim)[::-1][:5]) * 100), 1)

    # 6. 종합 판단
    fit_count = sum(1 for c in comparisons if c["status"] == "적합")
    total_feats = len(comparisons)
    fit_ratio = fit_count / total_feats

    if fit_ratio >= 0.7:
        verdict = "이 시장의 히트곡 패턴과 잘 맞아요"
        verdict_detail = f"9개 피처 중 {fit_count}개가 히트곡 범위 안에 있어요."
    elif fit_ratio >= 0.4:
        verdict = "일부 맞지만 조정이 필요해요"
        low_feats = [c["feature"] for c in comparisons if c["status"] == "낮음"]
        high_feats = [c["feature"] for c in comparisons if c["status"] == "높음"]
        details = []
        if low_feats:
            details.append(f"{', '.join(low_feats)}이 히트곡보다 낮아요")
        if high_feats:
            details.append(f"{', '.join(high_feats)}이 히트곡보다 높아요")
        verdict_detail = ". ".join(details) + "."
    else:
        verdict = "이 시장과는 잘 안 맞아요"
        best_market = max(all_market_scores, key=all_market_scores.get) if all_market_scores else target_market
        verdict_detail = f"다른 시장을 고려해보세요. {best_market.upper()}이 더 맞을 수 있어요."

    return {
        "track_features": track_features,
        "target_market": target_market,
        "market_name": MARKETS.get(target_market, target_market),
        "comparisons": comparisons,
        "percentiles": percentiles,
        "similar_chart_songs": similar_chart_songs,
        "market_scores": all_market_scores,
        "best_market": max(all_market_scores, key=all_market_scores.get) if all_market_scores else target_market,
        "verdict": verdict,
        "verdict_detail": verdict_detail,
        "fit_ratio": round(fit_ratio, 2),
        "sample_size": {
            "market_tracks": len(market_df),
            "top10_tracks": len(top10_df),
        },
    }


def analyze_timing(audio_bytes: bytes, target_market: str = "kr") -> dict:
    """시기별 히트 패턴 분석 — "지금 이 곡을 내면 맞는지"."""
    from datetime import datetime

    charts = _load_charts()
    if charts.empty:
        return {"error": "차트 데이터 없음"}

    features = _extract_spotify_compatible_features(audio_bytes)
    charts["snapshot_date"] = pd.to_datetime(charts["snapshot_date"])
    charts["month"] = charts["snapshot_date"].dt.month

    market_df = charts[(charts["market"] == target_market) & (charts["daily_rank"] <= 10)]
    if len(market_df) < 50:
        return {"error": "데이터 부족"}

    current_month = datetime.now().month

    # 현재 월의 히트곡 특성
    current_month_hits = market_df[market_df["month"] == current_month]
    FEATURES = ["danceability", "energy", "valence", "tempo", "loudness"]

    current_pattern = {}
    for f in FEATURES:
        vals = current_month_hits[f].dropna()
        if len(vals) > 0:
            current_pattern[f] = {
                "avg": round(float(vals.mean()), 3),
                "my_value": features.get(f, 0),
                "diff": round(features.get(f, 0) - float(vals.mean()), 3),
                "fit": abs(features.get(f, 0) - float(vals.mean())) < float(vals.std()) * 1.5,
            }

    # 어떤 월이 이 곡에 가장 맞는지
    best_month = None
    best_score = -1
    monthly_fit = []

    for month in range(1, 13):
        month_df = market_df[market_df["month"] == month]
        if len(month_df) < 10:
            continue

        fit_score = 0
        for f in FEATURES:
            vals = month_df[f].dropna()
            if len(vals) == 0:
                continue
            my_val = features.get(f, 0)
            mean = float(vals.mean())
            std = float(vals.std()) + 1e-6
            # 평균에 가까울수록 점수 높음
            z = abs(my_val - mean) / std
            fit_score += max(0, 1 - z * 0.5)

        fit_score = fit_score / len(FEATURES) * 100
        monthly_fit.append({"month": month, "score": round(fit_score, 1)})

        if fit_score > best_score:
            best_score = fit_score
            best_month = month

    MONTH_NAMES = {1:"1월",2:"2월",3:"3월",4:"4월",5:"5월",6:"6월",
                   7:"7월",8:"8월",9:"9월",10:"10월",11:"11월",12:"12월"}

    # 현재 월 적합도
    current_fit = next((m for m in monthly_fit if m["month"] == current_month), {"score": 0})

    if current_fit["score"] >= 70:
        timing_verdict = f"지금({MONTH_NAMES[current_month]}) 내기 좋은 곡이에요"
    elif current_fit["score"] >= 50:
        timing_verdict = f"지금 내도 괜찮지만, {MONTH_NAMES.get(best_month, '')}이 더 맞아요"
    else:
        timing_verdict = f"지금보다 {MONTH_NAMES.get(best_month, '')}에 내는 게 나아요"

    return {
        "target_market": target_market,
        "current_month": current_month,
        "current_month_fit": current_fit["score"],
        "best_month": best_month,
        "best_month_score": round(best_score, 1),
        "timing_verdict": timing_verdict,
        "monthly_fit": monthly_fit,
        "current_pattern": current_pattern,
        "track_features": features,
    }

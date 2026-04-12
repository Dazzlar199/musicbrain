"""Production Benchmarking Engine.

Compares uploaded track against market-specific production standards
derived from the reference database. Gives actionable mixing/mastering
feedback with exact dB values and frequency targets.

This is domain knowledge that requires audio engineering expertise to design.
No API sells this. Chartmetric and Viberate don't touch production-level analysis.
"""

import numpy as np
import librosa
import io

from core.similarity import ReferenceDatabase, MARKETS
from core.config import ANALYSIS_DURATION_SECONDS


def _extract_benchmark_features(y: np.ndarray, sr: int) -> dict:
    """Extract production-relevant features for benchmarking."""
    S = np.abs(librosa.stft(y))
    S_db = librosa.amplitude_to_db(S, ref=np.max)
    freqs = librosa.fft_frequencies(sr=sr)

    # Frequency band energy (dB)
    def band_energy(low, high):
        mask = (freqs >= low) & (freqs < high)
        if not mask.any():
            return -60.0
        return float(np.mean(S_db[mask, :]))

    sub_bass = band_energy(20, 60)       # Sub bass
    bass = band_energy(60, 250)          # Bass
    low_mid = band_energy(250, 500)      # Low mid
    mid = band_energy(500, 2000)         # Mid
    upper_mid = band_energy(2000, 4000)  # Upper mid (presence)
    high = band_energy(4000, 8000)       # High (brilliance)
    air = band_energy(8000, 16000)       # Air

    # RMS & dynamics
    rms = librosa.feature.rms(y=y)[0]
    lufs_estimate = float(20 * np.log10(np.mean(rms) + 1e-10))

    # Peak-to-RMS ratio (crest factor)
    peak = float(np.max(np.abs(y)))
    crest_factor = float(20 * np.log10(peak / (np.mean(rms) + 1e-10)))

    # Spectral characteristics
    centroid = float(np.mean(librosa.feature.spectral_centroid(y=y, sr=sr)))
    rolloff = float(np.mean(librosa.feature.spectral_rolloff(y=y, sr=sr)))
    flatness = float(np.mean(librosa.feature.spectral_flatness(y=y)))

    # Stereo width (if stereo)
    # We work with mono here, but track the harmonic/percussive balance
    y_harm, y_perc = librosa.effects.hpss(y)
    hp_ratio = float(np.sum(y_harm**2) / (np.sum(y**2) + 1e-10))

    # Tempo
    tempo = float(np.atleast_1d(librosa.beat.beat_track(y=y, sr=sr)[0])[0])

    return {
        "sub_bass_db": round(sub_bass, 1),
        "bass_db": round(bass, 1),
        "low_mid_db": round(low_mid, 1),
        "mid_db": round(mid, 1),
        "upper_mid_db": round(upper_mid, 1),
        "high_db": round(high, 1),
        "air_db": round(air, 1),
        "lufs_estimate": round(lufs_estimate, 1),
        "crest_factor_db": round(crest_factor, 1),
        "peak_db": round(float(20 * np.log10(peak + 1e-10)), 1),
        "spectral_centroid": round(centroid),
        "spectral_rolloff": round(rolloff),
        "spectral_flatness": round(flatness, 4),
        "harmonic_ratio": round(hp_ratio, 3),
        "tempo": round(tempo, 1),
    }


def build_market_profile(db: ReferenceDatabase, market: str) -> dict | None:
    """Build average production profile for a market from reference tracks."""
    tracks = [t for t in db.tracks if t.info.market == market]
    if not tracks:
        return None

    # We need to re-analyze reference audio files for benchmark features
    # Use cached features from the track's source path
    profiles = []
    for t in tracks:
        if not t.info.source or t.info.source == "bootstrap_demo":
            continue
        try:
            y, sr = librosa.load(t.info.source, sr=22050, duration=ANALYSIS_DURATION_SECONDS)
            prof = _extract_benchmark_features(y, sr)
            profiles.append(prof)
        except Exception:
            continue

    if len(profiles) < 3:
        return None

    # Calculate mean and std for each feature
    result = {}
    keys = profiles[0].keys()
    for key in keys:
        values = [p[key] for p in profiles]
        result[key] = {
            "mean": round(float(np.mean(values)), 1),
            "std": round(float(np.std(values)), 1),
            "min": round(float(np.min(values)), 1),
            "max": round(float(np.max(values)), 1),
            "p25": round(float(np.percentile(values, 25)), 1),
            "p75": round(float(np.percentile(values, 75)), 1),
        }
    result["_sample_count"] = len(profiles)
    return result


def benchmark_track(audio_bytes: bytes, db: ReferenceDatabase,
                    market: str) -> dict:
    """Compare a track against market production standards.

    Returns detailed comparison with actionable feedback.
    """
    y, sr = librosa.load(io.BytesIO(audio_bytes), sr=22050,
                         duration=ANALYSIS_DURATION_SECONDS)
    track_profile = _extract_benchmark_features(y, sr)

    market_profile = build_market_profile(db, market)

    if market_profile is None:
        return {
            "track": track_profile,
            "market_profile": None,
            "comparisons": [],
            "sample_count": 0,
            "match_score": 0,
            "market": market,
            "market_name": MARKETS.get(market, market),
            "error": "Not enough reference tracks for this market",
        }

    # Build comparisons
    comparisons = []
    feature_labels = {
        "sub_bass_db": ("Sub Bass (20-60Hz)", "dB", "서브 베이스"),
        "bass_db": ("Bass (60-250Hz)", "dB", "베이스"),
        "low_mid_db": ("Low Mid (250-500Hz)", "dB", "로우 미드"),
        "mid_db": ("Mid (500-2kHz)", "dB", "미드"),
        "upper_mid_db": ("Upper Mid (2-4kHz)", "dB", "어퍼 미드 (존재감)"),
        "high_db": ("High (4-8kHz)", "dB", "하이 (밝기)"),
        "air_db": ("Air (8-16kHz)", "dB", "에어 (공기감)"),
        "lufs_estimate": ("Loudness (LUFS est.)", "dB", "라우드니스"),
        "crest_factor_db": ("Crest Factor", "dB", "크레스트 팩터 (다이나믹)"),
        "spectral_centroid": ("Spectral Centroid", "Hz", "스펙트럼 중심"),
        "harmonic_ratio": ("Harmonic Ratio", "", "하모닉 비율"),
        "tempo": ("Tempo", "BPM", "템포"),
    }

    for key, (label, unit, kr_label) in feature_labels.items():
        if key not in market_profile:
            continue

        track_val = track_profile[key]
        market_mean = market_profile[key]["mean"]
        market_std = market_profile[key]["std"]
        market_p25 = market_profile[key]["p25"]
        market_p75 = market_profile[key]["p75"]

        diff = track_val - market_mean
        if market_std > 0:
            z_score = diff / market_std
        else:
            z_score = 0

        # Determine status
        if abs(z_score) < 0.5:
            status = "match"
            status_kr = "적합"
        elif abs(z_score) < 1.0:
            status = "slight"
            status_kr = "약간 차이"
        elif abs(z_score) < 1.5:
            status = "notable"
            status_kr = "조정 필요"
        else:
            status = "critical"
            status_kr = "큰 차이"

        direction = "higher" if diff > 0 else "lower" if diff < 0 else "equal"
        direction_kr = "높음" if diff > 0 else "낮음" if diff < 0 else "동일"

        # Generate actionable advice
        advice = _generate_advice(key, diff, z_score, unit, kr_label)

        comparisons.append({
            "feature": key,
            "label": label,
            "kr_label": kr_label,
            "unit": unit,
            "track_value": track_val,
            "market_mean": market_mean,
            "market_std": market_std,
            "market_range": f"{market_p25}~{market_p75}",
            "diff": round(diff, 1),
            "z_score": round(z_score, 2),
            "status": status,
            "status_kr": status_kr,
            "direction": direction,
            "direction_kr": direction_kr,
            "advice": advice,
        })

    # Overall production match score
    z_scores = [abs(c["z_score"]) for c in comparisons]
    avg_z = np.mean(z_scores) if z_scores else 0
    match_score = max(0, min(100, round(100 - avg_z * 25)))

    return {
        "track": track_profile,
        "market_profile": {k: v for k, v in market_profile.items() if k != "_sample_count"},
        "sample_count": market_profile.get("_sample_count", 0),
        "comparisons": comparisons,
        "match_score": match_score,
        "market": market,
        "market_name": MARKETS.get(market, market),
    }


def _generate_advice(key: str, diff: float, z_score: float, unit: str, kr_label: str) -> str:
    """Generate specific mixing/mastering advice."""
    if abs(z_score) < 0.5:
        return f"{kr_label} 시장 기준에 부합합니다."

    abs_diff = abs(diff)
    direction = "올리세요" if diff < 0 else "줄이세요"

    advice_map = {
        "sub_bass_db": f"서브 베이스를 {abs_diff:.1f}dB {direction}. 20-60Hz 대역 EQ 조정.",
        "bass_db": f"베이스를 {abs_diff:.1f}dB {direction}. 60-250Hz 대역. 킥과 베이스 밸런스 확인.",
        "low_mid_db": f"로우 미드 {abs_diff:.1f}dB {direction}. 250-500Hz — 탁함(muddy) 또는 얇음(thin) 영역.",
        "mid_db": f"미드 {abs_diff:.1f}dB {direction}. 500-2kHz — 보컬/악기 본체 영역.",
        "upper_mid_db": f"어퍼 미드 {abs_diff:.1f}dB {direction}. 2-4kHz — 존재감/어택 영역. {'보컬이 묻힐 수 있음' if diff < 0 else '귀 피로감 주의'}.",
        "high_db": f"하이를 {abs_diff:.1f}dB {direction}. 4-8kHz — {'밝기 부족, 답답한 느낌' if diff < 0 else '치찰음(sibilance) 과다 주의'}.",
        "air_db": f"에어를 {abs_diff:.1f}dB {direction}. 8-16kHz — {'공기감 부족' if diff < 0 else '노이즈/히스 주의'}.",
        "lufs_estimate": f"전체 라우드니스 {abs_diff:.1f}dB {direction}. {'마스터링에서 리미터/컴프레서 조정' if diff < 0 else '다이나믹 레인지 확보 필요'}.",
        "crest_factor_db": f"다이나믹 레인지 {'부족 — 과도한 컴프레션. 리미터 threshold를 올리세요.' if diff < 0 else '과다 — 좀 더 컴프레션 필요. 버스 컴프레서 추가 고려.'}",
        "spectral_centroid": f"전체 톤이 {'어두움 — 하이 쉘프 EQ +{abs_diff:.0f}Hz 방향으로 밝기 추가' if diff < 0 else '밝음 — 로우 쉘프로 따뜻함 추가'}.",
        "harmonic_ratio": f"하모닉 비율 {direction}. {'퍼커시브 요소가 많음 — 멜로딕 레이어 추가 고려' if diff < 0 else '하모닉 과다 — 리듬 섹션 강화 고려'}.",
        "tempo": f"템포 차이 {abs_diff:.0f} BPM. 시장 평균 대비 {'느림' if diff < 0 else '빠름'}.",
    }

    return advice_map.get(key, f"{kr_label} {abs_diff:.1f}{unit} 차이.")


def find_viral_segment(audio_bytes: bytes, sr: int = 22050,
                       segment_duration: float = 12.0) -> dict:
    """Find the most viral-potential 7-15 second segment.

    Scores each segment based on:
    - Energy peak (high energy = attention grabbing)
    - Onset density (rhythmic catchiness)
    - Spectral flux (sonic interest/change)
    - Repetition potential (hookiness — self-similarity)
    - Vocal presence (vocal hooks are more shareable)

    Returns timestamp + score + reason.
    """
    y, sr = librosa.load(io.BytesIO(audio_bytes), sr=sr,
                         duration=ANALYSIS_DURATION_SECONDS)

    hop_length = 512
    frame_duration = hop_length / sr

    # Compute features
    rms = librosa.feature.rms(y=y, hop_length=hop_length)[0]
    onset_env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop_length)
    spectral_flux = np.diff(
        np.abs(librosa.stft(y, hop_length=hop_length)), axis=1
    )
    spectral_flux_mean = np.mean(np.abs(spectral_flux), axis=0)
    # Pad to match length
    spectral_flux_mean = np.pad(spectral_flux_mean, (1, 0))

    # Vocal presence (harmonic content in 300-3400Hz)
    S = np.abs(librosa.stft(y, hop_length=hop_length))
    freqs = librosa.fft_frequencies(sr=sr)
    vocal_mask = (freqs >= 300) & (freqs <= 3400)
    vocal_energy = np.mean(S[vocal_mask, :], axis=0)
    total_energy_per_frame = np.mean(S, axis=0) + 1e-10
    vocal_ratio = vocal_energy / total_energy_per_frame

    # Self-similarity for repetition detection
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr, hop_length=hop_length)

    # Segment scoring
    seg_frames = int(segment_duration / frame_duration)
    n_frames = min(len(rms), len(onset_env), len(vocal_ratio))
    if seg_frames >= n_frames:
        seg_frames = n_frames // 2

    best_score = -1
    best_start = 0
    all_segments = []

    for start in range(0, n_frames - seg_frames, seg_frames // 4):
        end = start + seg_frames

        # Energy score (normalized)
        energy_score = float(np.mean(rms[start:end]) / (np.max(rms) + 1e-10))

        # Onset density (rhythmic catchiness)
        onset_score = float(np.mean(onset_env[start:end]) / (np.max(onset_env) + 1e-10))

        # Spectral flux (sonic interest)
        sf_end = min(end, len(spectral_flux_mean))
        flux_score = float(np.mean(spectral_flux_mean[start:sf_end]) / (np.max(spectral_flux_mean) + 1e-10))

        # Vocal presence
        vr_end = min(end, len(vocal_ratio))
        vocal_score = float(np.mean(vocal_ratio[start:vr_end]) / (np.max(vocal_ratio) + 1e-10))

        # Repetition (self-similarity of chroma in this segment)
        chroma_seg = chroma[:, start:end]
        if chroma_seg.shape[1] > 4:
            self_sim = librosa.segment.recurrence_matrix(chroma_seg, mode='affinity')
            rep_score = float(np.mean(self_sim))
        else:
            rep_score = 0.3

        # Composite score (weighted)
        composite = (
            0.25 * energy_score +
            0.25 * onset_score +
            0.15 * flux_score +
            0.20 * vocal_score +
            0.15 * rep_score
        )

        time_start = round(start * frame_duration, 1)
        time_end = round(end * frame_duration, 1)

        all_segments.append({
            "start_sec": time_start,
            "end_sec": time_end,
            "score": round(composite, 3),
            "energy": round(energy_score, 3),
            "rhythm": round(onset_score, 3),
            "interest": round(flux_score, 3),
            "vocal": round(vocal_score, 3),
            "hookiness": round(rep_score, 3),
        })

        if composite > best_score:
            best_score = composite
            best_start = start

    # Get best segment details
    best_time_start = round(best_start * frame_duration, 1)
    best_time_end = round((best_start + seg_frames) * frame_duration, 1)

    best_seg = next((s for s in all_segments
                     if s["start_sec"] == best_time_start), all_segments[0] if all_segments else {})

    # Determine why this segment is viral
    reasons = []
    if best_seg.get("energy", 0) > 0.7:
        reasons.append("에너지 피크 구간 — 주목도 높음")
    if best_seg.get("rhythm", 0) > 0.7:
        reasons.append("리듬 밀도 높음 — 몸이 반응하는 구간")
    if best_seg.get("vocal", 0) > 0.7:
        reasons.append("보컬 존재감 강함 — 따라 부르기 쉬운 구간")
    if best_seg.get("hookiness", 0) > 0.6:
        reasons.append("반복 패턴 감지 — 훅/킬링파트 가능성")
    if best_seg.get("interest", 0) > 0.7:
        reasons.append("사운드 변화 큼 — 귀를 잡는 구간")
    if not reasons:
        reasons.append("종합 점수 최고 구간")

    # Top 3 segments
    sorted_segs = sorted(all_segments, key=lambda s: s["score"], reverse=True)[:3]

    return {
        "best": {
            "start_sec": best_time_start,
            "end_sec": best_time_end,
            "timestamp": f"{int(best_time_start//60)}:{int(best_time_start%60):02d} ~ {int(best_time_end//60)}:{int(best_time_end%60):02d}",
            "score": round(best_score, 3),
            "reasons": reasons,
            "details": best_seg,
        },
        "top3": sorted_segs,
        "segment_duration": segment_duration,
    }


def compare_ab(audio_a_bytes: bytes, audio_b_bytes: bytes,
               db: ReferenceDatabase, market: str) -> dict:
    """Compare two mixes of the same track against a market.

    Returns which version fits the market better and why.
    """
    bench_a = benchmark_track(audio_a_bytes, db, market)
    bench_b = benchmark_track(audio_b_bytes, db, market)
    viral_a = find_viral_segment(audio_a_bytes)
    viral_b = find_viral_segment(audio_b_bytes)

    # Compare match scores
    score_a = bench_a.get("match_score", 0)
    score_b = bench_b.get("match_score", 0)
    winner = "A" if score_a > score_b else "B" if score_b > score_a else "TIE"

    # Find specific differences
    differences = []
    for comp_a in bench_a["comparisons"]:
        comp_b = next((c for c in bench_b["comparisons"]
                       if c["feature"] == comp_a["feature"]), None)
        if comp_b is None:
            continue

        if abs(comp_a["z_score"]) != abs(comp_b["z_score"]):
            better = "A" if abs(comp_a["z_score"]) < abs(comp_b["z_score"]) else "B"
            differences.append({
                "feature": comp_a["kr_label"],
                "a_value": comp_a["track_value"],
                "b_value": comp_b["track_value"],
                "a_status": comp_a["status_kr"],
                "b_status": comp_b["status_kr"],
                "better": better,
                "unit": comp_a["unit"],
            })

    return {
        "winner": winner,
        "score_a": score_a,
        "score_b": score_b,
        "viral_a": viral_a["best"],
        "viral_b": viral_b["best"],
        "differences": sorted(differences,
                              key=lambda d: abs(d["a_value"] - d["b_value"]),
                              reverse=True),
        "market": market,
        "market_name": MARKETS.get(market, market),
    }

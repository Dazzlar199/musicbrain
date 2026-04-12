"""Deep audio analysis — production-grade feature extraction.

Goes beyond basic features to extract musically meaningful attributes
that an A&R professional would care about.
"""

import io
import numpy as np
import librosa

from core.config import ANALYSIS_DURATION_SECONDS, MIN_AUDIO_SECONDS


def deep_analyze(audio_path: str | None = None, audio_bytes: bytes | None = None,
                 sr: int = 22050,
                 duration: float = ANALYSIS_DURATION_SECONDS) -> dict:
    """Extract detailed, musically meaningful analysis from audio.

    Returns a dict with structured analysis results, not just a feature vector.
    """
    if audio_bytes is not None:
        y_raw, sr = librosa.load(
            io.BytesIO(audio_bytes),
            sr=sr,
            duration=duration,
            mono=False,
        )
    elif audio_path is not None:
        y_raw, sr = librosa.load(
            audio_path,
            sr=sr,
            duration=duration,
            mono=False,
        )
    else:
        raise ValueError("Provide audio_path or audio_bytes")

    y = librosa.to_mono(y_raw) if getattr(y_raw, "ndim", 1) > 1 else y_raw

    if len(y) < sr * MIN_AUDIO_SECONDS:
        raise ValueError("Audio too short (minimum 1 second)")

    result = {}

    # ─── TEMPO & RHYTHM ───
    tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
    tempo_val = float(np.atleast_1d(tempo)[0])
    result["tempo"] = {
        "bpm": round(tempo_val, 1),
        "category": _tempo_category(tempo_val),
        "beat_count": len(beat_frames),
        "beat_regularity": _beat_regularity(beat_frames),
    }

    # Onset strength for rhythmic complexity
    onset_env = librosa.onset.onset_strength(y=y, sr=sr)
    result["rhythm"] = {
        "complexity": round(float(np.std(onset_env) / (np.mean(onset_env) + 1e-6)), 3),
        "avg_onset_strength": round(float(np.mean(onset_env)), 3),
        "peak_onset_strength": round(float(np.max(onset_env)), 3),
        "danceability": _estimate_danceability(tempo_val, onset_env, beat_frames),
    }

    # ─── KEY & TONALITY ───
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
    key, scale, key_confidence = _detect_key(chroma)
    result["tonality"] = {
        "key": key,
        "scale": scale,
        "key_name": f"{key} {scale}",
        "confidence": round(key_confidence, 3),
        "brightness": round(float(np.mean(chroma[_key_to_idx(key)])), 3),
    }

    # ─── ENERGY & DYNAMICS ───
    rms = librosa.feature.rms(y=y)[0]
    result["energy"] = {
        "mean": round(float(np.mean(rms)), 4),
        "max": round(float(np.max(rms)), 4),
        "min": round(float(np.min(rms)), 4),
        "dynamic_range_db": round(float(20 * np.log10((np.max(rms) + 1e-10) / (np.min(rms[rms > 0]) + 1e-10))), 1),
        "category": _energy_category(np.mean(rms)),
        "variation": round(float(np.std(rms) / (np.mean(rms) + 1e-6)), 3),
    }

    # Energy contour (intro → verse → chorus → outro pattern)
    n_segments = 8
    segment_len = max(1, len(rms) // n_segments)
    energy_contour = []
    for i in range(n_segments):
        start = i * segment_len
        end = len(rms) if i == n_segments - 1 else min(len(rms), (i + 1) * segment_len)
        seg = rms[start:end]
        energy_contour.append(round(float(np.mean(seg)), 4) if len(seg) else 0.0)
    result["energy"]["contour"] = energy_contour
    result["energy"]["has_buildup"] = _detect_buildup(energy_contour)
    result["energy"]["has_drop"] = _detect_drop(energy_contour)

    # ─── SPECTRAL / PRODUCTION QUALITY ───
    centroid = librosa.feature.spectral_centroid(y=y, sr=sr)[0]
    bandwidth = librosa.feature.spectral_bandwidth(y=y, sr=sr)[0]
    rolloff = librosa.feature.spectral_rolloff(y=y, sr=sr)[0]
    flatness = librosa.feature.spectral_flatness(y=y)[0]
    contrast = librosa.feature.spectral_contrast(y=y, sr=sr)

    result["spectral"] = {
        "centroid_hz": round(float(np.mean(centroid))),
        "bandwidth_hz": round(float(np.mean(bandwidth))),
        "rolloff_hz": round(float(np.mean(rolloff))),
        "brightness": _spectral_brightness(centroid),
        "warmth": round(1.0 - float(np.mean(flatness)), 3),
        "noise_ratio": round(float(np.mean(flatness)), 4),
        "low_mid_high": _frequency_balance(contrast),
    }

    # ─── VOCAL DETECTION ───
    y_harmonic, y_percussive = librosa.effects.hpss(y)
    harmonic_ratio = float(np.sum(y_harmonic ** 2) / (np.sum(y ** 2) + 1e-10))

    # Vocal presence estimation via harmonic content in vocal range (300-3400 Hz)
    S = np.abs(librosa.stft(y_harmonic))
    freqs = librosa.fft_frequencies(sr=sr)
    vocal_mask = (freqs >= 300) & (freqs <= 3400)
    vocal_energy = float(np.mean(S[vocal_mask, :]))
    total_energy = float(np.mean(S))
    vocal_prominence = vocal_energy / (total_energy + 1e-10)

    result["vocal"] = {
        "harmonic_ratio": round(harmonic_ratio, 3),
        "vocal_prominence": round(vocal_prominence, 3),
        "vocal_presence": "강함" if vocal_prominence > 1.5 else "보통" if vocal_prominence > 0.8 else "약함",
        "percussive_ratio": round(1.0 - harmonic_ratio, 3),
    }

    # ─── STRUCTURE ESTIMATION ───
    result["structure"] = _estimate_structure(y, sr, rms, onset_env)

    # ─── MOOD INDICATORS ───
    result["mood"] = _estimate_mood(
        tempo_val, key, scale, np.mean(rms), np.mean(centroid), harmonic_ratio
    )

    # ─── PRODUCTION QUALITY INDICATORS ───
    result["production"] = {
        "stereo_width": _estimate_stereo_width(y_raw),
        "compression_estimate": round(1.0 - float(np.std(rms) / (np.mean(rms) + 1e-6)), 3),
        "frequency_fullness": _frequency_fullness(contrast),
        "polish_score": _production_polish_score(result),
    }

    # ─── SUMMARY ───
    result["summary"] = _generate_summary(result)

    return result


# ─── Helper functions ───

_KEY_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
_MAJOR_PROFILE = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
_MINOR_PROFILE = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])


def _detect_key(chroma: np.ndarray) -> tuple[str, str, float]:
    """Detect key using Krumhansl-Schmuckler algorithm."""
    chroma_mean = np.mean(chroma, axis=1)
    best_corr = -1
    best_key = 0
    best_scale = "major"

    for i in range(12):
        major_corr = float(np.corrcoef(np.roll(chroma_mean, -i), _MAJOR_PROFILE)[0, 1])
        minor_corr = float(np.corrcoef(np.roll(chroma_mean, -i), _MINOR_PROFILE)[0, 1])

        if major_corr > best_corr:
            best_corr = major_corr
            best_key = i
            best_scale = "major"
        if minor_corr > best_corr:
            best_corr = minor_corr
            best_key = i
            best_scale = "minor"

    return _KEY_NAMES[best_key], best_scale, best_corr


def _key_to_idx(key: str) -> int:
    return _KEY_NAMES.index(key) if key in _KEY_NAMES else 0


def _tempo_category(bpm: float) -> str:
    if bpm < 80: return "slow"
    if bpm < 100: return "mid-slow"
    if bpm < 120: return "mid"
    if bpm < 140: return "mid-fast"
    if bpm < 160: return "fast"
    return "very fast"


def _beat_regularity(beat_frames: np.ndarray) -> str:
    if len(beat_frames) < 3:
        return "irregular"
    intervals = np.diff(beat_frames)
    cv = float(np.std(intervals) / (np.mean(intervals) + 1e-6))
    if cv < 0.1: return "매우 일정"
    if cv < 0.2: return "일정"
    if cv < 0.35: return "보통"
    return "불규칙"


def _estimate_danceability(tempo: float, onset_env: np.ndarray, beat_frames: np.ndarray) -> float:
    """0-1 score. High tempo regularity + strong onsets + good tempo = danceable."""
    tempo_score = 1.0 - abs(tempo - 120) / 80
    tempo_score = max(0, min(1, tempo_score))

    if len(beat_frames) < 3:
        regularity_score = 0.3
    else:
        intervals = np.diff(beat_frames)
        cv = float(np.std(intervals) / (np.mean(intervals) + 1e-6))
        regularity_score = max(0, 1.0 - cv * 3)

    onset_score = min(1.0, float(np.mean(onset_env)) / 3.0)

    return round(0.4 * tempo_score + 0.3 * regularity_score + 0.3 * onset_score, 3)


def _energy_category(mean_rms: float) -> str:
    if mean_rms < 0.01: return "매우 조용한 곡"
    if mean_rms < 0.03: return "차분한 곡"
    if mean_rms < 0.07: return "보통"
    if mean_rms < 0.14: return "힘 있는 곡"
    return "매우 강렬한 곡"


def _spectral_brightness(centroid: np.ndarray) -> str:
    mean_c = float(np.mean(centroid))
    if mean_c < 1500: return "어두운 톤"
    if mean_c < 2500: return "따뜻한 톤"
    if mean_c < 3500: return "중립"
    if mean_c < 4500: return "밝은 톤"
    return "매우 밝은 톤"


def _frequency_balance(contrast: np.ndarray) -> dict:
    """Analyze low/mid/high frequency balance."""
    mean_contrast = np.mean(contrast, axis=1)
    low = float(np.mean(mean_contrast[:2]))
    mid = float(np.mean(mean_contrast[2:5]))
    high = float(np.mean(mean_contrast[5:]))
    total = low + mid + high + 1e-6
    return {
        "low_pct": round(low / total * 100, 1),
        "mid_pct": round(mid / total * 100, 1),
        "high_pct": round(high / total * 100, 1),
        "balance": "bass-heavy" if low / total > 0.45 else
                   "mid-focused" if mid / total > 0.45 else
                   "treble-heavy" if high / total > 0.45 else "balanced",
    }


def _frequency_fullness(contrast: np.ndarray) -> str:
    """How evenly the frequency spectrum is filled."""
    mean_contrast = np.mean(contrast, axis=1)
    cv = float(np.std(mean_contrast) / (np.mean(mean_contrast) + 1e-6))
    if cv < 0.3: return "풍부"
    if cv < 0.5: return "보통"
    return "부족"


def _detect_buildup(contour: list[float]) -> bool:
    """Detect if there's an energy buildup pattern."""
    for i in range(len(contour) - 2):
        if contour[i] < contour[i+1] < contour[i+2]:
            ratio = contour[i+2] / (contour[i] + 1e-6)
            if ratio > 1.5:
                return True
    return False


def _detect_drop(contour: list[float]) -> bool:
    """Detect if there's an energy drop (EDM-style)."""
    for i in range(len(contour) - 1):
        if contour[i] > 0 and contour[i+1] / contour[i] < 0.5:
            return True
    return False


def _estimate_structure(y: np.ndarray, sr: int, rms: np.ndarray,
                        onset_env: np.ndarray) -> dict:
    """Rough structural analysis."""
    duration = len(y) / sr

    # Estimate intro length (time until first significant energy)
    threshold = np.mean(rms) * 0.5
    intro_frames = 0
    for val in rms:
        if val > threshold:
            break
        intro_frames += 1
    intro_sec = round(intro_frames * 512 / sr, 1)

    # Section count estimate via self-similarity
    n_segments = min(int(duration / 5), 20)

    return {
        "duration_sec": round(duration, 1),
        "intro_sec": intro_sec,
        "intro_category": "짧음" if intro_sec < 5 else "보통" if intro_sec < 15 else "긴 편",
        "estimated_sections": n_segments,
    }


def _estimate_mood(tempo: float, key: str, scale: str, energy: float,
                   centroid: float, harmonic: float) -> dict:
    """Estimate mood indicators."""
    valence = 0.5
    if scale == "major": valence += 0.15
    if scale == "minor": valence -= 0.15
    if tempo > 120: valence += 0.1
    if tempo < 90: valence -= 0.1
    if centroid > 3000: valence += 0.05
    if energy > 0.1: valence += 0.1
    valence = max(0, min(1, valence))

    arousal = 0.5
    if tempo > 130: arousal += 0.2
    if tempo < 90: arousal -= 0.2
    if energy > 0.12: arousal += 0.15
    if energy < 0.04: arousal -= 0.15
    arousal = max(0, min(1, arousal))

    if valence > 0.6 and arousal > 0.6: mood = "신나는"
    elif valence > 0.6 and arousal <= 0.6: mood = "편안한"
    elif valence <= 0.6 and arousal > 0.6: mood = "강렬한"
    else: mood = "감성적인"

    return {
        "valence": round(valence, 2),
        "arousal": round(arousal, 2),
        "primary_mood": mood,
    }


def _estimate_stereo_width(y: np.ndarray) -> str:
    """Estimate if the mix is wide or narrow."""
    if y.ndim == 1:
        return "mono"
    if y.ndim == 2 and y.shape[0] == 2:
        diff = np.mean(np.abs(y[0] - y[1]))
        total = np.mean(np.abs(y[0]) + np.abs(y[1])) + 1e-10
        ratio = diff / total
        if ratio > 0.3: return "넓음"
        if ratio > 0.1: return "보통"
        return "좁음"
    return "모노"


def _production_polish_score(result: dict) -> float:
    """0-10 score for production polish. Higher = more polished."""
    score = 5.0

    # Full frequency spectrum = polished
    balance = result["spectral"]["low_mid_high"]
    if balance["balance"] == "balanced": score += 1.0
    if result["spectral"]["warmth"] > 0.7: score += 0.5

    # High dynamic range but controlled = polished
    dr = result["energy"]["dynamic_range_db"]
    if 6 < dr < 20: score += 1.0
    elif dr < 3: score -= 1.0  # over-compressed

    # Regular beats = intentional production
    if result["tempo"]["beat_regularity"] in ("매우 일정", "일정"):
        score += 0.5

    # Low noise ratio = clean production
    if result["spectral"]["noise_ratio"] < 0.05:
        score += 1.0
    elif result["spectral"]["noise_ratio"] > 0.2:
        score -= 1.0

    # Good energy variation = interesting arrangement
    if 0.2 < result["energy"]["variation"] < 0.8:
        score += 0.5

    return round(max(0, min(10, score)), 1)


def _generate_summary(result: dict) -> str:
    """Generate a one-line summary of the track."""
    parts = []
    parts.append(f"{result['tempo']['bpm']} BPM {result['tempo']['category']}")
    parts.append(f"{result['tonality']['key_name']}")
    parts.append(f"{result['energy']['category']} energy")
    parts.append(f"{result['spectral']['brightness']} tone")
    parts.append(f"{result['mood']['primary_mood']}")
    parts.append(f"danceability {result['rhythm']['danceability']:.0%}")
    parts.append(f"polish {result['production']['polish_score']}/10")
    return " | ".join(parts)


def format_analysis_korean(result: dict) -> str:
    """Format deep analysis as Korean markdown."""
    t = result["tonality"]
    tempo = result["tempo"]
    energy = result["energy"]
    rhythm = result["rhythm"]
    spec = result["spectral"]
    vocal = result["vocal"]
    mood = result["mood"]
    prod = result["production"]
    struct = result["structure"]
    balance = spec["low_mid_high"]

    lines = []
    lines.append("### 오디오 상세 분석")
    lines.append("")
    lines.append(f"**🎵 기본 정보**")
    lines.append(f"- 템포: **{tempo['bpm']} BPM** ({tempo['category']}) | 비트 규칙성: {tempo['beat_regularity']}")
    lines.append(f"- 키: **{t['key_name']}** (신뢰도 {t['confidence']:.0%})")
    lines.append(f"- 길이: {struct['duration_sec']}초 | 인트로: {struct['intro_sec']}초 ({struct['intro_category']})")
    lines.append("")
    lines.append(f"**🔊 에너지 & 다이내믹스**")
    lines.append(f"- 에너지 레벨: **{energy['category']}** | 다이나믹 레인지: {energy['dynamic_range_db']} dB")
    lines.append(f"- 빌드업 감지: {'✅' if energy['has_buildup'] else '❌'} | 드롭 감지: {'✅' if energy['has_drop'] else '❌'}")
    bars = '▁▂▃▄▅▆▇█'
    contour_viz = ''.join(bars[min(7, int(v * 40))] for v in energy['contour'])
    lines.append(f"- 에너지 흐름: {contour_viz}")
    lines.append("")
    lines.append(f"**🎸 리듬 & 댄서빌리티**")
    lines.append(f"- 댄서빌리티: **{rhythm['danceability']:.0%}**")
    lines.append(f"- 리듬 복잡도: {rhythm['complexity']:.2f} | 온셋 강도: {rhythm['avg_onset_strength']:.1f}")
    lines.append("")
    lines.append(f"**🎤 보컬 & 사운드**")
    lines.append(f"- 보컬 존재감: **{vocal['vocal_presence']}** ({vocal['vocal_prominence']:.2f})")
    lines.append(f"- 하모닉/퍼커시브: {vocal['harmonic_ratio']:.0%} / {vocal['percussive_ratio']:.0%}")
    lines.append(f"- 톤: **{spec['brightness']}** | 스테레오: {prod['stereo_width']}")
    lines.append("")
    lines.append(f"**🎛️ 프로덕션 퀄리티**")
    lines.append(f"- 폴리시 스코어: **{prod['polish_score']}/10**")
    lines.append(f"- 주파수 밸런스: Low {balance['low_pct']}% / Mid {balance['mid_pct']}% / High {balance['high_pct']}% ({balance['balance']})")
    lines.append(f"- 스펙트럼 충실도: {prod['frequency_fullness']} | 노이즈: {spec['noise_ratio']:.3f}")
    lines.append("")
    lines.append(f"**🎭 무드**")
    lines.append(f"- 무드: **{mood['primary_mood']}** | Valence: {mood['valence']:.2f} | Arousal: {mood['arousal']:.2f}")
    lines.append("")
    lines.append(f"> {result['summary']}")

    return "\n".join(lines)

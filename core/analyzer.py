"""Audio feature extraction using librosa.

Extracts a 193-dimensional feature vector from audio:
- 40 MFCCs (mean + std = 80)
- 12 Chroma (mean + std = 24)
- 7 Spectral contrast (mean + std = 14)
- 1 Spectral centroid (mean + std = 2)
- 1 Spectral bandwidth (mean + std = 2)
- 1 Spectral rolloff (mean + std = 2)
- 1 Zero crossing rate (mean + std = 2)
- Tempo (1)
- 6 Tonnetz (mean + std = 12)
- RMS energy (mean + std = 2)
- 26 Mel spectrogram bands (mean + std = 52)
Total: 193 dimensions
"""

import io
import numpy as np
import librosa

from core.config import ANALYSIS_DURATION_SECONDS, MIN_AUDIO_SECONDS


def extract_features(audio_path: str | None = None, audio_bytes: bytes | None = None,
                     sr: int = 22050,
                     duration: float = ANALYSIS_DURATION_SECONDS) -> np.ndarray:
    """Extract audio features from a file path or raw bytes.

    Returns a 193-dimensional feature vector.
    """
    if audio_bytes is not None:
        y, sr = librosa.load(io.BytesIO(audio_bytes), sr=sr, duration=duration)
    elif audio_path is not None:
        y, sr = librosa.load(audio_path, sr=sr, duration=duration)
    else:
        raise ValueError("Provide audio_path or audio_bytes")

    if len(y) < sr * MIN_AUDIO_SECONDS:
        raise ValueError("Audio too short (minimum 1 second)")

    features = []

    # MFCCs (40 coefficients)
    mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=40)
    features.extend(np.mean(mfcc, axis=1))
    features.extend(np.std(mfcc, axis=1))

    # Chroma
    chroma = librosa.feature.chroma_stft(y=y, sr=sr)
    features.extend(np.mean(chroma, axis=1))
    features.extend(np.std(chroma, axis=1))

    # Spectral contrast
    contrast = librosa.feature.spectral_contrast(y=y, sr=sr)
    features.extend(np.mean(contrast, axis=1))
    features.extend(np.std(contrast, axis=1))

    # Spectral centroid
    centroid = librosa.feature.spectral_centroid(y=y, sr=sr)
    features.append(float(np.mean(centroid)))
    features.append(float(np.std(centroid)))

    # Spectral bandwidth
    bandwidth = librosa.feature.spectral_bandwidth(y=y, sr=sr)
    features.append(float(np.mean(bandwidth)))
    features.append(float(np.std(bandwidth)))

    # Spectral rolloff
    rolloff = librosa.feature.spectral_rolloff(y=y, sr=sr)
    features.append(float(np.mean(rolloff)))
    features.append(float(np.std(rolloff)))

    # Zero crossing rate
    zcr = librosa.feature.zero_crossing_rate(y)
    features.append(float(np.mean(zcr)))
    features.append(float(np.std(zcr)))

    # Tempo
    tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
    features.append(float(np.atleast_1d(tempo)[0]))

    # Tonnetz
    tonnetz = librosa.feature.tonnetz(y=librosa.effects.harmonic(y), sr=sr)
    features.extend(np.mean(tonnetz, axis=1))
    features.extend(np.std(tonnetz, axis=1))

    # RMS energy
    rms = librosa.feature.rms(y=y)
    features.append(float(np.mean(rms)))
    features.append(float(np.std(rms)))

    # Mel spectrogram (26 bands summary)
    mel = librosa.feature.melspectrogram(y=y, sr=sr, n_mels=26)
    mel_db = librosa.power_to_db(mel, ref=np.max)
    features.extend(np.mean(mel_db, axis=1))
    features.extend(np.std(mel_db, axis=1))

    return np.array(features, dtype=np.float32)


def get_feature_names() -> list[str]:
    """Return human-readable names for each feature dimension."""
    names = []
    for stat in ["mean", "std"]:
        for i in range(40):
            names.append(f"mfcc_{i}_{stat}")
    for stat in ["mean", "std"]:
        for i in range(12):
            names.append(f"chroma_{i}_{stat}")
    for stat in ["mean", "std"]:
        for i in range(7):
            names.append(f"contrast_{i}_{stat}")
    for feat in ["centroid", "bandwidth", "rolloff", "zcr"]:
        names.extend([f"{feat}_mean", f"{feat}_std"])
    names.append("tempo")
    for stat in ["mean", "std"]:
        for i in range(6):
            names.append(f"tonnetz_{i}_{stat}")
    names.extend(["rms_mean", "rms_std"])
    for stat in ["mean", "std"]:
        for i in range(26):
            names.append(f"mel_{i}_{stat}")
    return names

"""Similarity computation and reference database management."""

import pickle
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC

from core.analyzer import extract_features


from core.markets import MARKETS

DATA_DIR = Path(__file__).parent.parent / "data" / "references"


def _ranking_weight(popularity: int | None) -> float:
    if popularity is None or popularity <= 0:
        return 1.0
    return 0.7 + 0.3 * (popularity / 100.0)


def _market_fit_weight(popularity: int | None) -> float:
    if popularity is None or popularity <= 0:
        return 0.5
    return popularity / 100.0


def build_market_classifier(features: np.ndarray, labels: np.ndarray):
    """Train a market classifier on the reference embeddings."""
    if len(features) < 8:
        return None

    classes = np.unique(labels)
    if len(classes) < 2:
        return None

    model = make_pipeline(
        StandardScaler(),
        SVC(
            C=2.0,
            gamma="scale",
            probability=True,
            class_weight="balanced",
            random_state=42,
        ),
    )

    model.fit(features, labels)
    return model


def predict_market_probabilities(model, query_features: np.ndarray,
                                 markets: list[str] | None = None) -> dict[str, float]:
    """Predict market membership probabilities as 0-100 scores."""
    known_markets = list(markets or getattr(model, "classes_", []))
    scores = {market: 0.0 for market in known_markets}

    probabilities = model.predict_proba(query_features.reshape(1, -1))[0]
    for label, probability in zip(model.classes_, probabilities):
        if label in scores:
            scores[label] = float(np.clip(probability * 100.0, 0, 100))

    return scores


@dataclass
class TrackInfo:
    title: str
    artist: str
    market: str
    genre: str = ""
    year: int = 0
    source: str = ""
    # Spotify enrichment fields
    spotify_popularity: int | None = None
    spotify_id: str = ""
    spotify_url: str = ""
    artist_genres: list = None
    release_date: str = ""
    album_art_url: str | None = None

    def __post_init__(self):
        if self.artist_genres is None:
            self.artist_genres = []


@dataclass
class ReferenceTrack:
    info: TrackInfo
    features: np.ndarray


class ReferenceDatabase:
    """Manages reference track embeddings per market."""

    def __init__(self):
        self.tracks: list[ReferenceTrack] = []
        self.scaler: StandardScaler | None = None
        self.market_model = None
        self._load()

    def _db_path(self) -> Path:
        return DATA_DIR / "database.pkl"

    def _load(self):
        path = self._db_path()
        if path.exists():
            with open(path, "rb") as f:
                data = pickle.load(f)
            self.tracks = data.get("tracks", [])
            self.scaler = data.get("scaler")
        self._fit_runtime_models()

    def save(self):
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        self._fit_runtime_models()
        with open(self._db_path(), "wb") as f:
            pickle.dump({"tracks": self.tracks, "scaler": self.scaler}, f)

    def _fit_runtime_models(self):
        self.scaler = None
        self.market_model = None

        if not self.tracks:
            return

        features = np.array([t.features for t in self.tracks], dtype=np.float32)
        if len(self.tracks) > 1:
            self.scaler = StandardScaler().fit(features)

        labels = np.array([
            t.info.market for t in self.tracks
            if t.info.market in MARKETS and t.info.market != "global"
        ])
        labeled_features = np.array([
            t.features for t in self.tracks
            if t.info.market in MARKETS and t.info.market != "global"
        ], dtype=np.float32)

        if len(labels) < 8:
            return

        try:
            self.market_model = build_market_classifier(labeled_features, labels)
        except Exception:
            self.market_model = None

    def add_track(self, audio_path: str, info: TrackInfo):
        features = extract_features(audio_path=audio_path)
        self.tracks.append(ReferenceTrack(info=info, features=features))

    def add_track_from_bytes(self, audio_bytes: bytes, info: TrackInfo):
        features = extract_features(audio_bytes=audio_bytes)
        self.tracks.append(ReferenceTrack(info=info, features=features))

    def get_markets(self) -> dict[str, int]:
        counts = {}
        for t in self.tracks:
            m = t.info.market
            counts[m] = counts.get(m, 0) + 1
        return counts

    def find_similar(self, query_features: np.ndarray, market: str = "global",
                     top_k: int = 5) -> list[tuple[TrackInfo, float]]:
        """Find most similar tracks in a market.

        Returns list of (TrackInfo, similarity_score) sorted by similarity desc.
        """
        if market == "global":
            candidates = self.tracks
        else:
            candidates = [t for t in self.tracks if t.info.market == market]

        if not candidates:
            return []

        candidate_features = np.array([t.features for t in candidates])

        # Normalize features
        if self.scaler is not None:
            query_norm = self.scaler.transform(query_features.reshape(1, -1))
            candidates_norm = self.scaler.transform(candidate_features)
        else:
            query_norm = query_features.reshape(1, -1)
            candidates_norm = candidate_features

        raw_similarities = cosine_similarity(query_norm, candidates_norm)[0]

        # Apply popularity weighting if available
        # Similarity to a popular track matters more than similarity to an obscure one
        weighted_scores = []
        for idx, sim in enumerate(raw_similarities):
            weighted = sim * _ranking_weight(candidates[idx].info.spotify_popularity)
            weighted_scores.append(weighted)

        weighted_scores = np.array(weighted_scores)
        top_indices = np.argsort(weighted_scores)[::-1][:top_k]

        results = []
        for idx in top_indices:
            results.append((candidates[idx].info, float(raw_similarities[idx])))

        return results

    def market_scores_heuristic(self, query_features: np.ndarray) -> dict[str, float]:
        """Legacy heuristic market scores based on nearest-neighbor similarity."""
        scores = {}
        for market in MARKETS:
            if market == "global":
                continue
            scores[market] = self._market_score_heuristic(query_features, market)
        return scores

    def _market_score_heuristic(self, query_features: np.ndarray, market: str) -> float:
        if market == "global":
            candidates = self.tracks
        else:
            candidates = [t for t in self.tracks if t.info.market == market]

        if not candidates:
            return 0.0

        candidate_features = np.array([t.features for t in candidates])

        if self.scaler is not None:
            query_norm = self.scaler.transform(query_features.reshape(1, -1))
            candidates_norm = self.scaler.transform(candidate_features)
        else:
            query_norm = query_features.reshape(1, -1)
            candidates_norm = candidate_features

        sims = cosine_similarity(query_norm, candidates_norm)[0]

        # Weighted score: similarity * popularity
        scores = []
        for idx, sim in enumerate(sims):
            score = sim * _market_fit_weight(candidates[idx].info.spotify_popularity)
            scores.append(score)

        scores = np.array(scores)
        top5 = np.sort(scores)[::-1][:5]
        raw = float(np.mean(top5))
        return float(np.clip(raw * 120, 0, 100))  # scale to 0-100

    def market_scores(self, query_features: np.ndarray) -> dict[str, float]:
        """Model-based market scores, with heuristic fallback."""
        markets = [market for market in MARKETS if market != "global"]

        if self.market_model is None:
            return self.market_scores_heuristic(query_features)

        return predict_market_probabilities(
            self.market_model,
            query_features,
            markets=markets,
        )

    def market_score(self, query_features: np.ndarray, market: str) -> float:
        return float(self.market_scores(query_features).get(market, 0.0))

    def score_method(self) -> str:
        return "classifier" if self.market_model is not None else "heuristic"

    def stats(self) -> dict:
        markets = self.get_markets()
        enriched = sum(1 for t in self.tracks
                       if t.info.spotify_popularity is not None)
        return {
            "total_tracks": len(self.tracks),
            "markets": markets,
            "spotify_enriched": enriched,
            "score_method": self.score_method(),
        }

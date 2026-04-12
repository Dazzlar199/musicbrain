"""Trend Monitoring API — real-time market trends from 280万 track DB."""

from pathlib import Path
from fastapi import APIRouter
import pandas as pd
import numpy as np

from core.markets import MARKETS, COUNTRY_TO_MARKET

router = APIRouter(prefix="/api/trends", tags=["trends"])

KAGGLE_DIR = Path(__file__).parent.parent.parent / "data" / "kaggle"
CHARTS_FILE = KAGGLE_DIR / "charts" / "universal_top_spotify_songs.csv"

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


@router.get("/markets")
def market_overview():
    """Overview of all 12 markets — track count, top genres, avg features."""
    df = _load_charts()
    if df.empty:
        return {"error": "No chart data available"}

    result = {}
    for market_code, market_name in MARKETS.items():
        mdf = df[df["market"] == market_code]
        if mdf.empty:
            continue

        unique_tracks = mdf["spotify_id"].nunique()
        top_artists = mdf.groupby("artists")["spotify_id"].nunique().nlargest(5).to_dict()
        avg_features = {}
        for feat in ["danceability", "energy", "valence", "tempo", "speechiness", "acousticness"]:
            if feat in mdf.columns:
                avg_features[feat] = round(float(mdf[feat].mean()), 3)

        result[market_code] = {
            "name": market_name,
            "unique_tracks": unique_tracks,
            "total_entries": len(mdf),
            "top_artists": top_artists,
            "avg_features": avg_features,
        }

    return {"markets": result, "total_countries": df["country"].nunique()}


@router.get("/market/{market_code}")
def market_detail(market_code: str):
    """Detailed trend data for a specific market."""
    df = _load_charts()
    if df.empty:
        return {"error": "No chart data"}

    mdf = df[df["market"] == market_code]
    if mdf.empty:
        return {"error": f"No data for market {market_code}"}

    # Top tracks (by popularity)
    top_tracks = (mdf.sort_values("popularity", ascending=False)
                  .drop_duplicates("spotify_id")
                  .head(20)
                  [["name", "artists", "popularity", "danceability", "energy", "valence", "tempo"]]
                  .to_dict("records"))

    # Feature distributions
    features = {}
    for feat in ["danceability", "energy", "valence", "tempo", "speechiness",
                 "acousticness", "instrumentalness", "liveness"]:
        if feat in mdf.columns:
            vals = mdf[feat].dropna()
            features[feat] = {
                "mean": round(float(vals.mean()), 3),
                "std": round(float(vals.std()), 3),
                "median": round(float(vals.median()), 3),
                "p25": round(float(vals.quantile(0.25)), 3),
                "p75": round(float(vals.quantile(0.75)), 3),
                "histogram": [round(float(x), 3) for x in np.histogram(vals, bins=20)[0] / len(vals)],
            }

    # Tempo distribution
    if "tempo" in mdf.columns:
        tempo_vals = mdf["tempo"].dropna()
        tempo_bins = pd.cut(tempo_vals, bins=[0, 80, 100, 120, 140, 160, 200, 300])
        tempo_dist = tempo_bins.value_counts(normalize=True).sort_index().to_dict()
        tempo_dist = {str(k): round(v, 3) for k, v in tempo_dist.items()}
    else:
        tempo_dist = {}

    return {
        "market": market_code,
        "market_name": MARKETS.get(market_code, market_code),
        "unique_tracks": mdf["spotify_id"].nunique(),
        "top_tracks": top_tracks,
        "features": features,
        "tempo_distribution": tempo_dist,
    }


@router.get("/compare")
def compare_markets(markets: str = "kr,us,jp"):
    """Compare audio features across multiple markets side by side."""
    df = _load_charts()
    if df.empty:
        return {"error": "No chart data"}

    market_codes = [m.strip() for m in markets.split(",")]
    features = ["danceability", "energy", "valence", "tempo", "speechiness",
                "acousticness", "instrumentalness", "liveness"]

    result = {}
    for feat in features:
        feat_data = {}
        for mc in market_codes:
            mdf = df[df["market"] == mc]
            if feat in mdf.columns:
                vals = mdf[feat].dropna()
                feat_data[mc] = {
                    "mean": round(float(vals.mean()), 3),
                    "std": round(float(vals.std()), 3),
                }
        result[feat] = feat_data

    return {"features": result, "markets": market_codes}


@router.get("/global-top")
def global_top(limit: int = 50):
    """Global top tracks across all markets."""
    df = _load_charts()
    if df.empty:
        return {"tracks": []}

    top = (df.sort_values("popularity", ascending=False)
           .drop_duplicates("spotify_id")
           .head(limit))

    tracks = []
    for _, row in top.iterrows():
        tracks.append({
            "name": row.get("name", ""),
            "artists": row.get("artists", ""),
            "popularity": int(row.get("popularity", 0)),
            "country": row.get("country", ""),
            "market": row.get("market", ""),
            "danceability": round(float(row.get("danceability", 0)), 3),
            "energy": round(float(row.get("energy", 0)), 3),
            "valence": round(float(row.get("valence", 0)), 3),
            "tempo": round(float(row.get("tempo", 0)), 1),
        })

    return {"tracks": tracks, "total": len(tracks)}

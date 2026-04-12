"""Spotify API integration — enrich reference data with real streaming metrics.

Uses Client Credentials flow (no user login needed).
Available data (Feb 2026 Dev Mode):
  - Track search, metadata, popularity (0-100)
  - Artist info, genres
  - Album info, release date
  - Markets where track is available
Blocked (requires Extended Quota):
  - Audio features (danceability, energy, etc.) — 403
  - Top tracks by country
  - Detailed playlist data
"""

import os
from dataclasses import dataclass

import spotipy
from spotipy.oauth2 import SpotifyClientCredentials
from dotenv import load_dotenv

load_dotenv()

_SP = None


def _get_client() -> spotipy.Spotify:
    global _SP
    if _SP is None:
        client_id = os.getenv("SPOTIFY_CLIENT_ID")
        client_secret = os.getenv("SPOTIFY_CLIENT_SECRET")
        if not client_id or not client_secret:
            raise RuntimeError("SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET not set")
        _SP = spotipy.Spotify(auth_manager=SpotifyClientCredentials(
            client_id=client_id,
            client_secret=client_secret,
        ))
    return _SP


@dataclass
class SpotifyTrackData:
    spotify_id: str
    name: str
    artist: str
    album: str
    popularity: int  # 0-100, real streaming-based score
    release_date: str
    duration_ms: int
    explicit: bool
    preview_url: str | None
    spotify_url: str
    artist_genres: list[str]
    available_markets: int  # number of markets
    album_art_url: str | None


def search_track(artist: str, title: str) -> SpotifyTrackData | None:
    """Search for a track and return enriched data."""
    sp = _get_client()

    query = f"track:{title} artist:{artist}"
    results = sp.search(q=query, type="track", limit=5)

    if not results["tracks"]["items"]:
        # Fallback: looser search
        results = sp.search(q=f"{artist} {title}", type="track", limit=5)

    if not results["tracks"]["items"]:
        return None

    track = results["tracks"]["items"][0]
    artist_id = track["artists"][0]["id"]

    # Get artist genres
    try:
        artist_info = sp.artist(artist_id)
        genres = artist_info.get("genres", [])
    except Exception:
        genres = []

    album_art = None
    if track["album"]["images"]:
        album_art = track["album"]["images"][0]["url"]

    return SpotifyTrackData(
        spotify_id=track["id"],
        name=track["name"],
        artist=track["artists"][0]["name"],
        album=track["album"]["name"],
        popularity=track["popularity"],
        release_date=track["album"].get("release_date", ""),
        duration_ms=track["duration_ms"],
        explicit=track["explicit"],
        preview_url=track.get("preview_url"),
        spotify_url=track["external_urls"].get("spotify", ""),
        artist_genres=genres,
        available_markets=len(track.get("available_markets", [])),
        album_art_url=album_art,
    )


def enrich_reference_db(db) -> dict:
    """Look up Spotify popularity for all tracks in the reference database.

    Returns stats about the enrichment process.
    """
    sp = _get_client()
    enriched = 0
    failed = 0
    already = 0

    for track in db.tracks:
        # Skip if already has spotify data
        if hasattr(track.info, 'spotify_popularity') and track.info.spotify_popularity is not None:
            already += 1
            continue

        data = search_track(track.info.artist, track.info.title)
        if data:
            track.info.spotify_popularity = data.popularity
            track.info.spotify_id = data.spotify_id
            track.info.spotify_url = data.spotify_url
            track.info.artist_genres = data.artist_genres
            track.info.release_date = data.release_date
            track.info.album_art_url = data.album_art_url
            enriched += 1
        else:
            track.info.spotify_popularity = None
            failed += 1

    db.save()

    return {
        "enriched": enriched,
        "failed": failed,
        "already": already,
        "total": len(db.tracks),
    }


def get_market_popularity_stats(db, market: str) -> dict:
    """Get popularity distribution stats for a market's reference tracks."""
    tracks = [t for t in db.tracks if t.info.market == market]
    pops = [t.info.spotify_popularity for t in tracks
            if hasattr(t.info, 'spotify_popularity') and t.info.spotify_popularity is not None]

    if not pops:
        return {"count": 0, "avg": 0, "max": 0, "min": 0}

    import numpy as np
    return {
        "count": len(pops),
        "avg": round(float(np.mean(pops)), 1),
        "max": int(np.max(pops)),
        "min": int(np.min(pops)),
        "median": round(float(np.median(pops)), 1),
    }

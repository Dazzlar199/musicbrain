"""Artist CRUD API."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import date

from core.db.database import get_db
from core.db.models import Artist, ArtistMetric

router = APIRouter(prefix="/api/artists", tags=["artists"])


class ArtistCreate(BaseModel):
    name: str
    stage_name: Optional[str] = None
    artist_type: Optional[str] = "solo"
    genre: Optional[str] = None
    sub_genre: Optional[str] = None
    country: Optional[str] = None
    market: Optional[str] = None
    bio: Optional[str] = None
    photo_url: Optional[str] = None
    spotify_id: Optional[str] = None
    youtube_id: Optional[str] = None
    instagram_handle: Optional[str] = None
    tiktok_handle: Optional[str] = None
    label: Optional[str] = None
    tags: Optional[list] = []


class ArtistUpdate(ArtistCreate):
    name: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None


@router.get("")
def list_artists(
    status: Optional[str] = None,
    market: Optional[str] = None,
    genre: Optional[str] = None,
    search: Optional[str] = None,
    roster: Optional[str] = None,  # "signed" = 소속, "watching" = 관심
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
):
    q = db.query(Artist)
    if status:
        q = q.filter(Artist.status == status)
    if market:
        q = q.filter(Artist.market == market)
    if genre:
        q = q.filter(Artist.genre.ilike(f"%{genre}%"))
    if search:
        q = q.filter(
            (Artist.name.ilike(f"%{search}%")) |
            (Artist.stage_name.ilike(f"%{search}%"))
        )
    if roster:
        q = q.filter(Artist.tags.contains([roster]))
    total = q.count()
    artists = q.order_by(Artist.updated_at.desc()).offset(skip).limit(limit).all()
    return {"total": total, "items": [_serialize(a) for a in artists]}


@router.get("/{artist_id}")
def get_artist(artist_id: int, db: Session = Depends(get_db)):
    a = db.query(Artist).get(artist_id)
    if not a:
        raise HTTPException(404, "Artist not found")
    return _serialize(a, full=True)


@router.post("")
def create_artist(data: ArtistCreate, db: Session = Depends(get_db)):
    a = Artist(**data.model_dump(exclude_none=True))
    db.add(a)
    db.commit()
    db.refresh(a)
    return _serialize(a)


@router.put("/{artist_id}")
def update_artist(artist_id: int, data: ArtistUpdate, db: Session = Depends(get_db)):
    a = db.query(Artist).get(artist_id)
    if not a:
        raise HTTPException(404, "Artist not found")
    for k, v in data.model_dump(exclude_none=True).items():
        setattr(a, k, v)
    db.commit()
    db.refresh(a)
    return _serialize(a)


@router.delete("/{artist_id}")
def delete_artist(artist_id: int, db: Session = Depends(get_db)):
    a = db.query(Artist).get(artist_id)
    if not a:
        raise HTTPException(404, "Artist not found")
    db.delete(a)
    db.commit()
    return {"deleted": True}


@router.get("/{artist_id}/metrics")
def get_artist_metrics(artist_id: int, days: int = 30, db: Session = Depends(get_db)):
    metrics = (db.query(ArtistMetric)
               .filter(ArtistMetric.artist_id == artist_id)
               .order_by(ArtistMetric.date.desc())
               .limit(days).all())
    return [{"date": str(m.date), "spotify_listeners": m.spotify_monthly_listeners,
             "spotify_followers": m.spotify_followers, "instagram": m.instagram_followers,
             "tiktok": m.tiktok_followers} for m in metrics]


def _serialize(a: Artist, full=False) -> dict:
    d = {
        "id": a.id, "name": a.name, "stage_name": a.stage_name,
        "artist_type": a.artist_type, "genre": a.genre, "sub_genre": a.sub_genre,
        "country": a.country, "market": a.market, "status": a.status,
        "photo_url": a.photo_url, "label": a.label, "tags": a.tags or [],
        "created_at": str(a.created_at), "updated_at": str(a.updated_at),
    }
    if full:
        d.update({
            "bio": a.bio, "notes": a.notes,
            "spotify_id": a.spotify_id, "youtube_id": a.youtube_id,
            "instagram_handle": a.instagram_handle, "tiktok_handle": a.tiktok_handle,
            "signed_date": str(a.signed_date) if a.signed_date else None,
            "contract_end": str(a.contract_end) if a.contract_end else None,
            "track_count": len(a.tracks), "project_count": len(a.projects),
        })
    return d

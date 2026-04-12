"""A&R Scouting API — Artist discovery and evaluation."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import date

from core.db.database import get_db
from core.db.models import ScoutingNote

router = APIRouter(prefix="/api/scouting", tags=["scouting"])


class ScoutCreate(BaseModel):
    artist_name: str
    source: Optional[str] = None
    source_url: Optional[str] = None
    discovered_by: Optional[str] = None
    score: Optional[int] = None
    vocal_score: Optional[int] = None
    performance_score: Optional[int] = None
    visual_score: Optional[int] = None
    marketability_score: Optional[int] = None
    uniqueness_score: Optional[int] = None
    strengths: Optional[str] = None
    weaknesses: Optional[str] = None
    market_fit: Optional[dict] = None
    comparable_artists: Optional[list] = []
    recommended_market: Optional[str] = None
    notes: Optional[str] = None


@router.get("")
def list_scouts(status: Optional[str] = None, source: Optional[str] = None,
                skip: int = 0, limit: int = 50, db: Session = Depends(get_db)):
    q = db.query(ScoutingNote)
    if status:
        q = q.filter(ScoutingNote.status == status)
    if source:
        q = q.filter(ScoutingNote.source == source)
    total = q.count()
    items = q.order_by(ScoutingNote.created_at.desc()).offset(skip).limit(limit).all()
    return {"total": total, "items": [_serialize(s) for s in items]}


@router.get("/funnel")
def scouting_funnel(db: Session = Depends(get_db)):
    """Scouting pipeline funnel: discovered → contacted → auditioned → signed."""
    stages = ["discovered", "contacted", "auditioned", "negotiating", "signed", "passed"]
    counts = {}
    for stage in stages:
        counts[stage] = db.query(ScoutingNote).filter(ScoutingNote.status == stage).count()
    return {"stages": stages, "counts": counts, "total": sum(counts.values())}


@router.get("/{scout_id}")
def get_scout(scout_id: int, db: Session = Depends(get_db)):
    s = db.query(ScoutingNote).get(scout_id)
    if not s:
        raise HTTPException(404)
    return _serialize(s, full=True)


@router.post("")
def create_scout(data: ScoutCreate, db: Session = Depends(get_db)):
    s = ScoutingNote(**data.model_dump(exclude_none=True))
    db.add(s)
    db.commit()
    db.refresh(s)
    return _serialize(s)


@router.put("/{scout_id}")
def update_scout(scout_id: int, data: dict, db: Session = Depends(get_db)):
    s = db.query(ScoutingNote).get(scout_id)
    if not s:
        raise HTTPException(404)
    for k, v in data.items():
        if hasattr(s, k):
            setattr(s, k, v)
    db.commit()
    db.refresh(s)
    return _serialize(s)


@router.post("/{scout_id}/advance")
def advance_scout(scout_id: int, db: Session = Depends(get_db)):
    """Move to next scouting stage."""
    stages = ["discovered", "contacted", "auditioned", "negotiating", "signed"]
    s = db.query(ScoutingNote).get(scout_id)
    if not s:
        raise HTTPException(404)
    idx = stages.index(s.status) if s.status in stages else 0
    if idx < len(stages) - 1:
        s.status = stages[idx + 1]
        db.commit()
        db.refresh(s)
    return _serialize(s)


def _serialize(s: ScoutingNote, full=False) -> dict:
    d = {
        "id": s.id, "artist_name": s.artist_name, "source": s.source,
        "score": s.score, "status": s.status,
        "recommended_market": s.recommended_market,
        "discovered_date": str(s.discovered_date) if s.discovered_date else None,
        "discovered_by": s.discovered_by,
    }
    if full:
        d.update({
            "source_url": s.source_url,
            "vocal_score": s.vocal_score, "performance_score": s.performance_score,
            "visual_score": s.visual_score, "marketability_score": s.marketability_score,
            "uniqueness_score": s.uniqueness_score,
            "strengths": s.strengths, "weaknesses": s.weaknesses,
            "market_fit": s.market_fit, "comparable_artists": s.comparable_artists or [],
            "notes": s.notes,
        })
    return d

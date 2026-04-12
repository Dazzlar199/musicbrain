"""Marketing Campaign CRUD API."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import date

from core.db.database import get_db
from core.db.models import Campaign

router = APIRouter(prefix="/api/campaigns", tags=["campaigns"])


class CampaignCreate(BaseModel):
    project_id: int
    name: str
    campaign_type: Optional[str] = "pre_release"
    platform: Optional[str] = None
    target_market: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    budget: Optional[float] = None
    content_brief: Optional[str] = None
    target_kpi: Optional[dict] = None
    hashtags: Optional[list] = []
    influencers: Optional[list] = []


@router.get("")
def list_campaigns(project_id: Optional[int] = None, status: Optional[str] = None,
                   skip: int = 0, limit: int = 50, db: Session = Depends(get_db)):
    q = db.query(Campaign)
    if project_id:
        q = q.filter(Campaign.project_id == project_id)
    if status:
        q = q.filter(Campaign.status == status)
    total = q.count()
    items = q.order_by(Campaign.updated_at.desc()).offset(skip).limit(limit).all()
    return {"total": total, "items": [_serialize(c) for c in items]}


@router.get("/dashboard")
def campaign_dashboard(db: Session = Depends(get_db)):
    """Campaign overview: total budget, spend, ROI across all campaigns."""
    all_campaigns = db.query(Campaign).all()
    total_budget = sum(c.budget or 0 for c in all_campaigns)
    total_spent = sum(c.spent or 0 for c in all_campaigns)
    active = sum(1 for c in all_campaigns if c.status == "active")
    completed = sum(1 for c in all_campaigns if c.status == "completed")

    by_platform = {}
    for c in all_campaigns:
        if c.platform:
            by_platform.setdefault(c.platform, {"count": 0, "budget": 0, "spent": 0})
            by_platform[c.platform]["count"] += 1
            by_platform[c.platform]["budget"] += c.budget or 0
            by_platform[c.platform]["spent"] += c.spent or 0

    return {
        "total_campaigns": len(all_campaigns),
        "active": active, "completed": completed,
        "total_budget": total_budget, "total_spent": total_spent,
        "budget_utilization": round(total_spent / total_budget * 100, 1) if total_budget > 0 else 0,
        "by_platform": by_platform,
    }


@router.get("/{campaign_id}")
def get_campaign(campaign_id: int, db: Session = Depends(get_db)):
    c = db.query(Campaign).get(campaign_id)
    if not c:
        raise HTTPException(404)
    return _serialize(c, full=True)


@router.post("")
def create_campaign(data: CampaignCreate, db: Session = Depends(get_db)):
    c = Campaign(**data.model_dump(exclude_none=True))
    db.add(c)
    db.commit()
    db.refresh(c)
    return _serialize(c)


@router.put("/{campaign_id}")
def update_campaign(campaign_id: int, data: dict, db: Session = Depends(get_db)):
    c = db.query(Campaign).get(campaign_id)
    if not c:
        raise HTTPException(404)
    for k, v in data.items():
        if hasattr(c, k):
            setattr(c, k, v)
    # Auto-calculate ROI
    if c.spent and c.spent > 0 and c.actual_kpi:
        streams = c.actual_kpi.get("streams", 0)
        c.roi = round(streams / c.spent, 2) if streams else 0
    db.commit()
    db.refresh(c)
    return _serialize(c)


def _serialize(c: Campaign, full=False) -> dict:
    d = {
        "id": c.id, "project_id": c.project_id, "name": c.name,
        "campaign_type": c.campaign_type, "status": c.status,
        "platform": c.platform, "target_market": c.target_market,
        "start_date": str(c.start_date) if c.start_date else None,
        "end_date": str(c.end_date) if c.end_date else None,
        "budget": c.budget, "spent": c.spent, "roi": c.roi,
    }
    if full:
        d.update({
            "content_brief": c.content_brief, "notes": c.notes,
            "target_kpi": c.target_kpi, "actual_kpi": c.actual_kpi,
            "influencers": c.influencers or [], "hashtags": c.hashtags or [],
        })
    return d

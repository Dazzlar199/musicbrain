"""저작권 · 스플릿 시트 · 계약 · 정산 CRUD API."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import date

from core.db.database import get_db
from core.db.models_rights import SplitSheet, SplitEntry, Contract, RoyaltyStatement

router = APIRouter(prefix="/api/rights", tags=["rights"])


# ─── Split Sheets ───

class SplitSheetCreate(BaseModel):
    track_title: str
    track_id: Optional[int] = None
    isrc: Optional[str] = None

class SplitEntryCreate(BaseModel):
    name: str
    role: Optional[str] = "composer"
    publisher: Optional[str] = None
    share_pct: float
    share_type: Optional[str] = "publishing"
    email: Optional[str] = None
    pro: Optional[str] = None


@router.get("/splits")
def list_splits(status: Optional[str] = None, db: Session = Depends(get_db)):
    q = db.query(SplitSheet)
    if status: q = q.filter(SplitSheet.status == status)
    items = q.order_by(SplitSheet.updated_at.desc()).all()
    return {"total": len(items), "items": [_split(s, db) for s in items]}


@router.post("/splits")
def create_split(data: SplitSheetCreate, db: Session = Depends(get_db)):
    s = SplitSheet(**data.model_dump(exclude_none=True))
    db.add(s); db.commit(); db.refresh(s)
    return _split(s, db)


@router.get("/splits/{split_id}")
def get_split(split_id: int, db: Session = Depends(get_db)):
    s = db.query(SplitSheet).get(split_id)
    if not s: raise HTTPException(404)
    return _split(s, db, full=True)


@router.post("/splits/{split_id}/entries")
def add_split_entry(split_id: int, data: SplitEntryCreate, db: Session = Depends(get_db)):
    s = db.query(SplitSheet).get(split_id)
    if not s: raise HTTPException(404)

    # 총 지분 확인
    existing = db.query(SplitEntry).filter(SplitEntry.split_sheet_id == split_id).all()
    total = sum(e.share_pct for e in existing) + data.share_pct
    if total > 100.01:
        raise HTTPException(400, f"총 지분이 100%를 초과합니다 (현재 {total:.1f}%)")

    entry = SplitEntry(split_sheet_id=split_id, **data.model_dump(exclude_none=True))
    db.add(entry); db.commit(); db.refresh(entry)
    return _entry(entry)


@router.delete("/splits/entries/{entry_id}")
def delete_split_entry(entry_id: int, db: Session = Depends(get_db)):
    e = db.query(SplitEntry).get(entry_id)
    if not e: raise HTTPException(404)
    db.delete(e); db.commit()
    return {"deleted": True}


# ─── Contracts ───

class ContractCreate(BaseModel):
    title: str
    contract_type: Optional[str] = "recording"
    artist_id: Optional[int] = None
    party_a: Optional[str] = None
    party_b: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    advance: Optional[float] = None
    royalty_rate: Optional[float] = None
    territory: Optional[list] = []
    notes: Optional[str] = None


@router.get("/contracts")
def list_contracts(status: Optional[str] = None, db: Session = Depends(get_db)):
    q = db.query(Contract)
    if status: q = q.filter(Contract.status == status)
    items = q.order_by(Contract.updated_at.desc()).all()
    return {"total": len(items), "items": [_contract(c) for c in items]}


@router.post("/contracts")
def create_contract(data: ContractCreate, db: Session = Depends(get_db)):
    c = Contract(**data.model_dump(exclude_none=True))
    db.add(c); db.commit(); db.refresh(c)
    return _contract(c)


@router.get("/contracts/{contract_id}")
def get_contract(contract_id: int, db: Session = Depends(get_db)):
    c = db.query(Contract).get(contract_id)
    if not c: raise HTTPException(404)
    return _contract(c, full=True)


@router.put("/contracts/{contract_id}")
def update_contract(contract_id: int, data: dict, db: Session = Depends(get_db)):
    c = db.query(Contract).get(contract_id)
    if not c: raise HTTPException(404)
    for k, v in data.items():
        if hasattr(c, k): setattr(c, k, v)
    db.commit(); db.refresh(c)
    return _contract(c)


# ─── Royalty Statements ───

class RoyaltyCreate(BaseModel):
    contract_id: Optional[int] = None
    period_start: date
    period_end: date
    gross_revenue: Optional[float] = 0
    deductions: Optional[float] = 0
    breakdown: Optional[dict] = None
    notes: Optional[str] = None


@router.get("/royalties")
def list_royalties(db: Session = Depends(get_db)):
    items = db.query(RoyaltyStatement).order_by(RoyaltyStatement.period_end.desc()).all()
    return {"total": len(items), "items": [_royalty(r) for r in items]}


@router.post("/royalties")
def create_royalty(data: RoyaltyCreate, db: Session = Depends(get_db)):
    r = RoyaltyStatement(**data.model_dump(exclude_none=True))
    r.net_revenue = (r.gross_revenue or 0) - (r.deductions or 0)
    # 계약의 로열티율이 있으면 자동 계산
    if r.contract_id:
        contract = db.query(Contract).get(r.contract_id)
        if contract and contract.royalty_rate:
            r.royalty_amount = r.net_revenue * (contract.royalty_rate / 100)
    db.add(r); db.commit(); db.refresh(r)
    return _royalty(r)


# ─── Dashboard ───

@router.get("/dashboard")
def rights_dashboard(db: Session = Depends(get_db)):
    """저작권/계약/정산 현황 대시보드."""
    splits = db.query(SplitSheet).count()
    contracts = db.query(Contract).count()
    active_contracts = db.query(Contract).filter(Contract.status == "active").count()
    royalties = db.query(RoyaltyStatement).all()

    total_revenue = sum(r.gross_revenue or 0 for r in royalties)
    total_royalty = sum(r.royalty_amount or 0 for r in royalties)

    return {
        "splits": splits,
        "contracts": contracts,
        "active_contracts": active_contracts,
        "total_revenue": total_revenue,
        "total_royalty_paid": total_royalty,
        "statements": len(royalties),
    }


# ─── Serializers ───

def _split(s: SplitSheet, db: Session, full=False) -> dict:
    entries = db.query(SplitEntry).filter(SplitEntry.split_sheet_id == s.id).all()
    total_pct = sum(e.share_pct for e in entries)
    d = {
        "id": s.id, "track_title": s.track_title, "status": s.status,
        "isrc": s.isrc, "total_shares": s.total_shares,
        "allocated_pct": round(total_pct, 1),
        "remaining_pct": round(100 - total_pct, 1),
        "entry_count": len(entries),
        "created_at": str(s.created_at),
    }
    if full:
        d["entries"] = [_entry(e) for e in entries]
        d["notes"] = s.notes
    return d

def _entry(e: SplitEntry) -> dict:
    return {
        "id": e.id, "name": e.name, "role": e.role,
        "publisher": e.publisher, "share_pct": e.share_pct,
        "share_type": e.share_type, "email": e.email,
        "pro": e.pro,
    }

def _contract(c: Contract, full=False) -> dict:
    d = {
        "id": c.id, "title": c.title, "contract_type": c.contract_type,
        "status": c.status, "party_a": c.party_a, "party_b": c.party_b,
        "start_date": str(c.start_date) if c.start_date else None,
        "end_date": str(c.end_date) if c.end_date else None,
        "advance": c.advance, "royalty_rate": c.royalty_rate,
        "territory": c.territory or [],
        "created_at": str(c.created_at),
    }
    if full:
        d["notes"] = c.notes
        d["rights_granted"] = c.rights_granted or []
        d["auto_renewal"] = c.auto_renewal
        d["recoup_status"] = c.recoup_status
        d["document_url"] = c.document_url
    return d

def _royalty(r: RoyaltyStatement) -> dict:
    return {
        "id": r.id, "contract_id": r.contract_id,
        "period": f"{r.period_start} ~ {r.period_end}",
        "status": r.status,
        "gross_revenue": r.gross_revenue, "deductions": r.deductions,
        "net_revenue": r.net_revenue, "royalty_amount": r.royalty_amount,
        "currency": r.currency, "breakdown": r.breakdown,
        "created_at": str(r.created_at),
    }

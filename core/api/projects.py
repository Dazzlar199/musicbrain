"""Project & Release Pipeline CRUD API."""

from fastapi import APIRouter, Depends, HTTPException, Form
from sqlalchemy.orm import Session
from pydantic import BaseModel
from pathlib import Path
from typing import Optional
from datetime import date

from core.db.database import get_db
from core.db.models import Project, Task, Release

router = APIRouter(prefix="/api/projects", tags=["projects"])

PIPELINE_STAGES = [
    "planning", "pre_production", "recording", "mixing", "mastering",
    "quality_check", "distribution", "promotion", "released", "tracking",
]


class ProjectCreate(BaseModel):
    title: str
    project_type: Optional[str] = "single"
    target_market: Optional[str] = None
    target_markets: Optional[list] = []
    concept: Optional[str] = None
    budget: Optional[float] = None
    start_date: Optional[date] = None
    target_release_date: Optional[date] = None
    label: Optional[str] = None
    tags: Optional[list] = []


class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    category: Optional[str] = None
    priority: Optional[str] = "medium"
    assignee: Optional[str] = None
    due_date: Optional[date] = None


class ReleaseCreate(BaseModel):
    title: str
    release_type: Optional[str] = "single"
    release_date: Optional[date] = None
    platforms: Optional[list] = []
    distributor: Optional[str] = None
    territory: Optional[list] = []


# ─── Projects ───

@router.get("")
def list_projects(status: Optional[str] = None, skip: int = 0, limit: int = 50,
                  db: Session = Depends(get_db)):
    q = db.query(Project)
    if status:
        q = q.filter(Project.status == status)
    total = q.count()
    items = q.order_by(Project.updated_at.desc()).offset(skip).limit(limit).all()
    return {"total": total, "items": [_proj(p) for p in items]}


@router.get("/pipeline-overview")
def pipeline_overview(db: Session = Depends(get_db)):
    """Get count of projects at each pipeline stage."""
    result = {}
    for stage in PIPELINE_STAGES:
        count = db.query(Project).filter(Project.status == stage).count()
        result[stage] = count
    return {"stages": PIPELINE_STAGES, "counts": result, "total": sum(result.values())}


@router.get("/{project_id}")
def get_project(project_id: int, db: Session = Depends(get_db)):
    p = db.query(Project).get(project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    return _proj(p, full=True)


@router.post("")
def create_project(data: ProjectCreate, db: Session = Depends(get_db)):
    p = Project(**data.model_dump(exclude_none=True))
    db.add(p)
    db.commit()
    db.refresh(p)
    return _proj(p)


@router.put("/{project_id}")
def update_project(project_id: int, data: dict, db: Session = Depends(get_db)):
    p = db.query(Project).get(project_id)
    if not p:
        raise HTTPException(404)
    for k, v in data.items():
        if hasattr(p, k):
            setattr(p, k, v)
    db.commit()
    db.refresh(p)
    return _proj(p)


@router.post("/{project_id}/advance")
def advance_pipeline(project_id: int, db: Session = Depends(get_db)):
    """다음 단계로."""
    p = db.query(Project).get(project_id)
    if not p:
        raise HTTPException(404)
    idx = PIPELINE_STAGES.index(p.status) if p.status in PIPELINE_STAGES else 0
    if idx < len(PIPELINE_STAGES) - 1:
        p.status = PIPELINE_STAGES[idx + 1]
        db.commit()
        db.refresh(p)
    return _proj(p)


@router.post("/{project_id}/revert")
def revert_pipeline(project_id: int, db: Session = Depends(get_db)):
    """이전 단계로."""
    p = db.query(Project).get(project_id)
    if not p:
        raise HTTPException(404)
    idx = PIPELINE_STAGES.index(p.status) if p.status in PIPELINE_STAGES else 0
    if idx > 0:
        p.status = PIPELINE_STAGES[idx - 1]
        db.commit()
        db.refresh(p)
    return _proj(p)


# ─── Tasks ───

@router.get("/{project_id}/tasks")
def list_tasks(project_id: int, db: Session = Depends(get_db)):
    tasks = db.query(Task).filter(Task.project_id == project_id).order_by(Task.due_date).all()
    return [_task(t) for t in tasks]


@router.post("/{project_id}/tasks")
def create_task(project_id: int, data: TaskCreate, db: Session = Depends(get_db)):
    t = Task(project_id=project_id, **data.model_dump(exclude_none=True))
    db.add(t)
    db.commit()
    db.refresh(t)
    return _task(t)


@router.put("/tasks/{task_id}")
def update_task(task_id: int, data: dict, db: Session = Depends(get_db)):
    t = db.query(Task).get(task_id)
    if not t:
        raise HTTPException(404)
    for k, v in data.items():
        if hasattr(t, k):
            setattr(t, k, v)
    db.commit()
    db.refresh(t)
    return _task(t)


# ─── Releases ───

@router.get("/{project_id}/releases")
def list_releases(project_id: int, db: Session = Depends(get_db)):
    releases = db.query(Release).filter(Release.project_id == project_id).all()
    return [_release(r) for r in releases]


@router.post("/{project_id}/releases")
def create_release(project_id: int, data: ReleaseCreate, db: Session = Depends(get_db)):
    r = Release(project_id=project_id, **data.model_dump(exclude_none=True))
    db.add(r)
    db.commit()
    db.refresh(r)
    return _release(r)


def _proj(p: Project, full=False) -> dict:
    d = {
        "id": p.id, "title": p.title, "project_type": p.project_type,
        "status": p.status, "target_market": p.target_market,
        "target_markets": p.target_markets or [],
        "target_release_date": str(p.target_release_date) if p.target_release_date else None,
        "budget": p.budget, "label": p.label, "tags": p.tags or [],
        "created_at": str(p.created_at), "updated_at": str(p.updated_at),
    }
    if full:
        d.update({
            "concept": p.concept, "notes": p.notes,
            "start_date": str(p.start_date) if p.start_date else None,
            "actual_release_date": str(p.actual_release_date) if p.actual_release_date else None,
            "distributor": p.distributor, "isrc": p.isrc, "upc": p.upc,
            "artist_count": len(p.artists), "track_count": len(p.tracks),
            "task_count": len(p.tasks), "campaign_count": len(p.campaigns),
            "tracks": [{
                "id": t.id, "title": t.title, "status": t.status,
                "genre": t.genre, "bpm": t.bpm, "key": t.key, "mood": t.mood,
                "market_scores": t.market_scores,
                "viral_timestamp": (t.viral_json or {}).get("best", {}).get("timestamp"),
            } for t in p.tracks],
            "campaigns": [{
                "id": c.id, "name": c.name, "campaign_type": c.campaign_type,
                "status": c.status, "platform": c.platform,
                "budget": c.budget, "spent": c.spent,
            } for c in p.campaigns],
        })
    return d


def _task(t: Task) -> dict:
    return {
        "id": t.id, "title": t.title, "description": t.description,
        "category": t.category, "status": t.status, "priority": t.priority,
        "assignee": t.assignee,
        "due_date": str(t.due_date) if t.due_date else None,
        "completed_date": str(t.completed_date) if t.completed_date else None,
    }


def _release(r: Release) -> dict:
    return {
        "id": r.id, "title": r.title, "release_type": r.release_type,
        "release_date": str(r.release_date) if r.release_date else None,
        "status": r.status, "platforms": r.platforms or [],
        "distributor": r.distributor, "territory": r.territory or [],
        "first_week_streams": r.first_week_streams, "total_streams": r.total_streams,
        "chart_peak": r.chart_peak,
    }


# ─── 프로젝트 파일/이미지 ───

import uuid, shutil
from fastapi import UploadFile as _UploadFile, File as _File

PROJECT_FILES_DIR = Path(__file__).parent.parent.parent / "data" / "project_files"
PROJECT_FILES_DIR.mkdir(parents=True, exist_ok=True)


@router.post("/{project_id}/files")
async def upload_project_file(
    project_id: int,
    file: _UploadFile = _File(...),
    label: str = Form(""),
    db: Session = Depends(get_db),
):
    """프로젝트에 파일 업로드 (이미지, 무드보드, 가사, 기획서 등)."""
    p = db.query(Project).get(project_id)
    if not p:
        raise HTTPException(404)

    file_id = str(uuid.uuid4())[:8]
    ext = Path(file.filename or "file").suffix
    safe_name = f"{file_id}_{file.filename}".replace(" ", "_")
    file_path = PROJECT_FILES_DIR / str(project_id) / safe_name

    file_path.parent.mkdir(parents=True, exist_ok=True)
    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)

    # 파일 목록을 프로젝트 notes에 JSON으로 저장 (간단한 방식)
    import json
    files_list = json.loads(p.notes or "[]") if p.notes and p.notes.startswith("[") else []
    files_list.append({
        "id": file_id,
        "name": file.filename,
        "label": label or file.filename,
        "path": f"/api/projects/{project_id}/files/{safe_name}",
        "size": len(content),
        "type": file.content_type or "application/octet-stream",
    })

    # notes 필드에 파일 목록 + 기존 텍스트 노트를 분리 저장
    if not p.tags:
        p.tags = []
    # tags에 files 저장
    p.tags = list(set(p.tags))  # 중복 제거

    # 별도 JSON 파일로 저장
    meta_path = PROJECT_FILES_DIR / str(project_id) / "_files.json"
    with open(meta_path, "w") as f:
        json.dump(files_list, f, ensure_ascii=False)

    db.commit()
    return {"id": file_id, "name": file.filename, "path": f"/api/projects/{project_id}/files/{safe_name}"}


@router.get("/{project_id}/files")
def list_project_files(project_id: int):
    """프로젝트에 업로드된 파일 목록."""
    import json
    meta_path = PROJECT_FILES_DIR / str(project_id) / "_files.json"
    if meta_path.exists():
        return json.loads(meta_path.read_text())
    return []


@router.get("/{project_id}/files/{filename}")
def get_project_file(project_id: int, filename: str):
    """프로젝트 파일 다운로드/표시."""
    from fastapi.responses import FileResponse
    file_path = PROJECT_FILES_DIR / str(project_id) / filename
    if not file_path.exists():
        raise HTTPException(404)
    return FileResponse(str(file_path))

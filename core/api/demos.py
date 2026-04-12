"""데모 제출 포털 API.

외부 작곡가/프로듀서가 곡을 제출하면:
1. 자동으로 오디오 분석 실행
2. 12개 시장 적합도 판정
3. A&R 대시보드에서 결과 확인 가능

엔터사 A&R 프로세스를 자동화하는 핵심 기능.
"""

import os
import uuid
import shutil
from pathlib import Path
from datetime import datetime
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends
from sqlalchemy.orm import Session
from typing import Optional

from core.db.database import get_db
from core.db.models import Track
from core.analyzer import extract_features
from core.deep_analyzer import deep_analyze
from core.similarity import ReferenceDatabase
from core.benchmark import find_viral_segment

router = APIRouter(prefix="/api/demos", tags=["demos"])

UPLOAD_DIR = Path(__file__).parent.parent.parent / "data" / "demos"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

_db_ref = None
def _get_ref_db():
    global _db_ref
    if _db_ref is None:
        _db_ref = ReferenceDatabase()
    return _db_ref


@router.post("/submit")
async def submit_demo(
    file: UploadFile = File(...),
    title: str = Form(...),
    artist_name: str = Form(...),
    genre: str = Form(""),
    target_market: str = Form("kr"),
    submitter_name: str = Form(""),
    submitter_email: str = Form(""),
    notes: str = Form(""),
    db: Session = Depends(get_db),
):
    """곡 제출 + 자동 분석. 결과를 바로 반환."""
    # 파일 저장
    ext = Path(file.filename or "demo.mp3").suffix or ".mp3"
    file_id = str(uuid.uuid4())[:8]
    filename = f"{file_id}_{artist_name}_{title}{ext}".replace(" ", "_")
    file_path = UPLOAD_DIR / filename

    audio_bytes = await file.read()
    size_mb = len(audio_bytes) / (1024 * 1024)
    if size_mb > 50:
        raise HTTPException(400, "파일이 너무 큽니다 (최대 50MB)")

    with open(file_path, "wb") as f:
        f.write(audio_bytes)

    # 자동 분석
    try:
        features = extract_features(audio_bytes=audio_bytes)
        deep = deep_analyze(audio_bytes=audio_bytes)
        viral = find_viral_segment(audio_bytes)

        ref_db = _get_ref_db()
        market_scores = ref_db.market_scores(features)
        similar = ref_db.find_similar(features, target_market, top_k=5)

        primary_score = market_scores.get(target_market, 0)
    except Exception as e:
        raise HTTPException(500, f"분석 실패: {e}")

    # DB에 저장
    track = Track(
        title=title,
        genre=genre,
        file_path=str(file_path),
        status="demo",
        analysis_json=deep,
        market_scores=market_scores,
        viral_json=viral,
        bpm=deep.get("tempo", {}).get("bpm"),
        key=deep.get("tonality", {}).get("key_name"),
        mood=deep.get("mood", {}).get("primary_mood"),
        notes=f"제출자: {submitter_name} ({submitter_email})\n{notes}".strip(),
        tags=["demo", f"submitter:{submitter_name}", f"target:{target_market}"],
    )
    db.add(track)
    db.commit()
    db.refresh(track)

    # 유사 곡 정보
    similar_data = [
        {"artist": info.artist, "title": info.title, "similarity": round(score, 3),
         "market": info.market, "genre": info.genre}
        for info, score in similar
    ]

    # 시장 점수 랭킹
    ranked_markets = sorted(market_scores.items(), key=lambda x: x[1], reverse=True)

    return {
        "id": track.id,
        "status": "analyzed",
        "title": title,
        "artist": artist_name,
        "target_market": target_market,
        "score": round(primary_score, 1),
        "market_scores": {k: round(v, 1) for k, v in market_scores.items()},
        "best_market": ranked_markets[0][0] if ranked_markets else target_market,
        "best_market_score": round(ranked_markets[0][1], 1) if ranked_markets else 0,
        "analysis": {
            "tempo": deep.get("tempo", {}),
            "key": deep.get("tonality", {}).get("key_name"),
            "energy": deep.get("energy", {}).get("category"),
            "mood": deep.get("mood", {}).get("primary_mood"),
            "danceability": deep.get("rhythm", {}).get("danceability"),
            "polish": deep.get("production", {}).get("polish_score"),
            "vocal_presence": deep.get("vocal", {}).get("vocal_presence"),
        },
        "viral_segment": {
            "timestamp": viral.get("best", {}).get("timestamp"),
            "score": viral.get("best", {}).get("score"),
            "reasons": viral.get("best", {}).get("reasons", []),
        },
        "similar_tracks": similar_data,
        "verdict": _verdict(primary_score),
    }


@router.get("")
def list_demos(
    status: Optional[str] = None,
    target_market: Optional[str] = None,
    sort: str = "newest",
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
):
    """제출된 데모 목록. A&R 대시보드용."""
    q = db.query(Track).filter(Track.status == "demo")
    if target_market:
        q = q.filter(Track.tags.contains([f"target:{target_market}"]))

    if sort == "score":
        q = q.order_by(Track.id.desc())  # 나중에 score로 정렬
    else:
        q = q.order_by(Track.created_at.desc())

    total = q.count()
    tracks = q.offset(skip).limit(limit).all()

    items = []
    for t in tracks:
        scores = t.market_scores or {}
        best_market = max(scores, key=scores.get) if scores else "kr"
        items.append({
            "id": t.id,
            "title": t.title,
            "genre": t.genre,
            "status": t.status,
            "bpm": t.bpm,
            "key": t.key,
            "mood": t.mood,
            "score": round(scores.get(best_market, 0), 1) if scores else 0,
            "best_market": best_market,
            "market_scores": scores,
            "viral_timestamp": (t.viral_json or {}).get("best", {}).get("timestamp"),
            "notes": t.notes,
            "created_at": str(t.created_at),
            "verdict": _verdict(scores.get(best_market, 0) if scores else 0),
        })

    return {"total": total, "items": items}


@router.post("/{demo_id}/select")
def select_demo(demo_id: int, project_id: int = Form(0), db: Session = Depends(get_db)):
    """데모를 '선택됨'으로 변경하고, 프로젝트에 연결."""
    from core.db.models import Project, track_project
    t = db.query(Track).get(demo_id)
    if not t:
        raise HTTPException(404)
    t.status = "selected"

    # 프로젝트 연결
    if project_id and project_id > 0:
        p = db.query(Project).get(project_id)
        if p:
            # 이미 연결 안 되어 있으면 추가
            existing = db.execute(
                track_project.select().where(
                    (track_project.c.track_id == demo_id) &
                    (track_project.c.project_id == project_id)
                )
            ).first()
            if not existing:
                db.execute(track_project.insert().values(track_id=demo_id, project_id=project_id))

    db.commit()
    return {"id": t.id, "status": "selected", "project_id": project_id}


@router.post("/{demo_id}/pass")
def pass_demo(demo_id: int, reason: str = Form(""), db: Session = Depends(get_db)):
    """데모를 '패스'로 변경."""
    t = db.query(Track).get(demo_id)
    if not t:
        raise HTTPException(404)
    t.status = "passed"
    if reason:
        t.notes = (t.notes or "") + f"\n패스 사유: {reason}"
    db.commit()
    return {"id": t.id, "status": "passed"}


@router.get("/stats")
def demo_stats(db: Session = Depends(get_db)):
    """데모 제출 통계."""
    total = db.query(Track).filter(Track.tags.contains(["demo"])).count()
    selected = db.query(Track).filter(Track.status == "selected").count()
    passed = db.query(Track).filter(Track.status == "passed").count()
    pending = db.query(Track).filter(Track.status == "demo").count()

    return {
        "total": total,
        "pending": pending,
        "selected": selected,
        "passed": passed,
        "selection_rate": round(selected / total * 100, 1) if total > 0 else 0,
    }


def _verdict(score: float) -> str:
    if score >= 70:
        return "강력 추천"
    if score >= 50:
        return "검토 가치 있음"
    if score >= 30:
        return "조건부 가능"
    return "시장 부적합"

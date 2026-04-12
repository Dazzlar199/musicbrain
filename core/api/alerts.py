"""트렌드 알림 API.

차트 변동, 신규 진입, 급상승 곡을 감지하고 알림 생성.
주기적으로 호출하면 변동 사항을 추적.
"""

import json
from pathlib import Path
from datetime import datetime, date
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import Optional

from core.db.database import get_db
from core.db.models import TrendSnapshot

router = APIRouter(prefix="/api/alerts", tags=["alerts"])

ALERTS_FILE = Path(__file__).parent.parent.parent / "data" / "alerts.json"


def _load_alerts() -> list[dict]:
    if ALERTS_FILE.exists():
        return json.loads(ALERTS_FILE.read_text())
    return []


def _save_alerts(alerts: list[dict]):
    ALERTS_FILE.parent.mkdir(parents=True, exist_ok=True)
    ALERTS_FILE.write_text(json.dumps(alerts, ensure_ascii=False, indent=2))


@router.get("")
def list_alerts(unread_only: bool = False, limit: int = 30):
    """알림 목록."""
    alerts = _load_alerts()
    if unread_only:
        alerts = [a for a in alerts if not a.get("read")]
    return {
        "alerts": alerts[:limit],
        "total": len(alerts),
        "unread": sum(1 for a in _load_alerts() if not a.get("read")),
    }


@router.post("/mark-read/{alert_id}")
def mark_read(alert_id: str):
    """알림 읽음 처리."""
    alerts = _load_alerts()
    for a in alerts:
        if a.get("id") == alert_id:
            a["read"] = True
    _save_alerts(alerts)
    return {"ok": True}


@router.post("/mark-all-read")
def mark_all_read():
    """전체 읽음 처리."""
    alerts = _load_alerts()
    for a in alerts:
        a["read"] = True
    _save_alerts(alerts)
    return {"ok": True}


@router.post("/scan-charts")
def scan_charts():
    """차트를 스캔해서 변동 감지 → 알림 생성.

    이전 스냅샷과 비교해서:
    - 신규 진입 (새로 차트에 들어온 곡)
    - 급상승 (5순위 이상 상승)
    - 1위 변경
    """
    import uuid
    alerts = _load_alerts()
    new_alerts = []

    # 멜론 차트 체크
    try:
        from melon import ChartData
        chart = ChartData()
        entries = [{"rank": e.rank, "title": e.title, "artist": e.artist} for e in chart.entries[:50]]

        # 이전 스냅샷 로드
        snapshot_file = ALERTS_FILE.parent / "last_melon.json"
        prev = []
        if snapshot_file.exists():
            prev = json.loads(snapshot_file.read_text())

        prev_titles = {e["title"] for e in prev}
        prev_map = {e["title"]: e["rank"] for e in prev}

        for entry in entries:
            # 신규 진입
            if entry["title"] not in prev_titles and entry["rank"] <= 20:
                new_alerts.append({
                    "id": str(uuid.uuid4())[:8],
                    "type": "new_entry",
                    "platform": "멜론",
                    "title": f'{entry["artist"]} - {entry["title"]}',
                    "message": f'멜론 차트 {entry["rank"]}위 신규 진입',
                    "rank": entry["rank"],
                    "timestamp": datetime.utcnow().isoformat(),
                    "read": False,
                })

            # 1위 변경
            if entry["rank"] == 1 and prev and prev[0].get("title") != entry["title"]:
                new_alerts.append({
                    "id": str(uuid.uuid4())[:8],
                    "type": "top_change",
                    "platform": "멜론",
                    "title": f'{entry["artist"]} - {entry["title"]}',
                    "message": f'멜론 차트 1위 변경',
                    "rank": 1,
                    "timestamp": datetime.utcnow().isoformat(),
                    "read": False,
                })

            # 급상승
            if entry["title"] in prev_map:
                prev_rank = prev_map[entry["title"]]
                if prev_rank - entry["rank"] >= 5:
                    new_alerts.append({
                        "id": str(uuid.uuid4())[:8],
                        "type": "rising",
                        "platform": "멜론",
                        "title": f'{entry["artist"]} - {entry["title"]}',
                        "message": f'멜론 차트 {prev_rank}위 → {entry["rank"]}위 ({prev_rank - entry["rank"]}순위 상승)',
                        "rank": entry["rank"],
                        "prev_rank": prev_rank,
                        "timestamp": datetime.utcnow().isoformat(),
                        "read": False,
                    })

        # 현재 스냅샷 저장
        snapshot_file.write_text(json.dumps(entries, ensure_ascii=False))

    except Exception as e:
        new_alerts.append({
            "id": str(uuid.uuid4())[:8],
            "type": "error",
            "platform": "멜론",
            "title": "차트 스캔 실패",
            "message": str(e),
            "timestamp": datetime.utcnow().isoformat(),
            "read": False,
        })

    # 벅스 차트 체크
    try:
        from bugs import ChartData as BugsChart
        chart = BugsChart()
        entries = [{"rank": e.rank, "title": e.title, "artist": e.artist} for e in chart.entries[:20]]

        snapshot_file = ALERTS_FILE.parent / "last_bugs.json"
        prev = []
        if snapshot_file.exists():
            prev = json.loads(snapshot_file.read_text())

        prev_titles = {e["title"] for e in prev}

        for entry in entries:
            if entry["title"] not in prev_titles and entry["rank"] <= 10:
                new_alerts.append({
                    "id": str(uuid.uuid4())[:8],
                    "type": "new_entry",
                    "platform": "벅스",
                    "title": f'{entry["artist"]} - {entry["title"]}',
                    "message": f'벅스 차트 {entry["rank"]}위 신규 진입',
                    "rank": entry["rank"],
                    "timestamp": datetime.utcnow().isoformat(),
                    "read": False,
                })

        snapshot_file.write_text(json.dumps(entries, ensure_ascii=False))

    except Exception:
        pass

    # 새 알림 추가 (최신이 위로)
    alerts = new_alerts + alerts
    alerts = alerts[:200]  # 최대 200개
    _save_alerts(alerts)

    return {
        "new_alerts": len(new_alerts),
        "total": len(alerts),
        "unread": sum(1 for a in alerts if not a.get("read")),
        "details": new_alerts,
    }


@router.get("/summary")
def alert_summary():
    """알림 요약 — 헤더 뱃지용."""
    alerts = _load_alerts()
    unread = sum(1 for a in alerts if not a.get("read"))
    return {"unread": unread, "total": len(alerts)}

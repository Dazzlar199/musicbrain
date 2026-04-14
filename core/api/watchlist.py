"""경쟁사 워치리스트 — 등록 아티스트 모니터링 + 변화 감지.

워치리스트에 아티스트를 등록하면 정기적으로 버즈 데이터를 수집하고
급등/급락/플레이리스트 진입/트렌딩 등 이상 징후를 알림.
"""

import os
import json
from pathlib import Path
from datetime import datetime
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
from core.api.cache import SimpleCache

from core.api.buzz import _google_trends, _reddit_buzz, _google_news

router = APIRouter(prefix="/api/watchlist", tags=["watchlist"])

_cache = SimpleCache(ttl=1800)

DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"
WATCHLIST_FILE = DATA_DIR / "watchlist.json"
HISTORY_FILE = DATA_DIR / "watchlist_history.json"


# ─── 파일 I/O ───

def _load_watchlist() -> dict:
    """워치리스트 JSON 로드."""
    if WATCHLIST_FILE.exists():
        try:
            return json.loads(WATCHLIST_FILE.read_text(encoding="utf-8"))
        except Exception:
            return {"artists": {}}
    return {"artists": {}}


def _save_watchlist(data: dict):
    """워치리스트 JSON 저장."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    WATCHLIST_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def _load_history() -> dict:
    """히스토리 JSON 로드."""
    if HISTORY_FILE.exists():
        try:
            return json.loads(HISTORY_FILE.read_text(encoding="utf-8"))
        except Exception:
            return {"snapshots": {}}
    return {"snapshots": {}}


def _save_history(data: dict):
    """히스토리 JSON 저장."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    HISTORY_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


# ─── 버즈 스코어 계산 ───

def _calc_buzz_score(trends: dict, reddit: dict, news: dict) -> int:
    """간이 버즈 스코어 계산 (0-100)."""
    score = 0
    score += min(trends.get("avg", 0), 30)
    score += min(reddit.get("count", 0) * 3, 25)
    score += min(news.get("count", 0) * 3, 25)
    score += min(trends.get("peak", 0) * 0.2, 20)
    return min(int(score), 100)


# ─── 변화 감지 ───

def _detect_alerts(artist_name: str, current_score: int, trends: dict, reddit: dict, news: dict) -> list[dict]:
    """이전 스냅샷과 비교해서 이상 징후 감지."""
    alerts = []
    history = _load_history()
    snapshots = history.get("snapshots", {}).get(artist_name, [])

    if not snapshots:
        return alerts

    prev = snapshots[-1]
    prev_score = prev.get("score", 0)
    diff = current_score - prev_score

    # 버즈 급등
    if diff >= 20:
        alerts.append({
            "type": "buzz_spike",
            "artist": artist_name,
            "message": f"버즈 급등 감지: {prev_score} → {current_score} (+{diff})",
            "severity": "high" if diff >= 40 else "medium",
            "prev_score": prev_score,
            "current_score": current_score,
            "detected_at": datetime.utcnow().isoformat(),
        })

    # 버즈 급락
    if diff <= -20:
        alerts.append({
            "type": "buzz_drop",
            "artist": artist_name,
            "message": f"버즈 급락 감지: {prev_score} → {current_score} ({diff})",
            "severity": "high" if diff <= -40 else "medium",
            "prev_score": prev_score,
            "current_score": current_score,
            "detected_at": datetime.utcnow().isoformat(),
        })

    # Google Trends 피크 감지
    peak = trends.get("peak", 0)
    avg = trends.get("avg", 0)
    if peak >= 80 and avg >= 30:
        alerts.append({
            "type": "trending",
            "artist": artist_name,
            "message": f"Google Trends 피크 감지: 최고점 {peak}, 평균 {avg}",
            "severity": "high",
            "peak": peak,
            "avg": avg,
            "peak_date": trends.get("peak_date"),
            "detected_at": datetime.utcnow().isoformat(),
        })

    # 새 뉴스 급증 (이전 대비 기사 수 증가)
    prev_news_count = prev.get("news_count", 0)
    current_news_count = news.get("count", 0)
    if current_news_count >= 10 and current_news_count >= prev_news_count * 2:
        alerts.append({
            "type": "new_playlist",
            "artist": artist_name,
            "message": f"뉴스 급증 감지 (새 플레이리스트/활동 가능성): {prev_news_count} → {current_news_count}건",
            "severity": "medium",
            "prev_count": prev_news_count,
            "current_count": current_news_count,
            "detected_at": datetime.utcnow().isoformat(),
        })

    return alerts


# ─── 요청 모델 ───

class AddArtistRequest(BaseModel):
    artist_name: str
    priority: str = "medium"  # high / medium / low


# ─── API 엔드포인트 ───

@router.post("/add")
def add_to_watchlist(req: AddArtistRequest):
    """워치리스트에 아티스트 추가."""
    if req.priority not in ("high", "medium", "low"):
        return {"error": "priority는 high, medium, low 중 하나여야 합니다."}

    watchlist = _load_watchlist()
    now = datetime.utcnow().isoformat()

    if req.artist_name in watchlist["artists"]:
        watchlist["artists"][req.artist_name]["priority"] = req.priority
        watchlist["artists"][req.artist_name]["updated_at"] = now
        _save_watchlist(watchlist)
        return {
            "message": f"'{req.artist_name}' 우선순위가 '{req.priority}'로 업데이트되었습니다.",
            "artist": watchlist["artists"][req.artist_name],
        }

    watchlist["artists"][req.artist_name] = {
        "priority": req.priority,
        "added_at": now,
        "updated_at": now,
        "last_score": None,
        "last_scan": None,
    }
    _save_watchlist(watchlist)

    return {
        "message": f"'{req.artist_name}'이(가) 워치리스트에 추가되었습니다.",
        "artist": watchlist["artists"][req.artist_name],
        "total_artists": len(watchlist["artists"]),
    }


@router.get("/")
def list_watchlist():
    """워치리스트 전체 목록 + 최신 버즈 스코어."""
    watchlist = _load_watchlist()
    artists = []

    for name, info in watchlist.get("artists", {}).items():
        history = _load_history()
        snapshots = history.get("snapshots", {}).get(name, [])
        last_snapshot = snapshots[-1] if snapshots else None

        change = None
        if len(snapshots) >= 2:
            change = snapshots[-1].get("score", 0) - snapshots[-2].get("score", 0)

        artists.append({
            "artist_name": name,
            "priority": info.get("priority", "medium"),
            "last_score": info.get("last_score"),
            "last_scan": info.get("last_scan"),
            "score_change": change,
            "added_at": info.get("added_at"),
        })

    # 우선순위 순 정렬
    priority_order = {"high": 0, "medium": 1, "low": 2}
    artists.sort(key=lambda x: priority_order.get(x["priority"], 1))

    return {
        "artists": artists,
        "total": len(artists),
        "updated": datetime.utcnow().isoformat(),
    }


@router.get("/scan")
def scan_watchlist():
    """워치리스트 전체 스캔 — 버즈 수집 + 변화 감지."""
    cache_key = "watchlist_scan"
    if _cache.is_fresh(cache_key):
        return _cache.get(cache_key)

    watchlist = _load_watchlist()
    history = _load_history()
    if "snapshots" not in history:
        history["snapshots"] = {}

    scan_results = []
    all_alerts = []
    now = datetime.utcnow()

    for name, info in watchlist.get("artists", {}).items():
        try:
            # 버즈 데이터 수집
            trends = _google_trends(name)
            reddit = _reddit_buzz(name, limit=10)
            news = _google_news(name, limit=10)

            score = _calc_buzz_score(trends, reddit, news)

            # 변화 감지
            alerts = _detect_alerts(name, score, trends, reddit, news)
            all_alerts.extend(alerts)

            # 스냅샷 저장
            snapshot = {
                "score": score,
                "trend_avg": trends.get("avg", 0),
                "trend_peak": trends.get("peak", 0),
                "reddit_count": reddit.get("count", 0),
                "news_count": news.get("count", 0),
                "scanned_at": now.isoformat(),
            }

            if name not in history["snapshots"]:
                history["snapshots"][name] = []
            history["snapshots"][name].append(snapshot)
            # 최근 90일분만 보관 (하루 1회 스캔 기준 ~90개)
            history["snapshots"][name] = history["snapshots"][name][-90:]

            # 워치리스트 업데이트
            watchlist["artists"][name]["last_score"] = score
            watchlist["artists"][name]["last_scan"] = now.isoformat()

            scan_results.append({
                "artist": name,
                "score": score,
                "priority": info.get("priority", "medium"),
                "alerts": len(alerts),
                "trend_avg": trends.get("avg", 0),
                "reddit_mentions": reddit.get("count", 0),
                "news_articles": news.get("count", 0),
            })

        except Exception as e:
            scan_results.append({
                "artist": name,
                "score": None,
                "error": str(e),
            })

    _save_watchlist(watchlist)
    _save_history(history)

    result = {
        "scan_results": scan_results,
        "total_scanned": len(scan_results),
        "alerts_detected": len(all_alerts),
        "alerts": all_alerts,
        "scanned_at": now.isoformat(),
    }

    _cache.set(cache_key, result)
    return result


@router.get("/alerts")
def get_alerts():
    """마지막 스캔 이후 감지된 알림 목록."""
    cache_key = "watchlist_scan"
    scan_data = _cache.get(cache_key)
    if scan_data:
        return {
            "alerts": scan_data.get("alerts", []),
            "count": scan_data.get("alerts_detected", 0),
            "last_scan": scan_data.get("scanned_at"),
        }

    # 캐시 없으면 히스토리에서 최근 변화 분석
    watchlist = _load_watchlist()
    history = _load_history()
    alerts = []

    for name, info in watchlist.get("artists", {}).items():
        snapshots = history.get("snapshots", {}).get(name, [])
        if len(snapshots) < 2:
            continue

        current = snapshots[-1]
        prev = snapshots[-2]
        diff = current.get("score", 0) - prev.get("score", 0)

        if diff >= 20:
            alerts.append({
                "type": "buzz_spike",
                "artist": name,
                "message": f"버즈 급등: {prev.get('score', 0)} → {current.get('score', 0)} (+{diff})",
                "severity": "high" if diff >= 40 else "medium",
                "detected_at": current.get("scanned_at", ""),
            })
        elif diff <= -20:
            alerts.append({
                "type": "buzz_drop",
                "artist": name,
                "message": f"버즈 급락: {prev.get('score', 0)} → {current.get('score', 0)} ({diff})",
                "severity": "high" if diff <= -40 else "medium",
                "detected_at": current.get("scanned_at", ""),
            })

        if current.get("trend_peak", 0) >= 80:
            alerts.append({
                "type": "trending",
                "artist": name,
                "message": f"Google Trends 피크: {current.get('trend_peak', 0)}",
                "severity": "high",
                "detected_at": current.get("scanned_at", ""),
            })

    return {
        "alerts": alerts,
        "count": len(alerts),
        "source": "history",
        "message": "캐시된 스캔 결과 없음. 히스토리 기반 분석 결과입니다. /scan을 먼저 실행해주세요.",
    }


@router.get("/{artist_name}/history")
def get_artist_history(artist_name: str):
    """아티스트 버즈 히스토리 조회."""
    history = _load_history()
    snapshots = history.get("snapshots", {}).get(artist_name, [])

    if not snapshots:
        return {
            "artist": artist_name,
            "history": [],
            "message": f"'{artist_name}'의 히스토리가 없습니다. /scan을 먼저 실행해주세요.",
        }

    # 통계 계산
    scores = [s.get("score", 0) for s in snapshots]
    avg_score = round(sum(scores) / len(scores), 1) if scores else 0
    max_score = max(scores) if scores else 0
    min_score = min(scores) if scores else 0

    trend = "stable"
    if len(scores) >= 3:
        recent_avg = sum(scores[-3:]) / 3
        older_avg = sum(scores[:3]) / 3
        if recent_avg - older_avg >= 10:
            trend = "rising"
        elif older_avg - recent_avg >= 10:
            trend = "declining"

    return {
        "artist": artist_name,
        "history": snapshots,
        "total_snapshots": len(snapshots),
        "stats": {
            "avg_score": avg_score,
            "max_score": max_score,
            "min_score": min_score,
            "trend": trend,
        },
    }


@router.delete("/{artist_name}")
def remove_from_watchlist(artist_name: str):
    """워치리스트에서 아티스트 제거."""
    watchlist = _load_watchlist()

    if artist_name not in watchlist.get("artists", {}):
        return {"error": f"'{artist_name}'은(는) 워치리스트에 없습니다."}

    del watchlist["artists"][artist_name]
    _save_watchlist(watchlist)

    # 히스토리는 보존 (나중에 다시 추가할 수 있으므로)
    return {
        "message": f"'{artist_name}'이(가) 워치리스트에서 제거되었습니다.",
        "remaining_artists": len(watchlist["artists"]),
    }

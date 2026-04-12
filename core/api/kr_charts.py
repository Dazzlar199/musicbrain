"""한국 음악 차트 실시간 API — 멜론, 벅스."""

from fastapi import APIRouter
from datetime import datetime

router = APIRouter(prefix="/api/charts/kr", tags=["kr-charts"])

_cache = {}
_cache_ttl = 300  # 5분 캐시


def _is_fresh(key: str) -> bool:
    if key not in _cache:
        return False
    return (datetime.utcnow() - _cache[key]["ts"]).seconds < _cache_ttl


@router.get("/melon")
def melon_chart(limit: int = 50):
    """멜론 실시간 TOP 100."""
    if _is_fresh("melon"):
        return _cache["melon"]["data"]

    try:
        from melon import ChartData
        chart = ChartData()
        entries = []
        for e in chart.entries[:limit]:
            entries.append({
                "rank": e.rank,
                "title": e.title,
                "artist": e.artist,
                "image": getattr(e, "image", None),
            })
        result = {"platform": "melon", "entries": entries, "count": len(entries),
                  "updated": datetime.utcnow().isoformat()}
        _cache["melon"] = {"data": result, "ts": datetime.utcnow()}
        return result
    except Exception as e:
        return {"platform": "melon", "error": str(e), "entries": []}


@router.get("/bugs")
def bugs_chart(limit: int = 50):
    """벅스 실시간 TOP 100."""
    if _is_fresh("bugs"):
        return _cache["bugs"]["data"]

    try:
        from bugs import ChartData
        chart = ChartData()
        entries = []
        for e in chart.entries[:limit]:
            entries.append({
                "rank": e.rank,
                "title": e.title,
                "artist": e.artist,
                "image": getattr(e, "image", None),
            })
        result = {"platform": "bugs", "entries": entries, "count": len(entries),
                  "updated": datetime.utcnow().isoformat()}
        _cache["bugs"] = {"data": result, "ts": datetime.utcnow()}
        return result
    except Exception as e:
        return {"platform": "bugs", "error": str(e), "entries": []}


@router.get("/all")
def all_kr_charts(limit: int = 20):
    """멜론 + 벅스 통합 차트."""
    melon = melon_chart(limit)
    bugs = bugs_chart(limit)
    return {
        "melon": melon.get("entries", []),
        "bugs": bugs.get("entries", []),
        "updated": datetime.utcnow().isoformat(),
    }

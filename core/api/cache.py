"""공유 캐시 모듈 — 모든 API에서 재사용."""

from datetime import datetime


class SimpleCache:
    def __init__(self, ttl: int = 1800):
        self._data: dict = {}
        self._ttl = ttl

    def is_fresh(self, key: str) -> bool:
        if key not in self._data:
            return False
        return (datetime.utcnow() - self._data[key]["ts"]).total_seconds() < self._ttl

    def get(self, key: str):
        return self._data.get(key, {}).get("data")

    def set(self, key: str, data):
        self._data[key] = {"data": data, "ts": datetime.utcnow()}

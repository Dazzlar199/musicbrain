"""Database connection and session management."""

from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from core.db.models import Base
import core.db.models_rights  # 저작권/계약/정산 테이블 등록
# core.auth는 server.py에서 import 시 자동 등록됨 (순환 import 방지)

DB_PATH = Path(__file__).parent.parent.parent / "data" / "musicbrain.db"
DB_URL = f"sqlite:///{DB_PATH}"

engine = create_engine(DB_URL, echo=False, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine)


def init_db():
    """Create all tables."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    Base.metadata.create_all(engine)


def get_db() -> Session:
    """Get a database session (use as dependency)."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

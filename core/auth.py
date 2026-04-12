"""인증 시스템 — JWT 토큰 기반.

회원가입, 로그인, 토큰 검증, 소셜 계정 연결.
"""

import os
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy import Column, Integer, String, DateTime, Boolean, JSON
from sqlalchemy.orm import Session
from pydantic import BaseModel
from jose import JWTError, jwt
import bcrypt as _bcrypt

from core.db.models import Base
from core.db.database import get_db

SECRET_KEY = os.getenv("JWT_SECRET", "musicbrain-secret-key-change-in-production")
ALGORITHM = "HS256"
TOKEN_EXPIRE_HOURS = 72

def _hash_pw(password: str) -> str:
    return _bcrypt.hashpw(password.encode()[:72], _bcrypt.gensalt()).decode()

def _verify_pw(password: str, hashed: str) -> bool:
    return _bcrypt.checkpw(password.encode()[:72], hashed.encode())
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)

router = APIRouter(prefix="/api/auth", tags=["auth"])


# ─── User Model ───

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    email = Column(String(200), unique=True, nullable=False)
    name = Column(String(200), nullable=False)
    password_hash = Column(String(300), nullable=False)
    role = Column(String(50), default="member")  # admin, manager, member
    company = Column(String(200))
    avatar_url = Column(String(500))
    is_active = Column(Boolean, default=True)

    # 소셜 계정 연결
    connected_accounts = Column(JSON, default=dict)
    # {"youtube": {"channel_id": "...", "name": "..."}, "instagram": {"handle": "..."}, ...}

    created_at = Column(DateTime, default=datetime.utcnow)
    last_login = Column(DateTime)


# ─── Schemas ───

class SignupRequest(BaseModel):
    email: str
    password: str
    name: str
    company: Optional[str] = None
    role: Optional[str] = "member"

class LoginResponse(BaseModel):
    token: str
    user: dict

class ConnectAccountRequest(BaseModel):
    platform: str  # youtube, instagram, tiktok, spotify, melon
    account_id: str
    account_name: Optional[str] = None
    access_token: Optional[str] = None


# ─── Helpers ───

def create_token(user_id: int, email: str) -> str:
    expire = datetime.utcnow() + timedelta(hours=TOKEN_EXPIRE_HOURS)
    return jwt.encode({"sub": str(user_id), "email": email, "exp": expire}, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> Optional[User]:
    if not token:
        return None
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = int(payload.get("sub", 0))
        return db.query(User).get(user_id)
    except JWTError:
        return None


def require_auth(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    user = get_current_user(token, db)
    if not user:
        raise HTTPException(status_code=401, detail="로그인이 필요해요")
    return user


# ─── Endpoints ───

@router.post("/signup")
def signup(data: SignupRequest, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == data.email).first()
    if existing:
        raise HTTPException(400, "이미 가입된 이메일이에요")

    user = User(
        email=data.email,
        name=data.name,
        password_hash=_hash_pw(data.password),
        company=data.company,
        role=data.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_token(user.id, user.email)
    return {"token": token, "user": _serialize_user(user)}


@router.post("/login")
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == form.username).first()
    if not user or not _verify_pw(form.password, user.password_hash):
        raise HTTPException(401, "이메일 또는 비밀번호가 맞지 않아요")

    user.last_login = datetime.utcnow()
    db.commit()

    token = create_token(user.id, user.email)
    return {"access_token": token, "token_type": "bearer", "user": _serialize_user(user)}


@router.get("/me")
def get_me(user: User = Depends(require_auth)):
    return _serialize_user(user)


@router.put("/me")
def update_me(data: dict, user: User = Depends(require_auth), db: Session = Depends(get_db)):
    for k in ["name", "company", "avatar_url"]:
        if k in data:
            setattr(user, k, data[k])
    db.commit()
    db.refresh(user)
    return _serialize_user(user)


# ─── 소셜 계정 연결 ───

@router.post("/connect")
def connect_account(data: ConnectAccountRequest, user: User = Depends(require_auth), db: Session = Depends(get_db)):
    """소셜/마케팅 계정 연결."""
    accounts = user.connected_accounts or {}
    accounts[data.platform] = {
        "account_id": data.account_id,
        "name": data.account_name,
        "connected_at": datetime.utcnow().isoformat(),
    }
    if data.access_token:
        accounts[data.platform]["has_token"] = True

    user.connected_accounts = accounts
    db.commit()
    db.refresh(user)
    return {"connected": data.platform, "accounts": _safe_accounts(user.connected_accounts)}


@router.delete("/connect/{platform}")
def disconnect_account(platform: str, user: User = Depends(require_auth), db: Session = Depends(get_db)):
    """계정 연결 해제."""
    accounts = user.connected_accounts or {}
    if platform in accounts:
        del accounts[platform]
    user.connected_accounts = accounts
    db.commit()
    return {"disconnected": platform}


@router.get("/connections")
def list_connections(user: User = Depends(require_auth)):
    """연결된 계정 목록."""
    accounts = user.connected_accounts or {}

    platforms = [
        {"key": "youtube", "name": "YouTube", "icon": "YT", "color": "#ff0000",
         "desc": "채널 연결 후 영상 조회수, 구독자 변화를 추적해요"},
        {"key": "spotify", "name": "Spotify for Artists", "icon": "SP", "color": "#1db954",
         "desc": "스트리밍 수, 월간 리스너, 플레이리스트 추가를 확인해요"},
        {"key": "instagram", "name": "Instagram", "icon": "IG", "color": "#e1306c",
         "desc": "팔로워, 게시물 도달, 스토리 조회수를 추적해요"},
        {"key": "tiktok", "name": "TikTok", "icon": "TT", "color": "#000000",
         "desc": "팔로워, 영상 조회수, 사운드 사용 수를 확인해요"},
        {"key": "melon", "name": "멜론", "icon": "ML", "color": "#00cd3c",
         "desc": "멜론 차트 순위, 좋아요 수를 추적해요"},
        {"key": "twitter", "name": "X (Twitter)", "icon": "X", "color": "#000000",
         "desc": "팔로워, 게시물 반응, 트렌드를 확인해요"},
    ]

    result = []
    for p in platforms:
        connected = p["key"] in accounts
        result.append({
            **p,
            "connected": connected,
            "account": accounts.get(p["key"], {}) if connected else None,
        })

    return {"platforms": result}


def _serialize_user(u: User) -> dict:
    return {
        "id": u.id, "email": u.email, "name": u.name,
        "role": u.role, "company": u.company,
        "avatar_url": u.avatar_url, "is_active": u.is_active,
        "connected_accounts": _safe_accounts(u.connected_accounts),
        "created_at": str(u.created_at),
        "last_login": str(u.last_login) if u.last_login else None,
    }


def _safe_accounts(accounts: dict | None) -> dict:
    """토큰 정보 제거한 안전한 계정 정보."""
    if not accounts:
        return {}
    safe = {}
    for k, v in accounts.items():
        safe[k] = {kk: vv for kk, vv in v.items() if kk != "access_token"}
    return safe

"""저작권 · 정산 · 계약 관리 모델.

곡별 저작권 분배(스플릿 시트), 로열티 계산, 계약 관리.
"""

from datetime import datetime, date
from sqlalchemy import Column, Integer, String, Float, Boolean, Text, DateTime, Date, ForeignKey, JSON
from core.db.models import Base


class SplitSheet(Base):
    """곡별 저작권 분배 (스플릿 시트)."""
    __tablename__ = "split_sheets"

    id = Column(Integer, primary_key=True)
    track_id = Column(Integer, ForeignKey("tracks.id"), nullable=True)
    track_title = Column(String(300), nullable=False)
    status = Column(String(30), default="draft")  # draft, agreed, signed, disputed

    # 전체 메타
    isrc = Column(String(50))
    iswc = Column(String(50))
    total_shares = Column(Float, default=100.0)  # 총 지분 (보통 100%)
    notes = Column(Text)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class SplitEntry(Base):
    """스플릿 시트의 개별 지분 항목."""
    __tablename__ = "split_entries"

    id = Column(Integer, primary_key=True)
    split_sheet_id = Column(Integer, ForeignKey("split_sheets.id"), nullable=False)

    # 권리자 정보
    name = Column(String(200), nullable=False)
    role = Column(String(100))  # composer, lyricist, arranger, producer, performer, publisher
    publisher = Column(String(200))  # 퍼블리셔
    ipi = Column(String(50))  # IPI 번호
    pro = Column(String(100))  # PRO (KOMCA, ASCAP, BMI 등)

    # 지분
    share_pct = Column(Float, nullable=False)  # 지분 비율 (%)
    share_type = Column(String(50), default="publishing")  # publishing, master, both

    # 연락처
    email = Column(String(200))
    notes = Column(Text)


class Contract(Base):
    """계약 관리."""
    __tablename__ = "contracts"

    id = Column(Integer, primary_key=True)
    artist_id = Column(Integer, ForeignKey("artists.id"), nullable=True)
    title = Column(String(300), nullable=False)
    contract_type = Column(String(50))  # recording, publishing, management, distribution, sync, feature
    status = Column(String(30), default="draft")  # draft, negotiating, active, expired, terminated

    # 당사자
    party_a = Column(String(200))  # 우리 회사
    party_b = Column(String(200))  # 상대방

    # 기간
    start_date = Column(Date)
    end_date = Column(Date)
    auto_renewal = Column(Boolean, default=False)
    renewal_terms = Column(Text)

    # 재무
    advance = Column(Float)
    royalty_rate = Column(Float)  # %
    recoup_status = Column(String(30))  # not_started, recouping, recouped
    currency = Column(String(10), default="KRW")

    # 영역
    territory = Column(JSON, default=list)  # ["KR", "US", "JP", ...]
    rights_granted = Column(JSON, default=list)  # ["mechanical", "performance", "sync", ...]

    # 파일
    document_url = Column(String(500))
    notes = Column(Text)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class RoyaltyStatement(Base):
    """정산서."""
    __tablename__ = "royalty_statements"

    id = Column(Integer, primary_key=True)
    contract_id = Column(Integer, ForeignKey("contracts.id"), nullable=True)
    period_start = Column(Date, nullable=False)
    period_end = Column(Date, nullable=False)
    status = Column(String(30), default="draft")  # draft, calculated, approved, paid

    # 수익
    gross_revenue = Column(Float, default=0)
    deductions = Column(Float, default=0)  # 공제
    net_revenue = Column(Float, default=0)
    royalty_amount = Column(Float, default=0)  # 지급액
    currency = Column(String(10), default="KRW")

    # 상세
    breakdown = Column(JSON)  # {"streaming": 5000000, "sync": 2000000, ...}
    notes = Column(Text)

    created_at = Column(DateTime, default=datetime.utcnow)

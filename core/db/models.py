"""Music Brain — Full Entertainment SaaS Database Models.

Covers the entire entertainment workflow:
  Artists → Projects → Tracks → Releases → Campaigns → Analytics

SQLAlchemy ORM with SQLite (can migrate to PostgreSQL for production).
"""

from datetime import datetime, date
from sqlalchemy import (
    Column, Integer, String, Float, Boolean, Text, DateTime, Date,
    ForeignKey, JSON, Enum, Table, create_engine,
)
from sqlalchemy.orm import relationship, declarative_base, Session

Base = declarative_base()


# ─── Many-to-Many: Artists ↔ Projects ───
artist_project = Table(
    "artist_project", Base.metadata,
    Column("artist_id", Integer, ForeignKey("artists.id")),
    Column("project_id", Integer, ForeignKey("projects.id")),
)

# ─── Many-to-Many: Tracks ↔ Projects ───
track_project = Table(
    "track_project", Base.metadata,
    Column("track_id", Integer, ForeignKey("tracks.id")),
    Column("project_id", Integer, ForeignKey("projects.id")),
)


class Artist(Base):
    """아티스트/그룹 프로파일."""
    __tablename__ = "artists"

    id = Column(Integer, primary_key=True)
    name = Column(String(200), nullable=False)
    stage_name = Column(String(200))
    artist_type = Column(String(50))  # solo, group, band, producer
    genre = Column(String(100))
    sub_genre = Column(String(100))
    country = Column(String(10))
    market = Column(String(20))  # kr, us, jp, br, latam, sea, etc.
    bio = Column(Text)
    photo_url = Column(String(500))

    # External IDs
    spotify_id = Column(String(100))
    youtube_id = Column(String(100))
    instagram_handle = Column(String(100))
    tiktok_handle = Column(String(100))

    # Status
    status = Column(String(30), default="active")  # active, developing, inactive, graduated
    signed_date = Column(Date)
    contract_end = Column(Date)
    label = Column(String(200))

    # Metadata
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    notes = Column(Text)
    tags = Column(JSON, default=list)

    # Relations
    projects = relationship("Project", secondary=artist_project, back_populates="artists")
    tracks = relationship("Track", back_populates="artist")
    metrics = relationship("ArtistMetric", back_populates="artist")
    scouting_notes = relationship("ScoutingNote", back_populates="artist")


class Project(Base):
    """프로젝트 (앨범, 싱글, EP 등의 릴리즈 단위)."""
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True)
    title = Column(String(300), nullable=False)
    project_type = Column(String(50))  # single, ep, album, compilation, ost
    status = Column(String(30), default="planning")
    # planning → pre_production → recording → mixing → mastering →
    # quality_check → distribution → promotion → released → tracking

    target_market = Column(String(20))  # primary target market
    target_markets = Column(JSON, default=list)  # all target markets
    concept = Column(Text)
    budget = Column(Float)
    budget_currency = Column(String(10), default="USD")

    # Timeline
    start_date = Column(Date)
    target_release_date = Column(Date)
    actual_release_date = Column(Date)

    # Distribution
    distributor = Column(String(200))
    label = Column(String(200))
    isrc = Column(String(50))
    upc = Column(String(50))

    # Metadata
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    notes = Column(Text)
    tags = Column(JSON, default=list)

    # Relations
    artists = relationship("Artist", secondary=artist_project, back_populates="projects")
    tracks = relationship("Track", secondary=track_project, back_populates="projects")
    tasks = relationship("Task", back_populates="project")
    campaigns = relationship("Campaign", back_populates="project")
    releases = relationship("Release", back_populates="project")


class Track(Base):
    """개별 트랙 (곡)."""
    __tablename__ = "tracks"

    id = Column(Integer, primary_key=True)
    title = Column(String(300), nullable=False)
    artist_id = Column(Integer, ForeignKey("artists.id"))
    duration_sec = Column(Float)
    genre = Column(String(100))
    sub_genre = Column(String(100))
    language = Column(String(50))
    bpm = Column(Float)
    key = Column(String(10))
    mood = Column(String(50))

    # File
    file_path = Column(String(500))
    file_url = Column(String(500))

    # Analysis (from our AI engine)
    analysis_json = Column(JSON)  # deep_analyze() result
    market_scores = Column(JSON)  # {kr: 78, us: 45, ...}
    benchmark_json = Column(JSON)  # benchmark result
    viral_json = Column(JSON)  # viral segment result
    gemini_json = Column(JSON)  # structured Gemini result

    # Status in pipeline
    status = Column(String(30), default="demo")
    # demo → selected → recording → mixing → mastering → ready → released

    # External
    spotify_id = Column(String(100))
    isrc = Column(String(50))

    # Metadata
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    notes = Column(Text)
    tags = Column(JSON, default=list)

    # Relations
    artist = relationship("Artist", back_populates="tracks")
    projects = relationship("Project", secondary=track_project, back_populates="tracks")


class Release(Base):
    """릴리즈 (실제 발매 단위)."""
    __tablename__ = "releases"

    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.id"))
    title = Column(String(300), nullable=False)
    release_type = Column(String(50))  # single, ep, album
    release_date = Column(Date)
    status = Column(String(30), default="planned")
    # planned → submitted → live → tracking

    # Distribution
    platforms = Column(JSON, default=list)  # ["spotify", "apple", "melon", ...]
    distributor = Column(String(200))
    territory = Column(JSON, default=list)  # ["KR", "US", "JP", ...]

    # Tracking
    first_week_streams = Column(Integer)
    total_streams = Column(Integer)
    chart_peak = Column(JSON)  # {"melon": 5, "spotify_kr": 12, ...}

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relations
    project = relationship("Project", back_populates="releases")
    metrics = relationship("ReleaseMetric", back_populates="release")


class Task(Base):
    """프로젝트 내 태스크 (릴리즈 파이프라인의 각 단계)."""
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.id"))
    title = Column(String(300), nullable=False)
    description = Column(Text)
    category = Column(String(50))
    # a_and_r, recording, mixing, mastering, artwork, mv_production,
    # marketing, playlist_pitching, pr, social_media, distribution, legal

    status = Column(String(30), default="todo")  # todo, in_progress, review, done
    priority = Column(String(20), default="medium")  # low, medium, high, urgent
    assignee = Column(String(200))
    due_date = Column(Date)
    completed_date = Column(Date)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    project = relationship("Project", back_populates="tasks")


class Campaign(Base):
    """마케팅 캠페인."""
    __tablename__ = "campaigns"

    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.id"))
    name = Column(String(300), nullable=False)
    campaign_type = Column(String(50))
    # pre_release, release_day, post_release, always_on, playlist_push,
    # influencer, paid_ads, pr, challenge, concert

    status = Column(String(30), default="planned")
    # planned → active → paused → completed → analyzed

    platform = Column(String(50))  # tiktok, instagram, youtube, spotify, melon, etc.
    target_market = Column(String(20))
    start_date = Column(Date)
    end_date = Column(Date)

    # Budget & ROI
    budget = Column(Float)
    budget_currency = Column(String(10), default="USD")
    spent = Column(Float, default=0)
    target_kpi = Column(JSON)  # {"streams": 50000, "playlist_adds": 10, ...}
    actual_kpi = Column(JSON)  # {"streams": 42000, "playlist_adds": 8, ...}
    roi = Column(Float)

    # Content
    content_brief = Column(Text)
    influencers = Column(JSON, default=list)
    hashtags = Column(JSON, default=list)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    notes = Column(Text)

    project = relationship("Project", back_populates="campaigns")


class ArtistMetric(Base):
    """아티스트 메트릭 히스토리 (일별/주별 추적)."""
    __tablename__ = "artist_metrics"

    id = Column(Integer, primary_key=True)
    artist_id = Column(Integer, ForeignKey("artists.id"))
    date = Column(Date, nullable=False)

    # Streaming
    spotify_monthly_listeners = Column(Integer)
    spotify_followers = Column(Integer)
    youtube_subscribers = Column(Integer)
    melon_followers = Column(Integer)

    # Social
    instagram_followers = Column(Integer)
    tiktok_followers = Column(Integer)
    twitter_followers = Column(Integer)

    # Engagement
    instagram_engagement_rate = Column(Float)
    tiktok_avg_views = Column(Integer)

    # Raw data
    raw_json = Column(JSON)

    artist = relationship("Artist", back_populates="metrics")


class ReleaseMetric(Base):
    """릴리즈 메트릭 히스토리 (일별 스트리밍/차트 추적)."""
    __tablename__ = "release_metrics"

    id = Column(Integer, primary_key=True)
    release_id = Column(Integer, ForeignKey("releases.id"))
    date = Column(Date, nullable=False)

    # Streaming
    spotify_streams = Column(Integer)
    apple_streams = Column(Integer)
    youtube_views = Column(Integer)
    melon_streams = Column(Integer)

    # Charts
    spotify_chart_position = Column(Integer)
    melon_chart_position = Column(Integer)
    billboard_position = Column(Integer)
    oricon_position = Column(Integer)

    # Playlists
    playlist_adds = Column(Integer)
    playlist_reach = Column(Integer)

    # Social
    tiktok_creates = Column(Integer)
    shazam_count = Column(Integer)

    raw_json = Column(JSON)

    release = relationship("Release", back_populates="metrics")


class ScoutingNote(Base):
    """A&R 스카우팅 노트 (아티스트 발굴/평가)."""
    __tablename__ = "scouting_notes"

    id = Column(Integer, primary_key=True)
    artist_id = Column(Integer, ForeignKey("artists.id"), nullable=True)

    # Discovery
    artist_name = Column(String(200))
    source = Column(String(100))  # tiktok, youtube, instagram, soundcloud, live, referral
    source_url = Column(String(500))
    discovered_by = Column(String(200))
    discovered_date = Column(Date, default=date.today)

    # Evaluation
    score = Column(Integer)  # 1-10
    vocal_score = Column(Integer)
    performance_score = Column(Integer)
    visual_score = Column(Integer)
    marketability_score = Column(Integer)
    uniqueness_score = Column(Integer)

    # Status
    status = Column(String(30), default="discovered")
    # discovered → contacted → auditioned → negotiating → signed → passed

    # Analysis
    strengths = Column(Text)
    weaknesses = Column(Text)
    market_fit = Column(JSON)  # {kr: 8, us: 5, ...}
    comparable_artists = Column(JSON, default=list)
    recommended_market = Column(String(20))

    notes = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    artist = relationship("Artist", back_populates="scouting_notes")


class TrendSnapshot(Base):
    """시장별 트렌드 스냅샷 (주간/일간)."""
    __tablename__ = "trend_snapshots"

    id = Column(Integer, primary_key=True)
    market = Column(String(20), nullable=False)
    date = Column(Date, nullable=False)

    # Top tracks this period
    top_tracks = Column(JSON, default=list)  # [{title, artist, rank, streams}, ...]
    rising_tracks = Column(JSON, default=list)

    # Genre trends
    genre_distribution = Column(JSON)  # {kpop: 35%, hiphop: 25%, ...}
    trending_genres = Column(JSON, default=list)

    # Audio feature trends
    avg_danceability = Column(Float)
    avg_energy = Column(Float)
    avg_valence = Column(Float)
    avg_tempo = Column(Float)
    avg_speechiness = Column(Float)
    avg_acousticness = Column(Float)

    # Platform trends
    tiktok_trending = Column(JSON, default=list)
    viral_sounds = Column(JSON, default=list)

    raw_json = Column(JSON)
    created_at = Column(DateTime, default=datetime.utcnow)


class TeamMember(Base):
    """팀 멤버 (협업용)."""
    __tablename__ = "team_members"

    id = Column(Integer, primary_key=True)
    name = Column(String(200), nullable=False)
    email = Column(String(200))
    role = Column(String(100))  # producer, a_and_r, marketing, manager, executive
    department = Column(String(100))
    avatar_url = Column(String(500))
    status = Column(String(30), default="active")
    created_at = Column(DateTime, default=datetime.utcnow)

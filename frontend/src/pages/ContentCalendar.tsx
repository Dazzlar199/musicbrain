import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Calendar, Info, X, Activity, Check } from "lucide-react";
import { Nav } from "./Artists";
import { useArtist } from "../context";

interface CalendarItem {
  d_day: string;
  date: string;
  platform: string;
  content_type: string;
  description: string;
  hashtags: string[];
  timing: string;
  priority: "high" | "medium" | "low";
}

interface CalendarResult {
  artist_name: string;
  track_title: string;
  release_date: string;
  calendar: CalendarItem[];
  summary?: string;
  total_posts?: number;
  phase_summary?: { pre_release?: string; release_day?: string; post_release?: string };
}

const MARKETS = [
  { key: "kr", label: "한국" },
  { key: "us", label: "미국" },
  { key: "jp", label: "일본" },
  { key: "global", label: "글로벌" },
];

const PLATFORMS = [
  { key: "tiktok", label: "TikTok", color: "#000000" },
  { key: "instagram", label: "Instagram", color: "#e1306c" },
  { key: "youtube", label: "YouTube", color: "#ff0000" },
  { key: "x", label: "X", color: "#1da1f2" },
];

const TEMPLATES = [
  { key: "single", label: "싱글 발매", desc: "싱글 트랙 발매를 위한 2주 사전 홍보 + 발매 후 1개월 플랜", icon: "💿" },
  { key: "album", label: "앨범 발매", desc: "앨범 발매 4주 전부터의 종합 마케팅 캘린더", icon: "📀" },
  { key: "comeback", label: "컴백", desc: "컴백 티저부터 활동 기간까지의 전략적 콘텐츠 플랜", icon: "🔥" },
  { key: "collab", label: "콜라보", desc: "피처링/콜라보 발매에 맞춘 크로스 프로모션 캘린더", icon: "🤝" },
];

function platformColor(platform: string): string {
  const p = PLATFORMS.find(pl => pl.key === platform.toLowerCase());
  return p ? p.color : "var(--text-disabled)";
}

function priorityBorder(priority: string): string {
  if (priority === "high") return "#ef4444";
  if (priority === "medium") return "#3182f6";
  return "#94a3b8";
}

function InfoBubble({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1000 }}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420, padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>{title}</h3>
          <button onClick={onClose} style={{ border: "none", background: "none", cursor: "pointer", color: "var(--text-disabled)" }}><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function InfoButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      width: 20, height: 20, borderRadius: "50%",
      border: "1.5px solid var(--text-disabled)", background: "none",
      display: "inline-grid", placeItems: "center", cursor: "pointer",
      color: "var(--text-disabled)", fontSize: 11, fontWeight: 700,
      verticalAlign: "middle", marginLeft: 6,
    }} title="설명 보기">
      <Info size={12} />
    </button>
  );
}

export default function ContentCalendar() {
  const nav = useNavigate();
  const { current } = useArtist();

  const [artistName, setArtistName] = useState("");
  const [trackTitle, setTrackTitle] = useState("");
  const [releaseDate, setReleaseDate] = useState("");
  const [selectedMarkets, setSelectedMarkets] = useState<string[]>(["kr"]);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(["tiktok", "instagram"]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<CalendarResult | null>(null);
  const [showInfo, setShowInfo] = useState(false);

  useEffect(() => {
    if (current) {
      setArtistName(current.stage_name || current.name);
    }
  }, [current?.id]);

  const toggleMarket = (key: string) => {
    setSelectedMarkets(prev =>
      prev.includes(key) ? prev.filter(m => m !== key) : [...prev, key]
    );
  };

  const togglePlatform = (key: string) => {
    setSelectedPlatforms(prev =>
      prev.includes(key) ? prev.filter(p => p !== key) : [...prev, key]
    );
  };

  const handleGenerate = async () => {
    if (!artistName.trim() || !trackTitle.trim() || !releaseDate) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const r = await fetch("/api/content-calendar/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          artist_name: artistName.trim(),
          track_title: trackTitle.trim(),
          release_date: releaseDate,
          market: selectedMarkets[0] || "kr",
          platforms: selectedPlatforms,
        }),
      });
      if (!r.ok) throw new Error(`서버 오류 (${r.status})`);
      const d = await r.json();
      setResult(d);
    } catch (e: any) {
      setError(e.message || "캘린더 생성에 실패했습니다");
    }
    setLoading(false);
  };

  const handleTemplate = async (templateKey: string) => {
    if (!artistName.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const r = await fetch("/api/content-calendar/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          artist_name: artistName.trim(),
          track_title: trackTitle.trim() || `${templateKey} 릴리스`,
          release_date: releaseDate || new Date(Date.now() + 14 * 86400000).toISOString().split("T")[0],
          market: selectedMarkets[0] || "kr",
          platforms: selectedPlatforms,
        }),
      });
      if (!r.ok) throw new Error(`서버 오류 (${r.status})`);
      const d = await r.json();
      setResult(d);
    } catch (e: any) {
      setError(e.message || "캘린더 생성에 실패했습니다");
    }
    setLoading(false);
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "8px 12px",
    border: "1px solid var(--border)", borderRadius: 8, fontSize: 13,
  };

  const renderPhase = (title: string, items: CalendarItem[]) => {
    if (!items || items.length === 0) return null;
    return (
      <section className="subpanel" style={{ padding: 20 }}>
        <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, color: "var(--text-primary)" }}>{title}</p>
        <div style={{ display: "grid", gap: 10 }}>
          {items.map((item, i) => (
            <div key={i} style={{
              display: "flex", gap: 12, padding: "12px 14px",
              borderLeft: `3px solid ${priorityBorder(item.priority)}`,
              borderRadius: "0 10px 10px 0",
              background: "var(--surface)",
              border: "1px solid var(--border-light)",
              borderLeftWidth: 3,
              borderLeftColor: priorityBorder(item.priority),
              borderLeftStyle: "solid",
            }}>
              {/* D-day label */}
              <div style={{
                minWidth: 48, textAlign: "center", paddingTop: 2,
              }}>
                <span style={{
                  fontSize: 13, fontWeight: 700,
                  color: item.d_day === "D-Day" ? "#ef4444" : "var(--text-secondary)",
                }}>{item.d_day}</span>
                {item.date && (
                  <p style={{ fontSize: 10, color: "var(--text-disabled)", margin: "2px 0 0" }}>
                    {item.date.slice(5)}
                  </p>
                )}
              </div>

              {/* Content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                  {/* Platform badge */}
                  <span style={{
                    fontSize: 10, fontWeight: 600, padding: "2px 8px",
                    borderRadius: 4, color: "#fff",
                    background: platformColor(item.platform),
                  }}>{item.platform}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                    {item.content_type}
                  </span>
                  {item.timing && (
                    <span style={{ fontSize: 11, color: "var(--text-disabled)", marginLeft: "auto" }}>
                      {item.timing}
                    </span>
                  )}
                </div>
                <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6, margin: "4px 0 0" }}>
                  {item.description}
                </p>
                {item.hashtags && item.hashtags.length > 0 && (
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 8 }}>
                    {item.hashtags.map((h, hi) => (
                      <span key={hi} style={{
                        fontSize: 10, padding: "2px 6px", borderRadius: 4,
                        background: "var(--blue-light)", color: "var(--blue)",
                        fontWeight: 500,
                      }}>{h.startsWith("#") ? h : `#${h}`}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  };

  return (
    <div className="page-shell">
      <Nav nav={nav} active="calendar" />
      <div className="page-content">
        <div className="page-header">
          <div>
            <h1>
              컨텐츠 캘린더
              <InfoButton onClick={() => setShowInfo(true)} />
            </h1>
            <p className="text-muted">발매 전후 SNS 콘텐츠 일정 자동 생성</p>
          </div>
        </div>

        {/* Input form */}
        <section className="subpanel" style={{ padding: 20, marginBottom: 24 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
            <div>
              <label style={{ fontSize: 12, color: "var(--text-disabled)", display: "block", marginBottom: 4 }}>아티스트</label>
              <input
                value={artistName} onChange={e => setArtistName(e.target.value)}
                placeholder="아티스트 이름"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, color: "var(--text-disabled)", display: "block", marginBottom: 4 }}>트랙 제목</label>
              <input
                value={trackTitle} onChange={e => setTrackTitle(e.target.value)}
                placeholder="곡 제목 입력"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, color: "var(--text-disabled)", display: "block", marginBottom: 4 }}>발매일</label>
              <input
                type="date" value={releaseDate} onChange={e => setReleaseDate(e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>

          {/* Markets */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, color: "var(--text-disabled)", display: "block", marginBottom: 6 }}>타겟 시장</label>
            <div style={{ display: "flex", gap: 6 }}>
              {MARKETS.map(m => (
                <button key={m.key}
                  className={`chip${selectedMarkets.includes(m.key) ? " chip-active" : ""}`}
                  onClick={() => toggleMarket(m.key)}
                >{m.label}</button>
              ))}
            </div>
          </div>

          {/* Platforms */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, color: "var(--text-disabled)", display: "block", marginBottom: 6 }}>플랫폼</label>
            <div style={{ display: "flex", gap: 12 }}>
              {PLATFORMS.map(p => (
                <label key={p.key} style={{
                  display: "flex", alignItems: "center", gap: 6,
                  cursor: "pointer", fontSize: 13,
                }}>
                  <input
                    type="checkbox"
                    checked={selectedPlatforms.includes(p.key)}
                    onChange={() => togglePlatform(p.key)}
                    style={{ accentColor: p.color }}
                  />
                  <span style={{
                    fontSize: 10, fontWeight: 600, padding: "2px 8px",
                    borderRadius: 4, color: "#fff", background: p.color,
                  }}>{p.label}</span>
                </label>
              ))}
            </div>
          </div>

          <button
            className="btn btn-primary"
            onClick={handleGenerate}
            disabled={loading || !artistName.trim() || !trackTitle.trim() || !releaseDate}
            style={{ width: "100%" }}
          >
            {loading ? (
              <span style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
                <Activity size={16} style={{ animation: "pulse 1.5s infinite" }} />
                캘린더 생성 중...
              </span>
            ) : (
              <span style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
                <Calendar size={16} />
                캘린더 생성
              </span>
            )}
          </button>
        </section>

        {/* Error */}
        {error && (
          <div style={{
            padding: "12px 16px", marginBottom: 16, borderRadius: 10,
            background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)",
            color: "#ef4444", fontSize: 13,
          }}>
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div style={{ textAlign: "center", padding: 60, color: "var(--text-disabled)" }}>
            <Activity size={32} style={{ animation: "pulse 1.5s infinite" }} />
            <p style={{ marginTop: 12 }}>AI가 콘텐츠 캘린더를 생성하고 있어요...</p>
            <p style={{ fontSize: 12 }}>발매 전후 최적의 SNS 전략을 설계합니다</p>
          </div>
        )}

        {/* Results */}
        {result && !loading && (
          <div className="stack">
            {/* Summary header */}
            <div className="subpanel" style={{ padding: 16, display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{
                width: 48, height: 48, borderRadius: 12,
                background: "var(--blue-light)", display: "grid", placeItems: "center",
              }}>
                <Calendar size={24} style={{ color: "var(--blue)" }} />
              </div>
              <div>
                <strong style={{ fontSize: 16 }}>{result.artist_name} - {result.track_title}</strong>
                <p style={{ fontSize: 12, color: "var(--text-disabled)", margin: "2px 0 0" }}>
                  발매일: {result.release_date} | 총 {result.calendar?.length || 0}개 콘텐츠
                </p>
                {result.summary && <p style={{ fontSize: 12, color: "var(--text-tertiary)", margin: "4px 0 0" }}>{result.summary}</p>}
              </div>
              <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                {[
                  { label: "높음", color: "#ef4444" },
                  { label: "보통", color: "#3182f6" },
                  { label: "낮음", color: "#94a3b8" },
                ].map(p => (
                  <span key={p.label} style={{
                    fontSize: 10, display: "flex", alignItems: "center", gap: 4,
                    color: "var(--text-disabled)",
                  }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: p.color, display: "inline-block" }} />
                    {p.label}
                  </span>
                ))}
              </div>
            </div>

            {renderPhase("사전 홍보 (D-14 ~ D-1)", (result.calendar || []).filter(c => c.d_day.startsWith("D-")))}
            {renderPhase("발매일 (D-Day)", (result.calendar || []).filter(c => c.d_day === "D-Day"))}
            {renderPhase("사후 관리 (D+1 ~ D+30)", (result.calendar || []).filter(c => c.d_day.startsWith("D+")))}
          </div>
        )}

        {/* Empty state */}
        {!result && !loading && !error && (
          <>
            <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text-disabled)" }}>
              <Calendar size={40} />
              <p style={{ marginTop: 16, fontSize: 15 }}>릴리스 정보를 입력하면 SNS 콘텐츠 캘린더를 생성합니다</p>
              <p style={{ fontSize: 13 }}>또는 아래 템플릿을 선택해 빠르게 시작하세요</p>
            </div>

            {/* Templates */}
            <section style={{ marginTop: 8 }}>
              <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: "var(--text-primary)" }}>빠른 시작 템플릿</p>
              <div className="card-grid-2">
                {TEMPLATES.map(t => (
                  <button key={t.key}
                    onClick={() => handleTemplate(t.key)}
                    disabled={loading || !artistName.trim()}
                    style={{
                      display: "flex", alignItems: "flex-start", gap: 14,
                      padding: 16, border: "1px solid var(--border-light)", borderRadius: 12,
                      background: "var(--surface)", cursor: artistName.trim() ? "pointer" : "not-allowed",
                      textAlign: "left", width: "100%",
                      opacity: artistName.trim() ? 1 : 0.5,
                      transition: "border-color 0.15s",
                    }}
                    onMouseEnter={e => { if (artistName.trim()) e.currentTarget.style.borderColor = "var(--blue)"; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border-light)"; }}
                  >
                    <span style={{ fontSize: 28 }}>{t.icon}</span>
                    <div>
                      <strong style={{ fontSize: 14, display: "block", marginBottom: 4 }}>{t.label}</strong>
                      <span style={{ fontSize: 12, color: "var(--text-tertiary)", lineHeight: 1.5 }}>{t.desc}</span>
                    </div>
                  </button>
                ))}
              </div>
              {!artistName.trim() && (
                <p style={{ fontSize: 12, color: "var(--text-disabled)", marginTop: 8, textAlign: "center" }}>
                  아티스트 이름을 먼저 입력해주세요
                </p>
              )}
            </section>
          </>
        )}

        {/* Info modal */}
        {showInfo && (
          <InfoBubble title="컨텐츠 캘린더란?" onClose={() => setShowInfo(false)}>
            <p style={{ fontSize: 13, lineHeight: 1.8, color: "var(--text-secondary)", margin: "0 0 12px" }}>
              음원 발매 전후에 SNS에 올릴 콘텐츠 일정을 <strong>AI가 자동으로 생성</strong>합니다.
              발매 2주 전부터 사후 1개월까지, 플랫폼별 최적 타이밍과 콘텐츠 유형을 제안합니다.
            </p>
            <p style={{ fontSize: 13, lineHeight: 1.8, color: "var(--text-secondary)", margin: "0 0 12px" }}>
              <strong>3단계 전략:</strong>
            </p>
            <div style={{ display: "grid", gap: 8 }}>
              {[
                { phase: "사전 홍보", desc: "D-14부터 티저, 비하인드, 카운트다운으로 기대감 형성" },
                { phase: "발매일", desc: "D-Day에 집중적인 콘텐츠 폭탄으로 초동 극대화" },
                { phase: "사후 관리", desc: "챌린지, 리액션, 라이브로 롱런 유도" },
              ].map(p => (
                <div key={p.phase} style={{
                  padding: "8px 12px", borderRadius: 8,
                  background: "var(--bg)", fontSize: 13,
                }}>
                  <strong>{p.phase}:</strong> <span style={{ color: "var(--text-tertiary)" }}>{p.desc}</span>
                </div>
              ))}
            </div>
          </InfoBubble>
        )}
      </div>
    </div>
  );
}

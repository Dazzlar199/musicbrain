import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Search, Users, Music, X, ChevronDown } from "lucide-react";
import { useArtist } from "../context";

interface Artist {
  id: number; name: string; stage_name: string | null;
  artist_type: string; genre: string; market: string;
  status: string; photo_url: string | null; label: string;
  tags: string[]; updated_at: string;
}

const STATUSES = ["active", "developing", "inactive"];
const TYPES = ["solo", "group", "band", "producer"];

export default function Artists() {
  const nav = useNavigate();
  const [artists, setArtists] = useState<Artist[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [filterMarket, setFilterMarket] = useState("");
  const [rosterTab, setRosterTab] = useState<"all" | "signed" | "watching">("all");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", stage_name: "", artist_type: "solo", genre: "", market: "kr", label: "", bio: "", tags: ["signed"] as string[] });

  const load = async () => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (filterMarket) params.set("market", filterMarket);
    if (rosterTab !== "all") params.set("roster", rosterTab);
    const r = await fetch(`/api/artists?${params}`);
    const d = await r.json();
    setArtists(d.items); setTotal(d.total);
  };

  useEffect(() => { load(); }, [search, filterMarket, rosterTab]);

  const handleCreate = async () => {
    await fetch("/api/artists", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setShowForm(false); setForm({ name: "", stage_name: "", artist_type: "solo", genre: "", market: "kr", label: "", bio: "", tags: ["signed"] }); load();
  };

  return (
    <div className="page-shell">
      <Nav nav={nav} active="artists" />
      <div className="page-content">
        <div className="page-header">
          <div>
            <h1>아티스트 관리</h1>
            <p className="text-muted">소속 · 관심 아티스트 프로파일과 뉴스</p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-primary" onClick={() => { setForm({...form, tags: ["signed"]}); setShowForm(true); }}><Plus size={16} /> 소속 등록</button>
            <button className="btn btn-outline" onClick={() => { setForm({...form, tags: ["watching"]}); setShowForm(true); }}><Plus size={16} /> 관심 등록</button>
          </div>
        </div>

        {/* Roster Tabs */}
        <div className="tabs" style={{ marginBottom: 16 }}>
          <button className={`tab-button${rosterTab === "all" ? " is-active" : ""}`} onClick={() => setRosterTab("all")}>전체</button>
          <button className={`tab-button${rosterTab === "signed" ? " is-active" : ""}`} onClick={() => setRosterTab("signed")}>소속 아티스트</button>
          <button className={`tab-button${rosterTab === "watching" ? " is-active" : ""}`} onClick={() => setRosterTab("watching")}>관심 아티스트</button>
        </div>

        {/* Filters */}
        <div className="filter-bar">
          <div className="search-box">
            <Search size={16} />
            <input placeholder="이름으로 검색..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select value={filterMarket} onChange={e => setFilterMarket(e.target.value)}>
            <option value="">전체 시장</option>
            {["kr","us","jp","br","latam","sea","europe","uk","mena","africa","india","china"].map(m =>
              <option key={m} value={m}>{m.toUpperCase()}</option>
            )}
          </select>
          <div className="filter-stat">{total}명</div>
        </div>

        {/* Grid */}
        <div className="card-grid-3">
          {artists.map(a => (
            <div key={a.id} className="artist-card" onClick={() => nav(`/artists/${a.id}`)}>
              <div className="artist-avatar">{a.photo_url ? <img src={a.photo_url} alt="" /> : <Users size={24} />}</div>
              <div className="artist-info">
                <strong>{a.stage_name || a.name}</strong>
                <p>{a.genre || "장르 미지정"} · {a.market?.toUpperCase()}</p>
                <div className="tag-row">
                  {a.tags?.includes("signed") && <span className="status-badge status-active">소속</span>}
                  {a.tags?.includes("watching") && <span className="status-badge status-discovered">관심</span>}
                  {a.label && <span className="label-badge">{a.label}</span>}
                </div>
              </div>
            </div>
          ))}
          {artists.length === 0 && <div className="empty-card"><Users size={32} /><p>등록된 아티스트가 없습니다</p></div>}
        </div>

        {/* Create Modal — 검색 기반 */}
        {showForm && (
          <ArtistAddModal
            tags={form.tags}
            onClose={() => setShowForm(false)}
            onAdded={() => { setShowForm(false); load(); }}
          />
        )}
      </div>
    </div>
  );
}

// Shared nav component
interface AlertItem {
  id: string; type: string; platform: string;
  title: string; message: string; rank?: number;
  prev_rank?: number; timestamp: string; read: boolean;
}

export function Nav({ nav, active }: { nav: ReturnType<typeof useNavigate>; active: string }) {
  const { artists, current, setCurrent } = useArtist();
  const [alertCount, setAlertCount] = useState(0);
  const [showArtistPicker, setShowArtistPicker] = useState(false);
  const [showAlerts, setShowAlerts] = useState(false);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [scanning, setScanning] = useState(false);

  const refreshAlerts = () => {
    fetch("/api/alerts?limit=50").then(r => r.json()).then(d => {
      setAlerts(d.alerts || []);
      setAlertCount(d.unread || 0);
    }).catch(() => {});
  };

  useEffect(() => {
    refreshAlerts();
    const interval = setInterval(refreshAlerts, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleScan = () => {
    setScanning(true);
    fetch("/api/alerts/scan-charts", { method: "POST" })
      .then(() => refreshAlerts())
      .finally(() => setScanning(false));
  };

  const handleMarkAllRead = () => {
    fetch("/api/alerts/mark-all-read", { method: "POST" })
      .then(() => refreshAlerts());
  };

  const groups = [
    { label: "분석", items: [
      { key: "studio", label: "곡 분석", path: "/studio" },
      { key: "trends", label: "차트·트렌드", path: "/trends" },
      { key: "buzz", label: "팬덤 버즈", path: "/buzz" },
      { key: "playlists", label: "플레이리스트", path: "/playlists" },
    ]},
    { label: "운영", items: [
      { key: "artists", label: "아티스트", path: "/artists" },
      { key: "projects", label: "프로젝트", path: "/projects" },
      { key: "calendar", label: "컨텐츠 캘린더", path: "/content-calendar" },
    ]},
    { label: "전략", items: [
      { key: "timing", label: "릴리스 타이밍", path: "/release-timing" },
      { key: "watchlist", label: "경쟁사 워치", path: "/watchlist" },
    ]},
  ];

  return (
    <nav className="side-nav">
      <div className="side-nav-logo" onClick={() => nav("/")}><img src="/logo.png" alt="Music Brain" className="logo-img" /><span>Music Brain</span></div>

      {/* 아티스트 셀렉터 */}
      {current && (
        <div style={{ padding: "0 12px", marginBottom: 8, position: "relative" }}>
          <button className="artist-selector" onClick={() => setShowArtistPicker(!showArtistPicker)}>
            {current.photo_url ? (
              <img src={current.photo_url} alt="" style={{ width: 28, height: 28, borderRadius: 8, objectFit: "cover" }} />
            ) : (
              <div style={{ width: 28, height: 28, borderRadius: 8, background: "var(--blue-light)", display: "grid", placeItems: "center" }}><Users size={14} /></div>
            )}
            <div style={{ flex: 1, textAlign: "left" }}>
              <strong style={{ fontSize: 13, display: "block" }}>{current.stage_name || current.name}</strong>
              <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>{current.genre} · {current.market?.toUpperCase()}</span>
            </div>
            <ChevronDown size={14} style={{ color: "var(--text-disabled)" }} />
          </button>

          {showArtistPicker && (
            <div className="artist-picker-dropdown">
              {artists.map(a => (
                <button key={a.id} className={`artist-picker-item${a.id === current.id ? " active" : ""}`}
                  onClick={() => { setCurrent(a); setShowArtistPicker(false); }}>
                  {a.photo_url ? (
                    <img src={a.photo_url} alt="" style={{ width: 24, height: 24, borderRadius: 6, objectFit: "cover" }} />
                  ) : <Users size={14} />}
                  <span>{a.stage_name || a.name}</span>
                </button>
              ))}
              <button className="artist-picker-item" onClick={() => { nav("/artists"); setShowArtistPicker(false); }}
                style={{ color: "var(--blue)", borderTop: "1px solid var(--border-light)", marginTop: 4, paddingTop: 8 }}>
                <Plus size={14} /> 아티스트 관리
              </button>
            </div>
          )}
        </div>
      )}

      <div className="side-nav-items">
        {groups.map(g => (
          <div key={g.label}>
            <p className="side-nav-group">{g.label}</p>
            {g.items.map(it => (
              <button key={it.key} className={`side-nav-item${active === it.key ? " active" : ""}`} onClick={() => nav(it.path)}>
                <span>{it.label}</span>
              </button>
            ))}
          </div>
        ))}
        {/* 알림 + 설정 */}
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--border-light)" }}>
          <button className="side-nav-item" onClick={() => setShowAlerts(!showAlerts)}>
            <span>알림</span>
            {alertCount > 0 && <span className="alert-badge">{alertCount}</span>}
          </button>
          <button className={`side-nav-item${active === "settings" ? " active" : ""}`} onClick={() => nav("/settings")}>
            <span>설정</span>
          </button>
        </div>
      </div>

      {/* 알림 슬라이드 패널 */}
      {showAlerts && (
        <div className="alert-overlay" onClick={() => setShowAlerts(false)}>
          <div className="alert-panel" onClick={e => e.stopPropagation()}>
            <div className="alert-panel-header">
              <h3>알림</h3>
              <div style={{ display: "flex", gap: 6 }}>
                <button className="btn btn-ghost btn-sm" onClick={handleScan} disabled={scanning}>
                  {scanning ? "스캔 중..." : "차트 스캔"}
                </button>
                {alertCount > 0 && (
                  <button className="btn btn-ghost btn-sm" onClick={handleMarkAllRead}>모두 읽음</button>
                )}
                <button className="btn btn-ghost btn-sm" onClick={() => setShowAlerts(false)}>
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="alert-panel-body">
              {alerts.length === 0 ? (
                <div className="alert-empty">
                  <p>알림이 없습니다</p>
                  <span>"차트 스캔"을 누르면 멜론/벅스 차트 변동을 감지합니다</span>
                </div>
              ) : (
                alerts.map(a => (
                  <div key={a.id} className={`alert-item${a.read ? "" : " alert-unread"}`}
                    onClick={() => {
                      if (!a.read) {
                        fetch(`/api/alerts/mark-read/${a.id}`, { method: "POST" }).then(() => refreshAlerts());
                      }
                    }}>
                    <div className="alert-item-icon">
                      {a.type === "top_change" ? "👑" : a.type === "new_entry" ? "🆕" : a.type === "rising" ? "🔥" : "⚠️"}
                    </div>
                    <div className="alert-item-content">
                      <strong>{a.title}</strong>
                      <p>{a.message}</p>
                      <span className="alert-time">
                        {a.platform} · {new Date(a.timestamp).toLocaleDateString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    {!a.read && <div className="alert-dot" />}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}

function ArtistAddModal({ tags, onClose, onAdded }: { tags: string[]; onClose: () => void; onAdded: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Array<{ name: string; spotify_id: string; image: string | null }>>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [manual, setManual] = useState({ name: "", genre: "", bio: "", instagram: "", tiktok: "", x_handle: "", youtube: "", spotify_url: "" });

  const doSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const r = await fetch(`/api/search/artist?q=${encodeURIComponent(query)}&limit=6`);
      const d = await r.json();
      setResults(d.results || []);
    } catch { }
    setSearching(false);
  };

  const selectAndLoad = async (item: any) => {
    setSelected(item);
    setLoading(true);
    try {
      const r = await fetch(`/api/search/artist/${encodeURIComponent(item.name)}/profile`);
      const profile = await r.json();
      setSelected({ ...item, ...profile });
    } catch { }
    setLoading(false);
  };

  const handleAdd = async () => {
    if (!selected) return;
    setLoading(true);
    await fetch("/api/artists", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: selected.name,
        stage_name: selected.name,
        spotify_id: selected.spotify_id || "",
        photo_url: selected.image || "",
        bio: selected.bio || "",
        genre: selected.genre || "",
        instagram_handle: selected.instagram || "",
        tiktok_handle: selected.tiktok || "",
        x_handle: selected.x_handle || "",
        youtube_id: selected.youtube || "",
        tags: tags,
      }),
    });
    setLoading(false);
    onAdded();
  };

  const handleManualAdd = async () => {
    if (!manual.name.trim()) return;
    setLoading(true);
    await fetch("/api/artists", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: manual.name,
        stage_name: manual.name,
        genre: manual.genre,
        bio: manual.bio,
        instagram_handle: manual.instagram,
        tiktok_handle: manual.tiktok,
        x_handle: manual.x_handle,
        youtube_id: manual.youtube,
        spotify_id: manual.spotify_url.includes("artist/") ? manual.spotify_url.split("artist/")[1]?.split("?")[0] || "" : "",
        tags: tags,
      }),
    });
    setLoading(false);
    onAdded();
  };

  const inputStyle = { width: "100%", padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13 };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{tags.includes("signed") ? "소속 아티스트 등록" : "관심 아티스트 등록"}</h3>
          <button onClick={onClose} style={{ border: "none", background: "none", cursor: "pointer" }}><X size={18} /></button>
        </div>
        <div className="modal-body">
          {manualMode ? (
            /* 직접 등록 모드 */
            <div>
              <div style={{ display: "grid", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, color: "var(--text-disabled)", display: "block", marginBottom: 4 }}>아티스트 이름 *</label>
                  <input value={manual.name} onChange={e => setManual({...manual, name: e.target.value})} placeholder="활동명" style={inputStyle} autoFocus />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: "var(--text-disabled)", display: "block", marginBottom: 4 }}>장르</label>
                  <input value={manual.genre} onChange={e => setManual({...manual, genre: e.target.value})} placeholder="K-pop, Hip-hop, R&B..." style={inputStyle} />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: "var(--text-disabled)", display: "block", marginBottom: 4 }}>소개</label>
                  <textarea value={manual.bio} onChange={e => setManual({...manual, bio: e.target.value})} placeholder="간단한 소개" rows={2} style={{...inputStyle, resize: "vertical"}} />
                </div>
                <p style={{ fontSize: 12, fontWeight: 600, color: "var(--text-tertiary)", margin: "8px 0 0" }}>SNS 연결 (입력하면 자동 데이터 수집)</p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div>
                    <label style={{ fontSize: 11, color: "var(--text-disabled)" }}>X (트위터)</label>
                    <input value={manual.x_handle} onChange={e => setManual({...manual, x_handle: e.target.value})} placeholder="@handle" style={inputStyle} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: "var(--text-disabled)" }}>Instagram</label>
                    <input value={manual.instagram} onChange={e => setManual({...manual, instagram: e.target.value})} placeholder="handle" style={inputStyle} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: "var(--text-disabled)" }}>TikTok</label>
                    <input value={manual.tiktok} onChange={e => setManual({...manual, tiktok: e.target.value})} placeholder="@handle" style={inputStyle} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: "var(--text-disabled)" }}>YouTube</label>
                    <input value={manual.youtube} onChange={e => setManual({...manual, youtube: e.target.value})} placeholder="채널 ID 또는 이름" style={inputStyle} />
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: 11, color: "var(--text-disabled)" }}>Spotify 아티스트 URL</label>
                  <input value={manual.spotify_url} onChange={e => setManual({...manual, spotify_url: e.target.value})} placeholder="https://open.spotify.com/artist/..." style={inputStyle} />
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 20 }}>
                <button className="btn btn-outline" onClick={() => setManualMode(false)}>검색으로 돌아가기</button>
                <button className="btn btn-primary" onClick={handleManualAdd} disabled={loading || !manual.name.trim()}>
                  {loading ? "등록 중..." : "등록"}
                </button>
              </div>
            </div>
          ) : !selected ? (
            <>
              {/* 검색 */}
              <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                <input
                  value={query} onChange={e => setQuery(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && doSearch()}
                  placeholder="아티스트 이름을 입력하세요"
                  style={{ flex: 1, padding: "10px 14px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 14 }}
                  autoFocus
                />
                <button className="btn btn-primary" onClick={doSearch} disabled={searching || !query.trim()}>
                  {searching ? "검색 중..." : "검색"}
                </button>
              </div>

              {/* 결과 */}
              <div style={{ display: "grid", gap: 6 }}>
                {results.map((r, i) => (
                  <button key={i} onClick={() => selectAndLoad(r)}
                    style={{
                      display: "flex", alignItems: "center", gap: 12,
                      padding: 12, border: "1px solid var(--border-light)", borderRadius: 10,
                      background: "var(--surface)", cursor: "pointer", width: "100%", textAlign: "left",
                      transition: "background 0.1s",
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = "var(--bg)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "var(--surface)")}
                  >
                    {r.image ? (
                      <img src={r.image} alt="" style={{ width: 40, height: 40, borderRadius: 10, objectFit: "cover" }} />
                    ) : (
                      <div style={{ width: 40, height: 40, borderRadius: 10, background: "var(--border-light)", display: "grid", placeItems: "center" }}><Users size={18} /></div>
                    )}
                    <div>
                      <strong style={{ fontSize: 14 }}>{r.name}</strong>
                      {(r as any).genre && <p style={{ fontSize: 11, color: "var(--text-disabled)", margin: 0 }}>{(r as any).genre}</p>}
                    </div>
                  </button>
                ))}
                {results.length === 0 && query && !searching && (
                  <div style={{ textAlign: "center", padding: 20 }}>
                    <p style={{ color: "var(--text-disabled)", marginBottom: 12 }}>검색 결과가 없어요</p>
                    <button className="btn btn-outline btn-sm" onClick={() => { setManualMode(true); setManual({...manual, name: query}); }}>
                      "{query}" 직접 등록하기
                    </button>
                  </div>
                )}
              </div>

              {/* 직접 등록 링크 */}
              {!searching && (
                <div style={{ textAlign: "center", marginTop: 16, paddingTop: 12, borderTop: "1px solid var(--border-light)" }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => setManualMode(true)} style={{ color: "var(--blue)" }}>
                    검색 없이 직접 등록
                  </button>
                </div>
              )}
            </>
          ) : (
            /* 선택된 아티스트 확인 */
            <div style={{ textAlign: "center" }}>
              {selected.image && <img src={selected.image} alt="" style={{ width: 80, height: 80, borderRadius: 20, objectFit: "cover", margin: "0 auto 12px", display: "block" }} />}
              <h3 style={{ margin: "0 0 4px" }}>{selected.name}</h3>
              {selected.genre && <p style={{ fontSize: 12, color: "var(--text-disabled)", margin: "0 0 8px" }}>{selected.genre}</p>}
              {loading && <p style={{ color: "var(--text-disabled)" }}>정보 가져오는 중...</p>}
              {selected.bio && <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6, textAlign: "left", marginTop: 12 }}>{selected.bio}</p>}
              <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 16 }}>
                <button className="btn btn-outline" onClick={() => setSelected(null)}>다른 아티스트 선택</button>
                <button className="btn btn-primary" onClick={handleAdd} disabled={loading}>등록</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

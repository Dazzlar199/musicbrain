import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Info, X, Activity, Trash2, RefreshCw, Plus } from "lucide-react";
import { Nav } from "./Artists";
import { useArtist } from "../context";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

interface WatchlistItem {
  name: string;
  buzz_score: number;
  change: number;
  priority: "high" | "medium" | "low";
  last_scanned: string;
  history?: Array<{ date: string; score: number }>;
}

interface AlertItem {
  id: string;
  type: "buzz_spike" | "buzz_drop" | "new_playlist" | "trending";
  artist: string;
  message: string;
  timestamp: string;
}

function scoreColor(s: number): string {
  if (s >= 70) return "#22c55e";
  if (s >= 40) return "#3182f6";
  if (s >= 20) return "#eab308";
  return "#94a3b8";
}

function priorityColor(p: string): { bg: string; text: string; label: string } {
  if (p === "high") return { bg: "rgba(239,68,68,0.1)", text: "#ef4444", label: "높음" };
  if (p === "medium") return { bg: "rgba(49,130,246,0.1)", text: "#3182f6", label: "보통" };
  return { bg: "rgba(148,163,184,0.1)", text: "#94a3b8", label: "낮음" };
}

function alertMeta(type: string): { icon: string; bg: string; text: string; label: string } {
  switch (type) {
    case "buzz_spike": return { icon: "\uD83D\uDD25", bg: "rgba(34,197,94,0.1)", text: "#22c55e", label: "버즈 급등" };
    case "buzz_drop": return { icon: "\uD83D\uDCC9", bg: "rgba(239,68,68,0.1)", text: "#ef4444", label: "버즈 하락" };
    case "new_playlist": return { icon: "\uD83C\uDFB5", bg: "rgba(49,130,246,0.1)", text: "#3182f6", label: "신규 플리" };
    case "trending": return { icon: "\uD83D\uDCC8", bg: "rgba(168,85,247,0.1)", text: "#a855f7", label: "트렌딩" };
    default: return { icon: "\u26A0\uFE0F", bg: "rgba(148,163,184,0.1)", text: "#94a3b8", label: "알림" };
  }
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

export default function Watchlist() {
  const nav = useNavigate();
  const { current } = useArtist();

  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");

  // Add form
  const [addName, setAddName] = useState("");
  const [addPriority, setAddPriority] = useState<"high" | "medium" | "low">("medium");
  const [adding, setAdding] = useState(false);

  // Detail view
  const [selected, setSelected] = useState<WatchlistItem | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Auto-refresh
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lastUpdate, setLastUpdate] = useState("");

  // Info modal
  const [showInfo, setShowInfo] = useState(false);

  const loadWatchlist = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError("");
    try {
      const r = await fetch("/api/watchlist");
      if (!r.ok) throw new Error(`서버 오류 (${r.status})`);
      const d = await r.json();
      setItems(d.items || []);
      setLastUpdate(new Date().toLocaleTimeString("ko-KR"));
    } catch (e: any) {
      if (!silent) setError(e.message || "워치리스트를 불러올 수 없습니다");
    }
    if (!silent) setLoading(false);
  }, []);

  const loadAlerts = useCallback(async () => {
    try {
      const r = await fetch("/api/watchlist/alerts");
      if (!r.ok) return;
      const d = await r.json();
      setAlerts(d.alerts || []);
    } catch { }
  }, []);

  useEffect(() => {
    loadWatchlist();
    loadAlerts();
  }, [loadWatchlist, loadAlerts]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      loadWatchlist(true);
      loadAlerts();
    }, 60000);
    return () => clearInterval(interval);
  }, [autoRefresh, loadWatchlist, loadAlerts]);

  const handleAdd = async () => {
    if (!addName.trim()) return;
    setAdding(true);
    try {
      const r = await fetch("/api/watchlist/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: addName.trim(), priority: addPriority }),
      });
      if (!r.ok) throw new Error("추가 실패");
      setAddName("");
      await loadWatchlist();
    } catch { }
    setAdding(false);
  };

  const handleDelete = async (name: string) => {
    try {
      await fetch(`/api/watchlist/${encodeURIComponent(name)}`, { method: "DELETE" });
      setItems(prev => prev.filter(i => i.name !== name));
      if (selected?.name === name) setSelected(null);
    } catch { }
  };

  const handleScan = async () => {
    setScanning(true);
    try {
      await fetch("/api/watchlist/scan");
      await loadWatchlist();
      await loadAlerts();
    } catch { }
    setScanning(false);
  };

  const handleSelect = async (item: WatchlistItem) => {
    setSelected(item);
    if (!item.history || item.history.length === 0) {
      setHistoryLoading(true);
      try {
        const r = await fetch(`/api/watchlist/${encodeURIComponent(item.name)}/history`);
        if (r.ok) {
          const d = await r.json();
          setSelected(prev => prev ? { ...prev, history: d.history || [] } : null);
        }
      } catch { }
      setHistoryLoading(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    padding: "8px 12px",
    border: "1px solid var(--border)", borderRadius: 8, fontSize: 13,
  };

  return (
    <div className="page-shell">
      <Nav nav={nav} active="watchlist" />
      <div className="page-content">
        <div className="page-header">
          <div>
            <h1>
              경쟁사 워치리스트
              <InfoButton onClick={() => setShowInfo(true)} />
            </h1>
            <p className="text-muted">관심 아티스트 자동 모니터링 &middot; 변동 알림</p>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              className={`btn ${autoRefresh ? "btn-primary" : "btn-outline"} btn-sm`}
              onClick={() => setAutoRefresh(!autoRefresh)}
              style={{ whiteSpace: "nowrap" }}
            >
              {autoRefresh ? "실시간 ON" : "실시간"}
            </button>
            <button
              className="btn btn-outline"
              onClick={handleScan}
              disabled={scanning}
            >
              {scanning ? (
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <RefreshCw size={14} style={{ animation: "spin 1s linear infinite" }} />
                  스캔 중...
                </span>
              ) : (
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <RefreshCw size={14} />
                  전체 스캔
                </span>
              )}
            </button>
          </div>
        </div>

        {lastUpdate && (
          <div style={{ fontSize: 11, color: "var(--text-disabled)", marginBottom: 16, display: "flex", gap: 8, alignItems: "center" }}>
            <span>마지막 업데이트: {lastUpdate}</span>
            {autoRefresh && <span style={{ color: "#22c55e" }}>60초마다 자동 새로고침 중</span>}
          </div>
        )}

        {/* Add artist */}
        <section className="subpanel" style={{ padding: 16, marginBottom: 20 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label style={{ fontSize: 12, color: "var(--text-disabled)", display: "block", marginBottom: 4 }}>아티스트 추가</label>
              <div className="search-box">
                <Search size={16} />
                <input
                  value={addName} onChange={e => setAddName(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleAdd()}
                  placeholder="모니터링할 아티스트 이름..."
                />
              </div>
            </div>
            <div>
              <label style={{ fontSize: 12, color: "var(--text-disabled)", display: "block", marginBottom: 4 }}>우선순위</label>
              <div style={{ display: "flex", gap: 4 }}>
                {(["high", "medium", "low"] as const).map(p => {
                  const meta = priorityColor(p);
                  return (
                    <button key={p}
                      className={`chip${addPriority === p ? " chip-active" : ""}`}
                      onClick={() => setAddPriority(p)}
                      style={addPriority === p ? { background: meta.bg, color: meta.text, borderColor: meta.text } : {}}
                    >{meta.label}</button>
                  );
                })}
              </div>
            </div>
            <button className="btn btn-primary" onClick={handleAdd} disabled={adding || !addName.trim()}>
              <Plus size={14} /> 추가
            </button>
          </div>
        </section>

        {/* Alerts */}
        {alerts.length > 0 && (
          <section style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: "var(--text-primary)" }}>최근 알림</p>
            <div style={{ display: "grid", gap: 6 }}>
              {alerts.slice(0, 5).map(a => {
                const meta = alertMeta(a.type);
                return (
                  <div key={a.id} style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "10px 14px", borderRadius: 10,
                    background: meta.bg,
                    border: `1px solid ${meta.text}20`,
                  }}>
                    <span style={{ fontSize: 18 }}>{meta.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{
                          fontSize: 10, fontWeight: 600, padding: "1px 6px",
                          borderRadius: 4, background: meta.text, color: "#fff",
                        }}>{meta.label}</span>
                        <strong style={{ fontSize: 13 }}>{a.artist}</strong>
                      </div>
                      <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "2px 0 0" }}>{a.message}</p>
                    </div>
                    <span style={{ fontSize: 11, color: "var(--text-disabled)", whiteSpace: "nowrap" }}>
                      {new Date(a.timestamp).toLocaleDateString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        )}

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
            <p style={{ marginTop: 12 }}>워치리스트를 불러오고 있어요...</p>
          </div>
        )}

        {/* Watchlist cards */}
        {!loading && (
          <div style={{ display: "grid", gap: 8 }}>
            {items.map(item => {
              const pMeta = priorityColor(item.priority);
              const isSelected = selected?.name === item.name;
              return (
                <div key={item.name}>
                  <div
                    onClick={() => handleSelect(item)}
                    style={{
                      display: "flex", alignItems: "center", gap: 16,
                      padding: "14px 16px", borderRadius: 12,
                      border: `1px solid ${isSelected ? "var(--blue)" : "var(--border-light)"}`,
                      background: isSelected ? "var(--blue-light)" : "var(--surface)",
                      cursor: "pointer", transition: "all 0.15s",
                    }}
                    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.borderColor = "var(--border)"; }}
                    onMouseLeave={e => { if (!isSelected) e.currentTarget.style.borderColor = "var(--border-light)"; }}
                  >
                    {/* Buzz score circle */}
                    <div style={{
                      width: 48, height: 48, borderRadius: "50%",
                      border: `3px solid ${scoreColor(item.buzz_score)}`,
                      display: "grid", placeItems: "center",
                      fontSize: 16, fontWeight: 800, color: scoreColor(item.buzz_score),
                      flexShrink: 0,
                    }}>
                      {item.buzz_score}
                    </div>

                    {/* Name + meta */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <strong style={{ fontSize: 15 }}>{item.name}</strong>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
                        <span style={{
                          fontSize: 10, padding: "1px 6px", borderRadius: 4,
                          background: pMeta.bg, color: pMeta.text, fontWeight: 600,
                        }}>{pMeta.label}</span>
                        {item.last_scanned && (
                          <span style={{ fontSize: 11, color: "var(--text-disabled)" }}>
                            스캔: {new Date(item.last_scanned).toLocaleDateString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Change indicator */}
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      {item.change !== 0 && (
                        <span style={{
                          fontSize: 14, fontWeight: 700,
                          color: item.change > 0 ? "#22c55e" : "#ef4444",
                        }}>
                          {item.change > 0 ? "\u2191" : "\u2193"}{Math.abs(item.change)}
                        </span>
                      )}
                      {item.change === 0 && (
                        <span style={{ fontSize: 13, color: "var(--text-disabled)" }}>-</span>
                      )}
                    </div>

                    {/* Delete */}
                    <button
                      onClick={e => { e.stopPropagation(); handleDelete(item.name); }}
                      style={{
                        border: "none", background: "none", cursor: "pointer",
                        color: "var(--text-disabled)", padding: 4, borderRadius: 6,
                        transition: "color 0.15s",
                      }}
                      onMouseEnter={e => { e.currentTarget.style.color = "#ef4444"; }}
                      onMouseLeave={e => { e.currentTarget.style.color = "var(--text-disabled)"; }}
                      title="삭제"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  {/* History chart (expanded) */}
                  {isSelected && (
                    <div className="subpanel" style={{ padding: 20, marginTop: 8, marginBottom: 4 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
                        {item.name} 버즈 추이
                      </p>
                      {historyLoading ? (
                        <div style={{ textAlign: "center", padding: 40, color: "var(--text-disabled)" }}>
                          <Activity size={20} style={{ animation: "pulse 1.5s infinite" }} />
                          <p style={{ marginTop: 8, fontSize: 12 }}>히스토리 로딩 중...</p>
                        </div>
                      ) : selected.history && selected.history.length > 0 ? (
                        <ResponsiveContainer width="100%" height={200}>
                          <LineChart data={selected.history}>
                            <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={d => d.slice(5)} />
                            <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} />
                            <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid var(--border-light)", fontSize: 12 }} />
                            <Line type="monotone" dataKey="score" stroke={scoreColor(item.buzz_score)} strokeWidth={2} dot={{ r: 3 }} name="버즈 스코어" />
                          </LineChart>
                        </ResponsiveContainer>
                      ) : (
                        <div style={{ textAlign: "center", padding: 30, color: "var(--text-disabled)", fontSize: 13 }}>
                          아직 히스토리 데이터가 없습니다. 스캔을 실행하면 데이터가 쌓입니다.
                        </div>
                      )}
                      <button className="btn btn-ghost btn-sm" onClick={() => setSelected(null)} style={{ marginTop: 8 }}>
                        닫기
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Empty state */}
            {items.length === 0 && !loading && (
              <div style={{ textAlign: "center", padding: 60, color: "var(--text-disabled)" }}>
                <Search size={40} />
                <p style={{ marginTop: 16, fontSize: 15 }}>워치리스트가 비어 있어요</p>
                <p style={{ fontSize: 13 }}>위에서 모니터링할 경쟁 아티스트를 추가해보세요</p>
              </div>
            )}
          </div>
        )}

        {/* Info modal */}
        {showInfo && (
          <InfoBubble title="경쟁사 워치리스트란?" onClose={() => setShowInfo(false)}>
            <p style={{ fontSize: 13, lineHeight: 1.8, color: "var(--text-secondary)", margin: "0 0 12px" }}>
              관심 있는 경쟁 아티스트를 등록하면 <strong>버즈 스코어 변동을 자동 모니터링</strong>합니다.
              급등/급락, 신규 플레이리스트 진입, 트렌딩 등 주요 이벤트가 발생하면 알림을 받을 수 있어요.
            </p>
            <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
              {[
                { icon: "\uD83D\uDD25", label: "버즈 급등", desc: "스코어가 단기간 크게 상승하면 알림" },
                { icon: "\uD83D\uDCC9", label: "버즈 하락", desc: "스코어가 급락하면 경쟁 기회로 알림" },
                { icon: "\uD83C\uDFB5", label: "신규 플리", desc: "주요 플레이리스트에 신규 진입 시 알림" },
                { icon: "\uD83D\uDCC8", label: "트렌딩", desc: "SNS에서 화제가 되면 알림" },
              ].map(a => (
                <div key={a.label} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "8px 12px", borderRadius: 8, background: "var(--bg)",
                }}>
                  <span style={{ fontSize: 18 }}>{a.icon}</span>
                  <div>
                    <strong style={{ fontSize: 13 }}>{a.label}</strong>
                    <p style={{ fontSize: 12, color: "var(--text-tertiary)", margin: 0 }}>{a.desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 12, color: "var(--text-disabled)", marginTop: 16 }}>
              실시간 모드를 켜면 60초마다 자동으로 데이터를 갱신합니다.
            </p>
          </InfoBubble>
        )}
      </div>

      {/* Spin animation for RefreshCw */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

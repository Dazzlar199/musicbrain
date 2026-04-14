import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, ListMusic, BarChart3, Info, X } from "lucide-react";
import { Nav } from "./Artists";
import { useArtist } from "../context";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

interface Placement {
  playlist_id: string; playlist_name: string; market: string;
  type: string; position: number; track: string; total_tracks: number;
}

interface CompareResult {
  artist: string; count: number; playlists: string[];
  editorial: number; chart: number; gaps?: Array<{ playlist: string; artist_on_it: string }>;
}

export default function PlaylistTracker() {
  const nav = useNavigate();
  const { current } = useArtist();
  const [query, setQuery] = useState("");
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [loading, setLoading] = useState(false);
  const [scannedCount, setScannedCount] = useState(0);
  const [compareInput, setCompareInput] = useState("");
  const [compareData, setCompareData] = useState<CompareResult[]>([]);
  const [showInfo, setShowInfo] = useState(false);

  const scan = async (name: string) => {
    setLoading(true); setPlacements([]);
    try {
      const r = await fetch(`/api/playlists/scan/${encodeURIComponent(name)}`);
      const d = await r.json();
      setPlacements(d.placements || []);
      setScannedCount(d.scanned_playlists || 0);
    } catch { }
    setLoading(false);
  };

  const compare = async () => {
    if (!query.trim() || !compareInput.trim()) return;
    try {
      const r = await fetch(`/api/playlists/compare?artists=${encodeURIComponent(query + "," + compareInput)}`);
      const d = await r.json();
      setCompareData(d.comparison || []);
    } catch { }
  };

  useEffect(() => {
    if (current) {
      const name = current.stage_name || current.name;
      setQuery(name);
      scan(name);
    }
  }, [current?.id]);

  const editorial = placements.filter(p => p.type === "editorial");
  const chart = placements.filter(p => p.type === "chart");

  return (
    <div className="page-shell">
      <Nav nav={nav} active="playlists" />
      <div className="page-content">
        <div className="page-header">
          <div>
            <h1>플레이리스트 트래커</h1>
            <p className="text-muted">Spotify 에디토리얼 · 차트 플레이리스트 배치 모니터링</p>
          </div>
        </div>

        {/* 검색 */}
        <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
          <div className="search-box" style={{ flex: 1 }}>
            <Search size={16} />
            <input value={query} onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === "Enter" && scan(query)}
              placeholder="아티스트 이름..." />
          </div>
          <button className="btn btn-primary" onClick={() => scan(query)} disabled={loading || !query.trim()}>
            {loading ? "스캔 중..." : "스캔"}
          </button>
        </div>

        {loading && (
          <div style={{ textAlign: "center", padding: 60, color: "var(--text-disabled)" }}>
            <ListMusic size={32} style={{ animation: "pulse 1.5s infinite" }} />
            <p style={{ marginTop: 12 }}>20개 플레이리스트를 스캔하고 있어요...</p>
          </div>
        )}

        {!loading && placements.length > 0 && (
          <div className="stack">
            {/* KPI */}
            <div style={{ display: "flex", gap: 16, marginBottom: 8 }}>
              <div className="kpi-card" style={{ flex: 1 }}>
                <div>
                  <span>총 배치</span>
                  <strong style={{ fontSize: 24 }}>{placements.length}개</strong>
                </div>
                <InfoBtn onClick={() => setShowInfo(true)} />
              </div>
              <div className="kpi-card" style={{ flex: 1 }}>
                <div><span>에디토리얼</span><strong style={{ fontSize: 24, color: "#3182f6" }}>{editorial.length}</strong></div>
              </div>
              <div className="kpi-card" style={{ flex: 1 }}>
                <div><span>차트</span><strong style={{ fontSize: 24, color: "#22c55e" }}>{chart.length}</strong></div>
              </div>
              <div className="kpi-card" style={{ flex: 1 }}>
                <div><span>스캔 대상</span><strong style={{ fontSize: 24, color: "var(--text-tertiary)" }}>{scannedCount}</strong></div>
              </div>
            </div>

            {/* 배치 목록 */}
            <section className="subpanel" style={{ padding: 20 }}>
              <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>현재 배치된 플레이리스트</p>
              <div style={{ display: "grid", gap: 6 }}>
                {placements.map((p, i) => (
                  <div key={i} style={{
                    display: "grid", gridTemplateColumns: "1fr auto auto",
                    alignItems: "center", gap: 12, padding: "10px 0",
                    borderBottom: i < placements.length - 1 ? "1px solid var(--border-light)" : "none",
                  }}>
                    <div>
                      <strong style={{ fontSize: 14 }}>{p.playlist_name}</strong>
                      <p style={{ fontSize: 12, color: "var(--text-tertiary)", margin: 0 }}>
                        {p.track} · {p.market}
                      </p>
                    </div>
                    <span style={{ fontSize: 12, color: "var(--text-disabled)" }}>#{p.position}/{p.total_tracks}</span>
                    <span className={`status-badge ${p.type === "editorial" ? "status-active" : "status-discovered"}`}
                      style={{ fontSize: 10 }}>{p.type === "editorial" ? "에디토리얼" : "차트"}</span>
                  </div>
                ))}
              </div>
            </section>

            {/* 경쟁사 비교 */}
            <section className="subpanel" style={{ padding: 20 }}>
              <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
                <BarChart3 size={14} style={{ marginRight: 6, verticalAlign: "middle" }} />
                경쟁사 플레이리스트 비교
              </p>
              <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                <input value={compareInput} onChange={e => setCompareInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && compare()}
                  placeholder="비교할 아티스트 (쉼표 구분: NewJeans,aespa)"
                  style={{ flex: 1, padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13 }} />
                <button className="btn btn-outline btn-sm" onClick={compare}>비교</button>
              </div>
              {compareData.length > 0 && (
                <>
                  <ResponsiveContainer width="100%" height={Math.max(120, compareData.length * 50)}>
                    <BarChart data={compareData} layout="vertical" margin={{ left: 10 }}>
                      <XAxis type="number" tick={{ fontSize: 10 }} />
                      <YAxis type="category" dataKey="artist" width={80} tick={{ fontSize: 12 }} />
                      <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid var(--border-light)", fontSize: 12 }} />
                      <Bar dataKey="editorial" name="에디토리얼" fill="#3182f6" barSize={14} radius={[0, 4, 4, 0]} />
                      <Bar dataKey="chart" name="차트" fill="#22c55e" barSize={14} radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                  {/* Gap 분석 */}
                  {compareData[0]?.gaps && compareData[0].gaps.length > 0 && (
                    <div style={{ marginTop: 16 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: "var(--red)" }}>
                        우리가 빠져 있는 플레이리스트 ({compareData[0].gaps.length}개)
                      </p>
                      <div style={{ display: "grid", gap: 4 }}>
                        {compareData[0].gaps.map((g, i) => (
                          <div key={i} style={{ fontSize: 13, padding: "6px 0", borderBottom: "1px solid var(--border-light)" }}>
                            <strong>{g.playlist}</strong>
                            <span style={{ color: "var(--text-disabled)", marginLeft: 8 }}>← {g.artist_on_it}는 있음</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </section>
          </div>
        )}

        {!loading && placements.length === 0 && query && (
          <div style={{ textAlign: "center", padding: 60, color: "var(--text-disabled)" }}>
            <ListMusic size={40} />
            <p style={{ marginTop: 16 }}>이 아티스트는 추적 중인 플레이리스트에 없어요</p>
            <p style={{ fontSize: 13 }}>다른 아티스트를 검색하거나, 아티스트명을 정확히 입력해주세요</p>
          </div>
        )}

        {/* 안내 모달 */}
        {showInfo && (
          <div className="modal-overlay" onClick={() => setShowInfo(false)}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 440, padding: 24 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <h3 style={{ margin: 0 }}>플레이리스트 트래커란?</h3>
                <button onClick={() => setShowInfo(false)} style={{ border: "none", background: "none", cursor: "pointer" }}><X size={18} /></button>
              </div>
              <p style={{ fontSize: 13, lineHeight: 1.8, color: "var(--text-secondary)" }}>
                Spotify의 주요 에디토리얼 플레이리스트 20개를 스캔해서 아티스트가 어디에 배치되어 있는지 추적합니다.
              </p>
              <p style={{ fontSize: 13, lineHeight: 1.8, color: "var(--text-secondary)", marginTop: 12 }}>
                <strong>에디토리얼 플레이리스트</strong>는 Spotify 에디터가 직접 큐레이션하는 리스트로,
                배치되면 스트리밍 수가 크게 증가합니다. K-Pop Daebak, Today's Top Hits 같은 리스트가 해당돼요.
              </p>
              <p style={{ fontSize: 13, lineHeight: 1.8, color: "var(--text-secondary)", marginTop: 12 }}>
                <strong>경쟁사 비교</strong>를 통해 우리 아티스트가 빠져 있지만 경쟁사는 들어가 있는 플레이리스트를 찾을 수 있습니다.
                이게 곧 플레이리스트 피칭 타겟이에요.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function InfoBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      width: 20, height: 20, borderRadius: "50%", border: "1.5px solid var(--text-disabled)",
      background: "none", display: "inline-grid", placeItems: "center", cursor: "pointer",
      color: "var(--text-disabled)",
    }}><Info size={12} /></button>
  );
}

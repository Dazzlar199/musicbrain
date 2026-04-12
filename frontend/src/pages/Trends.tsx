import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Globe2, TrendingUp, Music, Radio, X, ExternalLink, Play } from "lucide-react";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { Nav } from "./Artists";

interface MarketOverview {
  name: string; unique_tracks: number; total_entries: number;
  top_artists: Record<string, number>;
  avg_features: Record<string, number>;
}

interface MarketDetail {
  market: string; market_name: string; unique_tracks: number;
  top_tracks: Array<{ name: string; artists: string; popularity: number; danceability: number; energy: number; valence: number; tempo: number }>;
  features: Record<string, { mean: number; std: number; median: number }>;
}

const MARKET_FLAGS: Record<string, string> = {
  kr: "🇰🇷", us: "🇺🇸", jp: "🇯🇵", br: "🇧🇷", latam: "🌎", sea: "🌏",
  europe: "🇪🇺", uk: "🇬🇧", mena: "🌍", africa: "🌍", india: "🇮🇳", china: "🇨🇳",
};
const COLORS = ["#3182f6", "#8b5cf6", "#00c471", "#ffc533", "#f04452", "#ff6b6b", "#00b8d9", "#36b37e", "#ff8b00", "#6554c0", "#ff5630", "#0065ff"];

interface ChartEntry {
  rank: number; title: string; artist: string;
  image?: string; popularity?: number; weeks?: number;
}

interface ChartData {
  platform: string; entries: ChartEntry[]; live?: boolean; updated?: string;
}

type ChartTab = "trends" | "live";

export default function Trends() {
  const nav = useNavigate();
  const [overview, setOverview] = useState<Record<string, MarketOverview>>({});
  const [selectedMarket, setSelectedMarket] = useState("kr");
  const [detail, setDetail] = useState<MarketDetail | null>(null);
  const [totalCountries, setTotalCountries] = useState(0);
  const [chartTab, setChartTab] = useState<ChartTab>("live");

  // Live charts
  const [melonChart, setMelonChart] = useState<ChartData | null>(null);
  const [bugsChart, setBugsChart] = useState<ChartData | null>(null);
  const [billboardChart, setBillboardChart] = useState<ChartData | null>(null);
  const [spotifyLive, setSpotifyLive] = useState<ChartData | null>(null);
  const [liveCountry, setLiveCountry] = useState("KR");
  const [chartsLoading, setChartsLoading] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState<ChartEntry | null>(null);

  const loadLiveCharts = async () => {
    setChartsLoading(true);
    const [m, b, bb, sp] = await Promise.allSettled([
      fetch("/api/charts/melon?limit=20").then(r => r.json()),
      fetch("/api/charts/bugs?limit=20").then(r => r.json()),
      fetch("/api/charts/billboard?limit=20").then(r => r.json()),
      fetch(`/api/charts/spotify-live/${liveCountry}?limit=20`).then(r => r.json()),
    ]);
    if (m.status === "fulfilled") setMelonChart(m.value);
    if (b.status === "fulfilled") setBugsChart(b.value);
    if (bb.status === "fulfilled") setBillboardChart(bb.value);
    if (sp.status === "fulfilled") setSpotifyLive(sp.value);
    setChartsLoading(false);
  };

  useEffect(() => {
    fetch("/api/trends/markets").then(r => r.json()).then(d => {
      setOverview(d.markets || {}); setTotalCountries(d.total_countries || 0);
    });
    loadLiveCharts();
  }, []);

  useEffect(() => {
    fetch(`/api/charts/spotify-live/${liveCountry}?limit=20`).then(r => r.json()).then(setSpotifyLive);
  }, [liveCountry]);

  useEffect(() => {
    fetch(`/api/trends/market/${selectedMarket}`).then(r => r.json()).then(setDetail);
  }, [selectedMarket]);

  const marketCards = Object.entries(overview).sort((a, b) => b[1].unique_tracks - a[1].unique_tracks);

  // Radar data for selected market
  const radarData = detail ? Object.entries(detail.features || {})
    .filter(([k]) => ["danceability", "energy", "valence", "speechiness", "acousticness", "liveness"].includes(k))
    .map(([k, v]) => ({ feature: k, value: Math.round(v.mean * 100) })) : [];

  // Compare bar data: all markets for one feature
  const compareData = Object.entries(overview)
    .filter(([_, v]) => v.avg_features?.danceability)
    .map(([k, v]) => ({ market: k, danceability: Math.round((v.avg_features.danceability || 0) * 100), energy: Math.round((v.avg_features.energy || 0) * 100) }))
    .sort((a, b) => b.danceability - a.danceability);

  return (
    <div className="page-shell">
      <Nav nav={nav} active="trends" />
      <div className="page-content">
        <div className="page-header">
          <div><h1>글로벌 트렌드</h1><p className="text-muted">{totalCountries}개국 차트 · 멜론/벅스/Billboard/Spotify 실시간</p></div>
          <button className="btn btn-outline btn-sm" onClick={loadLiveCharts}>
            <Radio size={14} /> 차트 새로고침
          </button>
        </div>

        {/* Tab: Live Charts vs Market Analysis */}
        <div className="tabs" style={{ marginBottom: 20 }}>
          <button className={`tab-button${chartTab === "live" ? " is-active" : ""}`} onClick={() => setChartTab("live")}>실시간 차트</button>
          <button className={`tab-button${chartTab === "trends" ? " is-active" : ""}`} onClick={() => setChartTab("trends")}>시장 분석</button>
        </div>

        {chartTab === "live" && (
          <div className="stack">
            {/* Spotify 국가별 차트 */}
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: "var(--text-secondary)" }}>Spotify Top 50 — 국가 선택</p>
              <SpotifyCountryFilter selected={liveCountry} onSelect={setLiveCountry} />
            </div>

            <div className="card-grid-2">
              <ChartCard data={spotifyLive} loading={chartsLoading} onSelect={setSelectedTrack} />
              <ChartCard data={billboardChart} loading={chartsLoading} onSelect={setSelectedTrack} />
              <ChartCard data={melonChart} loading={chartsLoading} onSelect={setSelectedTrack} />
              <ChartCard data={bugsChart} loading={chartsLoading} onSelect={setSelectedTrack} />
            </div>
          </div>
        )}

        {chartTab === "trends" && <>
        {Object.keys(overview).length === 0 ? (
          <div style={{ textAlign: "center", padding: 60, color: "var(--text-disabled)" }}>
            <p style={{ fontSize: 15, fontWeight: 600 }}>시장 분석 데이터 준비 중</p>
            <p style={{ fontSize: 13 }}>Spotify 차트 데이터가 연결되면 시장별 오디오 특성을 분석합니다</p>
          </div>
        ) : <>
        {/* Market selector chips */}
        <div className="chip-bar">
          {marketCards.map(([code]) => (
            <button key={code} className={`chip${selectedMarket === code ? " chip-active" : ""}`}
              onClick={() => setSelectedMarket(code)}>
              {MARKET_FLAGS[code]} {code.toUpperCase()} <span className="chip-count">{overview[code]?.unique_tracks}</span>
            </button>
          ))}
        </div>

        {/* KPI Row */}
        {detail && (
          <div className="kpi-grid">
            <div className="kpi-card">
              <Globe2 size={20} className="kpi-icon" />
              <div><span>유니크 트랙</span><strong>{detail.unique_tracks?.toLocaleString() ?? "—"}</strong></div>
            </div>
            <div className="kpi-card">
              <Music size={20} className="kpi-icon" style={{ color: "#3182f6" }} />
              <div><span>평균 Danceability</span><strong>{detail.features?.danceability ? `${Math.round(detail.features.danceability.mean * 100)}%` : "—"}</strong></div>
            </div>
            <div className="kpi-card">
              <TrendingUp size={20} className="kpi-icon" style={{ color: "#8b5cf6" }} />
              <div><span>평균 Energy</span><strong>{detail.features?.energy ? `${Math.round(detail.features.energy.mean * 100)}%` : "—"}</strong></div>
            </div>
            <div className="kpi-card">
              <TrendingUp size={20} className="kpi-icon" style={{ color: "#00c471" }} />
              <div><span>평균 Tempo</span><strong>{detail.features?.tempo ? `${Math.round(detail.features.tempo.mean)} BPM` : "—"}</strong></div>
            </div>
          </div>
        )}

        <div className="chart-grid-2">
          {/* Radar */}
          <div className="chart-card">
            <p className="chart-title">{selectedMarket.toUpperCase()} 오디오 DNA</p>
            {radarData.length > 0 && (
              <ResponsiveContainer width="100%" height={280}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="#e5e8eb" />
                  <PolarAngleAxis dataKey="feature" tick={{ fill: "#666", fontSize: 11 }} />
                  <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                  <Radar dataKey="value" stroke="#3182f6" fill="#3182f6" fillOpacity={0.2} strokeWidth={2} />
                </RadarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Cross-market comparison */}
          <div className="chart-card">
            <p className="chart-title">시장별 Danceability vs Energy</p>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={compareData} layout="vertical" margin={{ left: 10 }}>
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="market" width={60} tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #eee" }} />
                <Bar dataKey="danceability" fill="#3182f6" name="Danceability" barSize={10} radius={[0,4,4,0]} />
                <Bar dataKey="energy" fill="#8b5cf6" name="Energy" barSize={10} radius={[0,4,4,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Tracks Table */}
        {detail && detail.top_tracks && (
          <div className="table-card">
            <p className="chart-title" style={{ padding: "16px 20px 0" }}>{selectedMarket.toUpperCase()} Top 20 트랙</p>
            <table className="table">
              <thead><tr><th>#</th><th>곡</th><th>아티스트</th><th>인기도</th><th>Dance</th><th>Energy</th><th>Valence</th><th>BPM</th></tr></thead>
              <tbody>
                {detail.top_tracks.slice(0, 20).map((t, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td><strong>{t.name}</strong></td>
                    <td>{t.artists}</td>
                    <td><span className="pop-badge">{t.popularity}</span></td>
                    <td>{Math.round(t.danceability * 100)}%</td>
                    <td>{Math.round(t.energy * 100)}%</td>
                    <td>{Math.round(t.valence * 100)}%</td>
                    <td>{Math.round(t.tempo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        </>}</>}
        {/* Track Detail Modal */}
        {selectedTrack && (
          <TrackDetailModal track={selectedTrack} onClose={() => setSelectedTrack(null)} />
        )}
      </div>
    </div>
  );
}

const PLATFORM_LOGOS: Record<string, { bg: string; letter: string; color: string }> = {
  "멜론": { bg: "#00cd3c", letter: "M", color: "#fff" },
  "벅스": { bg: "#ea4c89", letter: "B", color: "#fff" },
  "Billboard": { bg: "#000", letter: "B", color: "#fff" },
  "Spotify": { bg: "#1db954", letter: "S", color: "#fff" },
};

function PlatformLogo({ platform }: { platform: string }) {
  const key = Object.keys(PLATFORM_LOGOS).find(k => platform.includes(k));
  if (!key) return null;
  const { bg, letter, color } = PLATFORM_LOGOS[key];
  return (
    <div style={{
      width: 24, height: 24, borderRadius: 6, background: bg,
      display: "grid", placeItems: "center",
      fontSize: 13, fontWeight: 800, color, flexShrink: 0,
    }}>{letter}</div>
  );
}

function ChartCard({ data, loading, onSelect }: { data: ChartData | null; loading: boolean; onSelect?: (e: ChartEntry) => void }) {
  if (loading && !data) {
    return (
      <div className="chart-card skeleton-card">
        <div className="skeleton-header">
          <div className="skeleton-line skeleton-w60" />
          <div className="skeleton-badge" />
        </div>
        {[1,2,3,4,5].map(i => (
          <div key={i} className="skeleton-row">
            <div className="skeleton-rank" />
            <div className="skeleton-line skeleton-w80" />
            <div className="skeleton-dots" />
          </div>
        ))}
      </div>
    );
  }
  if (!data || !data.entries?.length) {
    return (
      <div className="chart-card" style={{ minHeight: 200, display: "grid", placeItems: "center" }}>
        <p style={{ color: "var(--text-disabled)", fontSize: 13 }}>차트를 불러올 수 없어요</p>
      </div>
    );
  }
  return (
    <div className="chart-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <PlatformLogo platform={data.platform} />
          <p className="chart-title" style={{ margin: 0 }}>{data.platform}</p>
        </div>
        {data.live && <span className="status-badge status-active" style={{ fontSize: 10 }}>LIVE</span>}
      </div>
      <div style={{ display: "grid", gap: 4 }}>
        {data.entries.map((e, i) => (
          <div key={`${e.rank}-${e.title}`} onClick={() => onSelect?.(e)} style={{
            display: "grid", gridTemplateColumns: "28px 1fr auto", alignItems: "center", gap: 10,
            padding: "8px 4px", borderBottom: i < data.entries.length - 1 ? "1px solid var(--border-light)" : "none",
            cursor: "pointer", borderRadius: 6, transition: "background 0.15s",
          }} onMouseEnter={ev => (ev.currentTarget.style.background = "var(--bg)")} onMouseLeave={ev => (ev.currentTarget.style.background = "transparent")}>
            <span style={{ fontSize: 13, fontWeight: 700, color: e.rank <= 3 ? "var(--blue)" : "var(--text-disabled)", textAlign: "center" }}>{e.rank}</span>
            <div>
              <strong style={{ fontSize: 13, display: "block" }}>{e.title}</strong>
              <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{e.artist}</span>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {e.popularity && <span className="pop-badge">{e.popularity}</span>}
              {e.weeks && <span style={{ fontSize: 11, color: "var(--text-disabled)" }}>{e.weeks}주</span>}
              <PlatformLinks artist={e.artist} title={e.title} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PlatformLinks({ artist, title }: { artist: string; title: string }) {
  const q = encodeURIComponent(`${artist} ${title}`);
  const s = { width: 20, height: 20, borderRadius: 4, display: "inline-flex" as const, alignItems: "center" as const, justifyContent: "center" as const, fontSize: 9, textDecoration: "none", fontWeight: 700 as const, lineHeight: 1 };
  return (
    <div style={{ display: "flex", gap: 3 }}>
      <a href={`https://www.youtube.com/results?search_query=${q}+official`} target="_blank" rel="noreferrer"
        style={{ ...s, background: "#ff0000", color: "#fff" }} title="YouTube">YT</a>
      <a href={`https://open.spotify.com/search/${q}`} target="_blank" rel="noreferrer"
        style={{ ...s, background: "#1db954", color: "#fff" }} title="Spotify">SP</a>
      <a href={`https://www.melon.com/search/total/index.htm?q=${q}`} target="_blank" rel="noreferrer"
        style={{ ...s, background: "#00cd3c", color: "#fff" }} title="멜론">ML</a>
    </div>
  );
}

interface YTData {
  views: number | null;
  formatted: string | null;
  title: string | null;
  url: string;
  video_id: string;
}

interface PlatformLinksData {
  links: Record<string, string>;
}

function TrackDetailModal({ track, onClose }: { track: ChartEntry; onClose: () => void }) {
  const [ytData, setYtData] = useState<YTData | null>(null);
  const [ytLoading, setYtLoading] = useState(true);
  const [links, setLinks] = useState<PlatformLinksData | null>(null);

  useEffect(() => {
    const q = `${track.artist} ${track.title}`;
    setYtLoading(true);

    // YouTube 조회수 + 플랫폼 링크 동시 요청
    Promise.all([
      fetch(`/api/track-stats/youtube-search?query=${encodeURIComponent(q)}`).then(r => r.json()),
      fetch(`/api/track-stats/links?artist=${encodeURIComponent(track.artist)}&title=${encodeURIComponent(track.title)}`).then(r => r.json()),
    ]).then(([yt, lk]) => {
      setYtData(yt);
      setLinks(lk);
      setYtLoading(false);
    }).catch(() => setYtLoading(false));
  }, [track]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={e => e.stopPropagation()} style={{ maxWidth: 600 }}>
        <div className="modal-header">
          <div>
            <h3 style={{ margin: 0 }}>{track.title}</h3>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text-tertiary)" }}>{track.artist}</p>
          </div>
          <button onClick={onClose} style={{ border: "none", background: "none", cursor: "pointer", color: "var(--text-tertiary)", padding: 4 }}><X size={20} /></button>
        </div>
        <div className="modal-body">
          {/* KPI 카드 */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 20 }}>
            <div className="kpi-card" style={{ padding: 16 }}>
              <div><span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>차트 순위</span></div>
              <strong style={{ fontSize: 28, fontWeight: 800, color: track.rank <= 3 ? "var(--blue)" : "var(--text-primary)" }}>#{track.rank}</strong>
            </div>
            <div className="kpi-card" style={{ padding: 16 }}>
              <div><span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>YouTube 조회수</span></div>
              {ytLoading ? (
                <span style={{ fontSize: 13, color: "var(--text-disabled)" }}>불러오는 중...</span>
              ) : ytData?.views ? (
                <strong style={{ fontSize: 20, fontWeight: 800, color: "#ff0000" }}>{ytData.formatted}</strong>
              ) : (
                <span style={{ fontSize: 13, color: "var(--text-disabled)" }}>정보 없음</span>
              )}
            </div>
            <div className="kpi-card" style={{ padding: 16 }}>
              <div><span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>인기도</span></div>
              <strong style={{ fontSize: 28, fontWeight: 800 }}>{track.popularity || "—"}</strong>
            </div>
          </div>

          {/* YouTube 영상 */}
          {ytData?.video_id && (
            <div style={{ marginBottom: 20, borderRadius: 12, overflow: "hidden", background: "#000", aspectRatio: "16/9" }}>
              <iframe
                width="100%" height="100%"
                src={`https://www.youtube.com/embed/${ytData.video_id}`}
                style={{ border: "none" }}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          )}

          {/* 오디오 피처 (차트 데이터에 있으면) */}
          {(track as any).danceability != null && (
            <div style={{ marginBottom: 20 }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: "var(--text-tertiary)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>오디오 특성</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
                {[
                  ["Danceability", (track as any).danceability],
                  ["Energy", (track as any).energy],
                  ["Valence", (track as any).valence],
                  ["Tempo", (track as any).tempo],
                ].filter(([_, v]) => v != null).map(([label, value]) => (
                  <div key={label as string} style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", background: "var(--bg)", borderRadius: 8 }}>
                    <span style={{ fontSize: 13, color: "var(--text-tertiary)" }}>{label}</span>
                    <strong style={{ fontSize: 13 }}>
                      {typeof value === "number" && value < 1 ? `${Math.round(value * 100)}%` : String(Math.round(value as number))}
                    </strong>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 플랫폼 링크 */}
          {links && (
            <div>
              <p style={{ fontSize: 12, fontWeight: 600, color: "var(--text-tertiary)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>플랫폼에서 듣기</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
                {[
                  { key: "youtube", label: "YouTube", color: "#ff0000", icon: "▶" },
                  { key: "spotify", label: "Spotify", color: "#1db954", icon: "♪" },
                  { key: "melon", label: "멜론", color: "#00cd3c", icon: "♪" },
                  { key: "youtube_music", label: "YouTube Music", color: "#ff0000", icon: "♪" },
                  { key: "apple_music", label: "Apple Music", color: "#fc3c44", icon: "♪" },
                  { key: "bugs", label: "벅스", color: "#ea4c89", icon: "♪" },
                  { key: "genie", label: "지니", color: "#3f51b5", icon: "♪" },
                ].map(p => {
                  let url = links.links[p.key];
                  if (!url) return null;
                  // YouTube는 이미 찾은 video_id로 직접 연결
                  if (p.key === "youtube" && ytData?.video_id) url = `https://www.youtube.com/watch?v=${ytData.video_id}`;
                  if (p.key === "youtube_music" && ytData?.video_id) url = `https://music.youtube.com/watch?v=${ytData.video_id}`;
                  return (
                    <a key={p.key} href={url} target="_blank" rel="noreferrer"
                      style={{
                        display: "flex", alignItems: "center", gap: 10,
                        padding: "10px 14px", borderRadius: 10,
                        background: "var(--bg)", textDecoration: "none",
                        color: "var(--text-primary)", fontSize: 13, fontWeight: 500,
                        transition: "background 0.15s",
                      }}
                      onMouseEnter={ev => (ev.currentTarget.style.background = p.color + "15")}
                      onMouseLeave={ev => (ev.currentTarget.style.background = "var(--bg)")}
                    >
                      <span style={{
                        width: 28, height: 28, borderRadius: 6,
                        background: p.color, color: "#fff",
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                        fontSize: 12, fontWeight: 700,
                      }}>{p.icon}</span>
                      <span style={{ flex: 1 }}>{p.label}</span>
                      <ExternalLink size={14} style={{ color: "var(--text-disabled)" }} />
                    </a>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SpotifyCountryFilter({ selected, onSelect }: { selected: string; onSelect: (c: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const main = ["KR", "US", "JP", "BR"];
  const more = ["DE", "GB", "FR", "MX", "IN", "ID", "TH", "PH", "NG", "ZA", "SA", "TR", "TW", "Global"];
  const flags: Record<string, string> = {
    KR: "🇰🇷", US: "🇺🇸", JP: "🇯🇵", BR: "🇧🇷", DE: "🇩🇪", GB: "🇬🇧", FR: "🇫🇷",
    MX: "🇲🇽", IN: "🇮🇳", ID: "🇮🇩", TH: "🇹🇭", PH: "🇵🇭", NG: "🇳🇬", ZA: "🇿🇦",
    SA: "🇸🇦", TR: "🇹🇷", TW: "🇹🇼", Global: "🌐",
  };
  const visible = expanded ? [...main, ...more] : main;
  const isMoreSelected = more.includes(selected);

  return (
    <div className="chip-bar" style={{ flexWrap: "wrap" }}>
      {visible.map(c => (
        <button key={c} className={`chip${selected === c ? " chip-active" : ""}`} onClick={() => onSelect(c)}>
          {flags[c] || ""} {c}
        </button>
      ))}
      {!expanded && (
        <button className={`chip${isMoreSelected ? " chip-active" : ""}`} onClick={() => setExpanded(true)}
          style={{ color: "var(--blue)" }}>
          +{more.length}개국 더보기
        </button>
      )}
      {expanded && (
        <button className="chip" onClick={() => setExpanded(false)} style={{ color: "var(--text-tertiary)" }}>
          접기
        </button>
      )}
    </div>
  );
}

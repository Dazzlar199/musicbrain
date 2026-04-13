import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, TrendingUp, MessageCircle, Newspaper, PlayCircle, Activity } from "lucide-react";
import { Nav } from "./Artists";
import { useArtist } from "../context";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from "recharts";

interface BuzzData {
  artist: string;
  score: number;
  summary: string;
  trends: { points: Array<{ date: string; value: number }>; avg: number; peak: number; peak_date: string | null };
  reddit: { posts: Array<{ title: string; subreddit: string; score: number; comments: number; url: string; created: string }>; count: number; total_score: number; total_comments: number; top_subreddits: Array<{ name: string; count: number }> };
  news: { articles: Array<{ title: string; source: string; url: string; published: string }>; count: number };
  youtube: { videos: Array<{ title: string; channel: string; views: string; published: string; url: string }>; count: number };
  updated: string;
}

function scoreColor(s: number) {
  if (s >= 70) return "#22c55e";
  if (s >= 40) return "#3182f6";
  if (s >= 20) return "#eab308";
  return "#94a3b8";
}

export default function Buzz() {
  const nav = useNavigate();
  const { current } = useArtist();
  const [data, setData] = useState<BuzzData | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [compareInput, setCompareInput] = useState("");
  const [compareData, setCompareData] = useState<Array<{ artist: string; score: number; trend_avg: number; trend_peak: number }>>([]);

  const loadBuzz = async (name: string) => {
    setLoading(true);
    setData(null);
    try {
      const r = await fetch(`/api/buzz/${encodeURIComponent(name)}`);
      const d = await r.json();
      setData(d);
    } catch { }
    setLoading(false);
  };

  const loadCompare = async () => {
    if (!data?.artist || !compareInput.trim()) return;
    try {
      const r = await fetch(`/api/buzz/${encodeURIComponent(data.artist)}/compare?vs=${encodeURIComponent(compareInput)}`);
      const d = await r.json();
      setCompareData(d.comparison || []);
    } catch { }
  };

  useEffect(() => {
    if (current) {
      setSearchQuery(current.stage_name || current.name);
      loadBuzz(current.stage_name || current.name);
    }
  }, [current?.id]);

  const handleSearch = () => {
    if (searchQuery.trim()) loadBuzz(searchQuery.trim());
  };

  return (
    <div className="page-shell">
      <Nav nav={nav} active="buzz" />
      <div className="page-content">
        <div className="page-header">
          <div>
            <h1>팬덤 버즈 트래커</h1>
            <p className="text-muted">Google Trends · Reddit · 뉴스 · YouTube — 실시간 관심도</p>
          </div>
        </div>

        {/* 검색 */}
        <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
          <div className="search-box" style={{ flex: 1 }}>
            <Search size={16} />
            <input
              value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSearch()}
              placeholder="아티스트 이름 입력..."
            />
          </div>
          <button className="btn btn-primary" onClick={handleSearch} disabled={loading || !searchQuery.trim()}>
            {loading ? "분석 중..." : "버즈 분석"}
          </button>
        </div>

        {loading && (
          <div style={{ textAlign: "center", padding: 60, color: "var(--text-disabled)" }}>
            <Activity size={32} style={{ animation: "pulse 1.5s infinite" }} />
            <p style={{ marginTop: 12 }}>팬덤 버즈를 수집하고 있어요...</p>
            <p style={{ fontSize: 12 }}>Google Trends, Reddit, 뉴스, YouTube에서 데이터를 가져옵니다</p>
          </div>
        )}

        {data && !loading && (
          <div className="stack">
            {/* 버즈 스코어 + 요약 */}
            <div className="card-grid-2">
              <section className="subpanel" style={{ textAlign: "center", padding: 24 }}>
                <p style={{ fontSize: 12, color: "var(--text-disabled)", marginBottom: 8 }}>버즈 스코어</p>
                <div style={{
                  width: 100, height: 100, borderRadius: "50%",
                  border: `4px solid ${scoreColor(data.score)}`,
                  display: "grid", placeItems: "center", margin: "0 auto 12px",
                  fontSize: 32, fontWeight: 800, color: scoreColor(data.score),
                }}>
                  {data.score}
                </div>
                <strong style={{ fontSize: 18 }}>{data.artist}</strong>
                <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 12, fontSize: 12, color: "var(--text-tertiary)" }}>
                  <span>Reddit {data.reddit.count}건</span>
                  <span>뉴스 {data.news.count}건</span>
                  <span>YouTube {data.youtube.count}건</span>
                </div>
              </section>

              <section className="subpanel" style={{ padding: 20 }}>
                <p style={{ fontSize: 12, color: "var(--text-disabled)", marginBottom: 8 }}>AI 버즈 요약</p>
                {data.summary ? (
                  <p style={{ fontSize: 14, lineHeight: 1.8, color: "var(--text-secondary)" }}>{data.summary}</p>
                ) : (
                  <p style={{ fontSize: 13, color: "var(--text-disabled)" }}>요약 데이터가 부족해요</p>
                )}
              </section>
            </div>

            {/* Google Trends 그래프 */}
            {data.trends.points.length > 0 && (
              <section className="subpanel" style={{ padding: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>
                    <TrendingUp size={14} style={{ marginRight: 6, verticalAlign: "middle" }} />
                    Google Trends — 30일 관심도
                  </p>
                  <div style={{ display: "flex", gap: 12, fontSize: 12, color: "var(--text-tertiary)" }}>
                    <span>평균 {data.trends.avg}</span>
                    <span>피크 {data.trends.peak} ({data.trends.peak_date})</span>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={data.trends.points}>
                    <defs>
                      <linearGradient id="buzzGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3182f6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#3182f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={d => d.slice(5)} />
                    <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} />
                    <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid var(--border-light)", fontSize: 12 }} />
                    <Area type="monotone" dataKey="value" stroke="#3182f6" fill="url(#buzzGrad)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </section>
            )}

            {/* 플랫폼별 상세 */}
            <div className="card-grid-2">
              {/* Reddit */}
              <section className="subpanel" style={{ padding: 20 }}>
                <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
                  <MessageCircle size={14} style={{ marginRight: 6, verticalAlign: "middle" }} />
                  Reddit — 최근 7일
                </p>
                {data.reddit.top_subreddits.length > 0 && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                    {data.reddit.top_subreddits.map(s => (
                      <span key={s.name} className="label-badge">r/{s.name} ({s.count})</span>
                    ))}
                  </div>
                )}
                <div style={{ display: "grid", gap: 6, maxHeight: 300, overflow: "auto" }}>
                  {data.reddit.posts.slice(0, 8).map((p, i) => (
                    <a key={i} href={p.url} target="_blank" rel="noreferrer"
                      style={{ display: "block", padding: "8px 0", borderBottom: "1px solid var(--border-light)", textDecoration: "none", color: "inherit" }}>
                      <p style={{ fontSize: 13, margin: 0, lineHeight: 1.4 }}>{p.title}</p>
                      <span style={{ fontSize: 11, color: "var(--text-disabled)" }}>
                        r/{p.subreddit} · ↑{p.score} · {p.comments}댓글
                      </span>
                    </a>
                  ))}
                  {data.reddit.posts.length === 0 && <p style={{ color: "var(--text-disabled)", fontSize: 13 }}>최근 Reddit 언급 없음</p>}
                </div>
              </section>

              {/* 뉴스 */}
              <section className="subpanel" style={{ padding: 20 }}>
                <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
                  <Newspaper size={14} style={{ marginRight: 6, verticalAlign: "middle" }} />
                  뉴스
                </p>
                <div style={{ display: "grid", gap: 6, maxHeight: 300, overflow: "auto" }}>
                  {data.news.articles.slice(0, 8).map((a, i) => (
                    <a key={i} href={a.url} target="_blank" rel="noreferrer"
                      style={{ display: "block", padding: "8px 0", borderBottom: "1px solid var(--border-light)", textDecoration: "none", color: "inherit" }}>
                      <p style={{ fontSize: 13, margin: 0, lineHeight: 1.4 }}>{a.title}</p>
                      <span style={{ fontSize: 11, color: "var(--text-disabled)" }}>{a.source} · {a.published}</span>
                    </a>
                  ))}
                  {data.news.articles.length === 0 && <p style={{ color: "var(--text-disabled)", fontSize: 13 }}>최근 뉴스 없음</p>}
                </div>
              </section>
            </div>

            {/* YouTube */}
            <section className="subpanel" style={{ padding: 20 }}>
              <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
                <PlayCircle size={14} style={{ marginRight: 6, verticalAlign: "middle", color: "#ff0000" }} />
                YouTube — 최신 영상
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10 }}>
                {data.youtube.videos.slice(0, 6).map((v, i) => (
                  <a key={i} href={v.url} target="_blank" rel="noreferrer"
                    style={{ display: "block", padding: 12, border: "1px solid var(--border-light)", borderRadius: 10, textDecoration: "none", color: "inherit", transition: "background 0.1s" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "var(--bg)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                    <p style={{ fontSize: 13, margin: "0 0 4px", lineHeight: 1.4, fontWeight: 500 }}>{v.title}</p>
                    <span style={{ fontSize: 11, color: "var(--text-disabled)" }}>{v.channel} · {v.views} · {v.published}</span>
                  </a>
                ))}
              </div>
              {data.youtube.videos.length === 0 && <p style={{ color: "var(--text-disabled)", fontSize: 13 }}>최근 영상 없음</p>}
            </section>

            {/* 아티스트 비교 */}
            <section className="subpanel" style={{ padding: 20 }}>
              <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>아티스트 버즈 비교</p>
              <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                <input
                  value={compareInput} onChange={e => setCompareInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && loadCompare()}
                  placeholder="비교할 아티스트 (쉼표 구분: NewJeans,aespa,IVE)"
                  style={{ flex: 1, padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13 }}
                />
                <button className="btn btn-outline btn-sm" onClick={loadCompare} disabled={!compareInput.trim()}>비교</button>
              </div>
              {compareData.length > 0 && (
                <ResponsiveContainer width="100%" height={Math.max(160, compareData.length * 50)}>
                  <BarChart data={compareData} layout="vertical" margin={{ left: 10 }}>
                    <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="artist" width={80} tick={{ fontSize: 12 }} />
                    <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid var(--border-light)", fontSize: 12 }} />
                    <Bar dataKey="score" name="버즈 스코어" barSize={20} radius={[0, 6, 6, 0]}>
                      {compareData.map((d, i) => <Cell key={i} fill={scoreColor(d.score)} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </section>
          </div>
        )}

        {!data && !loading && (
          <div style={{ textAlign: "center", padding: 80, color: "var(--text-disabled)" }}>
            <Activity size={40} />
            <p style={{ marginTop: 16, fontSize: 15 }}>아티스트를 검색하면 실시간 팬덤 버즈를 분석합니다</p>
            <p style={{ fontSize: 13 }}>Google Trends, Reddit, 뉴스, YouTube에서 데이터를 수집해요</p>
          </div>
        )}
      </div>
    </div>
  );
}

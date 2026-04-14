import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Edit2, ExternalLink, Music, Users, Star, TrendingUp, MessageCircle, Newspaper, PlayCircle, ListMusic, Activity } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Nav } from "./Artists";

interface ArtistFull {
  id: number; name: string; stage_name: string | null;
  artist_type: string; genre: string; sub_genre: string;
  country: string; market: string; status: string;
  bio: string; notes: string; photo_url: string | null;
  label: string; tags: string[];
  spotify_id: string; youtube_id: string;
  instagram_handle: string; tiktok_handle: string;
  signed_date: string | null; contract_end: string | null;
  track_count: number; project_count: number;
}

interface Metric {
  date: string; spotify_listeners: number | null;
  spotify_followers: number | null; instagram: number | null;
  tiktok: number | null;
}

export default function ArtistDetail() {
  const nav = useNavigate();
  const { id } = useParams();
  const [artist, setArtist] = useState<ArtistFull | null>(null);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Partial<ArtistFull>>({});
  const [news, setNews] = useState<Array<{title: string; link: string; source: string; date: string; description: string}>>([]);
  const [crawlLoading, setCrawlLoading] = useState(false);
  const [buzz, setBuzz] = useState<any>(null);
  const [buzzLoading, setBuzzLoading] = useState(false);
  const [playlists, setPlaylists] = useState<any>(null);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/artists/${id}`).then(r => r.json()).then(d => { setArtist(d); setForm(d); });
    fetch(`/api/artists/${id}/metrics`).then(r => r.json()).then(setMetrics);
  }, [id]);

  useEffect(() => {
    if (!artist) return;
    const q = artist.stage_name || artist.name;
    setCrawlLoading(true);
    setBuzzLoading(true);

    // 뉴스 크롤링
    const newsQuery = `${q} ${artist.genre || ''} ${artist.artist_type === 'group' ? '그룹' : artist.artist_type === 'solo' ? '가수' : ''}`.trim();
    fetch(`/api/crawl/naver-news?query=${encodeURIComponent(newsQuery)}&count=8`)
      .then(r => r.json())
      .then(d => { setNews(d.articles || []); setCrawlLoading(false); })
      .catch(() => setCrawlLoading(false));

    // 버즈 데이터 (X, Reddit, YouTube, Trends)
    fetch(`/api/buzz/${encodeURIComponent(q)}`)
      .then(r => r.json())
      .then(d => { setBuzz(d); setBuzzLoading(false); })
      .catch(() => setBuzzLoading(false));

    // 플레이리스트 배치
    fetch(`/api/playlists/scan/${encodeURIComponent(q)}`)
      .then(r => r.json())
      .then(setPlaylists)
      .catch(() => {});
  }, [artist]);

  const handleSave = async () => {
    await fetch(`/api/artists/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const r = await fetch(`/api/artists/${id}`);
    setArtist(await r.json());
    setEditing(false);
  };

  if (!artist) return <div className="page-shell"><Nav nav={nav} active="artists" /><div className="page-content"><p>불러오는 중...</p></div></div>;

  const displayName = artist.stage_name || artist.name;
  const isRoster = artist.tags?.includes("signed");

  return (
    <div className="page-shell">
      <Nav nav={nav} active="artists" />
      <div className="page-content">
        {/* Back + Header */}
        <button className="btn btn-ghost btn-sm" onClick={() => nav("/artists")} style={{ marginBottom: 16 }}>
          <ArrowLeft size={16} /> 아티스트 목록
        </button>

        <div style={{ display: "flex", gap: 20, marginBottom: 28, alignItems: "flex-start" }}>
          <div className="artist-avatar" style={{ width: 80, height: 80, borderRadius: 20, fontSize: 28 }}>
            {artist.photo_url ? <img src={artist.photo_url} alt="" /> : <Users size={32} />}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
              <h1 style={{ margin: 0, fontSize: 24 }}>{displayName}</h1>
              <span className={`status-badge status-${artist.status}`}>{artist.status}</span>
            </div>
            <p className="text-muted" style={{ margin: 0 }}>
              {artist.genre || "장르 미지정"} · {artist.market?.toUpperCase()} · {artist.artist_type}
              {artist.label && ` · ${artist.label}`}
            </p>
          </div>
          <button className="btn btn-outline btn-sm" onClick={() => setEditing(!editing)}>
            <Edit2 size={14} /> {editing ? "취소" : "수정"}
          </button>
        </div>

        {/* KPI Cards */}
        <div className="kpi-grid" style={{ marginBottom: 24 }}>
          <div className="kpi-card">
            <Activity size={20} className="kpi-icon" style={{ color: buzz?.score >= 50 ? "#22c55e" : "#3182f6" }} />
            <div><span>버즈 스코어</span><strong>{buzz?.score ?? "..."}</strong></div>
          </div>
          <div className="kpi-card">
            <Newspaper size={20} className="kpi-icon" style={{ color: "#3182f6" }} />
            <div><span>최신 뉴스</span><strong>{news.length}건</strong></div>
          </div>
          <div className="kpi-card">
            <ListMusic size={20} className="kpi-icon" style={{ color: "#8b5cf6" }} />
            <div><span>플레이리스트</span><strong>{playlists?.count ?? "..."}</strong></div>
          </div>
          <div className="kpi-card">
            <MessageCircle size={20} className="kpi-icon" style={{ color: "#1da1f2" }} />
            <div><span>X 트윗</span><strong>{buzz?.x?.count ?? "..."}</strong></div>
          </div>
        </div>

        {/* Edit Form or Info */}
        {editing ? (
          <div className="chart-card" style={{ marginBottom: 24 }}>
            <p className="chart-title">프로파일 수정</p>
            <div className="form-row">
              <div className="form-group"><label>이름</label><input value={form.name || ""} onChange={e => setForm({...form, name: e.target.value})} /></div>
              <div className="form-group"><label>활동명</label><input value={form.stage_name || ""} onChange={e => setForm({...form, stage_name: e.target.value})} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>장르</label><input value={form.genre || ""} onChange={e => setForm({...form, genre: e.target.value})} /></div>
              <div className="form-group"><label>레이블</label><input value={form.label || ""} onChange={e => setForm({...form, label: e.target.value})} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Instagram</label><input value={form.instagram_handle || ""} onChange={e => setForm({...form, instagram_handle: e.target.value})} /></div>
              <div className="form-group"><label>TikTok</label><input value={form.tiktok_handle || ""} onChange={e => setForm({...form, tiktok_handle: e.target.value})} /></div>
            </div>
            <div className="form-group"><label>소개</label><textarea value={form.bio || ""} onChange={e => setForm({...form, bio: e.target.value})} rows={3} /></div>
            <div className="form-group"><label>메모</label><textarea value={form.notes || ""} onChange={e => setForm({...form, notes: e.target.value})} rows={2} /></div>
            <button className="btn btn-primary" onClick={handleSave}>저장</button>
          </div>
        ) : (
          <div className="card-grid-2" style={{ marginBottom: 24 }}>
            <div className="chart-card">
              <p className="chart-title">소개</p>
              <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.7 }}>{artist.bio || "소개가 없어요. 수정 버튼을 눌러 추가하세요."}</p>
            </div>
            <div className="chart-card">
              <p className="chart-title">SNS & 플랫폼</p>
              <div style={{ display: "grid", gap: 8 }}>
                {[
                  { label: "Instagram", value: artist.instagram_handle, url: artist.instagram_handle ? `https://instagram.com/${artist.instagram_handle}` : null },
                  { label: "TikTok", value: artist.tiktok_handle, url: artist.tiktok_handle ? `https://tiktok.com/@${artist.tiktok_handle}` : null },
                  { label: "Spotify", value: artist.spotify_id ? "연동됨" : "미연동", url: artist.spotify_id ? `https://open.spotify.com/artist/${artist.spotify_id}` : null },
                  { label: "YouTube", value: artist.youtube_id || "미연동", url: artist.youtube_id ? `https://youtube.com/channel/${artist.youtube_id}` : null },
                ].map(s => (
                  <div key={s.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--border-light)" }}>
                    <span style={{ fontSize: 13, color: "var(--text-tertiary)" }}>{s.label}</span>
                    {s.url ? (
                      <a href={s.url} target="_blank" rel="noreferrer" style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 4 }}>
                        {s.value} <ExternalLink size={12} />
                      </a>
                    ) : (
                      <span style={{ fontSize: 13, color: "var(--text-disabled)" }}>{s.value || "—"}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Metrics Chart */}
        {metrics.length > 0 && (
          <div className="chart-card" style={{ marginBottom: 24 }}>
            <p className="chart-title">메트릭 추이</p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={metrics.slice().reverse()}>
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #eee" }} />
                <Bar dataKey="spotify_listeners" fill="#1db954" name="Spotify 리스너" radius={[4,4,0,0]} barSize={16} />
                <Bar dataKey="instagram" fill="#e1306c" name="Instagram" radius={[4,4,0,0]} barSize={16} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Notes */}
        {/* 최신 뉴스 */}
        {news.length > 0 && (
          <div className="chart-card" style={{ marginBottom: 24 }}>
            <p className="chart-title">최신 뉴스</p>
            <div style={{ display: "grid", gap: 4 }}>
              {news.map((n, i) => (
                <a key={i} href={n.link} target="_blank" rel="noreferrer"
                  style={{
                    display: "grid", gridTemplateColumns: "1fr auto", gap: 8,
                    padding: "12px 4px", borderBottom: i < news.length - 1 ? "1px solid var(--border-light)" : "none",
                    textDecoration: "none", color: "inherit", borderRadius: 6,
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = "var(--bg)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  <div>
                    <strong style={{ fontSize: 13, display: "block", marginBottom: 4, lineHeight: 1.4 }}>{n.title}</strong>
                    {n.description && <p style={{ fontSize: 12, color: "var(--text-tertiary)", margin: 0, lineHeight: 1.5 }}>{n.description.slice(0, 100)}...</p>}
                  </div>
                  <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    {n.source && <span style={{ fontSize: 11, color: "var(--text-disabled)", display: "block" }}>{n.source}</span>}
                    {n.date && <span style={{ fontSize: 11, color: "var(--text-disabled)" }}>{n.date}</span>}
                  </div>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* 버즈 요약 */}
        {buzz?.summary && (
          <div className="chart-card" style={{ marginBottom: 24, borderLeft: "3px solid #1da1f2" }}>
            <p className="chart-title">팬덤 버즈 요약</p>
            <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.8 }}>{buzz.summary}</p>
          </div>
        )}

        {/* X 트윗 + Reddit */}
        <div className="card-grid-2" style={{ marginBottom: 24 }}>
          {/* X 트윗 */}
          {buzz?.x?.available && (
            <div className="chart-card">
              <p className="chart-title">X (트위터) 실시간</p>
              {buzz.x.source === "gemini" && buzz.x.hashtags?.length > 0 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                  {buzz.x.hashtags.map((h: string, i: number) => (
                    <span key={i} className="status-badge status-active" style={{ fontSize: 10 }}>{h}</span>
                  ))}
                </div>
              )}
              {buzz.x.source === "gemini" && buzz.x.summary && (
                <p style={{ fontSize: 13, lineHeight: 1.7, color: "var(--text-secondary)" }}>{buzz.x.summary}</p>
              )}
              {buzz.x.source === "x_live" && buzz.x.tweets?.slice(0, 5).map((t: any, i: number) => (
                <a key={i} href={t.url} target="_blank" rel="noreferrer"
                  style={{ display: "block", padding: "8px 0", borderBottom: "1px solid var(--border-light)", textDecoration: "none", color: "inherit" }}>
                  <p style={{ fontSize: 13, margin: "0 0 2px" }}>{t.text?.slice(0, 100)}</p>
                  <span style={{ fontSize: 11, color: "var(--text-disabled)" }}>{t.user} · ♡{t.likes} ↻{t.retweets}</span>
                </a>
              ))}
              {buzz.x.trending_topics?.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <p style={{ fontSize: 11, color: "var(--text-disabled)", marginBottom: 4 }}>화제 토픽</p>
                  {buzz.x.trending_topics.map((t: string, i: number) => (
                    <p key={i} style={{ fontSize: 12, margin: "2px 0", paddingLeft: 8, borderLeft: "2px solid var(--blue)" }}>{t}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Reddit */}
          {buzz?.reddit?.posts?.length > 0 && (
            <div className="chart-card">
              <p className="chart-title">Reddit</p>
              {buzz.reddit.top_subreddits?.length > 0 && (
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
                  {buzz.reddit.top_subreddits.map((s: any) => (
                    <span key={s.name} className="label-badge" style={{ fontSize: 10 }}>r/{s.name}</span>
                  ))}
                </div>
              )}
              {buzz.reddit.posts.slice(0, 5).map((p: any, i: number) => (
                <a key={i} href={p.url} target="_blank" rel="noreferrer"
                  style={{ display: "block", padding: "6px 0", borderBottom: "1px solid var(--border-light)", textDecoration: "none", color: "inherit" }}>
                  <p style={{ fontSize: 13, margin: 0, lineHeight: 1.4 }}>{p.title?.slice(0, 80)}</p>
                  <span style={{ fontSize: 11, color: "var(--text-disabled)" }}>↑{p.score} · {p.comments}댓글</span>
                </a>
              ))}
            </div>
          )}
        </div>

        {/* 플레이리스트 배치 */}
        {playlists?.placements?.length > 0 && (
          <div className="chart-card" style={{ marginBottom: 24 }}>
            <p className="chart-title">Spotify 플레이리스트 배치 ({playlists.count}개)</p>
            <div style={{ display: "grid", gap: 6 }}>
              {playlists.placements.map((p: any, i: number) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--border-light)" }}>
                  <div>
                    <strong style={{ fontSize: 13 }}>{p.playlist_name}</strong>
                    <span style={{ fontSize: 12, color: "var(--text-tertiary)", marginLeft: 8 }}>{p.track}</span>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: "var(--text-disabled)" }}>#{p.position}</span>
                    <span className={`status-badge ${p.type === "editorial" ? "status-active" : "status-discovered"}`} style={{ fontSize: 10 }}>
                      {p.type === "editorial" ? "에디토리얼" : "차트"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* YouTube */}
        {buzz?.youtube?.videos?.length > 0 && (
          <div className="chart-card" style={{ marginBottom: 24 }}>
            <p className="chart-title">YouTube 최신 영상</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {buzz.youtube.videos.slice(0, 4).map((v: any, i: number) => (
                <a key={i} href={v.url} target="_blank" rel="noreferrer"
                  style={{ display: "block", padding: 10, border: "1px solid var(--border-light)", borderRadius: 8, textDecoration: "none", color: "inherit" }}>
                  <p style={{ fontSize: 13, margin: "0 0 4px", fontWeight: 500, lineHeight: 1.4 }}>{v.title?.slice(0, 50)}</p>
                  <span style={{ fontSize: 11, color: "var(--text-disabled)" }}>{v.channel} · {v.views}</span>
                </a>
              ))}
            </div>
          </div>
        )}

        {(crawlLoading || buzzLoading) && (
          <div style={{ textAlign: "center", padding: 20, color: "var(--text-disabled)" }}>
            <div className="loading-orb" style={{ margin: "0 auto 12px" }} />
            정보 수집 중...
          </div>
        )}

        {artist.notes && (
          <div className="chart-card">
            <p className="chart-title">메모</p>
            <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{artist.notes}</p>
          </div>
        )}
      </div>
    </div>
  );
}

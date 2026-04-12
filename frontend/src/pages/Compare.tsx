import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, X, Users } from "lucide-react";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { Nav } from "./Artists";

interface Artist {
  id: number; name: string; stage_name: string | null;
  genre: string; market: string; label: string;
  photo_url: string | null; tags: string[];
  spotify_id: string; instagram_handle: string; tiktok_handle: string;
  bio: string;
}

interface NewsItem {
  title: string; link: string; source: string; date: string;
}

interface ArtistData {
  artist: Artist;
  news: NewsItem[];
  newsCount: number;
}

const COLORS = ["#3182f6", "#f04452", "#00c471", "#8b5cf6", "#ffc533"];

export default function ComparePage() {
  const nav = useNavigate();
  const [allArtists, setAllArtists] = useState<Artist[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [data, setData] = useState<ArtistData[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/artists?limit=100").then(r => r.json()).then(d => setAllArtists(d.items));
  }, []);

  const addArtist = (id: number) => {
    if (selected.includes(id) || selected.length >= 5) return;
    setSelected([...selected, id]);
  };

  const removeArtist = (id: number) => {
    setSelected(selected.filter(s => s !== id));
    setData(data.filter(d => d.artist.id !== id));
  };

  const loadData = async () => {
    setLoading(true);
    const results: ArtistData[] = [];

    for (const id of selected) {
      const [artistRes, newsRes] = await Promise.all([
        fetch(`/api/artists/${id}`).then(r => r.json()),
        fetch(`/api/crawl/naver-news?query=${encodeURIComponent(allArtists.find(a => a.id === id)?.stage_name || allArtists.find(a => a.id === id)?.name || "")}&count=5`).then(r => r.json()),
      ]);
      results.push({
        artist: artistRes,
        news: newsRes.articles || [],
        newsCount: newsRes.count || 0,
      });
    }

    setData(results);
    setLoading(false);
  };

  useEffect(() => {
    if (selected.length >= 2) loadData();
  }, [selected]);

  // 비교 데이터 생성
  const compareCards = data.map((d, i) => ({
    name: d.artist.stage_name || d.artist.name,
    color: COLORS[i % COLORS.length],
    genre: d.artist.genre,
    market: d.artist.market?.toUpperCase(),
    label: d.artist.label,
    photo: d.artist.photo_url,
    newsCount: d.newsCount,
    hasSns: [d.artist.spotify_id, d.artist.instagram_handle, d.artist.tiktok_handle].filter(Boolean).length,
    bio: d.artist.bio?.slice(0, 80),
  }));

  // SNS 연동 비교 차트
  const snsData = data.map((d, i) => ({
    name: d.artist.stage_name || d.artist.name,
    spotify: d.artist.spotify_id ? 1 : 0,
    instagram: d.artist.instagram_handle ? 1 : 0,
    tiktok: d.artist.tiktok_handle ? 1 : 0,
    fill: COLORS[i % COLORS.length],
  }));

  // 뉴스 비교
  const newsCompare = data.map((d, i) => ({
    name: d.artist.stage_name || d.artist.name,
    count: d.newsCount,
    fill: COLORS[i % COLORS.length],
  }));

  return (
    <div className="page-shell">
      <Nav nav={nav} active="compare" />
      <div className="page-content">
        <div className="page-header">
          <div>
            <h1>아티스트 비교</h1>
            <p className="text-muted">아티스트 간 프로파일 · 뉴스 · 포지셔닝 비교</p>
          </div>
        </div>

        {/* Artist Selector */}
        <div className="chart-card" style={{ marginBottom: 20 }}>
          <p className="chart-title">비교할 아티스트 선택 (최대 5명)</p>
          <div className="chip-bar" style={{ flexWrap: "wrap" }}>
            {allArtists.map(a => {
              const isSelected = selected.includes(a.id);
              const idx = selected.indexOf(a.id);
              return (
                <button key={a.id}
                  className={`chip${isSelected ? " chip-active" : ""}`}
                  style={isSelected ? { borderColor: COLORS[idx % COLORS.length], background: COLORS[idx % COLORS.length] + "15" } : {}}
                  onClick={() => isSelected ? removeArtist(a.id) : addArtist(a.id)}
                >
                  {a.photo_url && <img src={a.photo_url} alt="" style={{ width: 20, height: 20, borderRadius: 6, objectFit: "cover" }} />}
                  {a.stage_name || a.name}
                  {isSelected && <X size={12} />}
                </button>
              );
            })}
          </div>
          {selected.length < 2 && <p style={{ fontSize: 12, color: "var(--text-disabled)", marginTop: 8 }}>2명 이상 선택하면 비교가 시작돼요</p>}
        </div>

        {loading && (
          <div style={{ textAlign: "center", padding: 40, color: "var(--text-disabled)" }}>
            <div className="loading-orb" style={{ margin: "0 auto 12px" }} />데이터 수집 중...
          </div>
        )}

        {data.length >= 2 && !loading && (
          <div className="stack">
            {/* Profile Cards */}
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${data.length}, 1fr)`, gap: 12 }}>
              {compareCards.map((c, i) => (
                <div key={c.name} className="chart-card" style={{ textAlign: "center", borderTop: `3px solid ${c.color}` }}>
                  {c.photo && <img src={c.photo} alt="" style={{ width: 64, height: 64, borderRadius: 16, objectFit: "cover", margin: "0 auto 10px", display: "block" }} />}
                  <strong style={{ fontSize: 15 }}>{c.name}</strong>
                  <p style={{ fontSize: 12, color: "var(--text-tertiary)", margin: "4px 0" }}>{c.genre} · {c.market} · {c.label}</p>
                  <div style={{ display: "flex", justifyContent: "center", gap: 16, marginTop: 10 }}>
                    <div><span style={{ fontSize: 11, color: "var(--text-disabled)", display: "block" }}>뉴스</span><strong>{c.newsCount}</strong></div>
                    <div><span style={{ fontSize: 11, color: "var(--text-disabled)", display: "block" }}>SNS</span><strong>{c.hasSns}/3</strong></div>
                  </div>
                </div>
              ))}
            </div>

            {/* News Count Bar */}
            <div className="chart-card">
              <p className="chart-title">최근 뉴스 노출 비교</p>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={newsCompare}>
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" name="뉴스 수" radius={[6, 6, 0, 0]} barSize={40}>
                    {newsCompare.map((d, i) => (
                      <rect key={d.name} fill={d.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Latest News Side by Side */}
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${data.length}, 1fr)`, gap: 12 }}>
              {data.map((d, i) => (
                <div key={d.artist.id} className="chart-card">
                  <p className="chart-title" style={{ color: COLORS[i % COLORS.length] }}>{d.artist.stage_name || d.artist.name} 최신 뉴스</p>
                  {d.news.length > 0 ? d.news.slice(0, 4).map((n, j) => (
                    <a key={j} href={n.link} target="_blank" rel="noreferrer" style={{
                      display: "block", padding: "8px 0",
                      borderBottom: j < 3 ? "1px solid var(--border-light)" : "none",
                      textDecoration: "none", color: "inherit",
                    }}>
                      <strong style={{ fontSize: 12, lineHeight: 1.4, display: "block" }}>{n.title}</strong>
                      <span style={{ fontSize: 11, color: "var(--text-disabled)" }}>{n.source} {n.date}</span>
                    </a>
                  )) : <p style={{ fontSize: 12, color: "var(--text-disabled)" }}>뉴스 없음</p>}
                </div>
              ))}
            </div>

            {/* Bio 비교 */}
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${data.length}, 1fr)`, gap: 12 }}>
              {data.map((d, i) => (
                <div key={d.artist.id} className="chart-card">
                  <p className="chart-title">소개</p>
                  <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6 }}>{d.artist.bio || "소개 없음"}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

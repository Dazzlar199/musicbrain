import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Calendar, Info, X, Clock } from "lucide-react";
import { Nav } from "./Artists";

interface WeekData {
  week_start: string; competition_score: number;
  label: string; reason: string; major_releases: string[];
}

interface TimingData {
  summary: string; best_window: string;
  weeks: WeekData[]; tips: string[];
  market: string; genre: string;
}

function scoreColor(s: number) {
  if (s <= 3) return "#22c55e";
  if (s <= 5) return "#3182f6";
  if (s <= 7) return "#eab308";
  return "#ef4444";
}

function scoreBg(s: number) {
  if (s <= 3) return "#22c55e15";
  if (s <= 5) return "#3182f615";
  if (s <= 7) return "#eab30815";
  return "#ef444415";
}

export default function ReleaseTiming() {
  const nav = useNavigate();
  const [market, setMarket] = useState("kr");
  const [genre, setGenre] = useState("");
  const [data, setData] = useState<TimingData | null>(null);
  const [loading, setLoading] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  const analyze = async () => {
    setLoading(true); setData(null);
    try {
      const r = await fetch(`/api/release-timing/analyze?market=${market}&genre=${encodeURIComponent(genre)}`);
      const d = await r.json();
      setData(d);
    } catch { }
    setLoading(false);
  };

  const markets = [
    { code: "kr", label: "한국" }, { code: "us", label: "미국" },
    { code: "jp", label: "일본" }, { code: "global", label: "글로벌" },
    { code: "sea", label: "동남아" }, { code: "europe", label: "유럽" },
  ];

  return (
    <div className="page-shell">
      <Nav nav={nav} active="timing" />
      <div className="page-content">
        <div className="page-header">
          <div>
            <h1>릴리스 타이밍</h1>
            <p className="text-muted">향후 8주 경쟁 밀도 분석 · 최적 발매 시점 추천</p>
          </div>
          <button onClick={() => setShowInfo(true)} style={{
            width: 28, height: 28, borderRadius: "50%", border: "1.5px solid var(--text-disabled)",
            background: "none", cursor: "pointer", color: "var(--text-disabled)",
            display: "grid", placeItems: "center",
          }}><Info size={14} /></button>
        </div>

        {/* 설정 */}
        <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <label style={{ fontSize: 12, color: "var(--text-disabled)", display: "block", marginBottom: 4 }}>타겟 시장</label>
            <div style={{ display: "flex", gap: 6 }}>
              {markets.map(m => (
                <button key={m.code} className={`chip${market === m.code ? " chip-active" : ""}`}
                  onClick={() => setMarket(m.code)}>{m.label}</button>
              ))}
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={{ fontSize: 12, color: "var(--text-disabled)", display: "block", marginBottom: 4 }}>장르 (선택)</label>
            <input value={genre} onChange={e => setGenre(e.target.value)}
              placeholder="K-pop, Hip-hop, R&B..."
              style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13 }} />
          </div>
          <div style={{ paddingTop: 18 }}>
            <button className="btn btn-primary" onClick={analyze} disabled={loading}>
              {loading ? "분석 중..." : "타이밍 분석"}
            </button>
          </div>
        </div>

        {loading && (
          <div style={{ textAlign: "center", padding: 60, color: "var(--text-disabled)" }}>
            <Calendar size={32} style={{ animation: "pulse 1.5s infinite" }} />
            <p style={{ marginTop: 12 }}>경쟁 상황을 분석하고 있어요...</p>
            <p style={{ fontSize: 12 }}>현재 차트 + 발매 스케줄 + 시즌 패턴을 종합합니다</p>
          </div>
        )}

        {data && !loading && (
          <div className="stack">
            {/* 요약 + 추천 */}
            <div className="card-grid-2">
              <section className="subpanel" style={{ padding: 20 }}>
                <p style={{ fontSize: 12, color: "var(--text-disabled)", marginBottom: 8 }}>현재 상황</p>
                <p style={{ fontSize: 14, lineHeight: 1.8, color: "var(--text-secondary)" }}>{data.summary}</p>
              </section>
              <section className="subpanel" style={{ padding: 20, borderLeft: "3px solid #22c55e" }}>
                <p style={{ fontSize: 12, color: "#22c55e", fontWeight: 600, marginBottom: 8 }}>추천 발매 시점</p>
                <p style={{ fontSize: 14, lineHeight: 1.8, color: "var(--text-secondary)" }}>{data.best_window}</p>
              </section>
            </div>

            {/* 8주 캘린더 */}
            <section className="subpanel" style={{ padding: 20 }}>
              <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 16 }}>
                <Clock size={14} style={{ marginRight: 6, verticalAlign: "middle" }} />
                향후 8주 경쟁 밀도
              </p>
              <div style={{ display: "grid", gap: 8 }}>
                {(data.weeks || []).map((w, i) => (
                  <div key={i} style={{
                    display: "grid", gridTemplateColumns: "100px 60px 1fr",
                    gap: 12, alignItems: "center", padding: 12, borderRadius: 10,
                    background: scoreBg(w.competition_score),
                    border: `1px solid ${scoreColor(w.competition_score)}20`,
                  }}>
                    <div>
                      <strong style={{ fontSize: 13 }}>{w.week_start?.slice(5)}</strong>
                      <p style={{ fontSize: 11, color: "var(--text-disabled)", margin: 0 }}>
                        {i === 0 ? "이번 주" : `${i + 1}주 후`}
                      </p>
                    </div>
                    <div style={{
                      width: 44, height: 44, borderRadius: 10,
                      background: scoreColor(w.competition_score),
                      color: "#fff", display: "grid", placeItems: "center",
                      fontSize: 18, fontWeight: 800,
                    }}>
                      {w.competition_score}
                    </div>
                    <div>
                      <p style={{ fontSize: 13, margin: "0 0 4px", fontWeight: 500 }}>{w.label}</p>
                      <p style={{ fontSize: 12, color: "var(--text-tertiary)", margin: 0 }}>{w.reason}</p>
                      {w.major_releases?.length > 0 && (
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
                          {w.major_releases.map((r, j) => (
                            <span key={j} className="label-badge" style={{ fontSize: 10 }}>{r}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* 전략 팁 */}
            {data.tips?.length > 0 && (
              <section className="subpanel" style={{ padding: 20 }}>
                <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>발매 전략 팁</p>
                <div style={{ display: "grid", gap: 8 }}>
                  {data.tips.map((tip, i) => (
                    <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                      <span style={{
                        width: 22, height: 22, borderRadius: 6, background: "var(--blue-light)",
                        color: "var(--blue)", display: "grid", placeItems: "center",
                        fontSize: 11, fontWeight: 700, flexShrink: 0,
                      }}>{i + 1}</span>
                      <p style={{ fontSize: 13, lineHeight: 1.6, color: "var(--text-secondary)", margin: 0 }}>{tip}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        {!data && !loading && (
          <div style={{ textAlign: "center", padding: 80, color: "var(--text-disabled)" }}>
            <Calendar size={40} />
            <p style={{ marginTop: 16, fontSize: 15 }}>시장과 장르를 선택하고 분석을 시작하세요</p>
            <p style={{ fontSize: 13 }}>현재 차트 경쟁 상황 + 계절 패턴 + 발매 스케줄을 분석합니다</p>
          </div>
        )}

        {showInfo && (
          <div className="modal-overlay" onClick={() => setShowInfo(false)}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 440, padding: 24 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <h3 style={{ margin: 0 }}>릴리스 타이밍이란?</h3>
                <button onClick={() => setShowInfo(false)} style={{ border: "none", background: "none", cursor: "pointer" }}><X size={18} /></button>
              </div>
              <p style={{ fontSize: 13, lineHeight: 1.8, color: "var(--text-secondary)" }}>
                향후 8주의 <strong>경쟁 밀도</strong>를 분석해서 언제 곡을 발매하면 좋을지 추천합니다.
              </p>
              <div style={{ marginTop: 16, display: "grid", gap: 8 }}>
                {[
                  { score: "1-3", color: "#22c55e", text: "경쟁 낮음 — 발매 적합" },
                  { score: "4-5", color: "#3182f6", text: "보통 — 프로모션 강화 필요" },
                  { score: "6-7", color: "#eab308", text: "경쟁 높음 — 차별화 전략 필수" },
                  { score: "8-10", color: "#ef4444", text: "매우 치열 — 가능하면 피하기" },
                ].map(b => (
                  <div key={b.score} style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: b.color, color: "#fff", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 700 }}>{b.score}</div>
                    <span style={{ fontSize: 13 }}>{b.text}</span>
                  </div>
                ))}
              </div>
              <p style={{ fontSize: 13, lineHeight: 1.8, color: "var(--text-secondary)", marginTop: 16 }}>
                <strong>활용법:</strong> 경쟁 점수가 낮은 주에 발매하면 차트 진입 확률이 높아집니다.
                지금 엔터사들이 감으로 하는 발매일 결정을 데이터로 대체하세요.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

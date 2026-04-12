import { useArtist } from "../context";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Upload, CheckCircle2, XCircle, Clock, Music, BarChart3, Zap } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Nav } from "./Artists";

interface DemoItem {
  id: number; title: string; genre: string; status: string;
  bpm: number; key: string; mood: string;
  score: number; best_market: string; market_scores: Record<string, number>;
  viral_timestamp: string | null; notes: string; created_at: string; verdict: string;
}

interface DemoStats {
  total: number; pending: number; selected: number; passed: number; selection_rate: number;
}

interface SubmitResult {
  id: number; title: string; score: number; best_market: string;
  best_market_score: number; market_scores: Record<string, number>;
  analysis: Record<string, any>; viral_segment: Record<string, any>;
  similar_tracks: Array<any>; verdict: string;
}

const VERDICT_COLORS: Record<string, string> = {
  "강력 추천": "#00c471", "검토 가치 있음": "#3182f6",
  "조건부 가능": "#ffc533", "시장 부적합": "#f04452",
};

export default function Demos() {
  const nav = useNavigate();
  const [demos, setDemos] = useState<DemoItem[]>([]);
  const [stats, setStats] = useState<DemoStats | null>(null);
  const [tab, setTab] = useState<"review" | "submit">("review");
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<SubmitResult | null>(null);

  const load = async () => {
    const [dRes, sRes] = await Promise.all([fetch("/api/demos"), fetch("/api/demos/stats")]);
    setDemos((await dRes.json()).items);
    setStats(await sRes.json());
  };
  useEffect(() => { load(); }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true); setSubmitResult(null);
    const form = new FormData(e.currentTarget);
    try {
      const r = await fetch("/api/demos/submit", { method: "POST", body: form });
      const data = await r.json();
      if (r.ok) {
        setSubmitResult(data);
        load();
      } else {
        alert(data.detail || "제출 실패");
      }
    } catch { alert("서버 연결 실패"); }
    setSubmitting(false);
  };

  const [projectList, setProjectList] = useState<Array<{id: number; title: string}>>([]);

  useEffect(() => {
    fetch("/api/projects").then(r => r.json()).then(d => setProjectList(d.items));
  }, []);

  const handleSelect = async (demoId: number) => {
    // 프로젝트 선택
    const projectId = projectList.length > 0 ? projectList[0].id : 0;
    const fd = new FormData();
    fd.append("project_id", String(projectId));
    await fetch(`/api/demos/${demoId}/select`, { method: "POST", body: fd });
    load();
  };

  const handlePass = async (id: number) => {
    await fetch(`/api/demos/${id}/pass`, { method: "POST" });
    load();
  };

  return (
    <div className="page-shell">
      <Nav nav={nav} active="demos" />
      <div className="page-content">
        <div className="page-header">
          <div>
            <h1>데모 관리</h1>
            <p className="text-muted">데모 제출 · 자동 분석 · 선택/패스</p>
          </div>
        </div>

        {/* KPI */}
        {stats && (
          <div className="kpi-grid">
            <div className="kpi-card"><Clock size={20} className="kpi-icon" /><div><span>대기 중</span><strong>{stats.pending}</strong></div></div>
            <div className="kpi-card"><CheckCircle2 size={20} className="kpi-icon" style={{ color: "#00c471" }} /><div><span>선택됨</span><strong style={{ color: "#00c471" }}>{stats.selected}</strong></div></div>
            <div className="kpi-card"><XCircle size={20} className="kpi-icon" style={{ color: "#f04452" }} /><div><span>패스</span><strong>{stats.passed}</strong></div></div>
            <div className="kpi-card"><BarChart3 size={20} className="kpi-icon" style={{ color: "#3182f6" }} /><div><span>채택률</span><strong>{stats.selection_rate}%</strong></div></div>
          </div>
        )}

        {/* Tabs */}
        <div className="tabs" style={{ marginBottom: 20 }}>
          <button className={`tab-button${tab === "review" ? " is-active" : ""}`} onClick={() => setTab("review")}>A&R 리뷰</button>
          <button className={`tab-button${tab === "submit" ? " is-active" : ""}`} onClick={() => setTab("submit")}>곡 제출하기</button>
        </div>

        {/* Review Tab */}
        {tab === "review" && (
          <div className="stack">
            {demos.length === 0 ? (
              <div className="empty-card"><Music size={32} /><p>제출된 데모가 없어요. "곡 제출하기" 탭에서 곡을 올려보세요.</p></div>
            ) : demos.map(d => (
              <div key={d.id} className="chart-card" style={{ display: "grid", gap: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <strong style={{ fontSize: 15 }}>{d.title}</strong>
                    <p style={{ fontSize: 12, color: "var(--text-tertiary)", margin: "2px 0 0" }}>
                      {d.genre || "장르 미지정"} · {d.bpm ? `${Math.round(d.bpm)} BPM` : ""} · {d.key || ""} · {d.mood || ""}
                    </p>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <span style={{ fontSize: 24, fontWeight: 800, color: VERDICT_COLORS[d.verdict] || "var(--text-primary)" }}>{Math.round(d.score)}</span>
                    <p style={{ fontSize: 11, color: VERDICT_COLORS[d.verdict], fontWeight: 600, margin: 0 }}>{d.verdict}</p>
                  </div>
                </div>

                {/* Market scores bar */}
                {d.market_scores && Object.keys(d.market_scores).length > 0 && (
                  <ResponsiveContainer width="100%" height={100}>
                    <BarChart data={Object.entries(d.market_scores).sort((a,b) => b[1] - a[1]).slice(0, 6).map(([m, s]) => ({ market: m.toUpperCase(), score: Math.round(s) }))} layout="vertical">
                      <XAxis type="number" domain={[0, 100]} hide />
                      <YAxis type="category" dataKey="market" width={50} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="score" fill="#3182f6" radius={[0, 4, 4, 0]} barSize={12} />
                    </BarChart>
                  </ResponsiveContainer>
                )}

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", gap: 8, fontSize: 12, color: "var(--text-tertiary)" }}>
                    {d.viral_timestamp && <span><Zap size={12} /> 바이럴: {d.viral_timestamp}</span>}
                    <span>최적 시장: {d.best_market?.toUpperCase()}</span>
                    <span>{d.created_at?.split("T")[0]}</span>
                  </div>
                  {d.status === "demo" && (
                    <div style={{ display: "flex", gap: 6 }}>
                      <button className="btn btn-sm" style={{ background: "#00c471", color: "#fff", border: "none" }} onClick={() => handleSelect(d.id)}>
                        <CheckCircle2 size={14} /> 선택
                      </button>
                      <button className="btn btn-sm btn-outline" onClick={() => handlePass(d.id)}>
                        <XCircle size={14} /> 패스
                      </button>
                    </div>
                  )}
                  {d.status === "selected" && <span className="status-badge status-active">선택됨</span>}
                  {d.status === "passed" && <span className="status-badge status-passed">패스</span>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Submit Tab */}
        {tab === "submit" && (
          <div className="card-grid-2">
            <div className="chart-card">
              <p className="chart-title">곡 제출</p>
              <form onSubmit={handleSubmit} style={{ display: "grid", gap: 14 }}>
                <div className="form-group"><label>곡 제목 *</label><input name="title" required /></div>
                <div className="form-group"><label>아티스트/작곡가 이름 *</label><input name="artist_name" required /></div>
                <div className="form-row">
                  <div className="form-group"><label>장르</label><input name="genre" placeholder="K-pop, R&B 등" /></div>
                  <div className="form-group"><label>타겟 시장</label>
                    <select name="target_market">
                      {["kr","us","jp","br","latam","sea","europe","uk","mena","africa","india","china"].map(m => <option key={m} value={m}>{m.toUpperCase()}</option>)}
                    </select>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group"><label>제출자 이름</label><input name="submitter_name" /></div>
                  <div className="form-group"><label>이메일</label><input name="submitter_email" type="email" /></div>
                </div>
                <div className="form-group"><label>메모</label><textarea name="notes" rows={2} placeholder="곡 설명, 레퍼런스 등" /></div>
                <div className="form-group">
                  <label>오디오 파일 *</label>
                  <input name="file" type="file" accept=".mp3,.wav,.flac,audio/*" required style={{ padding: 10, border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg)" }} />
                </div>
                <button className="btn btn-primary" type="submit" disabled={submitting} style={{ width: "100%" }}>
                  {submitting ? "분석 중..." : "제출 + 자동 분석"}
                </button>
              </form>
            </div>

            {/* Result */}
            <div>
              {submitResult ? (
                <div className="chart-card" style={{ display: "grid", gap: 16 }}>
                  <p className="chart-title">분석 결과</p>
                  <div style={{ textAlign: "center" }}>
                    <strong style={{ fontSize: 48, fontWeight: 800, color: VERDICT_COLORS[submitResult.verdict] }}>{Math.round(submitResult.score)}</strong>
                    <p style={{ fontSize: 14, color: VERDICT_COLORS[submitResult.verdict], fontWeight: 600 }}>{submitResult.verdict}</p>
                    <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>최적 시장: {submitResult.best_market?.toUpperCase()} ({Math.round(submitResult.best_market_score)}점)</p>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
                    {[
                      ["템포", submitResult.analysis?.tempo?.bpm ? `${Math.round(submitResult.analysis.tempo.bpm)} BPM` : "—"],
                      ["키", submitResult.analysis?.key || "—"],
                      ["에너지", submitResult.analysis?.energy || "—"],
                      ["무드", submitResult.analysis?.mood || "—"],
                      ["댄서빌리티", submitResult.analysis?.danceability ? `${Math.round(submitResult.analysis.danceability * 100)}%` : "—"],
                      ["폴리시", submitResult.analysis?.polish ? `${submitResult.analysis.polish}/10` : "—"],
                    ].map(([label, value]) => (
                      <div key={label as string} className="mini-stat">
                        <span>{label}</span><strong>{value}</strong>
                      </div>
                    ))}
                  </div>

                  {submitResult.viral_segment?.timestamp && (
                    <div style={{ padding: 12, background: "var(--blue-bg)", borderRadius: 8, textAlign: "center" }}>
                      <span style={{ fontSize: 12, color: "var(--blue)" }}>바이럴 구간</span>
                      <strong style={{ display: "block", fontSize: 18, color: "var(--blue)" }}>{submitResult.viral_segment.timestamp}</strong>
                    </div>
                  )}

                  {submitResult.similar_tracks?.length > 0 && (
                    <div>
                      <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>비슷한 곡</span>
                      {submitResult.similar_tracks.slice(0, 3).map((t: any, i: number) => (
                        <p key={i} style={{ fontSize: 13, margin: "4px 0" }}>{t.artist} — {t.title} ({Math.round(t.similarity * 100)}%)</p>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="chart-card" style={{ display: "grid", placeItems: "center", minHeight: 300 }}>
                  <div style={{ textAlign: "center", color: "var(--text-disabled)" }}>
                    <Upload size={40} style={{ marginBottom: 12 }} />
                    <p>곡을 제출하면 여기에 분석 결과가 나와요</p>
                    <p style={{ fontSize: 12 }}>12개 시장 적합도 · 프로덕션 분석 · 바이럴 구간</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

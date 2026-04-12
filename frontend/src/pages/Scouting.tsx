import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, X, UserSearch, ChevronRight, Star } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Nav } from "./Artists";

interface Scout {
  id: number; artist_name: string; source: string; score: number | null;
  status: string; recommended_market: string | null; discovered_by: string | null;
  discovered_date: string | null;
}

interface Funnel {
  stages: string[]; counts: Record<string, number>; total: number;
}

const STAGE_LABELS: Record<string, string> = {
  discovered: "발굴", contacted: "컨택", auditioned: "오디션",
  negotiating: "협상 중", signed: "계약 완료", passed: "패스",
};
const STAGE_COLORS = ["#8b95a1", "#3182f6", "#8b5cf6", "#ffc533", "#00c471", "#f04452"];

export default function Scouting() {
  const nav = useNavigate();
  const [scouts, setScouts] = useState<Scout[]>([]);
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    artist_name: "", source: "tiktok", discovered_by: "",
    score: 5, vocal_score: 5, performance_score: 5, visual_score: 5,
    marketability_score: 5, uniqueness_score: 5,
    strengths: "", weaknesses: "", recommended_market: "kr", notes: "",
  });

  const load = async () => {
    const [sRes, fRes] = await Promise.all([fetch("/api/scouting"), fetch("/api/scouting/funnel")]);
    setScouts((await sRes.json()).items); setFunnel(await fRes.json());
  };
  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    await fetch("/api/scouting", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setShowForm(false); load();
  };

  const advanceScout = async (id: number) => {
    await fetch(`/api/scouting/${id}/advance`, { method: "POST" }); load();
  };

  const funnelData = funnel ? funnel.stages.map((s, i) => ({
    name: STAGE_LABELS[s] || s, value: funnel.counts[s] || 0, fill: STAGE_COLORS[i],
  })) : [];

  return (
    <div className="page-shell">
      <Nav nav={nav} active="scouting" />
      <div className="page-content">
        <div className="page-header">
          <div>
            <h1>A&R 스카우팅</h1>
            <p className="text-muted">발굴 → 컨택 → 오디션 → 협상 → 계약</p>
          </div>
          <button className="btn btn-primary" onClick={() => setShowForm(true)}><Plus size={16} /> 아티스트 발굴</button>
        </div>

        {/* Funnel Chart */}
        {funnel && funnel.total > 0 && (
          <div className="chart-card" style={{ marginBottom: 20 }}>
            <p className="chart-title">스카우팅 퍼널</p>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={funnelData}>
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="value" radius={[6,6,0,0]} barSize={36}>
                  {funnelData.map((d, i) => <Cell key={d.name} fill={d.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Scout Cards */}
        <div className="card-grid-3">
          {scouts.map(s => (
            <div key={s.id} className="scout-card">
              <div className="scout-header">
                <strong>{s.artist_name}</strong>
                <span className={`status-badge status-${s.status}`}>{STAGE_LABELS[s.status] || s.status}</span>
              </div>
              <div className="scout-meta">
                <span>소스: {s.source}</span>
                {s.recommended_market && <span>추천 시장: {s.recommended_market.toUpperCase()}</span>}
                {s.score && <span className="scout-score"><Star size={12} /> {s.score}/10</span>}
              </div>
              <div className="scout-actions">
                <button className="btn btn-sm btn-outline" onClick={() => advanceScout(s.id)}>
                  다음 단계 <ChevronRight size={14} />
                </button>
              </div>
            </div>
          ))}
          {scouts.length === 0 && <div className="empty-card"><UserSearch size={32} /><p>발굴된 아티스트가 없습니다</p></div>}
        </div>

        {showForm && (
          <div className="modal-overlay" onClick={() => setShowForm(false)}>
            <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
              <div className="modal-header"><h3>아티스트 발굴 등록</h3><button onClick={() => setShowForm(false)}><X size={18} /></button></div>
              <div className="modal-body">
                <div className="form-row">
                  <div className="form-group"><label>아티스트명 *</label><input value={form.artist_name} onChange={e => setForm({...form, artist_name: e.target.value})} /></div>
                  <div className="form-group"><label>발굴 소스</label>
                    <select value={form.source} onChange={e => setForm({...form, source: e.target.value})}>
                      {["tiktok","youtube","instagram","soundcloud","live","referral","competition"].map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="form-group"><label>발굴자</label><input value={form.discovered_by} onChange={e => setForm({...form, discovered_by: e.target.value})} /></div>
                </div>
                <p className="form-section-title">평가 점수 (1-10)</p>
                <div className="score-grid">
                  {[["종합", "score"], ["보컬", "vocal_score"], ["퍼포먼스", "performance_score"],
                    ["비주얼", "visual_score"], ["마케터빌리티", "marketability_score"], ["유니크", "uniqueness_score"]].map(([label, key]) => (
                    <div key={key} className="score-input">
                      <label>{label}</label>
                      <input type="range" min={1} max={10} value={(form as any)[key]} onChange={e => setForm({...form, [key]: Number(e.target.value)})} />
                      <strong>{(form as any)[key]}</strong>
                    </div>
                  ))}
                </div>
                <div className="form-row">
                  <div className="form-group"><label>강점</label><textarea value={form.strengths} onChange={e => setForm({...form, strengths: e.target.value})} rows={2} /></div>
                  <div className="form-group"><label>약점</label><textarea value={form.weaknesses} onChange={e => setForm({...form, weaknesses: e.target.value})} rows={2} /></div>
                </div>
                <div className="form-group"><label>추천 시장</label>
                  <select value={form.recommended_market} onChange={e => setForm({...form, recommended_market: e.target.value})}>
                    {["kr","us","jp","br","latam","sea","europe","uk","mena","africa","india","china"].map(m => <option key={m} value={m}>{m.toUpperCase()}</option>)}
                  </select>
                </div>
                <div className="form-group"><label>메모</label><textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} rows={2} /></div>
              </div>
              <div className="modal-footer"><button className="btn btn-primary" onClick={handleCreate} disabled={!form.artist_name}>등록</button></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

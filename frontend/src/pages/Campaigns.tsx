import { useArtist } from "../context";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, X, Megaphone, DollarSign, TrendingUp, Target } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Nav } from "./Artists";

interface Campaign {
  id: number; project_id: number; name: string; campaign_type: string;
  status: string; platform: string; target_market: string;
  start_date: string | null; end_date: string | null;
  budget: number | null; spent: number | null; roi: number | null;
}

interface Dashboard {
  total_campaigns: number; active: number; completed: number;
  total_budget: number; total_spent: number; budget_utilization: number;
  by_platform: Record<string, { count: number; budget: number; spent: number }>;
}

const COLORS = ["#3182f6", "#8b5cf6", "#00c471", "#ffc533", "#f04452", "#ff6b6b"];

export default function Campaigns() {
  const nav = useNavigate();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ project_id: 0, name: "", campaign_type: "pre_release", platform: "tiktok", target_market: "kr", budget: 0 });

  const load = async () => {
    const [cRes, dRes] = await Promise.all([fetch("/api/campaigns"), fetch("/api/campaigns/dashboard")]);
    setCampaigns((await cRes.json()).items); setDashboard(await dRes.json());
  };
  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    await fetch("/api/campaigns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setShowForm(false); load();
  };

  const platformData = dashboard ? Object.entries(dashboard.by_platform).map(([k, v], i) => ({
    name: k, budget: v.budget, spent: v.spent, count: v.count, fill: COLORS[i % COLORS.length],
  })) : [];

  return (
    <div className="page-shell">
      <Nav nav={nav} active="campaigns" />
      <div className="page-content">
        <div className="page-header">
          <div>
            <h1>마케팅 캠페인</h1>
            <p className="text-muted">플랫폼별 예산 · 집행 · ROI 관리</p>
          </div>
          <button className="btn btn-primary" onClick={() => setShowForm(true)}><Plus size={16} /> 새 캠페인</button>
        </div>

        {/* KPI Cards */}
        {dashboard && (
          <div className="kpi-grid">
            <div className="kpi-card">
              <Megaphone size={20} className="kpi-icon" />
              <div><span>전체 캠페인</span><strong>{dashboard.total_campaigns}</strong></div>
            </div>
            <div className="kpi-card">
              <Target size={20} className="kpi-icon" style={{ color: "#00c471" }} />
              <div><span>활성</span><strong style={{ color: "#00c471" }}>{dashboard.active}</strong></div>
            </div>
            <div className="kpi-card">
              <DollarSign size={20} className="kpi-icon" style={{ color: "#3182f6" }} />
              <div><span>총 예산</span><strong>₩{dashboard.total_budget.toLocaleString()}</strong></div>
            </div>
            <div className="kpi-card">
              <TrendingUp size={20} className="kpi-icon" style={{ color: "#8b5cf6" }} />
              <div><span>예산 집행률</span><strong>{dashboard.budget_utilization}%</strong></div>
            </div>
          </div>
        )}

        {/* Charts */}
        {platformData.length > 0 && (
          <div className="chart-grid-2">
            <div className="chart-card">
              <p className="chart-title">플랫폼별 예산</p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={platformData}>
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #eee" }} />
                  <Bar dataKey="budget" fill="#3182f6" name="예산" radius={[4,4,0,0]} barSize={24} />
                  <Bar dataKey="spent" fill="#8b5cf6" name="집행" radius={[4,4,0,0]} barSize={24} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="chart-card">
              <p className="chart-title">플랫폼 분포</p>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={platformData} dataKey="count" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} label={({ name, value }) => `${name} (${value})`}>
                    {platformData.map((d, i) => <Cell key={d.name} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Campaign List */}
        <div className="table-card">
          <table className="table">
            <thead><tr><th>캠페인</th><th>타입</th><th>플랫폼</th><th>시장</th><th>상태</th><th>예산</th><th>집행</th><th>ROI</th></tr></thead>
            <tbody>
              {campaigns.map(c => (
                <tr key={c.id}>
                  <td><strong>{c.name}</strong></td>
                  <td>{c.campaign_type}</td>
                  <td>{c.platform}</td>
                  <td>{c.target_market?.toUpperCase()}</td>
                  <td><span className={`status-badge status-${c.status}`}>{c.status}</span></td>
                  <td>₩{(c.budget || 0).toLocaleString()}</td>
                  <td>₩{(c.spent || 0).toLocaleString()}</td>
                  <td>{c.roi ? `${c.roi}x` : "—"}</td>
                </tr>
              ))}
              {campaigns.length === 0 && <tr><td colSpan={8} style={{ textAlign: "center", padding: 40, color: "#8b95a1" }}>캠페인을 추가하세요</td></tr>}
            </tbody>
          </table>
        </div>

        {showForm && (
          <div className="modal-overlay" onClick={() => setShowForm(false)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <div className="modal-header"><h3>새 캠페인</h3><button onClick={() => setShowForm(false)}><X size={18} /></button></div>
              <div className="modal-body">
                <div className="form-group"><label>캠페인명 *</label><input value={form.name} onChange={e => setForm({...form, name: e.target.value})} /></div>
                <div className="form-row">
                  <div className="form-group"><label>타입</label>
                    <select value={form.campaign_type} onChange={e => setForm({...form, campaign_type: e.target.value})}>
                      {["pre_release","release_day","post_release","playlist_push","influencer","paid_ads","pr","challenge"].map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="form-group"><label>플랫폼</label>
                    <select value={form.platform} onChange={e => setForm({...form, platform: e.target.value})}>
                      {["tiktok","instagram","youtube","spotify","melon","twitter","facebook"].map(p => <option key={p}>{p}</option>)}
                    </select>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group"><label>타겟 시장</label>
                    <select value={form.target_market} onChange={e => setForm({...form, target_market: e.target.value})}>
                      {["kr","us","jp","br","latam","sea","europe","uk","mena","africa","india","china"].map(m => <option key={m} value={m}>{m.toUpperCase()}</option>)}
                    </select>
                  </div>
                  <div className="form-group"><label>예산 (USD)</label><input type="number" value={form.budget} onChange={e => setForm({...form, budget: Number(e.target.value)})} /></div>
                </div>
              </div>
              <div className="modal-footer"><button className="btn btn-primary" onClick={handleCreate} disabled={!form.name}>생성</button></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

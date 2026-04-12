import { useArtist } from "../context";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, X, FileText, DollarSign, PieChart, Shield } from "lucide-react";
import { PieChart as RePie, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Nav } from "./Artists";

const COLORS = ["#3182f6", "#00c471", "#8b5cf6", "#ffc533", "#f04452", "#ff6b6b", "#00b8d9"];
const ROLES: Record<string, string> = { composer: "작곡", lyricist: "작사", arranger: "편곡", producer: "프로듀서", performer: "가수", publisher: "퍼블리셔" };

interface SplitSheet { id: number; track_title: string; status: string; allocated_pct: number; remaining_pct: number; entry_count: number; entries?: any[] }
interface ContractItem { id: number; title: string; contract_type: string; status: string; party_a: string; party_b: string; start_date: string; end_date: string; advance: number; royalty_rate: number; territory: string[] }
interface Dashboard { splits: number; contracts: number; active_contracts: number; total_revenue: number; total_royalty_paid: number; statements: number }

type Tab = "splits" | "contracts" | "royalties";

export default function Rights() {
  const nav = useNavigate();
  const [tab, setTab] = useState<Tab>("splits");
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [splits, setSplits] = useState<SplitSheet[]>([]);
  const [contracts, setContracts] = useState<ContractItem[]>([]);
  const [showSplitForm, setShowSplitForm] = useState(false);
  const [showContractForm, setShowContractForm] = useState(false);
  const [selectedSplit, setSelectedSplit] = useState<SplitSheet | null>(null);
  const [entryForm, setEntryForm] = useState({ name: "", role: "composer", share_pct: 0, publisher: "", email: "", pro: "" });

  const load = async () => {
    const [dRes, sRes, cRes] = await Promise.all([
      fetch("/api/rights/dashboard").then(r => r.json()),
      fetch("/api/rights/splits").then(r => r.json()),
      fetch("/api/rights/contracts").then(r => r.json()),
    ]);
    setDashboard(dRes); setSplits(sRes.items); setContracts(cRes.items);
  };
  useEffect(() => { load(); }, []);

  const createSplit = async (title: string) => {
    await fetch("/api/rights/splits", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ track_title: title }) });
    setShowSplitForm(false); load();
  };

  const addEntry = async () => {
    if (!selectedSplit) return;
    await fetch(`/api/rights/splits/${selectedSplit.id}/entries`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(entryForm) });
    setEntryForm({ name: "", role: "composer", share_pct: 0, publisher: "", email: "", pro: "" });
    // 새로고침
    const r = await fetch(`/api/rights/splits/${selectedSplit.id}`);
    setSelectedSplit(await r.json());
    load();
  };

  const createContract = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const data: any = {};
    fd.forEach((v, k) => { if (v) data[k] = k === "advance" || k === "royalty_rate" ? Number(v) : v; });
    await fetch("/api/rights/contracts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    setShowContractForm(false); load();
  };

  return (
    <div className="page-shell">
      <Nav nav={nav} active="rights" />
      <div className="page-content">
        <div className="page-header">
          <div>
            <h1>저작권 · 계약 · 정산</h1>
            <p className="text-muted">스플릿 시트 · 계약 · 로열티 정산</p>
          </div>
        </div>

        {/* KPI */}
        {dashboard && (
          <div className="kpi-grid">
            <div className="kpi-card"><PieChart size={20} className="kpi-icon" /><div><span>스플릿 시트</span><strong>{dashboard.splits}</strong></div></div>
            <div className="kpi-card"><FileText size={20} className="kpi-icon" style={{ color: "#3182f6" }} /><div><span>계약</span><strong>{dashboard.contracts}</strong></div></div>
            <div className="kpi-card"><Shield size={20} className="kpi-icon" style={{ color: "#00c471" }} /><div><span>유효 계약</span><strong style={{ color: "#00c471" }}>{dashboard.active_contracts}</strong></div></div>
            <div className="kpi-card"><DollarSign size={20} className="kpi-icon" style={{ color: "#ffc533" }} /><div><span>총 수익</span><strong>₩{(dashboard.total_revenue || 0).toLocaleString()}</strong></div></div>
          </div>
        )}

        <div className="tabs" style={{ marginBottom: 20 }}>
          <button className={`tab-button${tab === "splits" ? " is-active" : ""}`} onClick={() => setTab("splits")}>스플릿 시트</button>
          <button className={`tab-button${tab === "contracts" ? " is-active" : ""}`} onClick={() => setTab("contracts")}>계약 관리</button>
          <button className={`tab-button${tab === "royalties" ? " is-active" : ""}`} onClick={() => setTab("royalties")}>정산</button>
        </div>

        {/* ─── Splits ─── */}
        {tab === "splits" && (
          <div className="stack">
            <button className="btn btn-primary" onClick={() => setShowSplitForm(true)}><Plus size={16} /> 스플릿 시트 만들기</button>

            {selectedSplit ? (
              <div className="chart-card">
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
                  <div>
                    <strong style={{ fontSize: 17 }}>{selectedSplit.track_title}</strong>
                    <p className="text-muted">배분: {selectedSplit.allocated_pct}% / 남은 지분: {selectedSplit.remaining_pct}%</p>
                  </div>
                  <button className="btn btn-outline btn-sm" onClick={() => setSelectedSplit(null)}>목록으로</button>
                </div>

                {/* 파이 차트 */}
                {selectedSplit.entries && selectedSplit.entries.length > 0 && (
                  <ResponsiveContainer width="100%" height={200}>
                    <RePie>
                      <Pie data={[...selectedSplit.entries.map((e: any) => ({ name: e.name, value: e.share_pct })), ...(selectedSplit.remaining_pct > 0 ? [{ name: "미배분", value: selectedSplit.remaining_pct }] : [])]}
                        dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} label={({ name, value }) => `${name} ${value}%`}>
                        {selectedSplit.entries.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        {selectedSplit.remaining_pct > 0 && <Cell fill="#e5e8eb" />}
                      </Pie>
                      <Tooltip />
                    </RePie>
                  </ResponsiveContainer>
                )}

                {/* 엔트리 목록 */}
                <div style={{ marginTop: 16 }}>
                  {selectedSplit.entries?.map((e: any) => (
                    <div key={e.id} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid var(--border-light)" }}>
                      <div>
                        <strong style={{ fontSize: 14 }}>{e.name}</strong>
                        <span style={{ fontSize: 12, color: "var(--text-tertiary)", marginLeft: 8 }}>{ROLES[e.role] || e.role}{e.publisher ? ` · ${e.publisher}` : ""}{e.pro ? ` · ${e.pro}` : ""}</span>
                      </div>
                      <strong style={{ fontSize: 16, color: "var(--blue)" }}>{e.share_pct}%</strong>
                    </div>
                  ))}
                </div>

                {/* 엔트리 추가 폼 */}
                <div style={{ marginTop: 16, padding: 16, background: "var(--bg)", borderRadius: 12 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>권리자 추가</p>
                  <div className="form-row">
                    <div className="form-group"><label>이름 *</label><input value={entryForm.name} onChange={e => setEntryForm({...entryForm, name: e.target.value})} /></div>
                    <div className="form-group"><label>역할</label>
                      <select value={entryForm.role} onChange={e => setEntryForm({...entryForm, role: e.target.value})}>
                        {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </div>
                    <div className="form-group"><label>지분 (%)</label><input type="number" value={entryForm.share_pct} onChange={e => setEntryForm({...entryForm, share_pct: Number(e.target.value)})} /></div>
                  </div>
                  <div className="form-row">
                    <div className="form-group"><label>퍼블리셔</label><input value={entryForm.publisher} onChange={e => setEntryForm({...entryForm, publisher: e.target.value})} /></div>
                    <div className="form-group"><label>PRO (KOMCA 등)</label><input value={entryForm.pro} onChange={e => setEntryForm({...entryForm, pro: e.target.value})} /></div>
                    <div className="form-group"><label>이메일</label><input value={entryForm.email} onChange={e => setEntryForm({...entryForm, email: e.target.value})} /></div>
                  </div>
                  <button className="btn btn-primary btn-sm" onClick={addEntry} disabled={!entryForm.name || entryForm.share_pct <= 0}>추가</button>
                </div>
              </div>
            ) : (
              <div className="card-grid-2">
                {splits.map(s => (
                  <div key={s.id} className="chart-card" style={{ cursor: "pointer" }} onClick={async () => {
                    const r = await fetch(`/api/rights/splits/${s.id}`); setSelectedSplit(await r.json());
                  }}>
                    <strong>{s.track_title}</strong>
                    <p className="text-muted">{s.entry_count}명 · {s.allocated_pct}% 배분 · {s.remaining_pct}% 남음</p>
                    <div style={{ height: 6, background: "var(--bg)", borderRadius: 3, marginTop: 8, overflow: "hidden" }}>
                      <div style={{ width: `${s.allocated_pct}%`, height: "100%", background: "var(--blue)", borderRadius: 3 }} />
                    </div>
                  </div>
                ))}
                {splits.length === 0 && <div className="empty-card"><PieChart size={32} /><p>스플릿 시트를 만들어보세요</p></div>}
              </div>
            )}

            {showSplitForm && (
              <div className="modal-overlay" onClick={() => setShowSplitForm(false)}>
                <div className="modal" onClick={e => e.stopPropagation()}>
                  <div className="modal-header"><h3>스플릿 시트 만들기</h3><button onClick={() => setShowSplitForm(false)}><X size={18} /></button></div>
                  <div className="modal-body">
                    <div className="form-group"><label>곡 제목 *</label><input id="split-title" /></div>
                  </div>
                  <div className="modal-footer"><button className="btn btn-primary" onClick={() => createSplit((document.getElementById("split-title") as HTMLInputElement).value)}>만들기</button></div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── Contracts ─── */}
        {tab === "contracts" && (
          <div className="stack">
            <button className="btn btn-primary" onClick={() => setShowContractForm(true)}><Plus size={16} /> 계약 등록</button>
            <div className="table-card">
              <table className="table">
                <thead><tr><th>계약명</th><th>유형</th><th>상대방</th><th>기간</th><th>선급금</th><th>로열티</th><th>상태</th></tr></thead>
                <tbody>
                  {contracts.map(c => (
                    <tr key={c.id}>
                      <td><strong>{c.title}</strong></td>
                      <td>{c.contract_type}</td>
                      <td>{c.party_b}</td>
                      <td style={{ fontSize: 12 }}>{c.start_date} ~ {c.end_date}</td>
                      <td>{c.advance ? `₩${c.advance.toLocaleString()}` : "—"}</td>
                      <td>{c.royalty_rate ? `${c.royalty_rate}%` : "—"}</td>
                      <td><span className={`status-badge status-${c.status}`}>{c.status}</span></td>
                    </tr>
                  ))}
                  {contracts.length === 0 && <tr><td colSpan={7} style={{ textAlign: "center", padding: 40, color: "var(--text-disabled)" }}>계약을 등록하세요</td></tr>}
                </tbody>
              </table>
            </div>

            {showContractForm && (
              <div className="modal-overlay" onClick={() => setShowContractForm(false)}>
                <div className="modal" onClick={e => e.stopPropagation()}>
                  <div className="modal-header"><h3>계약 등록</h3><button onClick={() => setShowContractForm(false)}><X size={18} /></button></div>
                  <form onSubmit={createContract}>
                    <div className="modal-body">
                      <div className="form-group"><label>계약명 *</label><input name="title" required /></div>
                      <div className="form-row">
                        <div className="form-group"><label>유형</label>
                          <select name="contract_type">{["recording","publishing","management","distribution","sync","feature"].map(t => <option key={t}>{t}</option>)}</select>
                        </div>
                        <div className="form-group"><label>상대방</label><input name="party_b" /></div>
                      </div>
                      <div className="form-row">
                        <div className="form-group"><label>시작일</label><input name="start_date" type="date" /></div>
                        <div className="form-group"><label>종료일</label><input name="end_date" type="date" /></div>
                      </div>
                      <div className="form-row">
                        <div className="form-group"><label>선급금 (₩)</label><input name="advance" type="number" /></div>
                        <div className="form-group"><label>로열티율 (%)</label><input name="royalty_rate" type="number" step="0.1" /></div>
                      </div>
                    </div>
                    <div className="modal-footer"><button className="btn btn-primary" type="submit">등록</button></div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── Royalties ─── */}
        {tab === "royalties" && (
          <div className="empty-card" style={{ minHeight: 200 }}>
            <DollarSign size={32} />
            <p>정산 기능은 계약과 스플릿 시트를 먼저 등록하면 사용할 수 있어요.</p>
          </div>
        )}
      </div>
    </div>
  );
}

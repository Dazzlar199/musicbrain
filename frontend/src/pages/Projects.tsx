import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, X, FolderKanban } from "lucide-react";
import { Nav } from "./Artists";
import { useArtist } from "../context";

interface Project {
  id: number; title: string; project_type: string; status: string;
  target_market: string; target_release_date: string | null;
  budget: number | null; label: string;
}

const STAGE_LABELS: Record<string, string> = {
  planning: "기획", pre_production: "프리프로덕션", recording: "레코딩",
  mixing: "믹싱", mastering: "마스터링", quality_check: "QC",
  distribution: "유통", promotion: "프로모션", released: "릴리즈", tracking: "트래킹",
};
const STAGE_COLORS: Record<string, string> = {
  planning: "#8b95a1", pre_production: "#8b5cf6", recording: "#3182f6",
  mixing: "#00c471", mastering: "#ffc533", quality_check: "#f04452",
  distribution: "#ff6b6b", promotion: "#00c471", released: "#3182f6", tracking: "#8b5cf6",
};

export default function Projects() {
  const nav = useNavigate();
  const { current } = useArtist();
  const [projects, setProjects] = useState<Project[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", project_type: "single", target_market: "kr", concept: "" });

  useEffect(() => {
    fetch("/api/projects").then(r => r.json()).then(d => setProjects(d.items));
  }, [current]);

  const handleCreate = async () => {
    await fetch("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setShowForm(false);
    fetch("/api/projects").then(r => r.json()).then(d => setProjects(d.items));
  };

  const artistName = current?.stage_name || current?.name || "";

  return (
    <div className="page-shell">
      <Nav nav={nav} active="projects" />
      <div className="page-content">
        <div className="page-header">
          <div>
            <h1>{artistName ? `${artistName} 프로젝트` : "프로젝트"}</h1>
            <p className="text-muted">진행 중인 릴리즈를 관리하세요</p>
          </div>
          <button className="btn btn-primary" onClick={() => setShowForm(true)}><Plus size={16} /> 새 프로젝트</button>
        </div>

        {/* 프로젝트 목록 */}
        <div style={{ display: "grid", gap: 12 }}>
          {projects.map(p => (
            <div key={p.id} className="project-card" style={{ cursor: "pointer" }} onClick={() => nav(`/projects/${p.id}`)}>
              <div className="project-card-header">
                <div>
                  <strong>{p.title}</strong>
                  <p>{p.project_type} · {(p.target_market || "").toUpperCase()}</p>
                </div>
                <span className="status-badge" style={{ background: (STAGE_COLORS[p.status] || "#888") + "20", color: STAGE_COLORS[p.status] }}>
                  {STAGE_LABELS[p.status] || p.status}
                </span>
              </div>
              <div className="project-card-meta">
                {p.target_release_date && <span>릴리즈: {p.target_release_date}</span>}
                {p.budget && <span>예산: ₩{p.budget.toLocaleString()}</span>}
              </div>
            </div>
          ))}
          {projects.length === 0 && (
            <div className="empty-card"><FolderKanban size={32} /><p>{artistName}의 프로젝트가 아직 없어요</p></div>
          )}
        </div>

        {showForm && (
          <div className="modal-overlay" onClick={() => setShowForm(false)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <div className="modal-header"><h3>새 프로젝트</h3><button onClick={() => setShowForm(false)}><X size={18} /></button></div>
              <div className="modal-body">
                <div className="form-group"><label>프로젝트명</label><input value={form.title} onChange={e => setForm({...form, title: e.target.value})} /></div>
                <div className="form-row">
                  <div className="form-group"><label>타입</label>
                    <select value={form.project_type} onChange={e => setForm({...form, project_type: e.target.value})}>
                      {["single","ep","album","compilation","ost"].map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="form-group"><label>타겟 시장</label>
                    <select value={form.target_market} onChange={e => setForm({...form, target_market: e.target.value})}>
                      {["kr","us","jp","br","latam","sea","europe","uk","mena","africa","india","china"].map(m => <option key={m} value={m}>{m.toUpperCase()}</option>)}
                    </select>
                  </div>
                </div>
                <div className="form-group"><label>컨셉</label><textarea value={form.concept} onChange={e => setForm({...form, concept: e.target.value})} rows={3} /></div>
              </div>
              <div className="modal-footer"><button className="btn btn-primary" onClick={handleCreate} disabled={!form.title}>생성</button></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

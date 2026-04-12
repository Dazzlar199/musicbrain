import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ExternalLink, Check, X, LogOut } from "lucide-react";
import { Nav } from "./Artists";

interface PlatformInfo {
  key: string; name: string; icon: string; color: string; desc: string;
  connected: boolean; account: { account_id?: string; name?: string; connected_at?: string } | null;
}

interface UserInfo {
  id: number; email: string; name: string; role: string; company: string;
  avatar_url: string; connected_accounts: Record<string, any>;
  created_at?: string; last_login?: string;
}

export default function Settings() {
  const nav = useNavigate();
  const [user, setUser] = useState<UserInfo | null>(null);
  const [platforms, setPlatforms] = useState<PlatformInfo[]>([]);
  const [connectForm, setConnectForm] = useState<{ platform: string; account_id: string; account_name: string } | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: "", company: "" });

  const token = localStorage.getItem("token");

  const headers = () => ({
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json",
  });

  useEffect(() => {
    if (!token) { nav("/login"); return; }
    fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(d => { setUser(d); setForm({ name: d.name, company: d.company || "" }); })
      .catch(() => { localStorage.removeItem("token"); nav("/login"); });

    fetch("/api/auth/connections", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => setPlatforms(d.platforms || []))
      .catch(() => {});
  }, []);

  const saveProfile = async () => {
    await fetch("/api/auth/me", { method: "PUT", headers: headers(), body: JSON.stringify(form) });
    const r = await fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } });
    setUser(await r.json());
    setEditing(false);
  };

  const connectAccount = async () => {
    if (!connectForm) return;
    await fetch("/api/auth/connect", {
      method: "POST", headers: headers(),
      body: JSON.stringify(connectForm),
    });
    const r = await fetch("/api/auth/connections", { headers: { Authorization: `Bearer ${token}` } });
    setPlatforms((await r.json()).platforms || []);
    setConnectForm(null);
  };

  const disconnectAccount = async (platform: string) => {
    await fetch(`/api/auth/connect/${platform}`, { method: "DELETE", headers: headers() });
    const r = await fetch("/api/auth/connections", { headers: { Authorization: `Bearer ${token}` } });
    setPlatforms((await r.json()).platforms || []);
  };

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    nav("/login");
  };

  if (!user) return null;

  return (
    <div className="page-shell">
      <Nav nav={nav} active="settings" />
      <div className="page-content">
        <div className="page-header">
          <div><h1>설정</h1><p className="text-muted">계정 · 소셜 연결 · 팀</p></div>
          <button className="btn btn-outline btn-sm" onClick={logout}><LogOut size={14} /> 로그아웃</button>
        </div>

        {/* 프로필 */}
        <div className="chart-card" style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
            <p className="chart-title" style={{ margin: 0 }}>내 프로필</p>
            <button className="btn btn-sm btn-outline" onClick={() => setEditing(!editing)}>{editing ? "취소" : "수정"}</button>
          </div>
          {editing ? (
            <div style={{ display: "grid", gap: 12 }}>
              <div className="form-group" style={{ margin: 0 }}><label>이름</label><input value={form.name} onChange={e => setForm({...form, name: e.target.value})} /></div>
              <div className="form-group" style={{ margin: 0 }}><label>회사/레이블</label><input value={form.company} onChange={e => setForm({...form, company: e.target.value})} /></div>
              <button className="btn btn-primary btn-sm" onClick={saveProfile}>저장</button>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {[
                ["이름", user.name],
                ["이메일", user.email],
                ["회사", user.company || "미설정"],
                ["역할", user.role],
                ["가입일", user.created_at?.split("T")[0]],
              ].map(([label, value]) => (
                <div key={label as string} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--border-light)", fontSize: 14 }}>
                  <span style={{ color: "var(--text-tertiary)" }}>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 소셜 계정 연결 */}
        <div className="chart-card">
          <p className="chart-title">계정 연결</p>
          <p style={{ fontSize: 13, color: "var(--text-tertiary)", marginBottom: 16 }}>
            각 플랫폼 계정을 연결하면 아티스트 데이터를 자동으로 가져와요.
          </p>
          <div style={{ display: "grid", gap: 10 }}>
            {platforms.map(p => (
              <div key={p.key} style={{
                display: "flex", alignItems: "center", gap: 14,
                padding: 16, background: "var(--bg)", borderRadius: 12,
                border: p.connected ? `1px solid ${p.color}20` : "1px solid var(--border-light)",
              }}>
                <span style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: p.color, color: "#fff",
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  fontSize: 13, fontWeight: 700, flexShrink: 0,
                }}>{p.icon}</span>
                <div style={{ flex: 1 }}>
                  <strong style={{ fontSize: 14 }}>{p.name}</strong>
                  <p style={{ fontSize: 12, color: "var(--text-tertiary)", margin: "2px 0 0" }}>
                    {p.connected ? `${p.account?.name || p.account?.account_id} 연결됨` : p.desc}
                  </p>
                </div>
                {p.connected ? (
                  <div style={{ display: "flex", gap: 6 }}>
                    <span style={{ fontSize: 12, color: "var(--green)", display: "flex", alignItems: "center", gap: 4 }}><Check size={14} /> 연결됨</span>
                    <button className="btn btn-sm btn-outline" onClick={() => disconnectAccount(p.key)} style={{ color: "var(--text-disabled)" }}>해제</button>
                  </div>
                ) : (
                  <button className="btn btn-sm btn-primary" onClick={() => setConnectForm({ platform: p.key, account_id: "", account_name: "" })}>
                    연결하기
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* 연결 모달 */}
        {connectForm && (
          <div className="modal-overlay" onClick={() => setConnectForm(null)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h3>{platforms.find(p => p.key === connectForm.platform)?.name} 연결</h3>
                <button onClick={() => setConnectForm(null)}><X size={18} /></button>
              </div>
              <div className="modal-body">
                <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 16 }}>
                  {connectForm.platform === "youtube" && "YouTube 채널 URL이나 채널 ID를 입력하세요."}
                  {connectForm.platform === "spotify" && "Spotify for Artists의 아티스트 ID를 입력하세요."}
                  {connectForm.platform === "instagram" && "Instagram 핸들(@없이)을 입력하세요."}
                  {connectForm.platform === "tiktok" && "TikTok 핸들(@없이)을 입력하세요."}
                  {connectForm.platform === "melon" && "멜론 아티스트 페이지 URL을 입력하세요."}
                  {connectForm.platform === "twitter" && "X(Twitter) 핸들(@없이)을 입력하세요."}
                </p>
                <div className="form-group"><label>계정 ID / 핸들</label>
                  <input value={connectForm.account_id} onChange={e => setConnectForm({...connectForm, account_id: e.target.value})}
                    placeholder={connectForm.platform === "youtube" ? "UCxxxxxx 또는 채널 URL" : "@없이 핸들"} />
                </div>
                <div className="form-group"><label>표시 이름 (선택)</label>
                  <input value={connectForm.account_name} onChange={e => setConnectForm({...connectForm, account_name: e.target.value})}
                    placeholder="채널/계정 이름" />
                </div>
              </div>
              <div className="modal-footer"><button className="btn btn-primary" onClick={connectAccount} disabled={!connectForm.account_id}>연결</button></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

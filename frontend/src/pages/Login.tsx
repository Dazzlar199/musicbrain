import { useState } from "react";
import { useNavigate } from "react-router-dom";

type Mode = "login" | "signup";

export default function Login() {
  const nav = useNavigate();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setLoading(true);

    try {
      if (mode === "signup") {
        const r = await fetch("/api/auth/signup", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, name, company }),
        });
        const data = await r.json();
        if (!r.ok) { setError(data.detail || "가입 실패"); setLoading(false); return; }
        localStorage.setItem("token", data.token);
        localStorage.setItem("user", JSON.stringify(data.user));
        nav("/studio");
      } else {
        const fd = new URLSearchParams();
        fd.append("username", email);
        fd.append("password", password);
        const r = await fetch("/api/auth/login", { method: "POST", body: fd });
        const data = await r.json();
        if (!r.ok) { setError(data.detail || "로그인 실패"); setLoading(false); return; }
        localStorage.setItem("token", data.access_token);
        localStorage.setItem("user", JSON.stringify(data.user));
        nav("/studio");
      }
    } catch { setError("서버에 연결할 수 없어요"); }
    setLoading(false);
  };

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--bg)", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 400 }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <img src="/logo.png" alt="Music Brain" style={{ width: 52, height: 52, margin: "0 auto 12px", display: "block" }} />
          <h1 style={{ fontSize: 22, margin: "0 0 4px" }}>Music Brain</h1>
          <p style={{ fontSize: 14, color: "var(--text-tertiary)" }}>
            {mode === "login" ? "로그인해서 시작하세요" : "새 계정을 만들어보세요"}
          </p>
        </div>

        <div className="chart-card" style={{ padding: 28 }}>
          <form onSubmit={handleSubmit} style={{ display: "grid", gap: 14 }}>
            {mode === "signup" && (
              <>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>이름</label>
                  <input value={name} onChange={e => setName(e.target.value)} required placeholder="홍길동" />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>회사/레이블</label>
                  <input value={company} onChange={e => setCompany(e.target.value)} placeholder="선택" />
                </div>
              </>
            )}
            <div className="form-group" style={{ margin: 0 }}>
              <label>이메일</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="you@company.com" />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label>비밀번호</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="8자 이상" minLength={6} />
            </div>

            {error && <p style={{ color: "var(--red)", fontSize: 13, margin: 0 }}>{error}</p>}

            <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: "100%", justifyContent: "center", padding: 14 }}>
              {loading ? "처리 중..." : mode === "login" ? "로그인" : "가입하기"}
            </button>
          </form>
        </div>

        <p style={{ textAlign: "center", fontSize: 13, color: "var(--text-tertiary)", marginTop: 16 }}>
          {mode === "login" ? (
            <>계정이 없으신가요? <button onClick={() => { setMode("signup"); setError(""); }} style={{ border: "none", background: "none", color: "var(--blue)", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>가입하기</button></>
          ) : (
            <>이미 계정이 있으신가요? <button onClick={() => { setMode("login"); setError(""); }} style={{ border: "none", background: "none", color: "var(--blue)", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>로그인</button></>
          )}
        </p>
      </div>
    </div>
  );
}

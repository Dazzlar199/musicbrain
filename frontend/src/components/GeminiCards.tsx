/**
 * Gemini 구조화 응답을 SaaS 카드로 렌더링.
 * 마크다운 덩어리 대신 각 섹션을 독립 카드로 표시.
 */

import { RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from "recharts";

interface GeminiData {
  profile?: {
    genre?: string; sub_genre?: string; bpm_feel?: string;
    key_feel?: string; structure?: string; production_style?: string;
    vocal_style?: string; reference_artists?: string[];
  };
  market_fit?: {
    score?: number; verdict?: string;
    strengths?: Array<{ point: string; detail: string }>;
    weaknesses?: Array<{ point: string; detail: string }>;
    risks?: Array<{ risk: string; probability: string; impact: string; mitigation: string }>;
  };
  chart_potential?: {
    chart_entry_pct?: number; viral_potential?: string; viral_reason?: string;
    radio_fit?: string; longevity?: string; longevity_reason?: string;
  };
  production_advice?: Array<{ area: string; action: string; priority: string }>;
  success_cases?: Array<{ artist: string; track: string; reason: string }>;
  cross_market?: Array<{ market: string; fit_score: number; reason: string }>;
  roadmap?: {
    pre_release?: Array<{ week: string; title: string; actions: string[] }>;
    release?: Array<{ week: string; title: string; actions: string[] }>;
    post_release?: Array<{ week: string; title: string; actions: string[] }>;
  };
  marketing?: {
    platforms?: Array<{ name: string; strategy: string; priority: string; budget: string; viral_clip?: string }>;
    target_playlists?: Array<{ name: string; type: string; followers: string; fit_reason: string }>;
    budget_scenarios?: Array<{ tier: string; budget: string; focus: string; expected_streams: string }>;
    kpis?: Array<{ metric: string; week1: string; week4: string }>;
  };
  error?: string;
}

export default function GeminiCards({ data }: { data: GeminiData }) {
  if (data.error) {
    return <div className="chart-card"><p style={{ color: "var(--red)" }}>{data.error}</p></div>;
  }

  return (
    <div className="stack">
      {/* 프로파일 */}
      {data.profile && (
        <div className="chart-card">
          <p className="chart-title">곡 프로파일</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
            {[
              ["장르", `${data.profile.genre || ""} / ${data.profile.sub_genre || ""}`],
              ["BPM/그루브", data.profile.bpm_feel],
              ["키/조성", data.profile.key_feel],
              ["구조", data.profile.structure],
              ["프로덕션", data.profile.production_style],
              ["보컬", data.profile.vocal_style],
            ].filter(([_, v]) => v).map(([label, value]) => (
              <div key={label as string} style={{ padding: "10px 12px", background: "var(--bg)", borderRadius: 8 }}>
                <span style={{ fontSize: 11, color: "var(--text-tertiary)", display: "block", marginBottom: 4 }}>{label}</span>
                <span style={{ fontSize: 13 }}>{value}</span>
              </div>
            ))}
          </div>
          {data.profile.reference_artists?.length ? (
            <div style={{ marginTop: 12 }}>
              <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>비슷한 곡/아티스트</span>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                {data.profile.reference_artists.map(r => (
                  <span key={r} className="pop-badge">{r}</span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* 시장 적합도 */}
      {data.market_fit && (
        <div className="card-grid-2">
          <div className="chart-card">
            <p className="chart-title">시장 적합도</p>
            <div style={{ textAlign: "center", padding: "16px 0" }}>
              <strong style={{ fontSize: 48, fontWeight: 800, color: (data.market_fit.score || 0) >= 7 ? "var(--green)" : (data.market_fit.score || 0) >= 5 ? "var(--yellow)" : "var(--red)" }}>
                {data.market_fit.score || 0}
              </strong>
              <span style={{ fontSize: 20, color: "var(--text-disabled)" }}>/10</span>
              <p style={{ fontSize: 14, color: "var(--text-secondary)", marginTop: 8 }}>{data.market_fit.verdict}</p>
            </div>
          </div>
          <div className="chart-card">
            <p className="chart-title">차트 가능성</p>
            {data.chart_potential && (
              <div style={{ display: "grid", gap: 10 }}>
                <KpiMini label="차트 진입" value={`${data.chart_potential.chart_entry_pct || 0}%`} />
                <KpiMini label="숏폼 포텐셜" value={data.chart_potential.viral_potential || "—"} sub={data.chart_potential.viral_reason} />
                <KpiMini label="라디오" value={data.chart_potential.radio_fit || "—"} />
                <KpiMini label="수명" value={data.chart_potential.longevity || "—"} sub={data.chart_potential.longevity_reason} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* 강점 / 약점 */}
      {(data.market_fit?.strengths || data.market_fit?.weaknesses) && (
        <div className="card-grid-2">
          {data.market_fit?.strengths && (
            <div className="chart-card">
              <p className="chart-title" style={{ color: "var(--green)" }}>강점</p>
              {data.market_fit.strengths.map((s, i) => (
                <div key={i} style={{ padding: "10px 0", borderBottom: "1px solid var(--border-light)" }}>
                  <strong style={{ fontSize: 13 }}>{s.point}</strong>
                  <p style={{ fontSize: 12, color: "var(--text-tertiary)", margin: "4px 0 0" }}>{s.detail}</p>
                </div>
              ))}
            </div>
          )}
          {data.market_fit?.weaknesses && (
            <div className="chart-card">
              <p className="chart-title" style={{ color: "var(--red)" }}>약점</p>
              {data.market_fit.weaknesses.map((w, i) => (
                <div key={i} style={{ padding: "10px 0", borderBottom: "1px solid var(--border-light)" }}>
                  <strong style={{ fontSize: 13 }}>{w.point}</strong>
                  <p style={{ fontSize: 12, color: "var(--text-tertiary)", margin: "4px 0 0" }}>{w.detail}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 크로스마켓 */}
      {data.cross_market?.length ? (
        <div className="chart-card">
          <p className="chart-title">다른 시장에서의 가능성</p>
          <div style={{ display: "grid", gap: 8 }}>
            {data.cross_market.map(cm => (
              <div key={cm.market} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: "1px solid var(--border-light)" }}>
                <strong style={{ width: 40, textAlign: "center" }}>{cm.market}</strong>
                <div style={{ flex: 1, height: 8, background: "var(--bg)", borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ width: `${cm.fit_score * 10}%`, height: "100%", background: cm.fit_score >= 7 ? "var(--green)" : cm.fit_score >= 5 ? "var(--yellow)" : "var(--red)", borderRadius: 4 }} />
                </div>
                <span style={{ fontSize: 14, fontWeight: 700, width: 30 }}>{cm.fit_score}</span>
                <span style={{ fontSize: 12, color: "var(--text-tertiary)", flex: 1 }}>{cm.reason}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* 프로덕션 조언 */}
      {data.production_advice?.length ? (
        <div className="chart-card">
          <p className="chart-title">프로덕션 조언</p>
          <div style={{ display: "grid", gap: 8 }}>
            {data.production_advice.map((a, i) => {
              const prColor = a.priority === "높음" ? "var(--red)" : a.priority === "중간" ? "var(--yellow)" : "var(--text-disabled)";
              return (
                <div key={i} className={`advice-row advice-${a.priority === "높음" ? "critical" : a.priority === "중간" ? "notable" : "match"}`}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <strong>{a.area}</strong>
                    <span style={{ fontSize: 11, color: prColor, fontWeight: 600 }}>{a.priority}</span>
                  </div>
                  <p>{a.action}</p>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* 8주 로드맵 */}
      {data.roadmap && (
        <div className="chart-card">
          <p className="chart-title">릴리즈 로드맵</p>
          <div style={{ display: "grid", gap: 16 }}>
            {[
              { label: "사전 준비", items: data.roadmap.pre_release, color: "var(--blue)" },
              { label: "릴리즈", items: data.roadmap.release, color: "var(--green)" },
              { label: "릴리즈 후", items: data.roadmap.post_release, color: "var(--purple)" },
            ].map(phase => (
              phase.items?.length ? (
                <div key={phase.label}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: phase.color, textTransform: "uppercase", letterSpacing: "0.05em" }}>{phase.label}</span>
                  {phase.items.map((step, i) => (
                    <div key={i} style={{ marginTop: 8, paddingLeft: 16, borderLeft: `3px solid ${phase.color}` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <strong style={{ fontSize: 13 }}>{step.title}</strong>
                        <span style={{ fontSize: 11, color: "var(--text-disabled)" }}>{step.week}</span>
                      </div>
                      <ul style={{ margin: 0, paddingLeft: 16 }}>
                        {step.actions.map((a, j) => <li key={j} style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 2 }}>{a}</li>)}
                      </ul>
                    </div>
                  ))}
                </div>
              ) : null
            ))}
          </div>
        </div>
      )}

      {/* 마케팅 전략 */}
      {data.marketing?.platforms?.length ? (
        <div className="chart-card">
          <p className="chart-title">플랫폼별 마케팅 전략</p>
          <div className="table-card" style={{ border: "none" }}>
            <table className="table">
              <thead><tr><th>플랫폼</th><th>전략</th><th>우선순위</th><th>예산</th></tr></thead>
              <tbody>
                {data.marketing.platforms.map(p => (
                  <tr key={p.name}>
                    <td><strong>{p.name}</strong></td>
                    <td style={{ fontSize: 12 }}>{p.strategy}</td>
                    <td><span className={`status-badge ${p.priority === "상" ? "status-active" : p.priority === "중" ? "status-developing" : "status-inactive"}`}>{p.priority}</span></td>
                    <td>{p.budget}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* 예산 시나리오 */}
      {data.marketing?.budget_scenarios?.length ? (
        <div className="chart-card">
          <p className="chart-title">예산 시나리오</p>
          <div className="card-grid-3" style={{ gridTemplateColumns: `repeat(${data.marketing.budget_scenarios.length}, 1fr)` }}>
            {data.marketing.budget_scenarios.map(b => (
              <div key={b.tier} style={{ padding: 16, background: "var(--bg)", borderRadius: 12, textAlign: "center" }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-tertiary)" }}>{b.tier}</span>
                <strong style={{ display: "block", fontSize: 20, fontWeight: 800, margin: "8px 0" }}>{b.budget}</strong>
                <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "0 0 8px" }}>{b.focus}</p>
                <span style={{ fontSize: 11, color: "var(--blue)", fontWeight: 600 }}>예상 {b.expected_streams} 스트림</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* KPI 목표 */}
      {data.marketing?.kpis?.length ? (
        <div className="chart-card">
          <p className="chart-title">KPI 목표</p>
          <table className="table">
            <thead><tr><th>지표</th><th>1주차</th><th>4주차</th></tr></thead>
            <tbody>
              {data.marketing.kpis.map(k => (
                <tr key={k.metric}><td>{k.metric}</td><td>{k.week1}</td><td><strong>{k.week4}</strong></td></tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {/* 성공 사례 */}
      {data.success_cases?.length ? (
        <div className="chart-card">
          <p className="chart-title">비슷한 성공 사례</p>
          <div style={{ display: "grid", gap: 8 }}>
            {data.success_cases.map((c, i) => (
              <div key={i} style={{ display: "flex", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--border-light)" }}>
                <div className="pop-badge">{c.artist}</div>
                <div>
                  <strong style={{ fontSize: 13 }}>{c.track}</strong>
                  <p style={{ fontSize: 12, color: "var(--text-tertiary)", margin: "2px 0 0" }}>{c.reason}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function KpiMini({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div>
        <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{label}</span>
        {sub && <p style={{ fontSize: 11, color: "var(--text-disabled)", margin: "2px 0 0" }}>{sub}</p>}
      </div>
      <strong style={{ fontSize: 14 }}>{value}</strong>
    </div>
  );
}

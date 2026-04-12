import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, ChevronRight, Plus, CheckCircle2, Circle, Clock,
  AlertCircle, Lightbulb, TrendingUp, Calendar, Users, Music,
  Target, Megaphone, BarChart3, Zap,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Nav } from "./Artists";

interface Project {
  id: number; title: string; project_type: string; status: string;
  target_market: string; target_markets: string[];
  target_release_date: string | null; start_date: string | null;
  budget: number | null; concept: string; notes: string; label: string;
  distributor: string; artist_count: number; track_count: number;
  task_count: number; campaign_count: number;
  tracks?: Array<{ id: number; title: string; status: string; genre: string; bpm: number; key: string; mood: string; market_scores: Record<string, number>; viral_timestamp: string }>;
  campaigns?: Array<{ id: number; name: string; campaign_type: string; status: string; platform: string; budget: number; spent: number }>;
}

interface Task {
  id: number; title: string; description: string; category: string;
  status: string; priority: string; assignee: string;
  due_date: string | null;
}

const STAGES = [
  { key: "planning", label: "기획", icon: <Lightbulb size={16} />,
    desc: "컨셉 설정, 타겟 시장 선정, 예산 수립, 경쟁 분석",
    checklist: ["컨셉/무드보드 확정", "타겟 시장 선정", "예산 확정", "같은 시기 경쟁 컴백 조사", "프로듀서/작곡가 후보 리스트업"] },
  { key: "pre_production", label: "프리프로덕션", icon: <Music size={16} />,
    desc: "데모 선곡, 프로듀서 확정, 레퍼런스 설정, 곡 방향 결정",
    checklist: ["데모 곡 접수 및 선정", "타이틀곡 확정", "프로듀서/편곡자 계약", "가사 작업 시작", "레퍼런스 트랙 공유"] },
  { key: "recording", label: "레코딩", icon: <Music size={16} />,
    desc: "보컬 녹음, 가이드 작업, 코러스 작업",
    checklist: ["가이드 녹음", "멤버별 파트 배분", "보컬 녹음 (메인)", "코러스/하모니 녹음", "보컬 디렉팅 완료"] },
  { key: "mixing", label: "믹싱", icon: <BarChart3 size={16} />,
    desc: "밸런스 조정, 이펙트 처리, 최종 믹스 확인",
    checklist: ["1차 믹스 확인", "피드백 반영", "최종 믹스 승인", "인스트 버전 제작"] },
  { key: "mastering", label: "마스터링", icon: <BarChart3 size={16} />,
    desc: "라우드니스 최적화, 플랫폼별 포맷 대응",
    checklist: ["마스터링 완료", "스트리밍 포맷 변환", "CD/바이닐 포맷 (필요 시)", "최종 QC"] },
  { key: "quality_check", label: "QC", icon: <CheckCircle2 size={16} />,
    desc: "전체 품질 점검, 가사/크레딧 확인",
    checklist: ["음원 최종 청취 확인", "가사/크레딧 오류 확인", "메타데이터 확인 (ISRC, 장르 태그)", "아트워크 최종 확인"] },
  { key: "distribution", label: "유통", icon: <Target size={16} />,
    desc: "유통사 전달, 플랫폼 등록, 발매일 확정",
    checklist: ["유통사에 음원 전달", "각 플랫폼 등록 확인", "발매일/시간 최종 확정", "프리세이브 링크 생성"] },
  { key: "promotion", label: "프로모션", icon: <Megaphone size={16} />,
    desc: "마케팅 실행, 콘텐츠 배포, 미디어 대응",
    checklist: ["티저 콘텐츠 공개", "MV 공개", "숏폼 챌린지 시작", "음악방송 출연", "플레이리스트 피칭 결과 확인", "인플루언서 시딩"] },
  { key: "released", label: "릴리즈", icon: <Zap size={16} />,
    desc: "발매 완료, 초동 대응",
    checklist: ["발매 확인 (전 플랫폼)", "초동 스트리밍 모니터링", "차트 진입 확인", "팬 반응 수집"] },
  { key: "tracking", label: "트래킹", icon: <TrendingUp size={16} />,
    desc: "성과 추적, 데이터 분석, 다음 전략 수립",
    checklist: ["1주차 스트리밍 집계", "4주차 성과 리포트", "캠페인 ROI 분석", "다음 릴리즈 방향 수립"] },
];

const TASK_CATEGORIES: Record<string, string> = {
  a_and_r: "A&R", recording: "레코딩", mixing: "믹싱", mastering: "마스터링",
  artwork: "아트워크", mv_production: "MV", marketing: "마케팅",
  playlist_pitching: "플리 피칭", pr: "PR", social_media: "SNS",
  distribution: "유통", legal: "법무",
};

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "#f04452", high: "#ff6b6b", medium: "#ffc533", low: "#8b95a1",
};

export default function ProjectDetail() {
  const nav = useNavigate();
  const { id } = useParams();
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [aiTip, setAiTip] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [taskForm, setTaskForm] = useState({ title: "", category: "a_and_r", priority: "medium", assignee: "", due_date: "" });
  const [files, setFiles] = useState<Array<{ id: string; name: string; label: string; path: string; type: string }>>([]);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/projects/${id}`).then(r => r.json()).then(setProject);
    fetch(`/api/projects/${id}/tasks`).then(r => r.json()).then(setTasks);
    fetch(`/api/projects/${id}/files`).then(r => r.json()).then(setFiles).catch(() => {});
  }, [id]);

  const saveField = async (field: string, value: any) => {
    await fetch(`/api/projects/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    fetch(`/api/projects/${id}`).then(r => r.json()).then(setProject);
  };

  const advance = async () => {
    await fetch(`/api/projects/${id}/advance`, { method: "POST" });
    fetch(`/api/projects/${id}`).then(r => r.json()).then(setProject);
  };

  const revert = async () => {
    await fetch(`/api/projects/${id}/revert`, { method: "POST" });
    fetch(`/api/projects/${id}`).then(r => r.json()).then(setProject);
  };

  const addTask = async () => {
    const body: any = { ...taskForm };
    if (!body.due_date) delete body.due_date;
    if (!body.assignee) delete body.assignee;
    await fetch(`/api/projects/${id}/tasks`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setShowTaskForm(false);
    setTaskForm({ title: "", category: "a_and_r", priority: "medium", assignee: "", due_date: "" });
    fetch(`/api/projects/${id}/tasks`).then(r => r.json()).then(setTasks);
  };

  const updateTask = async (taskId: number, status: string) => {
    await fetch(`/api/projects/tasks/${taskId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    fetch(`/api/projects/${id}/tasks`).then(r => r.json()).then(setTasks);
  };

  const getAiTip = async () => {
    if (!project) return;
    setAiLoading(true);
    try {
      const currentStage = STAGES.find(s => s.key === project.status);
      const doneTasks = tasks.filter(t => t.status === "done").length;
      const prompt = `${project.title} 프로젝트가 현재 "${currentStage?.label}" 단계에 있어. ` +
        `컨셉: ${project.concept || "미정"}. 타겟 시장: ${(project.target_markets || []).join(",")}. ` +
        `태스크 ${doneTasks}/${tasks.length} 완료. ` +
        `이 단계에서 지금 가장 중요한 것 3가지를 짧게 알려줘. 존댓말 쓰지 마. 핵심만.`;

      const r = await fetch("/api/crawl/naver-news?query=" + encodeURIComponent(`${project.target_market === "kr" ? "K-pop 컴백" : "K-pop comeback"} ${new Date().getFullYear()}`));
      const newsData = await r.json();
      const newsContext = (newsData.articles || []).slice(0, 3).map((a: any) => a.title).join("; ");

      // Gemini 직접 호출 대신 간단한 가이드 제공
      const guides: Record<string, string> = {
        planning: `1. 같은 시기 경쟁 컴백을 확인하세요. 겹치면 차트 경쟁에서 불리해요.\n2. 타겟 시장의 현재 트렌드를 파악하세요. 지금 ${project.target_market?.toUpperCase()} 시장에서 뭐가 먹히는지.\n3. 예산 배분을 확정하세요. 프로덕션 vs 마케팅 비율이 중요해요.`,
        pre_production: `1. 데모 선곡이 가장 중요해요. 최소 20곡 이상 들어보고 골라야 해요.\n2. 타이틀곡의 숏폼 바이럴 포텐셜을 반드시 체크하세요.\n3. 레퍼런스 트랙을 프로듀서와 공유해서 방향을 맞추세요.`,
        recording: `1. 멤버별 파트 배분을 먼저 확정하세요. 킬링파트가 누구인지.\n2. 가이드 녹음 후 전체 구조를 한번 점검하세요.\n3. 보컬 디렉팅은 한 사람이 일관되게 해야 해요.`,
        mixing: `1. 1차 믹스를 차에서, 이어폰으로, 스피커로 다 들어보세요.\n2. 보컬이 악기에 묻히지 않는지 확인하세요.\n3. 타겟 시장의 차트곡과 A/B 비교하세요.`,
        mastering: `1. 스트리밍 라우드니스 기준(-14 LUFS)에 맞추세요.\n2. 다양한 기기에서 테스트하세요 (에어팟, 차량, 블루투스 스피커).\n3. 인스트 버전도 함께 마스터링하세요.`,
        quality_check: `1. 가사 오타를 꼭 확인하세요. 멜론/지니에 올라간 후에는 수정이 어려워요.\n2. 크레딧에 빠진 사람이 없는지 확인하세요.\n3. 메타데이터(장르, 발매일, ISRC)를 한 번 더 확인하세요.`,
        distribution: `1. 발매 2주 전에 유통사에 전달하세요.\n2. 프리세이브 링크를 만들어서 팬들에게 미리 공유하세요.\n3. 각 플랫폼별 발매 시간을 확인하세요 (한국 0시, 미국 금요일).`,
        promotion: `1. 발매 당일 숏폼 콘텐츠가 가장 중요해요. TikTok/Reels 동시 공개.\n2. 음악방송 출연 스케줄을 최소 3주 전에 잡으세요.\n3. 플레이리스트 피칭 결과를 확인하고 안 된 곳은 재피칭하세요.`,
        released: `1. 발매 직후 24시간 스트리밍을 모니터링하세요.\n2. 차트 진입 여부를 실시간으로 확인하세요.\n3. 팬 반응이 좋은 구간을 찾아서 추가 콘텐츠를 만드세요.`,
        tracking: `1. 1주차 vs 4주차 스트리밍 추이를 비교하세요.\n2. 캠페인별 ROI를 정리하세요. 어디에 돈을 더 쓸지 판단 근거가 돼요.\n3. 이번 릴리즈에서 배운 것을 정리하고 다음에 반영하세요.`,
      };
      setAiTip(guides[project.status] || "이 단계에 대한 가이드를 준비 중이에요.");
    } catch {
      setAiTip("가이드를 불러올 수 없어요.");
    }
    setAiLoading(false);
  };

  if (!project) return <div className="page-shell"><Nav nav={nav} active="projects" /><div className="page-content"><p>불러오는 중...</p></div></div>;

  const currentStageIdx = STAGES.findIndex(s => s.key === project.status);
  const currentStage = STAGES[currentStageIdx];
  const doneTasks = tasks.filter(t => t.status === "done").length;
  const daysLeft = project.target_release_date ? Math.ceil((new Date(project.target_release_date).getTime() - Date.now()) / 86400000) : null;

  // 태스크 카테고리별 그룹
  const tasksByCategory: Record<string, Task[]> = {};
  tasks.forEach(t => {
    const cat = t.category || "기타";
    if (!tasksByCategory[cat]) tasksByCategory[cat] = [];
    tasksByCategory[cat].push(t);
  });

  return (
    <div className="page-shell">
      <Nav nav={nav} active="projects" />
      <div className="page-content">
        <button className="btn btn-ghost btn-sm" onClick={() => nav("/projects")} style={{ marginBottom: 16 }}>
          <ArrowLeft size={16} /> 돌아가기
        </button>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <h1 style={{ margin: "0 0 4px", fontSize: 22 }}>{project.title}</h1>
            <p className="text-muted">{project.project_type} · {project.label} · {(project.target_markets || []).map(m => m.toUpperCase()).join(", ")}</p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-outline btn-sm" onClick={getAiTip} disabled={aiLoading}>
              <Lightbulb size={14} /> {aiLoading ? "확인 중..." : "지금 뭘 해야 해?"}
            </button>
            <button className="btn btn-outline btn-sm" onClick={revert} disabled={currentStageIdx <= 0}>
              <ArrowLeft size={14} /> 이전 단계
            </button>
            <button className="btn btn-primary btn-sm" onClick={advance} disabled={currentStageIdx >= STAGES.length - 1}>
              다음 단계 <ChevronRight size={14} />
            </button>
          </div>
        </div>

        {/* AI 가이드 */}
        {aiTip && (
          <div className="subpanel" style={{ marginBottom: 20, padding: 16, background: "#f0f7ff", borderLeft: "3px solid var(--blue)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <strong style={{ fontSize: 13, color: "var(--blue)" }}>지금 이 단계에서 중요한 것</strong>
              <button onClick={() => setAiTip(null)} style={{ border: "none", background: "none", cursor: "pointer", color: "var(--text-disabled)", fontSize: 12 }}>닫기</button>
            </div>
            <pre style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.7, whiteSpace: "pre-wrap", margin: 0, fontFamily: "inherit" }}>{aiTip}</pre>
          </div>
        )}

        {/* Pipeline */}
        <div className="subpanel" style={{ marginBottom: 20, padding: 20 }}>
          <div style={{ display: "flex", gap: 2, marginBottom: 16 }}>
            {STAGES.map((s, i) => (
              <div key={s.key} style={{ flex: 1, textAlign: "center" }}>
                <div style={{
                  height: 6, borderRadius: 3, marginBottom: 8,
                  background: i < currentStageIdx ? "var(--green)" : i === currentStageIdx ? "var(--blue)" : "var(--border-light)",
                }} />
                <div style={{
                  fontSize: 10, color: i === currentStageIdx ? "var(--blue)" : "var(--text-disabled)",
                  fontWeight: i === currentStageIdx ? 700 : 400,
                }}>
                  {s.label}
                </div>
              </div>
            ))}
          </div>

          {/* 현재 단계 상세 */}
          {currentStage && (
            <div style={{ padding: 16, background: "var(--bg)", borderRadius: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ color: "var(--blue)" }}>{currentStage.icon}</span>
                <strong style={{ fontSize: 15 }}>현재: {currentStage.label}</strong>
              </div>
              <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 12 }}>{currentStage.desc}</p>
              <div style={{ display: "grid", gap: 6 }}>
                {currentStage.checklist.map((item, i) => (
                  <label key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-secondary)", cursor: "pointer" }}>
                    <input type="checkbox" style={{ accentColor: "var(--blue)" }} />
                    {item}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* KPI */}
        <div className="kpi-grid" style={{ marginBottom: 20 }}>
          <div className="kpi-card">
            <Calendar size={18} className="kpi-icon" />
            <div><span>릴리즈까지</span><strong style={{ color: daysLeft !== null && daysLeft < 14 ? "var(--red)" : undefined }}>{daysLeft !== null ? `${daysLeft}일` : "미정"}</strong></div>
          </div>
          <div className="kpi-card">
            <CheckCircle2 size={18} className="kpi-icon" style={{ color: "var(--green)" }} />
            <div><span>태스크</span><strong>{doneTasks}/{tasks.length}</strong></div>
          </div>
          <div className="kpi-card">
            <Target size={18} className="kpi-icon" style={{ color: "var(--blue)" }} />
            <div><span>단계</span><strong>{currentStageIdx + 1}/10</strong></div>
          </div>
          <div className="kpi-card">
            <BarChart3 size={18} className="kpi-icon" style={{ color: "var(--purple)" }} />
            <div><span>예산</span><strong>{project.budget ? `₩${project.budget.toLocaleString()}` : "미정"}</strong></div>
          </div>
        </div>

        {/* 예산 트래킹 */}
        {project.budget && project.budget > 0 && (() => {
          // 캠페인 지출 합산
          const stagePercents: Record<string, number> = {
            planning: 5, pre_production: 10, recording: 25, mixing: 10,
            mastering: 5, quality_check: 2, distribution: 3, promotion: 35,
            released: 3, tracking: 2,
          };
          const completedStages = STAGES.slice(0, currentStageIdx);
          const estimatedSpent = completedStages.reduce((sum, s) => sum + (stagePercents[s.key] || 0), 0);
          const spentAmount = Math.round(project.budget * estimatedSpent / 100);
          const remaining = project.budget - spentAmount;
          const spentPct = Math.round(estimatedSpent);

          return (
            <div className="chart-card" style={{ marginBottom: 20 }}>
              <p className="chart-title">예산 현황</p>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                <div>
                  <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>총 예산</span>
                  <strong style={{ display: "block", fontSize: 18 }}>₩{project.budget.toLocaleString()}</strong>
                </div>
                <div style={{ textAlign: "center" }}>
                  <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>사용 추정</span>
                  <strong style={{ display: "block", fontSize: 18, color: spentPct > 80 ? "var(--red)" : "var(--blue)" }}>₩{spentAmount.toLocaleString()}</strong>
                </div>
                <div style={{ textAlign: "right" }}>
                  <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>남은 예산</span>
                  <strong style={{ display: "block", fontSize: 18, color: remaining < 0 ? "var(--red)" : "var(--green)" }}>₩{remaining.toLocaleString()}</strong>
                </div>
              </div>
              {/* 예산 바 */}
              <div style={{ height: 10, background: "var(--border-light)", borderRadius: 5, overflow: "hidden", marginBottom: 12 }}>
                <div style={{ height: "100%", width: `${Math.min(100, spentPct)}%`, background: spentPct > 80 ? "var(--red)" : "var(--blue)", borderRadius: 5, transition: "width 0.5s" }} />
              </div>
              {/* 단계별 예산 배분 */}
              <div style={{ display: "flex", gap: 2 }}>
                {STAGES.map((s, i) => {
                  const pct = stagePercents[s.key] || 0;
                  const isDone = i < currentStageIdx;
                  const isCurrent = i === currentStageIdx;
                  return (
                    <div key={s.key} style={{ flex: pct || 1, textAlign: "center" }}>
                      <div style={{
                        height: 20, borderRadius: 3, fontSize: 9, fontWeight: 600,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        background: isDone ? "var(--green)" : isCurrent ? "var(--blue)" : "var(--border-light)",
                        color: isDone || isCurrent ? "#fff" : "var(--text-disabled)",
                      }}>
                        {pct > 4 ? `${pct}%` : ""}
                      </div>
                      <span style={{ fontSize: 8, color: isCurrent ? "var(--blue)" : "var(--text-disabled)", display: "block", marginTop: 2 }}>
                        {s.label}
                      </span>
                    </div>
                  );
                })}
              </div>
              <p style={{ fontSize: 11, color: "var(--text-disabled)", marginTop: 8, textAlign: "center" }}>
                단계별 예산 비중은 업계 평균 기준이에요. 실제 지출은 캠페인에서 관리됩니다.
              </p>
            </div>
          );
        })()}

        {/* 프로젝트 정보 (인라인 편집) */}
        <div className="chart-card" style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
            <p className="chart-title" style={{ margin: 0 }}>프로젝트 정보</p>
            <button className="btn btn-sm btn-outline" onClick={() => setEditing(!editing)}>
              {editing ? "저장 완료" : "수정"}
            </button>
          </div>
          <div style={{ display: "grid", gap: 12 }}>
            <EditableField label="컨셉" value={project.concept} type="textarea" editing={editing}
              onSave={v => saveField("concept", v)} />
            <div className="form-row" style={{ margin: 0 }}>
              <EditableField label="시작일" value={project.start_date} type="date" editing={editing}
                onSave={v => saveField("start_date", v)} />
              <EditableField label="릴리즈 예정일" value={project.target_release_date} type="date" editing={editing}
                onSave={v => saveField("target_release_date", v)} />
            </div>
            <div className="form-row" style={{ margin: 0 }}>
              <EditableField label="타입" value={project.project_type} type="select" editing={editing}
                options={["single","ep","album","compilation","ost"]}
                onSave={v => saveField("project_type", v)} />
              <EditableField label="예산 (원)" value={project.budget} type="number" editing={editing}
                onSave={v => saveField("budget", Number(v))} format={v => v ? `₩${Number(v).toLocaleString()}` : "미정"} />
            </div>
            <div className="form-row" style={{ margin: 0 }}>
              <EditableField label="타겟 시장" value={(project.target_markets || []).join(",")} type="text" editing={editing}
                onSave={v => saveField("target_markets", v.split(",").map((s: string) => s.trim()))}
                format={v => v ? v.split(",").map((s: string) => s.trim().toUpperCase()).join(", ") : "미정"} />
              <EditableField label="레이블" value={project.label} type="text" editing={editing}
                onSave={v => saveField("label", v)} />
            </div>
            <EditableField label="메모" value={project.notes} type="textarea" editing={editing}
              onSave={v => saveField("notes", v)} placeholder="자유롭게 메모를 남기세요" />
          </div>
        </div>

        {/* 태스크 */}
        <div className="chart-card" style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
            <p className="chart-title" style={{ margin: 0 }}>태스크</p>
            <button className="btn btn-sm btn-outline" onClick={() => setShowTaskForm(!showTaskForm)}><Plus size={14} /> 추가</button>
          </div>

          {showTaskForm && (
            <div style={{ padding: 16, background: "var(--bg)", borderRadius: 10, marginBottom: 16 }}>
              <div className="form-row">
                <div className="form-group"><label>할 일</label><input value={taskForm.title} onChange={e => setTaskForm({...taskForm, title: e.target.value})} placeholder="예: 타이틀곡 데모 선정" /></div>
                <div className="form-group"><label>카테고리</label>
                  <select value={taskForm.category} onChange={e => setTaskForm({...taskForm, category: e.target.value})}>
                    {Object.entries(TASK_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>담당자</label><input value={taskForm.assignee} onChange={e => setTaskForm({...taskForm, assignee: e.target.value})} /></div>
                <div className="form-group"><label>우선순위</label>
                  <select value={taskForm.priority} onChange={e => setTaskForm({...taskForm, priority: e.target.value})}>
                    <option value="low">낮음</option><option value="medium">보통</option><option value="high">높음</option><option value="urgent">긴급</option>
                  </select>
                </div>
                <div className="form-group"><label>마감일</label><input type="date" value={taskForm.due_date} onChange={e => setTaskForm({...taskForm, due_date: e.target.value})} /></div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-primary btn-sm" onClick={addTask} disabled={!taskForm.title}>추가</button>
                <button className="btn btn-outline btn-sm" onClick={() => setShowTaskForm(false)}>취소</button>
              </div>
            </div>
          )}

          {/* 카테고리별 태스크 */}
          {Object.entries(tasksByCategory).map(([cat, catTasks]) => (
            <div key={cat} style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: "var(--text-tertiary)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {TASK_CATEGORIES[cat] || cat}
              </p>
              {catTasks.map(t => (
                <div key={t.id} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "8px 4px", borderBottom: "1px solid var(--border-light)",
                }}>
                  <button onClick={() => updateTask(t.id, t.status === "done" ? "todo" : "done")}
                    style={{ border: "none", background: "none", cursor: "pointer", padding: 0, flexShrink: 0 }}>
                    {t.status === "done" ? <CheckCircle2 size={18} style={{ color: "var(--green)" }} /> :
                     t.status === "in_progress" ? <Clock size={18} style={{ color: "var(--blue)" }} /> :
                     <Circle size={18} style={{ color: "var(--text-disabled)" }} />}
                  </button>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: 13, textDecoration: t.status === "done" ? "line-through" : "none", color: t.status === "done" ? "var(--text-disabled)" : "var(--text-primary)" }}>{t.title}</span>
                    {t.assignee && <span style={{ fontSize: 11, color: "var(--text-disabled)", marginLeft: 8 }}>{t.assignee}</span>}
                  </div>
                  {t.due_date && <span style={{ fontSize: 11, color: "var(--text-disabled)" }}>{t.due_date}</span>}
                  <span style={{ width: 8, height: 8, borderRadius: 4, background: PRIORITY_COLORS[t.priority] || "#888", flexShrink: 0 }} />
                  <select value={t.status} onChange={e => updateTask(t.id, e.target.value)}
                    style={{ fontSize: 11, padding: "3px 6px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--bg)" }}>
                    <option value="todo">할 일</option>
                    <option value="in_progress">진행 중</option>
                    <option value="done">완료</option>
                  </select>
                </div>
              ))}
            </div>
          ))}

          {tasks.length === 0 && (
            <p style={{ textAlign: "center", color: "var(--text-disabled)", padding: 24, fontSize: 13 }}>
              태스크를 추가해서 작업을 관리하세요
            </p>
          )}
        </div>

        {/* 태스크 진행률 차트 */}
        {tasks.length > 0 && (
          <div className="chart-card" style={{ marginBottom: 20 }}>
            <p className="chart-title">진행 현황</p>
            <ResponsiveContainer width="100%" height={120}>
              <BarChart data={[
                { name: "완료", count: tasks.filter(t => t.status === "done").length, fill: "#00c471" },
                { name: "진행 중", count: tasks.filter(t => t.status === "in_progress").length, fill: "#3182f6" },
                { name: "대기", count: tasks.filter(t => t.status === "todo").length, fill: "#e5e8eb" },
              ]}>
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" radius={[6, 6, 0, 0]} barSize={36}>
                  {[
                    { fill: "#00c471" },
                    { fill: "#3182f6" },
                    { fill: "#e5e8eb" },
                  ].map((d, i) => (
                    <rect key={i} fill={d.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* 연결된 곡 */}
        <div className="chart-card" style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
            <p className="chart-title" style={{ margin: 0 }}>곡 ({(project.tracks || []).length})</p>
            <button className="btn btn-sm btn-outline" onClick={() => nav("/demos")}>데모에서 곡 선택</button>
          </div>
          {(project.tracks || []).length > 0 ? (
            <div style={{ display: "grid", gap: 8 }}>
              {(project.tracks || []).map(t => {
                const bestMarket = t.market_scores ? Object.entries(t.market_scores).sort((a: any, b: any) => b[1] - a[1])[0] : null;
                return (
                  <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: 12, background: "var(--bg)", borderRadius: 10 }}>
                    <Music size={18} style={{ color: "var(--blue)", flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <strong style={{ fontSize: 14 }}>{t.title}</strong>
                      <div style={{ display: "flex", gap: 10, marginTop: 2, fontSize: 12, color: "var(--text-tertiary)" }}>
                        {t.genre && <span>{t.genre}</span>}
                        {t.bpm && <span>{Math.round(t.bpm)} BPM</span>}
                        {t.key && <span>{t.key}</span>}
                        {t.mood && <span>{t.mood}</span>}
                      </div>
                    </div>
                    <span className={`status-badge status-${t.status}`}>{t.status === "selected" ? "선택됨" : t.status}</span>
                    {t.viral_timestamp && <span style={{ fontSize: 11, color: "var(--blue)" }}>바이럴: {t.viral_timestamp}</span>}
                    {bestMarket && <span style={{ fontSize: 12, fontWeight: 600 }}>{bestMarket[0].toUpperCase()} {Math.round(bestMarket[1] as number)}점</span>}
                  </div>
                );
              })}
            </div>
          ) : (
            <p style={{ textAlign: "center", color: "var(--text-disabled)", padding: 16, fontSize: 13 }}>
              아직 연결된 곡이 없어요. 데모 관리에서 곡을 선택하면 여기에 나타나요.
            </p>
          )}
        </div>

        {/* 연결된 캠페인 */}
        <div className="chart-card" style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
            <p className="chart-title" style={{ margin: 0 }}>캠페인 ({(project.campaigns || []).length})</p>
            <button className="btn btn-sm btn-outline" onClick={() => nav("/campaigns")}>캠페인 관리</button>
          </div>
          {(project.campaigns || []).length > 0 ? (
            <div style={{ display: "grid", gap: 8 }}>
              {(project.campaigns || []).map(c => {
                const spentPct = c.budget ? Math.round((c.spent || 0) / c.budget * 100) : 0;
                return (
                  <div key={c.id} style={{ padding: 12, background: "var(--bg)", borderRadius: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <div>
                        <strong style={{ fontSize: 13 }}>{c.name}</strong>
                        <span style={{ fontSize: 11, color: "var(--text-tertiary)", marginLeft: 8 }}>{c.platform} · {c.campaign_type}</span>
                      </div>
                      <span className={`status-badge status-${c.status}`}>{c.status}</span>
                    </div>
                    {c.budget && (
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ flex: 1, height: 6, background: "var(--border-light)", borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${spentPct}%`, background: spentPct > 80 ? "var(--red)" : "var(--blue)", borderRadius: 3 }} />
                        </div>
                        <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>₩{(c.spent || 0).toLocaleString()} / ₩{c.budget.toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p style={{ textAlign: "center", color: "var(--text-disabled)", padding: 16, fontSize: 13 }}>
              이 프로젝트의 캠페인이 아직 없어요.
            </p>
          )}
        </div>

        {/* 무드보드 / 파일 */}
        <div className="chart-card" style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
            <p className="chart-title" style={{ margin: 0 }}>무드보드 · 파일</p>
            <label className="btn btn-sm btn-outline" style={{ cursor: "pointer" }}>
              <Plus size={14} /> 파일 올리기
              <input type="file" accept="image/*,.pdf,.doc,.docx,.txt,.mp3,.wav" style={{ display: "none" }}
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const fd = new FormData();
                  fd.append("file", f);
                  fd.append("label", f.name);
                  await fetch(`/api/projects/${id}/files`, { method: "POST", body: fd });
                  fetch(`/api/projects/${id}/files`).then(r => r.json()).then(setFiles).catch(() => {});
                }}
              />
            </label>
          </div>

          {files.length > 0 ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
              {files.map(f => {
                const isImage = f.type?.startsWith("image/");
                return (
                  <a key={f.id} href={f.path} target="_blank" rel="noreferrer"
                    style={{
                      display: "block", borderRadius: 10, overflow: "hidden",
                      border: "1px solid var(--border-light)", textDecoration: "none",
                      transition: "box-shadow 0.15s",
                    }}
                    onMouseEnter={e => (e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.08)")}
                    onMouseLeave={e => (e.currentTarget.style.boxShadow = "none")}
                  >
                    {isImage ? (
                      <img src={f.path} alt={f.label} style={{ width: "100%", height: 100, objectFit: "cover" }} />
                    ) : (
                      <div style={{ width: "100%", height: 100, background: "var(--bg)", display: "grid", placeItems: "center", color: "var(--text-disabled)" }}>
                        📄
                      </div>
                    )}
                    <p style={{ fontSize: 11, color: "var(--text-secondary)", padding: "6px 8px", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {f.label || f.name}
                    </p>
                  </a>
                );
              })}
            </div>
          ) : (
            <p style={{ textAlign: "center", color: "var(--text-disabled)", padding: 20, fontSize: 13 }}>
              컨셉 이미지, 무드보드, 가사, 기획서 등을 올려서 팀과 공유하세요
            </p>
          )}
        </div>

        {/* 다음 단계 미리보기 */}
        {currentStageIdx < STAGES.length - 1 && (
          <div className="subpanel" style={{ padding: 16, opacity: 0.6 }}>
            <p style={{ fontSize: 12, color: "var(--text-disabled)", marginBottom: 8 }}>다음 단계</p>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: "var(--text-disabled)" }}>{STAGES[currentStageIdx + 1].icon}</span>
              <strong style={{ fontSize: 14, color: "var(--text-tertiary)" }}>{STAGES[currentStageIdx + 1].label}</strong>
              <span style={{ fontSize: 12, color: "var(--text-disabled)" }}>— {STAGES[currentStageIdx + 1].desc}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function EditableField({
  label, value, type = "text", editing, onSave, options, placeholder, format,
}: {
  label: string; value: any; type?: "text" | "textarea" | "date" | "number" | "select";
  editing: boolean; onSave: (v: any) => void; options?: string[];
  placeholder?: string; format?: (v: any) => string;
}) {
  const [local, setLocal] = useState(value ?? "");
  useEffect(() => { setLocal(value ?? ""); }, [value]);

  const displayValue = format ? format(value) : (value || "미정");

  if (!editing) {
    return (
      <div className="form-group" style={{ margin: 0 }}>
        <label style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 4, display: "block" }}>{label}</label>
        {type === "textarea" ? (
          <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.7, margin: 0, whiteSpace: "pre-wrap" }}>{displayValue}</p>
        ) : (
          <strong style={{ fontSize: 14 }}>{displayValue}</strong>
        )}
      </div>
    );
  }

  const inputStyle = {
    width: "100%", padding: "8px 12px", border: "1px solid var(--border)",
    borderRadius: 8, fontSize: 14, background: "var(--bg)",
  };

  return (
    <div className="form-group" style={{ margin: 0 }}>
      <label style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 4, display: "block" }}>{label}</label>
      {type === "textarea" ? (
        <textarea value={local} onChange={e => setLocal(e.target.value)} onBlur={() => onSave(local)}
          rows={3} placeholder={placeholder} style={{ ...inputStyle, resize: "vertical" as const }} />
      ) : type === "select" ? (
        <select value={local} onChange={e => { setLocal(e.target.value); onSave(e.target.value); }} style={inputStyle}>
          {options?.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input type={type} value={local} onChange={e => setLocal(e.target.value)} onBlur={() => onSave(local)}
          placeholder={placeholder} style={inputStyle} />
      )}
    </div>
  );
}

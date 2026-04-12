import { useEffect, useMemo, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Nav } from "./Artists";
import GeminiCards from "../components/GeminiCards";
import { marked } from "marked";
import { Play, SkipForward, Flame, UploadCloud } from "lucide-react";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  AreaChart, Area, CartesianGrid,
  PieChart, Pie,
} from "recharts";
import {
  analyzeTrack, benchmarkTrack, compareMixes,
  fetchStats, fetchMarketProfiles, findViralSegment, generateGeminiReport, generateGeminiStructured,
  hitAnalyze, hitTiming, listenAnalyze,
} from "../api";
import { useI18n, LOCALE_OPTIONS, type Locale } from "../i18n";
import type {
  AnalyzeResponse, BenchmarkResponse, CompareResponse,
  MarketCode, MarketProfilesResponse, StatsResponse, ViralResponse,
} from "../types";

const MARKETS: Array<{ code: MarketCode; flag: string }> = [
  { code: "kr", flag: "🇰🇷" },
  { code: "us", flag: "🇺🇸" },
  { code: "jp", flag: "🇯🇵" },
  { code: "br", flag: "🇧🇷" },
  { code: "latam", flag: "🌎" },
  { code: "sea", flag: "🌏" },
  { code: "europe", flag: "🇪🇺" },
  { code: "uk", flag: "🇬🇧" },
  { code: "mena", flag: "🌍" },
  { code: "africa", flag: "🌍" },
  { code: "india", flag: "🇮🇳" },
  { code: "china", flag: "🇨🇳" },
];

const SCORE_COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#10b981"];
function scoreColor(s: number) {
  if (s >= 75) return SCORE_COLORS[4];
  if (s >= 55) return SCORE_COLORS[3];
  if (s >= 40) return SCORE_COLORS[2];
  if (s >= 20) return SCORE_COLORS[1];
  return SCORE_COLORS[0];
}

type Tab = "hit" | "analysis" | "benchmark" | "viral" | "gemini" | "compare";
type RunState = "idle" | "loading" | "done" | "error";

export default function Studio() {
  const { locale, setLocale, t } = useI18n("ko");
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [market, setMarket] = useState<MarketCode>("kr");
  const [tab, setTab] = useState<Tab>("analysis");
  const [file, setFile] = useState<File | null>(null);

  const [analysis, setAnalysis] = useState<AnalyzeResponse | null>(null);
  const [benchmark, setBenchmark] = useState<BenchmarkResponse | null>(null);
  const [viral, setViral] = useState<ViralResponse | null>(null);
  const [geminiHtml, setGeminiHtml] = useState("");
  const [geminiStructured, setGeminiStructured] = useState<Record<string, unknown> | null>(null);
  const [compare, setCompare] = useState<CompareResponse | null>(null);

  const [aState, setAState] = useState<RunState>("idle");
  const [bState, setBState] = useState<RunState>("idle");
  const [vState, setVState] = useState<RunState>("idle");
  const [gState, setGState] = useState<RunState>("idle");
  const [cState, setCState] = useState<RunState>("idle");

  const [cFileA, setCFileA] = useState<File | null>(null);
  const [cFileB, setCFileB] = useState<File | null>(null);
  const [hitData, setHitData] = useState<Record<string, any> | null>(null);
  const [timingData, setTimingData] = useState<Record<string, any> | null>(null);
  const [hitState, setHitState] = useState<RunState>("idle");
  const [userPrompt, setUserPrompt] = useState("");

  const audioRef = useRef<HTMLAudioElement>(null);
  const [audioUrl, setAudioUrl] = useState<string>("");

  useEffect(() => {
    if (file) {
      const url = URL.createObjectURL(file);
      setAudioUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setAudioUrl("");
    }
  }, [file]);

  const playSegment = (startSec: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = startSec;
      audioRef.current.play();
    }
  };

  const [marketProfiles, setMarketProfiles] = useState<MarketProfilesResponse | null>(null);

  useEffect(() => {
    fetchStats().then(setStats).catch(() => {});
    fetchMarketProfiles().then(setMarketProfiles).catch(() => {});
  }, []);

  // Derived data for charts
  const marketChartData = useMemo(() => {
    if (!analysis) return [];
    return MARKETS.map(m => ({
      market: t(`market.${m.code}`),
      code: m.code,
      flag: m.flag,
      score: Math.round(analysis.market_scores[m.code] ?? 0),
    }));
  }, [analysis, t]);

  const radarData = useMemo(() => {
    if (!analysis) return [];
    const d = analysis.deep_analysis;
    return [
      { axis: t("metric.energy"), value: d.energy?.category === "very high" ? 95 : d.energy?.category === "high" ? 75 : d.energy?.category === "medium" ? 55 : 30 },
      { axis: t("metric.danceability"), value: Math.round((d.rhythm?.danceability ?? 0) * 100) },
      { axis: t("metric.vocalPresence"), value: d.vocal?.vocal_presence === "high" ? 85 : d.vocal?.vocal_presence === "medium" ? 55 : 25 },
      { axis: t("metric.polish"), value: (d.production?.polish_score ?? 5) * 10 },
      { axis: t("metric.brightness"), value: d.spectral?.brightness === "very bright" ? 90 : d.spectral?.brightness === "bright" ? 70 : d.spectral?.brightness === "neutral" ? 50 : 30 },
      { axis: t("metric.mood"), value: Math.round((d.mood?.valence ?? 0.5) * 100) },
    ];
  }, [analysis, t]);

  const energyContour = useMemo(() => {
    if (!analysis) return [];
    return (analysis.deep_analysis.energy?.contour ?? []).map((v, i) => ({
      section: `${i + 1}`,
      energy: Math.round(v * 1000),
    }));
  }, [analysis]);

  const freqBalance = useMemo(() => {
    if (!analysis) return [];
    const lmh = analysis.deep_analysis.spectral?.low_mid_high;
    return [
      { name: "Low", value: lmh?.low_pct ?? 33, fill: "#ef4444" },
      { name: "Mid", value: lmh?.mid_pct ?? 34, fill: "#eab308" },
      { name: "High", value: lmh?.high_pct ?? 33, fill: "#3b82f6" },
    ];
  }, [analysis]);

  const [listenResult, setListenResult] = useState<Record<string, any> | null>(null);
  const [listenState, setListenState] = useState<RunState>("idle");

  function handleFileSelect(f: File) {
    setFile(f);
    // 파일만 저장, 분석은 아직 안 함
    setListenResult(null); setAnalysis(null); setBenchmark(null); setViral(null);
    setHitData(null); setTimingData(null);
    setGeminiHtml(""); setGeminiStructured(null); setCompare(null);
    setListenState("idle"); setAState("idle"); setBState("idle"); setVState("idle"); setHitState("idle");
    setGState("idle"); setCState("idle");
  }

  async function handleAnalyzeStart() {
    if (!file) return;
    setTab("hit");
    setListenState("loading");

    // 1. Gemini 청취만 먼저 (메인. 파일 1번만 전송)
    try {
      const result = await listenAnalyze(file, market, userPrompt || undefined);
      if (result && !(result as any).error) {
        setListenResult(result); setListenState("done");
      } else {
        setListenState("error");
      }
    } catch {
      setListenState("error");
    }

    // 2. 보조 분석은 백그라운드로 (탭 전환 시에만 필요)
    //    사용자가 다른 탭 클릭하면 그때 로드
  }

  // 보조 분석 (탭 전환 시 lazy load)
  async function loadHitData() {
    if (hitData || hitState === "loading" || !file) return;
    setHitState("loading");
    try {
      const r = await hitAnalyze(file, market);
      setHitData(r); setHitState("done");
    } catch { setHitState("error"); }
  }

  async function loadBenchmark() {
    if (benchmark || bState === "loading" || !file) return;
    setBState("loading");
    try {
      const r = await benchmarkTrack(file, market);
      setBenchmark(r); setBState("done");
    } catch { setBState("error"); }
  }

  async function loadAnalysis() {
    if (analysis || aState === "loading" || !file) return;
    setAState("loading");
    try {
      const r = await analyzeTrack(file, market);
      setAnalysis(r); setAState("done");
    } catch { setAState("error"); }
  }

  async function loadViral() {
    if (viral || vState === "loading" || !file) return;
    setVState("loading");
    try {
      const r = await findViralSegment(file);
      setViral(r); setVState("done");
    } catch { setVState("error"); }
  }

  async function handleGemini() {
    if (!file || !analysis) return;
    setGState("loading"); setGeminiHtml(""); setGeminiStructured(null);
    try {
      const r = await generateGeminiStructured(file, market, analysis.deep_analysis, userPrompt || undefined);
      if (r && !r.error) {
        setGeminiStructured(r);
      } else {
        const fallback = await generateGeminiReport(file, market, analysis.deep_analysis, userPrompt || undefined);
        setGeminiHtml(marked.parse(fallback.analysis) as string);
      }
      setGState("done"); setTab("gemini");
    } catch { setGState("error"); }
  }

  async function handleCompare() {
    if (!cFileA || !cFileB) return;
    setCState("loading"); setCompare(null);
    try {
      const r = await compareMixes(cFileA, cFileB, market);
      setCompare(r); setCState("done"); setTab("compare");
    } catch { setCState("error"); }
  }

  function reset() {
    setFile(null); setAnalysis(null); setBenchmark(null); setViral(null);
    setGeminiHtml(""); setCompare(null); setCFileA(null); setCFileB(null);
    setTab("analysis"); setAState("idle"); setBState("idle");
    setVState("idle"); setGState("idle"); setCState("idle");
  }

  return (
    <div className="page-shell">
      <Nav nav={useNavigate()} active="studio" />
      <div className="page-content">
        <div className="page-header">
          <div>
            <h1>{t("header.title")}</h1>
            <p className="text-muted">시장 적합도 · 프로덕션 비교 · 숏폼 구간 · 전략 리포트</p>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <select className="lang-select" value={locale} onChange={e => setLocale(e.target.value as Locale)}>
              {LOCALE_OPTIONS.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
            <button className="btn btn-outline btn-sm" onClick={reset} type="button">{t("header.reset")}</button>
          </div>
        </div>

        {/* Top Upload Hero */}
        <section className="hero-upload">
          <label className={`dropzone wide-dropzone${file ? " dropzone-filled" : ""}`}>
            <input
              accept=".mp3,.wav,.flac,audio/*"
              className="hidden-input"
              type="file"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }}
            />
            <div className="dropzone-inner">
              {file ? (
                <>
                  <div className="dropzone-file-icon">♫</div>
                  <strong>{file.name}</strong>
                  <span>{(file.size / 1024 / 1024).toFixed(1)}MB · 클릭해서 다른 곡 선택</span>
                </>
              ) : (
                <>
                  <UploadCloud size={36} style={{ marginBottom: 12, color: "var(--blue)", opacity: 0.6 }} />
                  <strong>{t("upload.placeholder")}</strong>
                  <span>{t("upload.hint")}</span>
                </>
              )}
            </div>
          </label>

          {/* 프롬프트 + 분석 시작 */}
          <div className="upload-action-bar">
            <textarea
              value={userPrompt}
              onChange={e => setUserPrompt(e.target.value)}
              placeholder={file ? "분석 방향이 있으면 적어주세요 (선택사항)" : "곡을 먼저 올려주세요"}
              disabled={!file}
              className="prompt-input"
              style={{ opacity: file ? 1 : 0.5 }}
            />
            <button
              className="btn btn-primary analyze-btn"
              onClick={handleAnalyzeStart}
              disabled={!file || listenState === "loading"}
            >
              {listenState === "loading" ? "분석 중..." : file ? "분석 시작 →" : "곡을 먼저 올려주세요"}
            </button>
          </div>

          {audioUrl && (
            <div className="subpanel audio-controller">
               <strong style={{ fontSize: "14px", color: "var(--text-primary)" }}>🎧 마스터 오디오 컨트롤</strong>
               <audio ref={audioRef} src={audioUrl} controls style={{ width: "100%", height: "40px", borderRadius: "8px" }} />
               {analysis && (
                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "10px" }}>
                    <button className="ghost-button" style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "12px", padding: "5px 10px" }} onClick={() => playSegment(0)}>
                      <Play size={14}/> 인트로
                    </button>
                    <button className="ghost-button" style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "12px", padding: "5px 10px" }} onClick={() => playSegment((analysis.deep_analysis.structure?.intro_sec ?? 10) + 1)}>
                      <SkipForward size={14}/> 벌스 진입
                    </button>
                    {viral?.best && typeof viral.best.timestamp === "string" && (
                      <button className="ghost-button" style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "12px", padding: "5px 10px", color: "var(--copper)" }} onClick={() => {
                          const parts = viral.best.timestamp.split(":");
                          if (parts.length === 2) {
                              playSegment(parseInt(parts[0])*60 + parseInt(parts[1]));
                          }
                      }}>
                        <Flame size={14}/> 최고 바이럴 구간
                      </button>
                    )}
                  </div>
                )}
            </div>
          )}
        </section>

        {/* Chips Filter Row */}
        <section className="chips-row-container">
          <div className="chips-row">
            {MARKETS.map(m => (
              <button
                 key={m.code}
                 className={`chip ${m.code === market ? "is-active" : ""}`}
                 onClick={() => setMarket(m.code)}
                 type="button"
              >
                 <span className="chip-flag">{m.flag}</span>
                 <strong>{t(`market.${m.code}`)}</strong>
              </button>
            ))}
          </div>
        </section>

        {/* Run state pills row */}
        {(aState !== "idle" || bState !== "idle" || vState !== "idle" || gState !== "idle") && (
          <div className="run-grid run-grid-wide" style={{ marginBottom: "24px" }}>
            {([["analyze", aState, t("state.analyze")], ["benchmark", bState, t("state.benchmark")], ["viral", vState, t("state.viral")], ["gemini", gState, t("state.gemini")]] as const).map(([k, s, label]) => (
              <div key={k} className={`status-pill status-${s}`}>
                <span>{label}</span>
                <strong>{t(`state.${s}`)}</strong>
              </div>
            ))}
          </div>
        )}

        {/* Results KPIs Top Grid */}
        {analysis && (
          <section className="kpi-grid">
             <div className="kpi-card" style={{ borderTop: `4px solid ${scoreColor(analysis.score)}` }}>
                <span>Market Fit</span>
                <strong style={{ color: scoreColor(analysis.score) }}>{Math.round(analysis.score)}</strong>
             </div>
             <div className="kpi-card">
                <span>{t("metric.tempo")}</span>
                <strong>{Math.round(analysis.deep_analysis.tempo?.bpm ?? 0)}</strong>
             </div>
             <div className="kpi-card">
                <span>{t("metric.key")}</span>
                <strong>{analysis.deep_analysis.tonality?.key_name ?? "n/a"}</strong>
             </div>
             <div className="kpi-card">
                <span>{t("metric.polish")}</span>
                <strong>{analysis.deep_analysis.production?.polish_score ?? 0}/10</strong>
             </div>
             <div className="kpi-card">
                <span>Viral Score</span>
                <strong>{viral ? Math.round(viral.best.score * 100) : "..."}</strong>
             </div>
          </section>
        )}

        {/* Right: Results (now full width underneath) */}
        <section className="results-panel panel full-width-results">
          <div className="tabs">
            {(["hit", "analysis", "benchmark", "viral", "gemini", "compare"] as Tab[]).map(tb => (
              <button
                key={tb}
                className={`tab-button${tab === tb ? " is-active" : ""}`}
                onClick={() => {
                  setTab(tb);
                  // 탭 전환 시 필요한 데이터 lazy load
                  if (tb === "hit" && !hitData) loadHitData();
                  if (tb === "benchmark") loadBenchmark();
                  if (tb === "analysis") loadAnalysis();
                  if (tb === "viral") loadViral();
                }}
                type="button"
              >{t(`tab.${tb}`)}</button>
            ))}
          </div>

          {/* ─── Analysis Tab ─── */}
          {/* ─── 메인 분석 탭 ─── */}
          {tab === "hit" && (
            listenState === "loading" ? <Loading title="곡을 듣고 있어요" body="" /> :
            !listenResult && !hitData ? <Empty title="곡을 올려주세요" body="이 시장에서 잘 될 수 있는 곡인지 확인해드려요." /> :
            hitData?.error ? <Empty title="분석 실패" body={hitData.error} /> :
            <div className="stack">
              {/* Gemini 청취 분석 결과 */}
              {listenResult && !listenResult.error && (
                <>
                  {/* 한 줄 요약 */}
                  <section className="subpanel" style={{ padding: 20 }}>
                    <p style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.6, color: "var(--text-primary)" }}>
                      {listenResult.one_line}
                    </p>
                    {listenResult.first_impression && (
                      <p style={{ fontSize: 13, color: "var(--text-tertiary)", marginTop: 6 }}>
                        첫인상: {listenResult.first_impression}
                      </p>
                    )}
                  </section>

                  {/* 사용자 질문에 대한 답변 */}
                  {listenResult.answer && userPrompt && (
                    <section className="subpanel" style={{ padding: 20, borderLeft: "3px solid var(--blue)" }}>
                      <p style={{ fontSize: 12, color: "var(--blue)", fontWeight: 600, marginBottom: 6 }}>질문에 대한 답변</p>
                      <p style={{ fontSize: 14, lineHeight: 1.7, color: "var(--text-secondary)" }}>{listenResult.answer}</p>
                    </section>
                  )}

                  {/* 시장 적합도 + 기본 정보 */}
                  <div className="card-grid-2">
                    <section className="subpanel" style={{ textAlign: "center", padding: 20 }}>
                      <p style={{ fontSize: 12, color: "var(--text-tertiary)" }}>시장 적합도</p>
                      <strong style={{ fontSize: 48, fontWeight: 800, display: "block", color: (listenResult.market_fit?.score || 0) >= 7 ? "var(--green)" : (listenResult.market_fit?.score || 0) >= 5 ? "var(--blue)" : "var(--red)" }}>
                        {listenResult.market_fit?.score || "?"}
                      </strong>
                      <span style={{ fontSize: 16, color: "var(--text-disabled)" }}>/10</span>
                      <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 8 }}>{listenResult.market_fit?.reason}</p>
                      {listenResult.market_fit?.best_market && (
                        <p style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 4 }}>
                          가장 잘 맞는 시장: <strong>{listenResult.market_fit.best_market.toUpperCase()}</strong> — {listenResult.market_fit.best_market_reason}
                        </p>
                      )}
                    </section>
                    <section className="subpanel" style={{ padding: 20 }}>
                      <div style={{ display: "grid", gap: 10 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--border-light)" }}>
                          <span style={{ color: "var(--text-tertiary)", fontSize: 13 }}>장르</span>
                          <strong style={{ fontSize: 13 }}>{listenResult.genre}{listenResult.sub_genre ? ` / ${listenResult.sub_genre}` : ""}</strong>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--border-light)" }}>
                          <span style={{ color: "var(--text-tertiary)", fontSize: 13 }}>분위기</span>
                          <strong style={{ fontSize: 13 }}>{listenResult.mood}</strong>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--border-light)" }}>
                          <span style={{ color: "var(--text-tertiary)", fontSize: 13 }}>에너지</span>
                          <strong style={{ fontSize: 13 }}>{listenResult.energy_level}/10</strong>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--border-light)" }}>
                          <span style={{ color: "var(--text-tertiary)", fontSize: 13 }}>프로덕션</span>
                          <strong style={{ fontSize: 13 }}>{listenResult.production?.quality}/10</strong>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0" }}>
                          <span style={{ color: "var(--text-tertiary)", fontSize: 13 }}>보컬</span>
                          <strong style={{ fontSize: 13 }}>{listenResult.vocal?.style}</strong>
                        </div>
                      </div>
                    </section>
                  </div>

                  {/* 잘 된 점 / 개선 필요 */}
                  <div className="card-grid-2">
                    {listenResult.what_works?.length > 0 && (
                      <section className="subpanel" style={{ padding: 20 }}>
                        <p style={{ fontSize: 12, color: "var(--green)", fontWeight: 600, marginBottom: 10 }}>잘 된 부분</p>
                        {listenResult.what_works.map((w: string, i: number) => (
                          <p key={i} style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6, padding: "6px 0", borderBottom: i < listenResult.what_works.length - 1 ? "1px solid var(--border-light)" : "none" }}>
                            {w}
                          </p>
                        ))}
                      </section>
                    )}
                    {listenResult.what_needs_work?.length > 0 && (
                      <section className="subpanel" style={{ padding: 20 }}>
                        <p style={{ fontSize: 12, color: "var(--red)", fontWeight: 600, marginBottom: 10 }}>개선이 필요한 부분</p>
                        {listenResult.what_needs_work.map((w: string, i: number) => (
                          <p key={i} style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6, padding: "6px 0", borderBottom: i < listenResult.what_needs_work.length - 1 ? "1px solid var(--border-light)" : "none" }}>
                            {w}
                          </p>
                        ))}
                      </section>
                    )}
                  </div>

                  {/* 프로덕션 + 훅 + 숏폼 */}
                  <div className="card-grid-2">
                    {listenResult.hook?.has_hook && (
                      <section className="subpanel" style={{ padding: 20 }}>
                        <p style={{ fontSize: 12, color: "var(--text-tertiary)", fontWeight: 600, marginBottom: 8 }}>가장 귀에 남는 구간</p>
                        <strong style={{ fontSize: 18, color: "var(--blue)" }}>{listenResult.hook.timestamp}</strong>
                        <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 6 }}>{listenResult.hook.description}</p>
                      </section>
                    )}
                    {listenResult.shortform?.best_clip && (
                      <section className="subpanel" style={{ padding: 20 }}>
                        <p style={{ fontSize: 12, color: "var(--text-tertiary)", fontWeight: 600, marginBottom: 8 }}>숏폼 추천 구간</p>
                        <strong style={{ fontSize: 18, color: "var(--purple)" }}>{listenResult.shortform.best_clip}</strong>
                        <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 6 }}>{listenResult.shortform.reason}</p>
                      </section>
                    )}
                  </div>

                  {/* 경쟁 분석 */}
                  {listenResult.competitors?.length > 0 && (
                    <section className="subpanel" style={{ padding: 20 }}>
                      <p style={{ fontSize: 12, color: "var(--text-tertiary)", fontWeight: 600, marginBottom: 12 }}>경쟁 곡 분석</p>
                      <div style={{ display: "grid", gap: 12 }}>
                        {listenResult.competitors.map((c: any, i: number) => (
                          <div key={i} style={{ padding: 14, background: "var(--bg)", borderRadius: 10 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                              <strong style={{ fontSize: 14 }}>{c.artist} — {c.track}</strong>
                            </div>
                            <div style={{ display: "grid", gap: 6, fontSize: 13, color: "var(--text-secondary)" }}>
                              <div><span style={{ color: "var(--text-tertiary)", fontSize: 12 }}>공통점:</span> {c.why_similar}</div>
                              <div><span style={{ color: "var(--green)", fontSize: 12 }}>그 곡의 성공 요인:</span> {c.what_they_did_well}</div>
                              <div><span style={{ color: "var(--blue)", fontSize: 12 }}>차별화 포인트:</span> {c.how_to_differentiate}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {listenResult.release_advice && (
                    <section className="subpanel" style={{ padding: 20 }}>
                      <p style={{ fontSize: 12, color: "var(--text-tertiary)", fontWeight: 600, marginBottom: 8 }}>릴리즈 조언</p>
                      <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.7 }}>{listenResult.release_advice}</p>
                    </section>
                  )}

                  {/* 프로덕션 노트 */}
                  {(listenResult.production?.mixing_note || listenResult.production?.arrangement_note) && (
                    <section className="subpanel" style={{ padding: 20 }}>
                      <p style={{ fontSize: 12, color: "var(--text-tertiary)", fontWeight: 600, marginBottom: 8 }}>프로덕션 노트</p>
                      {listenResult.production.mixing_note && <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 4 }}>믹싱: {listenResult.production.mixing_note}</p>}
                      {listenResult.production.arrangement_note && <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>편곡: {listenResult.production.arrangement_note}</p>}
                      {listenResult.vocal?.note && <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>보컬: {listenResult.vocal.note}</p>}
                    </section>
                  )}
                </>
              )}

              {listenResult?.error && (
                <section className="subpanel" style={{ padding: 20, borderLeft: "3px solid var(--red)" }}>
                  <p style={{ color: "var(--red)", fontSize: 13 }}>분석 실패: {listenResult.error}</p>
                </section>
              )}

              {/* 차트 데이터 기반 분석 (보조) */}
              {hitData && !hitData.error && (
              <>
              {/* 판정 카드 */}
              <section className="subpanel" style={{ textAlign: "center", padding: 28 }}>
                <p style={{ fontSize: 14, color: "var(--text-tertiary)", marginBottom: 8 }}>
                  {hitData.market_name} 시장 기준
                </p>
                <h3 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 8px", color: hitData.fit_ratio >= 0.7 ? "var(--green)" : hitData.fit_ratio >= 0.4 ? "var(--blue)" : "var(--red)" }}>
                  {hitData.verdict}
                </h3>
                <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>{hitData.verdict_detail}</p>
              </section>

              {/* 시기 분석 */}
              {timingData && !timingData.error && (
                <section className="subpanel" style={{ textAlign: "center", padding: 20 }}>
                  <p style={{ fontSize: 13, color: "var(--text-tertiary)", marginBottom: 6 }}>발매 시기</p>
                  <strong style={{ fontSize: 16, color: timingData.current_month_fit >= 70 ? "var(--green)" : "var(--blue)" }}>
                    {timingData.timing_verdict}
                  </strong>
                  {timingData.best_month && timingData.best_month !== timingData.current_month && (
                    <p style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 4 }}>
                      최적 시기: {timingData.best_month}월 ({timingData.best_month_score}점)
                    </p>
                  )}
                </section>
              )}

              {/* 피처 비교 테이블 */}
              <section className="subpanel">
                <p className="eyebrow">히트곡 대비 비교 (Top 10 기준)</p>
                <div style={{ display: "grid", gap: 6 }}>
                  {(hitData.comparisons || []).map((c: any) => {
                    const statusColor = c.status === "적합" ? "var(--green)" : c.status === "높음" ? "var(--blue)" : "var(--red)";
                    const featureLabels: Record<string, string> = {
                      danceability: "댄서빌리티", energy: "에너지", loudness: "라우드니스",
                      speechiness: "스피치", acousticness: "어쿠스틱", instrumentalness: "악기 비중",
                      liveness: "라이브감", valence: "밝기", tempo: "BPM",
                    };
                    return (
                      <div key={c.feature} style={{ display: "grid", gridTemplateColumns: "100px 1fr 60px 60px 50px", alignItems: "center", gap: 8, padding: "8px 4px", borderBottom: "1px solid var(--border-light)" }}>
                        <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{featureLabels[c.feature] || c.feature}</span>
                        <div style={{ height: 6, background: "var(--bg)", borderRadius: 3, position: "relative" as const, overflow: "hidden" }}>
                          {/* 시장 평균 마커 */}
                          <div style={{ position: "absolute" as const, left: `${Math.min(95, c.percentile)}%`, top: 0, width: 2, height: "100%", background: statusColor }} />
                        </div>
                        <span style={{ fontSize: 12, textAlign: "right" as const }}>{typeof c.my_value === "number" && c.my_value < 2 ? (c.my_value * 100).toFixed(0) + "%" : c.my_value}</span>
                        <span style={{ fontSize: 11, color: "var(--text-disabled)", textAlign: "right" as const }}>Top10: {typeof c.top10_avg === "number" && c.top10_avg < 2 ? (c.top10_avg * 100).toFixed(0) + "%" : c.top10_avg}</span>
                        <span style={{ fontSize: 11, fontWeight: 600, color: statusColor, textAlign: "right" as const }}>{c.status}</span>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* 시장별 점수 */}
              {hitData.market_scores && Object.keys(hitData.market_scores).length > 0 && (
                <section className="subpanel">
                  <p className="eyebrow">시장별 적합도</p>
                  <ResponsiveContainer width="100%" height={Math.max(200, Object.keys(hitData.market_scores).length * 28)}>
                    <BarChart data={Object.entries(hitData.market_scores as Record<string, number>).sort((a: any, b: any) => b[1] - a[1]).map(([m, s]: any) => ({ market: m.toUpperCase(), score: Math.round(s) }))} layout="vertical" margin={{ left: 10 }}>
                      <XAxis type="number" domain={[0, 100]} tick={{ fill: "#888", fontSize: 10 }} />
                      <YAxis type="category" dataKey="market" width={60} tick={{ fill: "#666", fontSize: 11 }} />
                      <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #eee" }} />
                      <Bar dataKey="score" fill="#3182f6" radius={[0, 6, 6, 0]} barSize={14} />
                    </BarChart>
                  </ResponsiveContainer>
                  {hitData.best_market && (
                    <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 8, textAlign: "center" }}>
                      가장 잘 맞는 시장: <strong>{hitData.best_market.toUpperCase()}</strong>
                    </p>
                  )}
                </section>
              )}

              {/* 비슷한 차트곡 */}
              {hitData.similar_chart_songs?.length > 0 && (
                <section className="subpanel">
                  <p className="eyebrow">비슷한 특성의 실제 차트곡</p>
                  <div className="similar-list">
                    {hitData.similar_chart_songs.slice(0, 7).map((s: any, i: number) => (
                      <div key={i} className="similar-row">
                        <div className="album-dot" style={{ fontSize: 12 }}>{s.rank}</div>
                        <div>
                          <strong style={{ fontSize: 13 }}>{s.artist} — {s.title}</strong>
                          <p style={{ fontSize: 12, margin: "2px 0 0" }}>차트 {s.rank}위 · 인기도 {s.popularity}</p>
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--blue)" }}>{Math.round(s.similarity * 100)}%</span>
                      </div>
                    ))}
                  </div>
                  <p style={{ fontSize: 11, color: "var(--text-disabled)", marginTop: 8, textAlign: "center" }}>
                    현재 이 시장에서 비슷한 특성으로 차트에 오른 곡들이에요
                  </p>
                </section>
              )}
              </>
              )}
            </div>
          )}

          {/* ─── Audio Detail Tab (기존 analysis) ─── */}
          {tab === "analysis" && (
            aState === "loading" ? <Loading title="오디오 분석 중" body="주파수 · 파형 · 에너지 분석을 진행하고 있어요." /> :
            aState === "error" ? <Empty title="오디오 상세 분석 준비 중" body="이 기능은 현재 준비 중이에요. 히트 분석 탭에서 Gemini 분석을 이용해주세요." /> :
            analysis ? (
              <div className="stack">
                {/* Market scores bar chart */}
                <section className="subpanel">
                  <p className="eyebrow">{t("analysis.marketSplit")}</p>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={marketChartData} layout="vertical" margin={{ left: 10 }}>
                      <XAxis type="number" domain={[0, 100]} tick={{ fill: "#888", fontSize: 11 }} />
                      <YAxis type="category" dataKey="market" width={60} tick={{ fill: "#ccc", fontSize: 12 }} />
                      <Tooltip contentStyle={{ background: "#1a1a2e", border: "1px solid #333", borderRadius: 8, color: "#fff" }} />
                      <Bar dataKey="score" radius={[0, 6, 6, 0]} barSize={24}>
                        {marketChartData.map(d => <Cell key={d.code} fill={scoreColor(d.score)} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </section>

                <div className="grid-two">
                  {/* Radar chart */}
                  <section className="subpanel">
                    <p className="eyebrow">{t("analysis.signalSummary")}</p>
                    <ResponsiveContainer width="100%" height={260}>
                      <RadarChart data={radarData}>
                        <PolarGrid stroke="#333" />
                        <PolarAngleAxis dataKey="axis" tick={{ fill: "#aaa", fontSize: 11 }} />
                        <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                        <Radar dataKey="value" stroke="#818cf8" fill="#818cf8" fillOpacity={0.3} strokeWidth={2} />
                      </RadarChart>
                    </ResponsiveContainer>
                  </section>

                  {/* Frequency balance pie */}
                  <section className="subpanel">
                    <p className="eyebrow">{t("metric.balance")}</p>
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie data={freqBalance} dataKey="value" nameKey="name" cx="50%" cy="50%"
                          innerRadius={50} outerRadius={80} paddingAngle={3}
                          label={({ name, value }) => `${name} ${value}%`}
                        >
                          {freqBalance.map(d => <Cell key={d.name} fill={d.fill} />)}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="stat-grid">
                      <MiniStat label={t("metric.tempo")} value={`${Math.round(analysis.deep_analysis.tempo?.bpm ?? 0)} BPM`} />
                      <MiniStat label={t("metric.key")} value={analysis.deep_analysis.tonality?.key_name ?? "n/a"} />
                      <MiniStat label={t("metric.polish")} value={`${analysis.deep_analysis.production?.polish_score ?? 0}/10`} />
                      <MiniStat label={t("metric.mood")} value={analysis.deep_analysis.mood?.primary_mood ?? "n/a"} />
                    </div>
                  </section>
                </div>

                {/* Energy contour area chart */}
                {energyContour.length > 0 && (
                  <section className="subpanel">
                    <p className="eyebrow">{t("metric.energy")} Contour</p>
                    <ResponsiveContainer width="100%" height={120}>
                      <AreaChart data={energyContour}>
                        <defs>
                          <linearGradient id="energyGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#818cf8" stopOpacity={0.6} />
                            <stop offset="95%" stopColor="#818cf8" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                        <XAxis dataKey="section" tick={{ fill: "#666", fontSize: 10 }} />
                        <Area type="monotone" dataKey="energy" stroke="#818cf8" fill="url(#energyGrad)" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </section>
                )}

                {/* Similar tracks */}
                <section className="subpanel">
                  <p className="eyebrow">{t("analysis.refMatches")}</p>
                  <div className="similar-list">
                    {analysis.similar_tracks.length ? analysis.similar_tracks.map(tr => (
                      <div className="similar-row" key={`${tr.artist}-${tr.title}`}>
                        <div className="album-dot">
                          {tr.album_art ? <img alt="" src={tr.album_art} /> : tr.artist.slice(0, 1)}
                        </div>
                        <div>
                          <strong>{tr.artist} — {tr.title}</strong>
                          <p>{tr.genre || t("metric.genre")} / {t("metric.similarity")} {Math.round(tr.similarity * 100)}%</p>
                        </div>
                        <div className="similar-meta">
                          {tr.popularity ? <span>pop {tr.popularity}</span> : null}
                          {tr.spotify_url ? <a href={tr.spotify_url} target="_blank" rel="noreferrer">Spotify</a> : null}
                        </div>
                      </div>
                    )) : <p className="muted-copy">{t("analysis.noSimilar")}</p>}
                  </div>
                </section>

                {/* Market DNA Comparison — Viberate-style multi-market radar */}
                {marketProfiles && marketProfiles.profiles && Object.keys(marketProfiles.profiles).length > 0 && (
                  <section className="subpanel">
                    <p className="eyebrow">Market DNA — 12개 시장 오디오 특성 비교 (280만곡 기반)</p>
                    <div className="grid-two">
                      {/* Danceability by market */}
                      <div>
                        <p style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 8 }}>Danceability 평균</p>
                        <ResponsiveContainer width="100%" height={280}>
                          <BarChart data={Object.entries(marketProfiles.profiles)
                            .filter(([_, p]) => p.danceability)
                            .map(([m, p]) => ({ market: t(`market.${m}`), value: Math.round(p.danceability.mean * 100) }))
                            .sort((a, b) => b.value - a.value)
                          } layout="vertical" margin={{ left: 10 }}>
                            <XAxis type="number" domain={[0, 100]} tick={{ fill: "#888", fontSize: 10 }} />
                            <YAxis type="category" dataKey="market" width={80} tick={{ fill: "#666", fontSize: 11 }} />
                            <Tooltip contentStyle={{ background: "#fff", border: "1px solid #eee", borderRadius: 10, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }} />
                            <Bar dataKey="value" fill="#3182f6" radius={[0, 6, 6, 0]} barSize={16} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                      {/* Energy by market */}
                      <div>
                        <p style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 8 }}>Energy 평균</p>
                        <ResponsiveContainer width="100%" height={280}>
                          <BarChart data={Object.entries(marketProfiles.profiles)
                            .filter(([_, p]) => p.energy)
                            .map(([m, p]) => ({ market: t(`market.${m}`), value: Math.round(p.energy.mean * 100) }))
                            .sort((a, b) => b.value - a.value)
                          } layout="vertical" margin={{ left: 10 }}>
                            <XAxis type="number" domain={[0, 100]} tick={{ fill: "#888", fontSize: 10 }} />
                            <YAxis type="category" dataKey="market" width={80} tick={{ fill: "#666", fontSize: 11 }} />
                            <Tooltip contentStyle={{ background: "#fff", border: "1px solid #eee", borderRadius: 10, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }} />
                            <Bar dataKey="value" fill="#8b5cf6" radius={[0, 6, 6, 0]} barSize={16} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                    <div className="grid-two" style={{ marginTop: 16 }}>
                      {/* Valence by market */}
                      <div>
                        <p style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 8 }}>Valence (긍정도) 평균</p>
                        <ResponsiveContainer width="100%" height={280}>
                          <BarChart data={Object.entries(marketProfiles.profiles)
                            .filter(([_, p]) => p.valence)
                            .map(([m, p]) => ({ market: t(`market.${m}`), value: Math.round(p.valence.mean * 100) }))
                            .sort((a, b) => b.value - a.value)
                          } layout="vertical" margin={{ left: 10 }}>
                            <XAxis type="number" domain={[0, 100]} tick={{ fill: "#888", fontSize: 10 }} />
                            <YAxis type="category" dataKey="market" width={80} tick={{ fill: "#666", fontSize: 11 }} />
                            <Tooltip contentStyle={{ background: "#fff", border: "1px solid #eee", borderRadius: 10, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }} />
                            <Bar dataKey="value" fill="#00c471" radius={[0, 6, 6, 0]} barSize={16} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                      {/* Tempo by market */}
                      <div>
                        <p style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 8 }}>Tempo 평균 (BPM)</p>
                        <ResponsiveContainer width="100%" height={280}>
                          <BarChart data={Object.entries(marketProfiles.profiles)
                            .filter(([_, p]) => p.tempo)
                            .map(([m, p]) => ({ market: t(`market.${m}`), value: Math.round(p.tempo.mean) }))
                            .sort((a, b) => b.value - a.value)
                          } layout="vertical" margin={{ left: 10 }}>
                            <XAxis type="number" domain={[80, 140]} tick={{ fill: "#888", fontSize: 10 }} />
                            <YAxis type="category" dataKey="market" width={80} tick={{ fill: "#666", fontSize: 11 }} />
                            <Tooltip contentStyle={{ background: "#fff", border: "1px solid #eee", borderRadius: 10, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }} />
                            <Bar dataKey="value" fill="#f04452" radius={[0, 6, 6, 0]} barSize={16} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                    <p style={{ fontSize: 11, color: "var(--text-disabled)", marginTop: 12, textAlign: "center" }}>
                      72개국 차트 기준 시장별 음악 특성 비교
                    </p>
                  </section>
                )}
              </div>
            ) : <Empty title={t("analysis.empty.title")} body={t("analysis.empty.body")} />
          )}

          {/* ─── Benchmark Tab ─── */}
          {tab === "benchmark" && (
            bState === "loading" ? <Loading title={t("benchmark.loading.title")} body={t("benchmark.loading.body")} /> :
            bState === "error" ? <Empty title="프로덕션 비교 준비 중" body="시장별 프로덕션 벤치마크 데이터를 구축하고 있어요. 히트 분석 탭을 이용해주세요." /> :
            !benchmark ? <Empty title={t("benchmark.empty.title")} body={t("benchmark.empty.body")} /> :
            benchmark.error ? <Empty title={t("benchmark.error.title")} body={benchmark.error} /> :
            <div className="stack">
              <section className="subpanel">
                <p className="eyebrow">{t("benchmark.productionMatch")}</p>
                <div className="benchmark-hero">
                  <div className="benchmark-score-big" style={{ color: scoreColor(benchmark.match_score ?? 0) }}>
                    {benchmark.match_score ?? 0}
                  </div>
                  <span>{benchmark.market_name} / {benchmark.sample_count ?? 0} {t("benchmark.tracks")}</span>
                </div>
              </section>
              {/* Benchmark bar chart */}
              <section className="subpanel">
                <p className="eyebrow">{t("benchmark.bandComparison")}</p>
                <ResponsiveContainer width="100%" height={Math.max(300, benchmark.comparisons.length * 44)}>
                  <BarChart data={benchmark.comparisons.map(c => ({
                    name: c.kr_label,
                    track: c.track_value,
                    market: c.market_mean,
                    status: c.status,
                  }))} layout="vertical" margin={{ left: 20 }}>
                    <XAxis type="number" tick={{ fill: "#888", fontSize: 10 }} />
                    <YAxis type="category" dataKey="name" width={90} tick={{ fill: "#ccc", fontSize: 11 }} />
                    <Tooltip contentStyle={{ background: "#1a1a2e", border: "1px solid #333", borderRadius: 8, color: "#fff" }} />
                    <Bar dataKey="track" fill="#818cf8" name={t("benchmark.th.yourTrack")} barSize={10} radius={[0, 4, 4, 0]} />
                    <Bar dataKey="market" fill="#444" name={t("benchmark.th.marketMean")} barSize={10} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </section>
              {/* Advice list */}
              <section className="subpanel">
                <p className="eyebrow">{t("benchmark.th.advice")}</p>
                <div className="advice-list">
                  {benchmark.comparisons.filter(c => c.status !== "match").map(c => (
                    <div key={c.feature} className={`advice-row advice-${c.status}`}>
                      <span className={`status-tag status-${c.status}`}>{c.status_kr}</span>
                      <strong>{c.kr_label}</strong>
                      <p>{c.advice}</p>
                    </div>
                  ))}
                  {benchmark.comparisons.every(c => c.status === "match") && (
                    <p className="muted-copy">✅ 모든 대역이 시장 기준에 부합합니다.</p>
                  )}
                </div>
              </section>
            </div>
          )}

          {/* ─── Viral Tab ─── */}
          {tab === "viral" && (
            vState === "loading" ? <Loading title={t("viral.loading.title")} body={t("viral.loading.body")} /> :
            vState === "error" ? <Empty title="숏폼 구간 분석 준비 중" body="바이럴 구간 탐지 기능을 준비하고 있어요. 히트 분석 탭의 숏폼 추천을 참고해주세요." /> :
            !viral ? <Empty title={t("viral.empty.title")} body={t("viral.empty.body")} /> :
            <div className="stack">
              <section className="subpanel feature-hero">
                <p className="eyebrow">{t("viral.bestSegment")}</p>
                <h3 className="viral-timestamp">{viral.best.timestamp}</h3>
                <p className="muted-copy">{t("viral.score")} {Math.round(viral.best.score * 100)} / 100</p>
                <div className="reason-pills">
                  {viral.best.reasons.map(r => <span className="reason-pill" key={r}>{r}</span>)}
                </div>
              </section>
              {/* Viral radar */}
              <section className="subpanel">
                <ResponsiveContainer width="100%" height={240}>
                  <RadarChart data={[
                    { axis: t("metric.energy"), value: Math.round((viral.best.details.energy ?? 0) * 100) },
                    { axis: "리듬", value: Math.round((viral.best.details.rhythm ?? 0) * 100) },
                    { axis: t("metric.vocalPresence"), value: Math.round((viral.best.details.vocal ?? 0) * 100) },
                    { axis: "훅감", value: Math.round((viral.best.details.hookiness ?? 0) * 100) },
                    { axis: "변화도", value: Math.round((viral.best.details.interest ?? 0) * 100) },
                  ]}>
                    <PolarGrid stroke="#333" />
                    <PolarAngleAxis dataKey="axis" tick={{ fill: "#aaa", fontSize: 11 }} />
                    <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                    <Radar dataKey="value" stroke="#f472b6" fill="#f472b6" fillOpacity={0.3} strokeWidth={2} />
                  </RadarChart>
                </ResponsiveContainer>
              </section>
              {/* Top 3 */}
              <section className="subpanel">
                <p className="eyebrow">{t("viral.top3")}</p>
                <div className="segment-list">
                  {viral.top3.map((s, i) => (
                    <div className="segment-row" key={`${s.start_sec}-${s.end_sec}`}>
                      <span className="rank">#{i + 1}</span>
                      <strong>{fmtSec(s.start_sec)} - {fmtSec(s.end_sec)}</strong>
                      <div className="segment-bar"><div className="segment-fill" style={{ width: `${s.score * 100}%` }} /></div>
                      <span className="segment-score">{Math.round(s.score * 100)}</span>
                    </div>
                  ))}
                </div>
                <p className="tip">{t("viral.tip")}</p>
              </section>
            </div>
          )}

          {/* ─── Gemini Tab ─── */}
          {tab === "gemini" && (
            <div className="stack">
              <section className="subpanel gemini-cta">
                <div>
                  <p className="eyebrow">{t("gemini.eyebrow")}</p>
                  <h3>{t("gemini.title")}</h3>
                  <p className="muted-copy">{t("gemini.body")}</p>
                </div>
                <button className="primary-button" disabled={!file || !analysis || gState === "loading"} onClick={handleGemini} type="button">
                  {gState === "loading" ? t("gemini.generating") : t("gemini.generate")}
                </button>
              </section>
              {gState === "loading" && <Loading title={t("gemini.loading.title")} body={t("gemini.loading.body")} />}
              {geminiStructured && <GeminiCards data={geminiStructured as any} />}
              {geminiHtml && !geminiStructured && <section className="subpanel markdown-shell" dangerouslySetInnerHTML={{ __html: geminiHtml }} />}
              {gState === "idle" && !geminiHtml && !geminiStructured && <Empty title={t("gemini.idle.title")} body={t("gemini.idle.body")} />}
            </div>
          )}

          {/* ─── Compare Tab ─── */}
          {tab === "compare" && (
            <div className="stack">
              <section className="subpanel">
                <p className="eyebrow">{t("compare.eyebrow")}</p>
                <div className="compare-grid">
                  <FileSlot label={t("compare.versionA")} file={cFileA} onSelect={setCFileA} t={t} />
                  <FileSlot label={t("compare.versionB")} file={cFileB} onSelect={setCFileB} t={t} />
                </div>
                <button className="primary-button" disabled={!cFileA || !cFileB || cState === "loading"} onClick={handleCompare} type="button">
                  {cState === "loading" ? t("compare.comparing") : t("compare.run")}
                </button>
              </section>
              {cState === "loading" && <Loading title={t("compare.loading.title")} body={t("compare.loading.body")} />}
              {compare && (
                <>
                  <section className="subpanel compare-winner">
                    <p className="eyebrow">{t("compare.winner")}</p>
                    <div className="winner-strip">
                      <strong>{compare.winner === "TIE" ? t("compare.tie") : `Version ${compare.winner}`}</strong>
                      <span>{compare.market_name} / A {compare.score_a} {t("compare.vs")} B {compare.score_b}</span>
                    </div>
                    {/* Compare bar */}
                    <ResponsiveContainer width="100%" height={60}>
                      <BarChart data={[{ a: compare.score_a, b: compare.score_b }]} layout="vertical">
                        <XAxis type="number" domain={[0, 100]} hide />
                        <YAxis type="category" hide />
                        <Bar dataKey="a" fill="#818cf8" name="A" barSize={20} radius={[4, 0, 0, 4]} />
                        <Bar dataKey="b" fill="#f472b6" name="B" barSize={20} radius={[4, 0, 0, 4]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </section>
                  <section className="subpanel">
                    <p className="eyebrow">{t("compare.biggestDiff")}</p>
                    <div className="difference-list">
                      {compare.differences.slice(0, 8).map(d => (
                        <div className="difference-row" key={d.feature}>
                          <strong>{d.feature}</strong>
                          <span className="diff-a">A: {d.a_value}{d.unit}</span>
                          <span className="diff-b">B: {d.b_value}{d.unit}</span>
                          <span className="winner-pill">{d.better} {t("compare.better")}</span>
                        </div>
                      ))}
                    </div>
                  </section>
                </>
              )}
              {cState === "idle" && !compare && <Empty title={t("compare.idle.title")} body={t("compare.idle.body")} />}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return <div className="mini-stat"><span>{label}</span><strong>{value}</strong></div>;
}

function FileSlot({ label, file, onSelect, t }: { label: string; file: File | null; onSelect: (f: File | null) => void; t: (k: string) => string }) {
  return (
    <label className="file-slot">
      <input className="hidden-input" type="file" accept=".mp3,.wav,.flac,audio/*" onChange={e => onSelect(e.target.files?.[0] ?? null)} />
      <span className="eyebrow">{label}</span>
      <strong>{file ? file.name : t("compare.selectFile")}</strong>
    </label>
  );
}

function Loading({ title, body }: { title: string; body: string }) {
  const [dots, setDots] = useState("");
  useEffect(() => {
    const id = setInterval(() => setDots(d => d.length >= 3 ? "" : d + "."), 500);
    return () => clearInterval(id);
  }, []);
  const messages = ["화성 구조 분석 중", "마켓 DB 매칭 중", "AI 파라미터 연산 중", "믹싱 다이나믹 점검 중"];
  const [msgIdx, setMsgIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setMsgIdx(i => (i + 1) % messages.length), 3000);
    return () => clearInterval(id);
  }, []);

  return (
    <section className="subpanel empty-state">
      <div className="loading-orb" />
      <h3>{title}{dots}</h3>
      <p style={{ color: "var(--copper)", fontWeight: "bold", marginTop: "10px" }}>{messages[msgIdx]}...</p>
      <p>{body}</p>
    </section>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return <section className="subpanel empty-state"><h3>{title}</h3><p>{body}</p></section>;
}

function fmtSec(s: number) { return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`; }

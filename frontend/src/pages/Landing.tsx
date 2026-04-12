import { useNavigate } from "react-router-dom";
import { ArrowRight, Check } from "lucide-react";
import { motion, Variants, useMotionValue, useTransform, useSpring } from "framer-motion";
import { useEffect, useRef, useState, useCallback } from "react";

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] } }
};

const stagger: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.07 } }
};

function Counter({ target, suffix = "" }: { target: number; suffix?: string }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const done = useRef(false);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !done.current) {
        done.current = true;
        const t0 = performance.now();
        const step = (now: number) => {
          const p = Math.min((now - t0) / 1200, 1);
          setCount(Math.floor((1 - Math.pow(1 - p, 3)) * target));
          if (p < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }
    }, { threshold: 0.5 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [target]);
  return <span ref={ref}>{count.toLocaleString()}{suffix}</span>;
}

function TiltCard({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotateX = useSpring(useTransform(y, [-0.5, 0.5], [6, -6]), { stiffness: 200, damping: 20 });
  const rotateY = useSpring(useTransform(x, [-0.5, 0.5], [-6, 6]), { stiffness: 200, damping: 20 });

  const handleMouse = useCallback((e: React.MouseEvent) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    x.set((e.clientX - rect.left) / rect.width - 0.5);
    y.set((e.clientY - rect.top) / rect.height - 0.5);
  }, [x, y]);

  const handleLeave = useCallback(() => { x.set(0); y.set(0); }, [x, y]);

  return (
    <motion.div ref={ref} className={className}
      style={{ rotateX, rotateY, transformPerspective: 800 }}
      onMouseMove={handleMouse} onMouseLeave={handleLeave}>
      {children}
    </motion.div>
  );
}

export default function Landing() {
  const nav = useNavigate();
  const [mouseX, setMouseX] = useState(0);

  return (
    <div className="landing">
      <div className="landing-ambient">
        <div className="ambient-orb ambient-orb-1" />
        <div className="ambient-orb ambient-orb-2" />
      </div>

      {/* ── Nav ── */}
      <nav className="landing-nav">
        <div className="landing-nav-inner">
          <div className="nav-logo" onClick={() => nav("/")}>
            <img src="/logo.png" alt="Music Brain" className="logo-img" />
            <span>Music Brain</span>
          </div>
          <div className="nav-links">
            <a href="#what">기능</a>
            <a href="#how">프로세스</a>
            <a href="/pricing">도입</a>
          </div>
          <div className="nav-actions">
            <button className="btn btn-primary btn-sm" onClick={() => nav("/studio")}>
              스튜디오 진입 <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="landing-hero">
        <motion.div initial="hidden" animate="visible" variants={stagger} className="hero-content">
          <motion.p variants={fadeUp} className="hero-kicker">
            For A&R, Producers & Labels
          </motion.p>

          <motion.h1 variants={fadeUp} className="hero-title">
            타이틀곡 회의 전에,<br />
            <span className="gradient-text">데이터를 먼저 보세요.</span>
          </motion.h1>

          <motion.p variants={fadeUp} className="hero-sub">
            곡을 업로드하면 어느 시장에서 경쟁력이 있는지,<br />
            프로덕션은 레퍼런스 대비 어떤지, 숏폼에 쓸 구간은 어딘지<br />
            한 화면에서 확인할 수 있습니다.
          </motion.p>

          <motion.div variants={fadeUp} className="hero-actions">
            <button className="btn btn-primary btn-hero" onClick={() => nav("/studio")}>
              무료로 곡 분석해보기 <ArrowRight size={16} />
            </button>
          </motion.div>
          <motion.p variants={fadeUp} className="hero-note">
            가입 없이 바로 사용 · 설치 불필요
          </motion.p>
        </motion.div>

        {/* Hero mockup */}
        <motion.div
          className="hero-visual"
          initial={{ opacity: 0, y: 48 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3 }}
        >
          <div className="visual-glow" />
          <TiltCard className="visual-card">
            <div className="visual-toolbar">
              <div className="toolbar-dots"><span /><span /><span /></div>
              <span className="toolbar-title">Studio — Market Fit Analysis</span>
              <div />
            </div>
            <div className="visual-body">
              <div className="visual-left">
                <div className="visual-score-ring">
                  <svg viewBox="0 0 120 120">
                    <circle cx="60" cy="60" r="52" fill="none" stroke="#f0f0f0" strokeWidth="8" />
                    <motion.circle cx="60" cy="60" r="52" fill="none" stroke="url(#scoreGrad)" strokeWidth="8"
                      strokeLinecap="round" strokeDasharray={327}
                      initial={{ strokeDashoffset: 327 }}
                      animate={{ strokeDashoffset: 327 * 0.08 }}
                      transition={{ duration: 1.5, delay: 0.8, ease: "easeOut" }}
                      transform="rotate(-90 60 60)" />
                    <defs>
                      <linearGradient id="scoreGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#3182f6" />
                        <stop offset="100%" stopColor="#8b5cf6" />
                      </linearGradient>
                    </defs>
                  </svg>
                  <div className="score-inner">
                    <strong>92</strong>
                    <span>US</span>
                  </div>
                </div>
              </div>
              <div className="visual-right">
                {[
                  { flag: "🇰🇷", m: "Korea", s: 68, c: "#3182f6" },
                  { flag: "🇺🇸", m: "US", s: 92, c: "#8b5cf6" },
                  { flag: "🇯🇵", m: "Japan", s: 57, c: "#f04452" },
                  { flag: "🇧🇷", m: "Latin", s: 34, c: "#ffc533" },
                  { flag: "🌏", m: "SEA", s: 85, c: "#00c471" },
                ].map((d, i) => (
                  <div key={d.m} className="market-row">
                    <span className="market-flag">{d.flag}</span>
                    <span className="market-name">{d.m}</span>
                    <div className="market-bar-track">
                      <motion.div className="market-bar-fill" style={{ background: d.c }}
                        initial={{ width: 0 }} animate={{ width: `${d.s}%` }}
                        transition={{ duration: 0.8, delay: 0.6 + i * 0.1 }} />
                    </div>
                    <strong className="market-score" style={{ color: d.c }}>{d.s}</strong>
                  </div>
                ))}
              </div>
            </div>
          </TiltCard>
        </motion.div>
      </section>

      {/* ── Numbers ── */}
      <section className="landing-stats-section">
        <motion.div className="stats-grid" initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.5 }} variants={stagger}>
          {[
            { num: 280, suf: "만", label: "레퍼런스 트랙", sub: "Spotify 기반" },
            { num: 193, suf: "개", label: "분석 피처", sub: "오디오 시그널" },
            { num: 12, suf: "개", label: "타겟 시장", sub: "글로벌 커버리지" },
            { num: 72, suf: "개국", label: "차트 데이터", sub: "실시간 수집" },
          ].map(s => (
            <motion.div variants={fadeUp} key={s.label} className="stat-item">
              <strong><Counter target={s.num} suffix={s.suf} /></strong>
              <span className="stat-label">{s.label}</span>
              <span className="stat-sub">{s.sub}</span>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* ── What it does — slide style ── */}
      <section className="slide" id="what">
        <motion.div className="slide-inner" initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger}>
          <motion.div variants={fadeUp} className="eq-banner"
            onMouseMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              setMouseX((e.clientX - rect.left) / rect.width);
            }}
            onMouseLeave={() => setMouseX(0)}>
            <div className="eq-bars">
              {Array.from({ length: 80 }).map((_, i) => {
                const center = 40;
                const dist = Math.abs(i - center) / center;
                const envelope = 1 - dist * dist;
                const wave = Math.sin(i * 0.4) * 0.3 + Math.sin(i * 0.9) * 0.2 + Math.cos(i * 0.15) * 0.15;
                const barPos = i / 80;
                const mouseDist = mouseX > 0 ? Math.max(0, 1 - Math.abs(barPos - mouseX) * 5) : 0;
                const boost = 1 + mouseDist * 0.6;
                const h = (8 + envelope * 85 * (0.5 + wave)) * boost;
                const hue = 210 + i * 2.2;
                const lightness = 52 + envelope * 18 + mouseDist * 12;
                return (
                  <div key={i} className="eq-bar" style={{
                    '--h': `${h}%`,
                    '--delay': `${i * 0.04}s`,
                    '--color': `hsl(${hue}, ${70 + mouseDist * 15}%, ${lightness}%)`,
                    transition: 'height 0.15s ease, background 0.15s ease',
                  } as React.CSSProperties} />
                );
              })}
            </div>
          </motion.div>
          <motion.p variants={fadeUp} className="slide-label">핵심 기능</motion.p>
          <motion.h2 variants={fadeUp} className="slide-heading">
            곡을 넣으면,<br />이런 것들을 알 수 있습니다.
          </motion.h2>

          <div className="feature-list">
            {[
              { num: "01", title: "이 곡이 어느 나라에서 먹힐까?", body: "12개 시장별 적합도를 수치로 보여줍니다. 한국 68점, 미국 92점, 동남아 85점 — 이런 식으로. 타겟 시장을 감이 아니라 숫자로 정할 수 있습니다." },
              { num: "02", title: "프로덕션 퀄리티는 경쟁곡 대비 어떤가?", body: "빌보드 상위권, 멜론 차트인 곡들의 평균 주파수 밸런스와 비교합니다. 로우엔드가 약한지, 보컬이 묻히는지, 12개 대역별로 차이를 보여줍니다." },
              { num: "03", title: "TikTok에 쓸 구간은?", body: "곡 전체에서 에너지가 가장 높고 훅이 강한 7–15초 구간을 자동으로 찾아줍니다. 숏폼 마케팅팀에 바로 전달할 수 있는 타임코드." },
              { num: "04", title: "이 곡으로 어떤 전략을 짜야 할까?", body: "분석 결과를 바탕으로 마케팅 방향, 타겟 오디언스, 릴리스 타이밍, 플레이리스팅 전략까지 리포트로 정리합니다." },
              { num: "05", title: "A 믹스 vs B 믹스, 어느 게 나은가?", body: "두 버전의 마스터를 동시에 분석해서 시장 적합도, 주파수 밸런스, 바이럴 포텐셜을 나란히 비교합니다." },
            ].map(f => (
              <motion.div variants={fadeUp} key={f.num} className="feature-item">
                <span className="feature-num">{f.num}</span>
                <div>
                  <h3>{f.title}</h3>
                  <p>{f.body}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* ── How it works — slide ── */}
      <section className="slide slide-dark" id="how" style={{ backgroundImage: 'url(/landing-wave.png)', backgroundSize: 'cover', backgroundPosition: 'center', backgroundBlendMode: 'soft-light' }}>
        <motion.div className="slide-inner" initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger}>
          <motion.p variants={fadeUp} className="slide-label slide-label-light">프로세스</motion.p>
          <motion.h2 variants={fadeUp} className="slide-heading slide-heading-light">
            복잡한 건 없습니다.
          </motion.h2>

          <div className="process-steps">
            {[
              { n: "1", title: "시장을 고르세요", desc: "한국, 미국, 일본, 동남아 등 12개 시장 중 타겟을 선택합니다." },
              { n: "2", title: "곡을 올리세요", desc: "MP3, WAV, FLAC. 드래그 앤 드롭. 분석은 30초면 끝납니다." },
              { n: "3", title: "결과를 보세요", desc: "시장 적합도, 프로덕션 리뷰, 바이럴 구간, 전략 리포트가 한 화면에." },
            ].map(s => (
              <motion.div variants={fadeUp} key={s.n} className="process-step">
                <div className="process-num">{s.n}</div>
                <h3>{s.title}</h3>
                <p>{s.desc}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* ── Difference — slide ── */}
      <section className="slide">
        <motion.div className="slide-inner" initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger}>
          <motion.p variants={fadeUp} className="slide-label">차별점</motion.p>
          <motion.h2 variants={fadeUp} className="slide-heading">
            Chartmetric은 성적표.<br />
            Music Brain은 처방전.
          </motion.h2>
          <motion.p variants={fadeUp} className="slide-sub">
            기존 도구는 릴리스 후 스트리밍 수와 팔로워를 추적합니다.<br />
            Music Brain은 릴리스 전에 곡 자체를 분석해서<br />
            어디서 경쟁력이 있고, 프로덕션을 어떻게 고쳐야 하는지 알려줍니다.
          </motion.p>

          <motion.div variants={fadeUp} className="diff-grid">
            <div className="diff-card diff-card-highlight">
              <strong>Music Brain</strong>
              <p>발매 전, 곡 자체를 분석</p>
              <ul>
                <li><Check size={15} /> 193개 오디오 피처 분석</li>
                <li><Check size={15} /> 12개 시장별 적합도 점수</li>
                <li><Check size={15} /> 레퍼런스 대비 프로덕션 비교</li>
                <li><Check size={15} /> 숏폼 바이럴 구간 추출</li>
                <li><Check size={15} /> 전략 리포트 자동 생성</li>
                <li><Check size={15} /> 멜론 · 벅스 차트 연동</li>
              </ul>
            </div>
            <div className="diff-card">
              <strong>기존 분석 도구</strong>
              <p>발매 후, 수치만 집계</p>
              <ul className="diff-list-muted">
                <li>스트리밍 수 · 팔로워 증감</li>
                <li>차트 진입 후 순위 추적</li>
                <li>플레이리스트 추가/삭제 이력</li>
                <li>소셜 미디어 지표</li>
                <li>곡 자체 분석 기능 없음</li>
                <li>한국 국내 차트 미지원</li>
              </ul>
            </div>
          </motion.div>
        </motion.div>
      </section>

      {/* ── For who — slide ── */}
      <section className="slide slide-alt">
        <motion.div className="slide-inner" initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger}>
          <motion.p variants={fadeUp} className="slide-label">사용 사례</motion.p>
          <motion.h2 variants={fadeUp} className="slide-heading">
            이런 상황에서 씁니다.
          </motion.h2>

          <div className="usecase-grid">
            {[
              { who: "A&R 담당자", scene: "\"데모가 200곡인데 타이틀곡 후보를 3곡으로 줄여야 합니다\"", how: "전곡 분석 → 시장 적합도 상위 곡 선별 → 회의 자료로 활용" },
              { who: "프로듀서", scene: "\"이 믹스가 US 시장에 맞는 밸런스인지 확인하고 싶습니다\"", how: "빌보드 Top 50 평균과 12대역 주파수 비교 → 교정 포인트 확인" },
              { who: "기획사 대표", scene: "\"이번 신인 데뷔곡, 일본이랑 동남아 중 어디를 먼저 공략할지\"", how: "시장별 적합도 비교 → 데이터 기반 진출 순서 결정" },
              { who: "마케팅팀", scene: "\"TikTok 챌린지에 쓸 구간을 빨리 뽑아주세요\"", how: "바이럴 구간 자동 감지 → 타임코드와 함께 전달" },
            ].map(u => (
              <motion.div variants={fadeUp} key={u.who} className="usecase-card">
                <span className="usecase-who">{u.who}</span>
                <p className="usecase-scene">{u.scene}</p>
                <p className="usecase-how">{u.how}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* ── CTA ── */}
      <section className="slide slide-cta" style={{ backgroundImage: 'linear-gradient(rgba(17,19,24,0.85), rgba(17,19,24,0.92)), url(/landing-studio.png)', backgroundSize: 'cover', backgroundPosition: 'center' }}>
        <motion.div className="slide-inner" initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }}>
          <h2>다음 타이틀곡 회의 전에<br />한번 돌려보세요.</h2>
          <p>가입 없이, 설치 없이. 곡만 올리면 됩니다.</p>
          <button className="btn btn-primary btn-hero" onClick={() => nav("/studio")}>
            무료로 곡 분석하기 <ArrowRight size={16} />
          </button>
        </motion.div>
      </section>

      {/* ── Footer ── */}
      <footer className="landing-footer-v2">
        <div className="footer-inner-v2">
          <div className="footer-brand-v2">
            <div className="nav-logo">
              <img src="/logo.png" alt="Music Brain" className="logo-img logo-img-sm" />
              <span>Music Brain</span>
            </div>
            <p>A&R Intelligence for the Global Music Industry</p>
          </div>
          <div className="footer-cols">
            <div>
              <h4>Product</h4>
              <a href="/studio">스튜디오</a>
              <a href="/trends">트렌드</a>
              <a href="/artists">아티스트</a>
            </div>
            <div>
              <h4>Company</h4>
              <a href="/about">소개</a>
              <a href="/pricing">도입 문의</a>
              <a href="/contact">연락처</a>
            </div>
          </div>
        </div>
        <div className="footer-bottom-v2">
          <span>&copy; 2026 Music Brain. All rights reserved.</span>
        </div>
      </footer>
    </div>
  );
}

import { useNavigate } from "react-router-dom";
import { CheckCircle2, ArrowRight } from "lucide-react";

export default function Pricing() {
  const nav = useNavigate();
  return (
    <div className="page">
      <nav className="landing-nav"><div className="landing-nav-inner">
        <div className="nav-logo" onClick={() => nav("/")}><img src="/logo.png" alt="Music Brain" className="logo-img" /><span>Music Brain</span></div>
        <div className="nav-links"><a href="/#what">기능</a><a href="/#how">프로세스</a><a href="/pricing">도입</a></div>
        <div className="nav-actions"><button className="btn btn-primary btn-sm" onClick={() => nav("/studio")}>스튜디오 진입 <ArrowRight size={14} /></button></div>
      </div></nav>

      <section className="page-hero">
        <h1>합리적인 요금제</h1>
        <p>필요한 만큼만 사용하세요</p>
      </section>

      <div className="pricing-grid">
        {[
          { name: "Free", price: "₩0", period: "/월", desc: "시작하기 좋은 무료 플랜", features: ["월 5곡 분석", "4개 시장 적합도", "프로덕션 벤치마크", "바이럴 구간 감지", "딥 오디오 분석"], cta: "무료로 시작", highlight: false },
          { name: "Pro", price: "₩29,000", period: "/월", desc: "프로듀서와 A&R을 위한 플랜", features: ["무제한 분석", "AI A&R 리포트 (Gemini)", "8주 릴리즈 로드맵", "마케팅 전략 & 예산 가이드", "A/B 믹스 비교", "구조화된 JSON API", "우선 지원"], cta: "Pro 시작하기", highlight: true },
          { name: "Enterprise", price: "문의", period: "", desc: "기획사 & 레이블을 위한 맞춤 플랜", features: ["Pro의 모든 기능", "커스텀 레퍼런스 DB", "전용 API 엔드포인트", "Viberate/Chartmetric 연동", "맞춤 리포트 포맷", "전담 매니저", "SLA 보장"], cta: "영업팀 문의", highlight: false },
        ].map(plan => (
          <div key={plan.name} className={`pricing-card ${plan.highlight ? "pricing-highlight" : ""}`}>
            {plan.highlight && <div className="pricing-badge">인기</div>}
            <h3>{plan.name}</h3>
            <div className="pricing-price">
              <strong>{plan.price}</strong>
              <span>{plan.period}</span>
            </div>
            <p className="pricing-desc">{plan.desc}</p>
            <button className={`btn ${plan.highlight ? "btn-primary" : "btn-outline"} pricing-cta`} onClick={() => nav("/studio")}>
              {plan.cta} <ArrowRight size={16} />
            </button>
            <ul className="pricing-features">
              {plan.features.map(f => <li key={f}><CheckCircle2 size={16} /> {f}</li>)}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Send, Mail, MessageSquare } from "lucide-react";

export default function Contact() {
  const nav = useNavigate();
  const [sent, setSent] = useState(false);

  return (
    <div className="page">
      <nav className="landing-nav"><div className="landing-nav-inner">
        <div className="nav-logo" onClick={() => nav("/")}><img src="/logo.png" alt="Music Brain" className="logo-img" /><span>Music Brain</span></div>
        <div className="nav-links"><a href="/#what">기능</a><a href="/#how">프로세스</a><a href="/pricing">도입</a></div>
        <div className="nav-actions"><button className="btn btn-primary btn-sm" onClick={() => nav("/studio")}>스튜디오 진입</button></div>
      </div></nav>

      <section className="page-hero">
        <h1>문의하기</h1>
        <p>궁금한 점이 있으시면 언제든 연락주세요</p>
      </section>

      <div className="contact-content">
        <div className="contact-grid">
          <div className="contact-info">
            <div className="contact-item">
              <Mail size={20} />
              <div>
                <h4>이메일</h4>
                <p>hello@arbrain.io</p>
              </div>
            </div>
            <div className="contact-item">
              <MessageSquare size={20} />
              <div>
                <h4>카카오톡 채널</h4>
                <p>@arbrain</p>
              </div>
            </div>
            <div className="contact-info-text">
              <h3>Enterprise 도입을 원하시나요?</h3>
              <p>기획사, 레이블, 에이전시를 위한 맞춤 솔루션을 제공합니다. 전용 레퍼런스 DB, API 접근, 커스텀 리포트 등을 논의해보세요.</p>
            </div>
          </div>

          <div className="contact-form-card">
            {sent ? (
              <div className="contact-sent">
                <div className="sent-icon">✓</div>
                <h3>메시지가 전송되었습니다</h3>
                <p>빠른 시일 내에 답변드리겠습니다</p>
              </div>
            ) : (
              <form className="contact-form" onSubmit={e => { e.preventDefault(); setSent(true); }}>
                <div className="form-group">
                  <label>이름</label>
                  <input type="text" placeholder="홍길동" required />
                </div>
                <div className="form-group">
                  <label>이메일</label>
                  <input type="email" placeholder="you@company.com" required />
                </div>
                <div className="form-group">
                  <label>소속</label>
                  <input type="text" placeholder="회사/레이블명 (선택)" />
                </div>
                <div className="form-group">
                  <label>문의 유형</label>
                  <select required>
                    <option value="">선택해주세요</option>
                    <option>일반 문의</option>
                    <option>Enterprise 도입</option>
                    <option>API 연동</option>
                    <option>파트너십 제안</option>
                    <option>기술 지원</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>메시지</label>
                  <textarea rows={4} placeholder="문의 내용을 적어주세요" required />
                </div>
                <button type="submit" className="btn btn-primary" style={{ width: "100%" }}>
                  <Send size={16} /> 보내기
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

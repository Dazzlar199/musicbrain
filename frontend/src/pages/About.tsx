import { useNavigate } from "react-router-dom";

export default function About() {
  const nav = useNavigate();
  return (
    <div className="page">
      <nav className="landing-nav"><div className="landing-nav-inner">
        <div className="nav-logo" onClick={() => nav("/")}><img src="/logo.png" alt="Music Brain" className="logo-img" /><span>Music Brain</span></div>
        <div className="nav-links"><a href="/#what">기능</a><a href="/#how">프로세스</a><a href="/pricing">도입</a></div>
        <div className="nav-actions"><button className="btn btn-primary btn-sm" onClick={() => nav("/studio")}>스튜디오 진입</button></div>
      </div></nav>

      <section className="page-hero">
        <h1>Music Brain은</h1>
        <p>음악 산업의 A&R 의사결정을 데이터 기반으로 바꿉니다</p>
      </section>

      <div className="about-content">
        <div className="about-grid">
          <div className="about-card">
            <h3>왜 만들었나</h3>
            <p>해외 엔터테인먼트 회사들이 K-pop 스타일 음악을 만들 때 매번 실패합니다. 작곡비를 과도하게 쓰고, 트렌드를 파악하지 못하고, 어떤 시장에 맞는 곡인지 감으로 판단합니다.</p>
            <p>Music Brain은 이 정보 비대칭을 해소합니다. 곡 하나를 업로드하면, 4개 글로벌 시장에서의 적합도를 데이터로 보여줍니다.</p>
          </div>
          <div className="about-card">
            <h3>기술</h3>
            <p>237곡+ 레퍼런스 데이터베이스에서 학습한 ML 분류기가 시장별 적합도를 판정합니다. 193차원 오디오 피처 추출, 주파수 대역별 프로덕션 벤치마킹, 바이럴 구간 알고리즘 감지를 결합합니다.</p>
            <p>Gemini 3 Flash가 곡을 직접 듣고 정성적 A&R 리포트를 작성합니다. 분류기 점수를 덮어쓰지 않고, 왜 그런 점수가 나왔는지 해석합니다.</p>
          </div>
          <div className="about-card">
            <h3>팀</h3>
            <p>음향 엔지니어링 + K-pop 엔터테인먼트 산업 경험 + AI 개발 역량을 가진 팀이 만들었습니다. 프로덕션 레벨의 오디오 분석은 도메인 전문가만이 설계할 수 있습니다.</p>
          </div>
          <div className="about-card">
            <h3>로드맵</h3>
            <ul>
              <li>레퍼런스 DB 1,000곡+ 확장</li>
              <li>Viberate/Chartmetric 실시간 데이터 연동</li>
              <li>캠페인 ROI 트래킹</li>
              <li>아티스트 프로파일 대시보드</li>
              <li>플레이리스트 모니터링</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

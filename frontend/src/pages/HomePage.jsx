// H110 · H120 지도 홈 (아직 만들기 전 · 자리만 잡아 둠)
import { useEffect } from "react";
import { Link } from "react-router";
import NoticeBox from "../components/NoticeBox.jsx";

export default function HomePage() {
  useEffect(() => { document.title = "지역 코스 지도"; }, []);

  return (
    <main className="page">
      <NoticeBox page title="지도 화면은 준비 중이에요" desc="지금은 축제 목록에서 축제를 찾아볼 수 있어요.">
        <Link className="btn btn--primary" to="/festivals">축제 목록 보기</Link>
      </NoticeBox>
    </main>
  );
}

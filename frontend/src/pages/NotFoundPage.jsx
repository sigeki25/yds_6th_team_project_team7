// E110 없는 주소
import { useEffect } from "react";
import { Link } from "react-router";
import NoticeBox from "../components/NoticeBox.jsx";

export default function NotFoundPage() {
  useEffect(() => { document.title = "페이지를 찾을 수 없어요 · 지역 코스 지도"; }, []);
  return (
    <main className="page">
      <NoticeBox page title="페이지를 찾을 수 없어요" desc="주소가 바뀌었거나 없는 페이지예요.">
        <Link className="btn btn--primary" to="/">지도로 가기</Link>
      </NoticeBox>
    </main>
  );
}

"""React 화면 라우트.

frontend 폴더의 React 앱을 빌드하면 view 폴더에 결과가 생긴다 (cd frontend && npm run build).
화면 주소로 들어오면 view/index.html 을 돌려주고, 이후 화면 전환은 React Router 가 맡는다.
"""
import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import APIRouter
from fastapi.responses import HTMLResponse

load_dotenv()

INDEX_HTML = Path(__file__).resolve().parent / "view" / "index.html"

router = APIRouter(include_in_schema=False)


def _app_page() -> HTMLResponse:
    if not INDEX_HTML.exists():
        return HTMLResponse(
            "<p>프론트가 아직 빌드되지 않았어요. <code>cd frontend && npm install && npm run build</code> 를 실행하세요.</p>",
            status_code=503,
        )
    html = INDEX_HTML.read_text(encoding="utf-8")
    # 카카오 JavaScript 키는 브라우저에 공개되는 키라 HTML에 넣어도 된다 (REST 키는 넣지 말 것)
    html = html.replace("{{KAKAO_JS_KEY}}", os.getenv("KAKAO_JS_KEY", ""))
    return HTMLResponse(html)


@router.get("/")
def home_page():
    """H110 지도 홈 · H120 권역 선택 (/?region=)"""
    return _app_page()


@router.get("/course")
def course_page():
    """R110 코스 결과 (코스는 저장하지 않아 새로고침하면 지도 홈으로 감)"""
    return _app_page()


@router.get("/festivals")
def festival_list_page():
    """L110 축제 목록"""
    return _app_page()


@router.get("/festivals/{festival_id}")
def festival_detail_page(festival_id: str):
    """D110 축제 상세"""
    return _app_page()

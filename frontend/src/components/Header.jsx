import { useState } from "react";
import { Link, NavLink, useLocation } from "react-router";

/** CM20-1 공통 헤더: 현재 메뉴는 굵게 + 초록 밑줄. 모바일은 ≡ 로 펼침 (M110-7) */
export default function Header() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [openedAt, setOpenedAt] = useState(location.key);

  // 화면을 옮기면 메뉴 닫기
  if (open && openedAt !== location.key) setOpen(false);

  function toggle() {
    setOpenedAt(location.key);
    setOpen((v) => !v);
  }

  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link className="site-logo" to="/">
          <span className="site-logo__mark" aria-hidden="true" />
          지역 코스 지도
        </Link>
        <button
          type="button"
          className="site-menu-btn"
          aria-expanded={open}
          aria-controls="site-nav"
          aria-label="메뉴"
          onClick={toggle}
        >
          ≡
        </button>
        <nav id="site-nav" className={`site-nav${open ? " is-open" : ""}`} aria-label="주 메뉴">
          <NavLink to="/" end>지도</NavLink>
          <NavLink to="/festivals">축제 목록</NavLink>
        </nav>
      </div>
    </header>
  );
}

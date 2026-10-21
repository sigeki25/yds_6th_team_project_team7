import { Link, NavLink } from "react-router";

/** CM20-1 공통 헤더: 현재 메뉴는 굵게 + 초록 밑줄 */
export default function Header() {
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link className="site-logo" to="/">
          <span className="site-logo__mark" aria-hidden="true" />
          지역 코스 지도
        </Link>
        <nav className="site-nav" aria-label="주 메뉴">
          <NavLink to="/" end>지도</NavLink>
          <NavLink to="/festivals">축제 목록</NavLink>
        </nav>
      </div>
    </header>
  );
}

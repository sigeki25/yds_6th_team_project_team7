/** 빈 결과 · 오류 · 없는 페이지 안내 상자 */
export default function NoticeBox({ title, desc, page = false, children }) {
  return (
    <div className={`notice-box${page ? " notice-box--page" : ""}`}>
      <p className="notice-box__title">{title}</p>
      {desc && <p className="notice-box__desc">{desc}</p>}
      {children}
    </div>
  );
}

// R110 코스 결과 (/course). 저장하지 않으므로 새로고침 · 직접 접속 시 지도 홈으로
import { Fragment, useEffect, useState } from "react";
import { Link, Navigate } from "react-router";
import { CHAT_MAX_LENGTH } from "../api/chat.js";
import CourseMap from "../components/CourseMap.jsx";
import FallbackImage from "../components/FallbackImage.jsx";
import PlaceMark from "../components/PlaceMark.jsx";
import { PLACE_TYPES } from "../lib/places.js";
import { useToast } from "../components/toastContext.js";
import { useCourse } from "../course/courseContext.js";
import "../styles/course.css";

const NO_COURSE = "코스는 저장되지 않아요. 다시 만들어 주세요.";

export default function CoursePage() {
  const { course } = useCourse();
  const toast = useToast();

  // E110-3 코스 없이 접속 → H110 + 토스트
  useEffect(() => {
    if (!course) toast(NO_COURSE);
  }, [course, toast]);

  if (!course) return <Navigate to="/" replace />;
  return <CourseResult course={course} />;
}

function CourseResult({ course }) {
  const { revise, revising, revisionsLeft, limited, pending } = useCourse();
  const [active, setActive] = useState(null);
  const [text, setText] = useState("");

  useEffect(() => { document.title = `${course.title} · 지역 코스 지도`; }, [course.title]);

  const counts = ["festival", "food", "attraction"]
    .map((t) => [t, course.places.filter((p) => p.type === t).length])
    .filter(([, n]) => n);
  const about = course.estimated ? "약 " : "";
  const canRevise = revisionsLeft > 0 && !limited;

  async function submit(e) {
    e.preventDefault();
    if (!text.trim() || pending || !canRevise) return;
    const made = await revise(text);
    if (made) setText("");
  }

  function onKeyDown(e) {
    if (e.key === "Enter" && !e.nativeEvent.isComposing) submit(e);
  }

  return (
    <main className="course">
      <div className="course__side">
        {/* 1. 뒤로 가기: H120 (대화 · 선택 권역 유지) */}
        <Link className="course__back" to={`/?region=${course.region}`}>
          <span aria-hidden="true">←</span> AI 코스 도우미
        </Link>

        {/* 2. 코스 제목 · 요약 */}
        <section className="course-summary">
          <div className="course-summary__head">
            <span className="course-summary__duration">{course.duration === "half" ? "반나절" : "하루"}</span>
            <h1 className="course-summary__title">{course.title}</h1>
          </div>
          <p>총 이동 {about}{course.totalKm}km · 차로 {about}{formatMin(course.moveMin)}</p>
          <p>총 소요 약 {formatMin(course.totalMin)} (체류 포함)</p>
          <p className="course-summary__counts">
            장소 {counts.map(([t, n]) => `${PLACE_TYPES[t].label} ${n}`).join(" · ")}
          </p>
          {course.baseDate && (
            <p className="course-summary__date">방문일 {course.baseDate}{course.baseDateDefault ? " (오늘 기준)" : ""}</p>
          )}
        </section>

        {course.changeNote && <p className="course-change" role="status">{course.changeNote}</p>}

        {/* 3 · 4 · 5. 코스 일정 */}
        <section className="course-plan" aria-labelledby="plan-title" aria-busy={revising}>
          <h2 id="plan-title" className="course-plan__title">코스 일정</h2>
          <ol className="course-plan__list">
            {course.places.map((p, i) => (
              <Fragment key={p.id}>
                {i > 0 && <Leg leg={course.legs[i - 1]} />}
                <li>
                  <PlaceCard place={p} n={i + 1} active={active === p.id}
                    changed={course.changed?.includes(p.id)} onSelect={() => setActive(p.id)} />
                </li>
              </Fragment>
            ))}
          </ol>
          {revising && <div className="course-plan__loading" role="status"><span className="dots"><i /><i /><i /></span>코스를 고치는 중…</div>}
          {/* 6. 출처 · 예상치 안내 */}
          <p className="course-plan__source">
            출처 : 한국관광공사 TourAPI · 이동 시간은 자동차 기준 예상치이며, 방문 전 운영 여부를 확인하세요.
          </p>
        </section>

        {/* 7. 코스 수정 (1회) */}
        <form className="course-revise" onSubmit={submit}>
          <div className="chat__input-row">
            <label className="sr-only" htmlFor="revise-input">코스 수정 요청</label>
            <input
              id="revise-input"
              className="chat__input"
              maxLength={CHAT_MAX_LENGTH}
              placeholder={canRevise ? "예: 점심을 한 곳 더 넣어 줘" : "더 이상 수정할 수 없어요"}
              disabled={!canRevise}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKeyDown}
            />
            <button className="btn btn--primary chat__send" type="submit" disabled={!canRevise || pending || !text.trim()}>전송</button>
          </div>
          <p className="course-revise__left">수정 요청 {revisionsLeft}회 남음</p>
        </form>
      </div>

      <CourseMap course={course} active={active} onSelect={setActive} />
    </main>
  );
}

function PlaceCard({ place: p, n, active, changed, onSelect }) {
  return (
    <article
      className={`place-card${active ? " is-active" : ""}${changed ? " is-changed" : ""}`}
      onClick={onSelect}
    >
      <PlaceMark type={p.type} n={n} />
      <div className="place-card__photo"><FallbackImage src={p.image} loading="lazy" /></div>
      <div className="place-card__body">
        <p className="place-card__type">{PLACE_TYPES[p.type].label}</p>
        <h3 className="place-card__name">
          {p.festivalId
            ? <Link to={`/festivals/${encodeURIComponent(p.festivalId)}`} onClick={(e) => e.stopPropagation()}>{p.title}</Link>
            : <button type="button" onClick={onSelect}>{p.title}</button>}
        </h3>
        {p.address && <p className="place-card__meta">{p.address}</p>}
        <p className="place-card__meta">
          체류 약 {p.stayMin}분
          {p.hours ? ` · ${p.hours}` : <> · <span className="text-warn">운영시간 정보 없음</span></>}
        </p>
      </div>
    </article>
  );
}

/** 4. 구간 이동: 길찾기 실패 구간은 주의색 '예상 (추정)' */
function Leg({ leg }) {
  return (
    <li className={`course-leg${leg.estimated ? " course-leg--estimated" : ""}`} aria-label="이동">
      {leg.estimated
        ? `차로 약 ${leg.minutes}분 · ${leg.km}km · 예상 (추정)`
        : `차로 ${leg.minutes}분 · ${leg.km}km`}
    </li>
  );
}

function formatMin(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h}시간${m ? ` ${m}분` : ""}` : `${m}분`;
}

// D110 축제 상세
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { fetchFestival, NotFoundError } from "../api/festivals.js";
import FallbackImage from "../components/FallbackImage.jsx";
import KakaoMap from "../components/KakaoMap.jsx";
import NoticeBox from "../components/NoticeBox.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import { useToast } from "../components/toastContext.js";
import { useCourse } from "../course/courseContext.js";
import {
  festivalStatus, firstSentence, formatPeriodFull, MISSING_TEXT, REGION_BY_SIDO, safeUrl,
} from "../lib/festival.js";
import "../styles/festival.css";

/** 축제가 바뀌면 화면 상태를 새로 시작 */
export default function FestivalDetailRoute() {
  const { id } = useParams();
  return <FestivalDetailPage key={id} id={id} />;
}

function FestivalDetailPage({ id }) {
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const [state, setState] = useState({ status: "loading", festival: null });
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchFestival(id)
      .then((festival) => !cancelled && setState({ status: "ready", festival }))
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof NotFoundError) return setState({ status: "notFound", festival: null });
        console.error(err);
        toast("정보를 불러오지 못했어요. 다시 시도해 주세요.");
        setState({ status: "error", festival: null });
      });
    return () => { cancelled = true; };
  }, [id, reloadToken, toast]);

  const f = state.festival;
  useEffect(() => {
    document.title = f ? `${f.title} · 지역 코스 지도`
      : state.status === "notFound" ? "축제 정보를 찾을 수 없어요 · 지역 코스 지도"
      : "축제 상세 · 지역 코스 지도";
  }, [f, state.status]);

  function retry() {
    setState({ status: "loading", festival: null });
    setReloadToken((t) => t + 1);
  }

  /** 1. 뒤로 가기: 들어온 화면으로. 링크로 바로 들어왔으면 축제 목록으로 */
  function goBack(e) {
    if (location.key !== "default") {
      e.preventDefault();
      navigate(-1);
    }
  }

  return (
    <main className="page">
      <Link className="back-link" to="/festivals" onClick={goBack}>
        <span aria-hidden="true">←</span> 뒤로 가기
      </Link>

      {state.status === "loading" && <DetailSkeleton />}

      {state.status === "notFound" && (
        <NoticeBox page title="축제 정보를 찾을 수 없어요" desc="정보가 삭제됐거나 주소가 잘못됐어요.">
          <Link className="btn btn--primary" to="/festivals">축제 목록 보기</Link>
        </NoticeBox>
      )}

      {state.status === "error" && (
        <NoticeBox page title="정보를 불러오지 못했어요" desc="잠시 뒤 다시 시도해 주세요">
          <button type="button" className="btn btn--secondary" onClick={retry}>다시 시도</button>
        </NoticeBox>
      )}

      {state.status === "ready" && <FestivalDetail festival={f} />}
    </main>
  );
}

function FestivalDetail({ festival: f }) {
  const navigate = useNavigate();
  const { attach } = useCourse();
  const status = festivalStatus(f);
  const ended = status === "ended";
  const intro = firstSentence(f.overview);
  const homepage = f.homepage && safeUrl(f.homepage);

  /** 6. 이 축제로 코스 만들기 → 축제가 속한 권역의 지도 홈(H120) + 채팅 첨부 칩 */
  function makeCourse() {
    const region = REGION_BY_SIDO[f.sidoCode];
    attach({ id: f.id, title: f.title, startDate: f.startDate, endDate: f.endDate });
    navigate(region ? `/?region=${region}` : "/");
  }

  const rows = [
    ["기간", formatPeriodFull(f.startDate, f.endDate)],
    ["시간", f.playtime],   // detailIntro2 playtime, 글 그대로 (줄바꿈 유지)
    ["장소", f.place],
    ["주소", f.address],
    ["전화", f.tel],
    ["주최", f.sponsor],
    ["요금", f.fee],
  ];

  return (
    <div className="detail">
      {/* 2. 포스터 */}
      <div className="detail__poster">
        <FallbackImage src={f.image} alt={`${f.title} 포스터`} />
      </div>

      <div className="detail__body">
        {/* 3. 상태 · 축제명 · 소개 */}
        <StatusBadge status={status} label={ended ? "축제 종료" : undefined} />
        <h1 className="detail__title">{f.title}</h1>
        {intro && <p className="detail__intro">{intro}</p>}
        <hr className="detail__divider" />

        {/* 4. 상세 정보: 값이 없으면 회색 안내 */}
        <dl className="info-list">
          {rows.map(([label, value]) => (
            <div key={label} className="info-list__row">
              <dt>{label}</dt>
              <dd>{value || <span className="info-missing">{MISSING_TEXT}</span>}</dd>
            </div>
          ))}
        </dl>

        <div className="detail__actions">
          {/* 5. 공식 홈페이지 */}
          {homepage && (
            <a className="btn btn--secondary" href={homepage} target="_blank" rel="noopener noreferrer">
              공식 홈페이지 <span aria-hidden="true">↗</span><span className="sr-only">(새 탭)</span>
            </a>
          )}
          {/* 6 · 7. 코스 만들기 / 종료된 축제 */}
          {ended ? (
            <>
              <button className="btn" type="button" disabled>코스 만들기 불가</button>
              <p className="ended-note">종료된 축제는 지도와 코스 후보에서 빠져요.</p>
            </>
          ) : (
            <button className="btn btn--primary" type="button" onClick={makeCourse}>이 축제로 코스 만들기</button>
          )}
        </div>

        {/* 8. 위치 지도 */}
        <KakaoMap key={f.id} lat={f.lat} lng={f.lng} title={f.title} />
      </div>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="detail" aria-busy="true">
      <div className="skeleton detail__poster" />
      <div className="detail__body">
        <div className="skeleton" style={{ width: 64, height: 24, borderRadius: 999 }} />
        <div className="skeleton" style={{ width: "55%", height: 36, marginTop: 14 }} />
        <div className="skeleton" style={{ width: "80%", height: 18, marginTop: 12 }} />
        <div className="skeleton" style={{ width: "100%", height: 160, marginTop: 28 }} />
      </div>
    </div>
  );
}

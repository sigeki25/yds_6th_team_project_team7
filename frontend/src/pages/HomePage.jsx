// H110 지도 홈(전국) · H120 권역 선택 (/?region=권역코드)
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { fetchFestivals, fetchPlaces } from "../api/festivals.js";
import ChatPanel from "../components/ChatPanel.jsx";
import FestivalCard, { FestivalCardSkeleton } from "../components/FestivalCard.jsx";
import KoreaMap from "../components/KoreaMap.jsx";
import RegionMap from "../components/RegionMap.jsx";
import SourceNote from "../components/SourceNote.jsx";
import { useToast } from "../components/toastContext.js";
import { useCourse } from "../course/courseContext.js";
import { monthOf } from "../lib/festival.js";
import { REGIONS, regionByCode } from "../lib/regions.js";
import "../styles/festivals.css";
import "../styles/home.css";
import "../styles/chat.css";

const LOAD_ERROR = "정보를 불러오지 못했어요. 다시 시도해 주세요.";

export default function HomePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const region = regionByCode(searchParams.get("region"));
  const { course } = useCourse();
  const toast = useToast();
  const [tab, setTab] = useState("chat"); // M110-3 모바일 탭

  useEffect(() => {
    document.title = region ? `${region.name} · 지역 코스 지도` : "지역 코스 지도";
  }, [region]);

  // 3. 권역 선택: 화면 이동 없이 주소에만 ?region= 을 남김
  function selectRegion(code) {
    if (code === region?.code) return;
    setSearchParams(code ? { region: code } : {});
  }

  // 코스가 나오면 그 코스의 권역 지도로
  function onCourse(made) {
    if (made.region && made.region !== region?.code) setSearchParams({ region: made.region });
  }

  // 6. 이번 달 축제 (개최중 · 예정 4개)
  const [month, setMonth] = useState({ status: "loading", total: 0, items: [] });
  useEffect(() => {
    let cancelled = false;
    fetchFestivals({ month: monthOf(0), active: 1, sort: "date", size: 4 })
      .then((r) => !cancelled && setMonth({ status: "ready", total: r.total, items: r.items }))
      .catch((err) => {
        if (cancelled) return;
        console.error(err);
        toast(LOAD_ERROR);
        setMonth({ status: "error", total: 0, items: [] });
      });
    return () => { cancelled = true; };
  }, [toast]);

  return (
    <main className="home" data-tab={tab}>
      <div className="home__top">
        {/* 1 · 2. 전국 권역 지도 */}
        <aside className="home__nation">
          <h2 className="home__nation-title">{region ? "다른 지역 보기" : "지역을 선택하세요"}</h2>
          <KoreaMap selected={region?.code} onSelect={selectRegion} />
          {/* M110-1 모바일: 권역 버튼을 가로로 */}
          <div className="region-chips" role="group" aria-label="권역 선택">
            <button type="button" aria-pressed={!region} onClick={() => selectRegion(null)}>전국</button>
            {REGIONS.map((r) => (
              <button key={r.code} type="button" aria-pressed={region?.code === r.code} onClick={() => selectRegion(r.code)}>
                {r.short}
              </button>
            ))}
          </div>
        </aside>

        <section className="home__center" aria-label="권역 지도">
          {region
            ? <RegionPanel key={region.code} region={region} course={course?.region === region.code ? course : null} />
            : <NationGuide month={month} />}
        </section>

        <div className="home__tabs" role="tablist" aria-label="보기 전환">
          <button type="button" role="tab" aria-selected={tab === "chat"} onClick={() => setTab("chat")}>AI 코스 도우미</button>
          <button type="button" role="tab" aria-selected={tab === "month"} onClick={() => setTab("month")}>이번 달 축제</button>
        </div>

        <div className="home__chat">
          <ChatPanel region={region?.code} onCourse={onCourse} />
        </div>
      </div>

      <MonthFestivals month={month} />
      <SourceNote />
    </main>
  );
}

/** 4. 권역 선택 전 안내 */
function NationGuide({ month }) {
  return (
    <div className="nation-guide">
      <p className="nation-guide__title">왼쪽 지도에서 지역을 고르면<br />그 지역 축제 지도가 여기에 나와요</p>
      {month.status === "ready" && (
        <p className="nation-guide__count">이번 달 전국 축제 <strong>{month.total}</strong>개</p>
      )}
    </div>
  );
}

/** H120 2 · 3 · 4 · 5. 권역 이름 · 축제 수 + 권역 지도 */
function RegionPanel({ region, course }) {
  const toast = useToast();
  const [data, setData] = useState({ status: "loading", festivals: [], places: [] });

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchFestivals({ region: region.code, active: 1, sort: "date", size: 500 }),
      fetchPlaces(region.code),
    ])
      .then(([f, p]) => {
        if (cancelled) return;
        // 좌표 없는 장소는 지도에 표시 안 함
        const festivals = f.items.filter((x) => x.lat != null && x.lng != null);
        setData({ status: "ready", festivals, places: p.items });
      })
      .catch((err) => {
        if (cancelled) return;
        console.error(err);
        toast(LOAD_ERROR);
        setData({ status: "error", festivals: [], places: [] });
      });
    return () => { cancelled = true; };
  }, [region.code, toast]);

  return (
    <div className="region-panel">
      <h1 className="region-panel__title">
        {region.name} 축제
        {data.status === "ready" && <span className="region-panel__count">{data.festivals.length}</span>}
      </h1>
      {data.status === "loading" && <div className="skeleton region-panel__skeleton" aria-busy="true" />}
      {data.status === "ready" && <RegionMap festivals={data.festivals} places={data.places} course={course} />}
      {data.status === "error" && (
        <p className="region-panel__error">축제 정보를 불러오지 못했어요.</p>
      )}
    </div>
  );
}

/** 6. 이번 달 축제 */
function MonthFestivals({ month }) {
  return (
    <section className="home__month" aria-labelledby="month-title">
      <div className="home__month-head">
        <h2 id="month-title">이번 달 축제</h2>
        <Link className="home__month-all" to="/festivals?period=this">전체 보기 <span aria-hidden="true">〉</span></Link>
      </div>
      <div className="festival-grid">
        {month.status === "loading" && Array.from({ length: 4 }, (_, i) => <FestivalCardSkeleton key={i} />)}
        {month.items.map((f) => <FestivalCard key={f.id} festival={f} />)}
      </div>
      {month.status === "ready" && month.items.length === 0 && (
        <p className="home__month-empty">이번 달에 열리는 축제가 없어요.</p>
      )}
    </section>
  );
}

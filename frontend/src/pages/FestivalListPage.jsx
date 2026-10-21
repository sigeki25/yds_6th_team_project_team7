// L110 축제 목록
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useNavigationType, useSearchParams } from "react-router";
import { fetchFestivals, fetchRegions } from "../api/festivals.js";
import FestivalCard, { FestivalCardSkeleton } from "../components/FestivalCard.jsx";
import NoticeBox from "../components/NoticeBox.jsx";
import SourceNote from "../components/SourceNote.jsx";
import { useToast } from "../components/toastContext.js";
import { CATEGORIES, getPosition, monthOf } from "../lib/festival.js";
import "../styles/festivals.css";

const PAGE_SIZE = 12;
const DEFAULTS = { period: "", month: "", sido: "", sigungu: "", cat: "", sort: "date" };
const PERIODS = ["", "this", "next", "custom"];
const LOAD_ERROR = "정보를 불러오지 못했어요. 다시 시도해 주세요.";
const NO_LOCATION = "위치 권한이 없어 축제일순으로 보여 드려요.";

/** 주소 → 검색 조건 */
function readConditions(search) {
  const p = new URLSearchParams(search);
  const c = { ...DEFAULTS };
  for (const k of Object.keys(DEFAULTS)) c[k] = p.get(k) ?? DEFAULTS[k];
  if (!PERIODS.includes(c.period)) c.period = "";
  if (c.period !== "custom") c.month = "";
  if (!c.sido) c.sigungu = "";
  if (c.sort !== "distance") c.sort = "date";
  return c;
}

/** 검색 조건 → 주소 (기본값은 생략) */
function toSearch(c) {
  const p = new URLSearchParams();
  if (c.period) p.set("period", c.period);
  if (c.period === "custom" && c.month) p.set("month", c.month);
  if (c.sido) p.set("sido", c.sido);
  if (c.sido && c.sigungu) p.set("sigungu", c.sigungu);
  if (c.cat) p.set("cat", c.cat);
  if (c.sort !== "date") p.set("sort", c.sort);
  return p.toString();
}

function apiParams(c, coords, page, size) {
  const month = c.period === "this" ? monthOf(0)
    : c.period === "next" ? monthOf(1)
    : c.period === "custom" ? c.month : "";
  const p = { month, sido: c.sido, sigungu: c.sigungu, cat: c.cat, sort: c.sort, page, size };
  if (c.sort === "distance" && coords) Object.assign(p, coords);
  return p;
}

export default function FestivalListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const toast = useToast();

  // 주소에 남은 조건이 기준. 폼은 [검색]을 누르기 전까지 따로 고침
  const key = searchParams.toString();
  const applied = useMemo(() => readConditions(key), [key]);
  const [form, setForm] = useState(applied);
  // 이동(검색 · 뒤로 가기 등)할 때마다 폼을 주소에 맞춤. '더 보기'처럼 같은 주소를 바꿔치기한 경우는 그대로 둠
  const [syncedKey, setSyncedKey] = useState(location.key);
  if (syncedKey !== location.key) {
    setSyncedKey(location.key);
    if (navigationType !== "REPLACE") setForm(applied);
  }

  const [regions, setRegions] = useState([]);
  const [coords, setCoords] = useState(null);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [loadingMore, setLoadingMore] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const hasItems = useRef(false);
  hasItems.current = items.length > 0;
  const requestId = useRef(0);

  useEffect(() => {
    fetchRegions().then(setRegions).catch(() => toast("지역 목록을 불러오지 못했어요."));
  }, [toast]);

  // 주소로 '가까운 순'에 들어왔는데 위치를 아직 모르면 먼저 위치를 물음
  const needsCoords = applied.sort === "distance" && !coords;
  useEffect(() => {
    if (!needsCoords) return;
    let cancelled = false;
    getPosition()
      .then((c) => !cancelled && setCoords(c))
      .catch(() => {
        if (cancelled) return;
        toast(NO_LOCATION);
        setSearchParams(toSearch({ ...applied, sort: "date" }), { replace: true });
      });
    return () => { cancelled = true; };
  }, [needsCoords, applied, setSearchParams, toast]);

  // 조건이 바뀌면 다시 불러옴. 뒤로 가기로 왔으면 보던 쪽 수만큼 한 번에
  useEffect(() => {
    if (needsCoords) return;
    const id = ++requestId.current;
    const pages = location.state?.pages ?? 1;
    setStatus("loading");
    setLoadingMore(false);
    fetchFestivals(apiParams(applied, coords, 1, PAGE_SIZE * pages))
      .then((res) => {
        if (id !== requestId.current) return;
        setItems(res.items);
        setTotal(res.total);
        setStatus("ready");
      })
      .catch((err) => {
        if (id !== requestId.current) return;
        console.error(err);
        toast(LOAD_ERROR);
        setStatus(hasItems.current ? "ready" : "error"); // 보던 화면은 그대로 둠
      });
    // location.state 는 처음 들어올 때만 읽음
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applied, coords, needsCoords, reloadToken, toast]);

  /** 조건 적용: 주소가 같으면 다시 불러오기만 함 */
  function apply(next) {
    const search = toSearch(next);
    if (search === key) setReloadToken((t) => t + 1);
    else setSearchParams(search, { state: { pages: 1 } });
  }

  function onSubmit(e) {
    e.preventDefault();
    apply({ ...form, sort: applied.sort });
  }

  async function changeSort(sort) {
    if (sort === applied.sort) return;
    if (sort === "distance" && !coords) {
      try {
        setCoords(await getPosition());
      } catch {
        toast(NO_LOCATION);
        return;
      }
    }
    apply({ ...applied, sort });
  }

  async function loadMore() {
    const id = ++requestId.current;
    const nextPage = Math.ceil(items.length / PAGE_SIZE) + 1;
    setLoadingMore(true);
    try {
      const res = await fetchFestivals(apiParams(applied, coords, nextPage, PAGE_SIZE));
      if (id !== requestId.current) return;
      setItems((prev) => [...prev, ...res.items]);
      setTotal(res.total);
      // 상세에 갔다가 돌아왔을 때 이만큼 다시 보여 주려고 기록
      navigate({ search: location.search }, { replace: true, state: { pages: nextPage } });
    } catch (err) {
      console.error(err);
      toast(LOAD_ERROR);
    } finally {
      if (id === requestId.current) setLoadingMore(false);
    }
  }

  const update = (patch) => setForm((f) => ({ ...f, ...patch }));
  const sigunguList = regions.find((r) => r.code === form.sido)?.sigungu ?? [];
  const firstLoad = status === "loading" && items.length === 0;

  return (
    <>
      <main className="page">
        <h1 className="sr-only">축제 목록</h1>

        {/* 1. 검색 조건 */}
        <form className="search-bar" role="search" onSubmit={onSubmit}>
          <div className="search-bar__period">
            <label className="sr-only" htmlFor="period">시기</label>
            <select
              id="period" className="select" value={form.period}
              onChange={(e) => {
                const period = e.target.value;
                update({ period, month: period === "custom" ? form.month || monthOf(0) : "" });
              }}
            >
              <option value="">시기</option>
              <option value="this">이번 달</option>
              <option value="next">다음 달</option>
              <option value="custom">직접 선택</option>
            </select>
            {form.period === "custom" && (
              <>
                <label className="sr-only" htmlFor="month">달 선택</label>
                <input
                  id="month" className="select select--month" type="month" value={form.month}
                  onChange={(e) => update({ month: e.target.value })}
                />
              </>
            )}
          </div>

          <label className="sr-only" htmlFor="sido">시·도</label>
          <select id="sido" className="select" value={form.sido} onChange={(e) => update({ sido: e.target.value, sigungu: "" })}>
            <option value="">전국</option>
            {regions.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
          </select>

          <label className="sr-only" htmlFor="sigungu">시·군·구</label>
          <select
            id="sigungu" className="select" value={form.sigungu} disabled={sigunguList.length <= 1}
            onChange={(e) => update({ sigungu: e.target.value })}
          >
            <option value="">시·군·구</option>
            {sigunguList.map((g) => <option key={g.code} value={g.code}>{g.name}</option>)}
          </select>

          <label className="sr-only" htmlFor="cat">카테고리</label>
          <select id="cat" className="select" value={form.cat} onChange={(e) => update({ cat: e.target.value })}>
            <option value="">카테고리</option>
            {CATEGORIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
          </select>

          <button className="btn btn--primary search-bar__submit" type="submit">검색</button>
        </form>

        <div className="list-head">
          {/* 2. 결과 수 */}
          <p className="result-count" aria-live="polite">
            {firstLoad ? "불러오는 중…"
              : status === "error" ? ""
              : <>총 <strong>{total.toLocaleString("ko-KR")}</strong> 개 축제</>}
          </p>
          {/* 3. 정렬 */}
          <div className="sort-toggle" role="group" aria-label="정렬">
            {[["date", "축제일순"], ["distance", "가까운 순"]].map(([value, label]) => (
              <button
                key={value} type="button" className="sort-toggle__btn"
                aria-pressed={applied.sort === value} onClick={() => changeSort(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* 4. 축제 카드 */}
        {firstLoad ? (
          <div className="festival-grid">
            {Array.from({ length: 8 }, (_, i) => <FestivalCardSkeleton key={i} />)}
          </div>
        ) : items.length > 0 && status !== "error" ? (
          <div className="festival-grid" aria-busy={status === "loading" || undefined}>
            {items.map((f) => <FestivalCard key={f.id} festival={f} />)}
          </div>
        ) : null}

        {status === "ready" && total === 0 && (
          <NoticeBox title="조건에 맞는 축제가 없어요" desc="조건을 바꿔 다시 찾아보세요">
            <button type="button" className="btn btn--secondary" onClick={() => apply(DEFAULTS)}>조건 초기화</button>
          </NoticeBox>
        )}

        {status === "error" && (
          <NoticeBox title="정보를 불러오지 못했어요" desc="잠시 뒤 다시 시도해 주세요">
            <button type="button" className="btn btn--secondary" onClick={() => setReloadToken((t) => t + 1)}>다시 시도</button>
          </NoticeBox>
        )}

        {/* 6. 더 보기: 12개를 넘을 때만 */}
        {status === "ready" && items.length < total && (
          <div className="more-wrap">
            <button type="button" className="btn btn--more" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? "불러오는 중…" : "더 보기"}
            </button>
          </div>
        )}
      </main>
      <SourceNote />
    </>
  );
}

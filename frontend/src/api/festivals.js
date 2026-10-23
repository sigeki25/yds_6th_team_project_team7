// 백엔드 API 호출. USE_MOCK = true 면 public/mock 스냅샷을 씀 (백엔드 · chroma_db 없이 화면만 볼 때).
//
// ── 백엔드와 맞춘 형식 ──────────────────────────────────────────────
// 축제는 chroma.py search_festival_data(). 요청 · 응답 이름은 tour_api.py 와 같음 (chroma c0f7714)
//
// GET /api/festivals?startDate=2026-10-01&endDate=2026-10-31&sido=44&sigungu=210&category=EV010400&page=1&size=1000
//   → chroma.FilterSearchFestivalData. 날짜 조건은 기간이 겹치는 축제 (종료일 >= startDate, 시작일 <= endDate)
//   → 200 { "total", "page", "size", "items": [Festival, ...] }   (chroma.to_response, 날짜는 "YYYY-MM-DD")
//   (lat&lng[&radius=m] 를 주면 items 에 distance(m) 가 붙음. arrange 는 A 제목순 · E 거리순 · startDate · endDate)
//
// GET /api/festivals/:id
//   → search_festival_data(contentid=id). items 가 비면 없는 축제
//
// Festival = { id, title, startDate:"2026-10-16", endDate, sidoCode, sido:"충청남도",
//              sigunguCode, sigungu:"서산시", category, image, lat, lng }
// FestivalDetail = Festival + { address, tel, sponsor, fee, homepage, overview, place, playtime }
//   - 값이 없으면 null (AI 추정값 금지, TourAPI 원본 값만)
//
// 관광지 · 음식점은 권역 단위로 받지 않음 (TourAPI 호출량). 코스 주변 것만 chat.js 의 course.nearby 로 받음
//
// TourAPI 가 못 하는 것은 화면에서 처리함: 7개 권역(→ 시·도 여러 번 호출), 종료 제외(→ startDate=오늘),
// 축제만 남기기(분류 EV01), 축제일순 · 가까운 순 정렬, 12개씩 나눠 보기
// ────────────────────────────────────────────────────────────────

import { asset, distanceKm, festivalStatus, REGION_BY_SIDO, STATUS, today } from "../lib/festival.js";

export const USE_MOCK = false;

export class NotFoundError extends Error {}

const FESTIVAL_CATEGORY = "EV01"; // 분류 '축제' (공연 · 행사는 뺌)
const FETCH_SIZE = 1000;          // 한 번에 다 받아 화면에서 정렬 · 페이지 나눔

/** 권역 → 시·도 코드 목록 */
const sidosOf = (region) => Object.keys(REGION_BY_SIDO).filter((code) => REGION_BY_SIDO[code] === region);

/**
 * 축제 목록. 화면 조건을 백엔드 조건으로 바꿔 받고, 나머지는 여기서 거르고 정렬함
 * @param {{month?, region?, sido?, sigungu?, cat?, active?, sort?, lat?, lng?, page?, size?}} params
 */
export async function fetchFestivals({ month, region, sido, sigungu, cat, active, sort = "date", lat, lng, page = 1, size = 12 }) {
  const base = today();
  let start = month ? `${month}-01` : `${Number(base.slice(0, 4)) - 1}-01-01`; // 전체: 작년부터
  const end = month ? lastDay(month) : "";
  if (active && start < base) start = base;
  if (end && start > end) return { total: 0, items: [] };

  const sidoList = region ? sidosOf(region) : [sido || ""];
  const query = (s) => ({ startDate: start, endDate: end, sido: s, sigungu: s && sigungu, category: cat, page: 1, size: FETCH_SIZE });
  const results = await Promise.all(sidoList.map((s) => cachedGet("/api/festivals", query(s))));

  const seen = new Set();
  let items = results.flatMap((r) => r.items).filter((f) => {
    if (seen.has(f.id)) return false;
    seen.add(f.id);
    return f.category?.startsWith(FESTIVAL_CATEGORY) && (!active || festivalStatus(f, base) !== "ended");
  });

  if (sort === "distance" && lat != null && lng != null) {
    const here = { lat: Number(lat), lng: Number(lng) };
    const dist = (f) => (f.lat != null && f.lng != null ? distanceKm(here, f) : Infinity);
    items.sort((a, b) => dist(a) - dist(b));
  } else {
    // 축제일순: 개최중 → 예정(시작일 빠른 순) → 종료(최근 순)
    items.sort((a, b) => {
      const sa = festivalStatus(a, base);
      const sb = festivalStatus(b, base);
      if (sa !== sb) return STATUS[sa].order - STATUS[sb].order;
      if (sa === "ended") return (b.endDate ?? "").localeCompare(a.endDate ?? "");
      return (a.startDate ?? "").localeCompare(b.startDate ?? "");
    });
  }
  const from = (Number(page) - 1) * Number(size);
  return { total: items.length, items: items.slice(from, from + Number(size)) };
}

export async function fetchFestival(id) {
  if (USE_MOCK) return mockFestival(id);
  const { items } = await getJson(`/api/festivals/${encodeURIComponent(id)}`);
  if (!items?.length) throw new NotFoundError(id);
  // 상세 API(detailCommon2 · detailIntro2)를 아직 안 받아서 목록 값만 있음 (나머지는 '정보 없음')
  return { address: null, tel: null, sponsor: null, fee: null, homepage: null, overview: null, ...items[0] };
}

// 같은 조건은 화면을 옮겨도 다시 부르지 않음 (새로고침하면 비움)
const cache = new Map();
function cachedGet(path, params) {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== "" && v != null)).toString();
  const key = `${path}?${qs}`;
  if (!cache.has(key)) {
    const req = (USE_MOCK ? mockGet(params) : getJson(key)).catch((err) => {
      cache.delete(key);
      throw err;
    });
    cache.set(key, req);
  }
  return cache.get(key);
}

/** 시·도 / 시·군·구 목록 (TourAPI 법정동 코드) */
let regionsCache;
export function fetchRegions() {
  regionsCache ??= getJson(asset("data/regions.json")).catch((err) => {
    regionsCache = undefined;
    throw err;
  });
  return regionsCache;
}

async function getJson(url) {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (res.status === 404) throw new NotFoundError(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

// ── mock (TourAPI 실제 데이터 스냅샷, 상세는 충남만) ─────────────────────
// 백엔드 엔드포인트가 돌려줄 값을 그대로 흉내 냄
let mockList;
function loadMockList() {
  mockList ??= getJson(asset("mock/festivals.json"));
  return mockList;
}

let mockPlaceList;
/** 관광지 · 음식점 스냅샷 (type · region 붙음). chat.js mock 코스 만들기에서만 씀 */
export function loadMockPlaces() {
  mockPlaceList ??= getJson(asset("mock/places.json"));
  return mockPlaceList;
}

export { loadMockList as loadMockFestivals };

/** GET /api/festivals 흉내 */
async function mockGet(q) {
  await delay(200);
  const items = (await loadMockList()).filter((f) =>
    (!q.startDate || f.endDate >= q.startDate) && (!q.endDate || f.startDate <= q.endDate)
    && (!q.sido || f.sidoCode === q.sido) && (!q.sigungu || f.sigunguCode === q.sigungu)
    && (!q.category || f.category === q.category));
  const from = (q.page - 1) * q.size;
  return { total: items.length, page: q.page, size: q.size, items: items.slice(from, from + q.size) };
}

let mockDetails;
async function mockFestival(id) {
  await delay(250);
  mockDetails ??= getJson(asset("mock/details.json"));
  const details = await mockDetails;
  if (details[id]) return details[id];
  const base = (await loadMockList()).find((f) => f.id === id);
  if (!base) throw new NotFoundError(id);
  // 상세를 받아 두지 않은 축제는 목록 값만 보여 줌 (나머지는 '정보 없음')
  return { ...base, address: null, tel: null, sponsor: null, fee: null, homepage: null, overview: null };
}

function lastDay(month) {
  const [y, m] = month.split("-").map(Number);
  return `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
}
function delay(ms) { return new Promise((r) => setTimeout(r, ms)); }

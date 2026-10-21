// 백엔드 API 호출. 백엔드가 준비되기 전에는 USE_MOCK = true 로 mock 데이터를 씀.
//
// ── 백엔드와 맞춘 형식 (tour_api.py 함수 인자 · 반환값 그대로) ────────────
// GET /api/festivals?start_date=YYYYMMDD&end_date=YYYYMMDD&sido=44&sigungu=210&lclsSystm3=EV010400&page=1&size=1000
//   → search_festival(start_date, end_date, sido, sigungu, page, size, lclsSystm3=...)
//   - TourAPI 날짜 조건은 기간이 겹치는 축제 (종료일 >= start_date, 시작일 <= end_date)
//   → 200 { "total": 8, "page": 1, "size": 1000, "items": [Festival, ...] }
//
// GET /api/festivals/:id
//   → get_festival_detail(id). None 이면 404
//
// GET /api/places?sido=44&content_type_id=12&size=100     (12 관광지, 39 음식점)
//   → area_based_list(sido, sigungu, content_type_id, page, size)
//   → 200 { "total", "page", "size", "items": [Place, ...] }
//
// Festival = { id, title, startDate:"2026-10-16", endDate, sidoCode, sido:"충청남도",
//              sigunguCode, sigungu:"서산시", category, image, lat, lng }
// FestivalDetail = Festival + { address, tel, sponsor, fee, homepage, overview, place, playtime }
// Place = { id, contentTypeId, title, address, tel, image, lat, lng, sidoCode, sido, sigunguCode, sigungu, category, distance }
//   - 값이 없으면 null (AI 추정값 금지, TourAPI 원본 값만)
//
// TourAPI 가 못 하는 것은 화면에서 처리함: 7개 권역(→ 시·도 여러 번 호출), 종료 제외(→ start_date=오늘),
// 축제만 남기기(분류 EV01), 축제일순 · 가까운 순 정렬, 12개씩 나눠 보기
// ────────────────────────────────────────────────────────────────

import { asset, distanceKm, festivalStatus, REGION_BY_SIDO, STATUS, today } from "../lib/festival.js";

export const USE_MOCK = true;

export class NotFoundError extends Error {}

const FESTIVAL_CATEGORY = "EV01"; // 분류 '축제' (공연 · 행사는 뺌)
const FETCH_SIZE = 1000;          // 한 번에 다 받아 화면에서 정렬 · 페이지 나눔
const PLACE_TYPES = { 12: "attraction", 39: "food" };
const PLACE_SIZE = 100;           // 시·도 · 종류별로 받는 장소 수

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
  const query = (s) => ({
    start_date: compact(start), end_date: compact(end), sido: s, sigungu: s && sigungu,
    lclsSystm3: cat, page: 1, size: FETCH_SIZE,
  });
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

/** 권역의 관광지 · 음식점 (좌표 없는 곳은 뺌) */
export async function fetchPlaces(region) {
  const calls = sidosOf(region).flatMap((sido) => Object.keys(PLACE_TYPES).map((type) =>
    cachedGet("/api/places", { sido, content_type_id: type, page: 1, size: PLACE_SIZE })));
  const seen = new Set();
  const items = (await Promise.all(calls)).flatMap((r) => r.items).flatMap((p) => {
    const type = PLACE_TYPES[p.contentTypeId];
    if (!type || p.lat == null || p.lng == null || seen.has(p.id)) return [];
    seen.add(p.id);
    return [{ ...p, type, region }];
  });
  return { items };
}

export async function fetchFestival(id) {
  if (USE_MOCK) return mockFestival(id);
  return getJson(`/api/festivals/${encodeURIComponent(id)}`);
}

// 같은 조건은 화면을 옮겨도 다시 부르지 않음 (TourAPI 하루 호출 수 아끼기, 새로고침하면 비움)
const cache = new Map();
function cachedGet(path, params) {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== "" && v != null)).toString();
  const key = `${path}?${qs}`;
  if (!cache.has(key)) {
    const req = (USE_MOCK ? mockGet(path, params) : getJson(key)).catch((err) => {
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
/** 화면용 형태 (type · region 붙음). chat.js mock 도 씀 */
export function loadMockPlaces() {
  mockPlaceList ??= getJson(asset("mock/places.json"));
  return mockPlaceList;
}

export { loadMockList as loadMockFestivals };

async function mockGet(path, q) {
  await delay(200);
  let items;
  if (path === "/api/festivals") {
    const start = q.start_date && dashed(q.start_date);
    const end = q.end_date && dashed(q.end_date);
    items = (await loadMockList()).filter((f) =>
      (!start || f.endDate >= start) && (!end || f.startDate <= end)
      && (!q.sido || f.sidoCode === q.sido) && (!q.sigungu || f.sigunguCode === q.sigungu)
      && (!q.lclsSystm3 || f.category === q.lclsSystm3));
  } else {
    const typeId = { attraction: 12, food: 39 };
    items = (await loadMockPlaces())
      .filter((p) => p.sidoCode === q.sido && String(typeId[p.type]) === String(q.content_type_id))
      .map(({ type, region: _r, ...p }) => ({ ...p, contentTypeId: typeId[type] }));
  }
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
const compact = (ymd) => (ymd ? ymd.replaceAll("-", "") : "");
const dashed = (d) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
function delay(ms) { return new Promise((r) => setTimeout(r, ms)); }

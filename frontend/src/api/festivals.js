// 백엔드 API 호출. 백엔드가 준비되기 전에는 USE_MOCK = true 로 mock 데이터를 씀.
//
// ── 프론트가 기대하는 응답 형식 (백엔드와 협의용) ─────────────────────
// GET /api/festivals?month=YYYY-MM&region=chungcheong&sido=44&sigungu=210&cat=EV010400&active=1&sort=date|distance&lat=&lng=&page=1&size=12
//   - month: 그 달에 하루라도 열리는 축제. 비우면 전체
//   - region: 7개 권역 코드 (lib/regions.js, 형식 협의 필요)
//   - sido / sigungu: TourAPI 법정동 코드 (lDongRegnCd / lDongSignguCd)
//   - active=1: 종료 축제 빼기 (개최중 · 예정만)
//   - cat: TourAPI 분류 코드 (lclsSystm3)
//   - sort=date: 개최중 → 예정(시작일 빠른 순) → 종료(최근 순)
//   - sort=distance: lat, lng 에서 가까운 순
//   → 200 { "total": 8, "items": [Festival, ...] }
//
// GET /api/festivals/:id
//   → 200 FestivalDetail / 404 없는 축제
//
// Festival = { id, title, startDate:"2026-10-16", endDate, sidoCode, sido:"충청남도",
//              sigunguCode, sigungu:"서산시", category, image, lat, lng }
// FestivalDetail = Festival + { address, tel, sponsor, fee, homepage, overview, place, playtime }
//   - 값이 없으면 null (AI 추정값 금지, TourAPI 원본 값만)
//
// GET /api/places?region=chungcheong   (H120 관광지 · 음식점 점)
//   → 200 { "items": [Place, ...] }
// Place = { id, type:"attraction"|"food", title, address, sidoCode, sigunguCode, region, image, lat, lng }
//   - 좌표 없는 장소는 빼고 줌
// ────────────────────────────────────────────────────────────────

import { asset, distanceKm, festivalStatus, REGION_BY_SIDO, STATUS, today } from "../lib/festival.js";

export const USE_MOCK = true;

export class NotFoundError extends Error {}

export async function fetchFestivals(params) {
  if (USE_MOCK) return mockFestivals(params);
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== "" && v != null));
  return getJson(`/api/festivals?${qs}`);
}

export async function fetchPlaces(region) {
  if (USE_MOCK) return mockPlaces(region);
  return getJson(`/api/places?region=${encodeURIComponent(region)}`);
}

export async function fetchFestival(id) {
  if (USE_MOCK) return mockFestival(id);
  return getJson(`/api/festivals/${encodeURIComponent(id)}`);
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
let mockList;
function loadMockList() {
  mockList ??= getJson(asset("mock/festivals.json"));
  return mockList;
}

async function mockFestivals({ month, region, sido, sigungu, cat, active, sort = "date", lat, lng, page = 1, size = 12 }) {
  await delay(250);
  let items = await loadMockList();
  if (month) {
    const [y, m] = month.split("-").map(Number);
    const first = `${month}-01`;
    const last = `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
    items = items.filter((f) => f.startDate <= last && f.endDate >= first);
  }
  if (region) items = items.filter((f) => REGION_BY_SIDO[f.sidoCode] === region);
  if (sido) items = items.filter((f) => f.sidoCode === sido);
  if (sigungu) items = items.filter((f) => f.sigunguCode === sigungu);
  if (cat) items = items.filter((f) => f.category === cat);

  const base = today();
  if (active) items = items.filter((f) => festivalStatus(f, base) !== "ended");
  if (sort === "distance" && lat != null && lng != null) {
    const here = { lat: Number(lat), lng: Number(lng) };
    const dist = (f) => (f.lat != null && f.lng != null ? distanceKm(here, f) : Infinity);
    items = [...items].sort((a, b) => dist(a) - dist(b));
  } else {
    items = [...items].sort((a, b) => {
      const sa = festivalStatus(a, base);
      const sb = festivalStatus(b, base);
      if (sa !== sb) return STATUS[sa].order - STATUS[sb].order;
      if (sa === "ended") return b.endDate.localeCompare(a.endDate);
      return a.startDate.localeCompare(b.startDate);
    });
  }
  const start = (Number(page) - 1) * Number(size);
  return { total: items.length, items: items.slice(start, start + Number(size)) };
}

let mockPlaceList;
export function loadMockPlaces() {
  mockPlaceList ??= getJson(asset("mock/places.json"));
  return mockPlaceList;
}

async function mockPlaces(region) {
  await delay(200);
  return { items: (await loadMockPlaces()).filter((p) => p.region === region) };
}

export { loadMockList as loadMockFestivals };

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

function delay(ms) { return new Promise((r) => setTimeout(r, ms)); }

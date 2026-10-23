// 축제 공통 값 · 계산 (UI 설계서 CM20)

/** public 폴더 파일 경로 (개발: /, 빌드: /view/) */
export const asset = (path) => `${import.meta.env.BASE_URL}${path}`;

export const NO_IMAGE = asset("no-image.svg");
export const SOURCE_TEXT = "출처 : 한국관광공사 TourAPI · 방문 전 운영 여부를 확인하세요";
export const MISSING_TEXT = "정보 없음 · 방문 전 확인";

// 축제 카테고리 (TourAPI 분류체계 lclsSystm3, 축제 EV01 하위 6종)
export const CATEGORIES = [
  { code: "EV010100", name: "문화관광축제" },
  { code: "EV010200", name: "문화예술축제" },
  { code: "EV010300", name: "지역특산물축제" },
  { code: "EV010400", name: "전통역사축제" },
  { code: "EV010500", name: "생태자연축제" },
  { code: "EV010600", name: "기타축제" },
];

// 시·도 법정동 코드 → 7개 권역 코드 (regions.js, 화면 전용)
export const REGION_BY_SIDO = {
  "11": "capital", "28": "capital", "41": "capital",
  "51": "gangwon",
  "36110": "chungcheong", "30": "chungcheong", "43": "chungcheong", "44": "chungcheong",
  "47": "gyeongsang", "48": "gyeongsang",
  "27": "southeast", "31": "southeast", "26": "southeast",
  "12": "jeolla", "52": "jeolla",
  "50": "jeju",
};

export const SIDO_SHORT = {
  "서울특별시": "서울", "부산광역시": "부산", "대구광역시": "대구", "인천광역시": "인천",
  "대전광역시": "대전", "울산광역시": "울산", "세종특별자치시": "세종", "경기도": "경기",
  "충청북도": "충북", "충청남도": "충남", "경상북도": "경북", "경상남도": "경남",
  "제주특별자치도": "제주", "강원특별자치도": "강원", "전북특별자치도": "전북",
  "전남광주통합특별시": "전남광주",
};

export const STATUS = {
  ongoing: { label: "개최중", order: 0 },
  upcoming: { label: "예정", order: 1 },
  ended: { label: "종료", order: 2 },
};

/** 브라우저 기준 오늘 날짜 "YYYY-MM-DD" */
export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 개최 상태: 오늘 날짜 기준으로 화면에서 계산 */
export function festivalStatus(f, base = today()) {
  if (f.startDate && base < f.startDate) return "upcoming";
  if (f.endDate && f.endDate < base) return "ended";
  return "ongoing";
}

/** 카드용 "2026.10.16 ~ 10.25" (해가 다르면 끝에도 연도) */
export function formatPeriodShort(start, end) {
  if (!start) return MISSING_TEXT;
  const s = dot(start);
  if (!end || end === start) return s;
  return start.slice(0, 4) === end.slice(0, 4) ? `${s} ~ ${dot(end).slice(5)}` : `${s} ~ ${dot(end)}`;
}

/** 상세용 "2026.10.16 ~ 2026.10.25" */
export function formatPeriodFull(start, end) {
  if (!start) return null;
  return !end || end === start ? dot(start) : `${dot(start)} ~ ${dot(end)}`;
}

/** "충남 서산시" */
export function regionLabel(f) {
  const sido = SIDO_SHORT[f.sido] ?? f.sido ?? "";
  if (f.sido === "세종특별자치시") return sido;
  return [sido, f.sigungu].filter(Boolean).join(" ");
}

/** "YYYY-MM" 형태로 이번 달 + offset 달 */
export function monthOf(offset = 0) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

/** 두 좌표 사이 거리(km) */
export function distanceKm(a, b) {
  const R = 6371;
  const rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** 한 줄 소개: TourAPI 개요의 첫 문장 */
export function firstSentence(text) {
  if (!text) return null;
  const t = text.replace(/\s+/g, " ").trim();
  const m = t.match(/^.+?[.!?](?=\s|$)/);
  return m ? m[0] : t;
}

/** http(s) 주소만 허용 */
export function safeUrl(url) {
  try {
    const u = new URL(url, window.location.origin);
    return ["http:", "https:"].includes(u.protocol) ? u.href : null;
  } catch {
    return null;
  }
}

/** 브라우저 위치 (가까운 순 정렬) */
export function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("geolocation 미지원"));
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      reject,
      { timeout: 10000, maximumAge: 600000 },
    );
  });
}

function pad(n) { return String(n).padStart(2, "0"); }
function dot(ymd) { return ymd.replaceAll("-", "."); }

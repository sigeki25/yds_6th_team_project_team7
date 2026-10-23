// 7개 권역 (UI 설계서 1장). 화면에서만 쓰는 코드 — 백엔드는 권역 대신 지역 이름("강릉")을 쓰고, 화면이 코드로 바꿔 씀 (chat.js withRegionCode)
export const REGIONS = [
  { code: "capital", name: "서울 / 인천 / 경기도", short: "수도권" },
  { code: "gangwon", name: "강원특별자치도", short: "강원" },
  { code: "chungcheong", name: "세종 / 대전 / 충청도", short: "충청" },
  { code: "gyeongsang", name: "경상도", short: "경상" },
  { code: "southeast", name: "대구 / 울산 / 부산", short: "대구·울산·부산" },
  { code: "jeolla", name: "광주 / 전라도", short: "광주·전라" },
  { code: "jeju", name: "제주특별자치도", short: "제주" },
];

export const regionByCode = (code) => REGIONS.find((r) => r.code === code) ?? null;

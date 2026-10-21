// CM20-4 장소 종류: 색 + 모양으로 구분 (축제 라벨 · 관광지 원 · 음식점 마름모)
export const PLACE_TYPES = {
  festival: { label: "축제" },
  attraction: { label: "관광지" },
  food: { label: "음식점" },
};

/** 번호 마커 HTML (카카오맵 오버레이용, components/PlaceMark.jsx 와 같은 모양) */
export function placeMarkHtml(type, n) {
  return `<span class="place-mark place-mark--${type}" aria-hidden="true"><span>${n}</span></span>`;
}

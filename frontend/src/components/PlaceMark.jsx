import { PLACE_TYPES } from "../lib/places.js";

/** CM20-4 장소 번호 마커 */
export default function PlaceMark({ type, n }) {
  return (
    <span className={`place-mark place-mark--${type}`} aria-label={`${n}번 ${PLACE_TYPES[type].label}`}>
      <span>{n}</span>
    </span>
  );
}

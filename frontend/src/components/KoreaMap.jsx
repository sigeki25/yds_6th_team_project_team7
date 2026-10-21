import { ISLANDS, MAP_VIEWBOX, REGION_PATHS } from "../lib/koreaMap.js";
import { REGIONS } from "../lib/regions.js";

// 권역 이름 위치 (지도 좌표, 손으로 맞춤)
const LABEL_AT = {
  capital: [128, 52], gangwon: [352, 96], chungcheong: [176, 232], gyeongsang: [372, 232],
  southeast: [400, 372], jeolla: [182, 352], jeju: [168, 498],
};

/** H110-2 · 3 전국 권역 지도: 클릭하면 권역 선택 (선택 권역은 연보라) */
export default function KoreaMap({ selected, onSelect }) {
  function onKey(e, code) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect(code);
    }
  }

  return (
    <svg className="korea-map" viewBox={MAP_VIEWBOX} role="group" aria-label="전국 권역 지도">
      {REGIONS.map((r) => (
        <g
          key={r.code}
          className={`korea-map__region${selected === r.code ? " is-selected" : ""}`}
          role="button"
          tabIndex={0}
          aria-pressed={selected === r.code}
          aria-label={r.name}
          onClick={() => onSelect(r.code)}
          onKeyDown={(e) => onKey(e, r.code)}
        >
          {REGION_PATHS[r.code].map((d, i) => <path key={i} d={d} />)}
          {r.code === "gyeongsang" && (
            <>
              <circle cx={ISLANDS.dokdo[0]} cy={ISLANDS.dokdo[1]} r="3" />
              <text className="korea-map__island" x={ISLANDS.ulleung[0] - 10} y={ISLANDS.ulleung[1] - 10} textAnchor="end">울릉도</text>
              <text className="korea-map__island" x={ISLANDS.dokdo[0] - 8} y={ISLANDS.dokdo[1] + 5} textAnchor="end">독도</text>
            </>
          )}
        </g>
      ))}
      {/* 이름은 다른 권역에 가리지 않게 맨 위에 */}
      <g aria-hidden="true">
        {REGIONS.map((r) => (
          <text key={r.code} className="korea-map__label" x={LABEL_AT[r.code][0]} y={LABEL_AT[r.code][1]} textAnchor="middle">
            {r.name}
          </text>
        ))}
      </g>
    </svg>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { regionLabel } from "../lib/festival.js";
import { loadKakaoMaps } from "../lib/kakao.js";
import { PLACE_TYPES, placeMarkHtml } from "../lib/places.js";

const LAYERS = [
  { key: "festival", label: "축제 라벨" },
  { key: "attraction", label: "관광지" },
  { key: "food", label: "음식점" },
];

/** '시 · 군 + 축제명' 라벨 (축제명에 지명이 이미 있으면 그대로) */
function labelOf(f) {
  let city = (f.sigungu ?? "").replace(/(특별자치)?[시군구]$/, "");
  if (city.length < 2) city = regionLabel(f).split(" ")[0]; // 대전 서구 → 대전
  return f.title.includes(city) ? f.title : `${city} ${f.title}`;
}

/** H120 가운데 권역 지도: 축제 라벨 · 관광지/음식점 점 · 코스 번호 */
export default function RegionMap({ festivals, places, course }) {
  const navigate = useNavigate();
  const box = useRef(null);
  const mapRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [show, setShow] = useState({ festival: true, attraction: true, food: true });

  useEffect(() => {
    let cancelled = false;
    loadKakaoMaps()
      .then((kakao) => {
        if (cancelled || !box.current) return;
        box.current.innerHTML = "";
        const map = new kakao.maps.Map(box.current, { center: new kakao.maps.LatLng(36.5, 127.8), level: 11 });
        map.addControl(new kakao.maps.ZoomControl(), kakao.maps.ControlPosition.RIGHT);
        mapRef.current = map;
        setReady(true);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error(err);
        setFailed(true);
      });
    return () => { cancelled = true; };
  }, []);

  // 처음엔 권역 축제 · 장소가 다 보이게, 코스가 있으면 코스에 맞춤
  useEffect(() => {
    if (!ready) return;
    const { kakao } = window;
    const pts = course ? course.places : [...festivals, ...places];
    if (!pts.length) return;
    const bounds = new kakao.maps.LatLngBounds();
    pts.forEach((p) => bounds.extend(new kakao.maps.LatLng(p.lat, p.lng)));
    mapRef.current.setBounds(bounds, 40, 40, 40, 40);
  }, [ready, festivals, places, course]);

  // 3. 축제 라벨 (클릭 → D110)
  useOverlays(ready && show.festival, mapRef, festivals, (f) => {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "map-label";
    el.textContent = labelOf(f);
    el.addEventListener("click", () => navigate(`/festivals/${encodeURIComponent(f.id)}`));
    return { el, yAnchor: 1.2 };
  });

  // 4. 관광지 원 · 음식점 마름모 (마우스오버 툴팁, 클릭 이동 없음)
  const shownPlaces = useMemo(() => places.filter((p) => show[p.type]), [places, show]);
  useOverlays(ready, mapRef, shownPlaces, (p) => {
    const el = document.createElement("span");
    el.className = `map-dot map-dot--${p.type}`;
    el.dataset.tip = `${PLACE_TYPES[p.type].label} · ${p.title}`;
    return { el };
  });

  // CM10-7 코스 장소를 번호로
  useOverlays(ready && course, mapRef, course?.places ?? [], (p, i) => {
    const el = document.createElement("span");
    el.className = "map-course-mark";
    el.innerHTML = placeMarkHtml(p.type, i + 1);
    el.title = p.title;
    return { el, z: 5 };
  });
  useEffect(() => {
    if (!ready || !course) return;
    const { kakao } = window;
    const line = new kakao.maps.Polyline({
      map: mapRef.current,
      path: course.places.map((p) => new kakao.maps.LatLng(p.lat, p.lng)),
      strokeWeight: 3, strokeColor: "#2E5E46", strokeOpacity: 0.9, strokeStyle: "shortdash",
    });
    return () => line.setMap(null);
  }, [ready, course]);

  return (
    <div className="region-map">
      <div ref={box} className="region-map__canvas" hidden={failed} />

      {failed && (
        <div className="region-map__fallback">
          <p className="region-map__fallback-title">지도를 불러오지 못했어요. 축제 목록으로 보여 드려요.</p>
          {course && (
            <ol className="region-map__course">
              {course.places.map((p, i) => <li key={p.id}>{i + 1}. {p.title}</li>)}
            </ol>
          )}
          <ul className="region-map__list">
            {festivals.map((f) => (
              <li key={f.id}>
                <Link to={`/festivals/${encodeURIComponent(f.id)}`}>{labelOf(f)}</Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 5. 범례 · 표시 켜고 끄기 (색 + 모양) */}
      {!failed && (
        <fieldset className="map-legend">
          <legend className="sr-only">지도 표시</legend>
          {LAYERS.map((l) => (
            <label key={l.key} className="map-legend__item">
              <input
                type="checkbox"
                checked={show[l.key]}
                onChange={(e) => setShow((s) => ({ ...s, [l.key]: e.target.checked }))}
              />
              <span className={`legend-icon legend-icon--${l.key}`} aria-hidden="true" />
              {l.label}
            </label>
          ))}
        </fieldset>
      )}
    </div>
  );
}

/** 목록을 카카오맵 CustomOverlay 로 올리고, 바뀌면 지움 */
function useOverlays(enabled, mapRef, items, make) {
  const makeRef = useRef(make);
  useEffect(() => { makeRef.current = make; });

  useEffect(() => {
    if (!enabled) return;
    const { kakao } = window;
    const overlays = items.filter((p) => p.lat != null && p.lng != null).map((p, i) => {
      const { el, yAnchor = 0.5, z = 1 } = makeRef.current(p, i);
      return new kakao.maps.CustomOverlay({
        map: mapRef.current, position: new kakao.maps.LatLng(p.lat, p.lng),
        content: el, yAnchor, zIndex: z, clickable: true,
      });
    });
    return () => overlays.forEach((o) => o.setMap(null));
  }, [enabled, mapRef, items]);
}

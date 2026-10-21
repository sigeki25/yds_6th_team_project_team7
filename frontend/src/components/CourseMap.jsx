import { useEffect, useRef, useState } from "react";
import { loadKakaoMaps } from "../lib/kakao.js";
import { PLACE_TYPES, placeMarkHtml } from "../lib/places.js";

/** R110-8 · 9 · 10 코스 지도: 번호 마커 + 점선 경로 + 구간 시간, 회색 점은 코스 밖 주변 장소 */
export default function CourseMap({ course, active, onSelect }) {
  const box = useRef(null);
  const mapRef = useRef(null);
  const marks = useRef(new Map());
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const onSelectRef = useRef(onSelect);
  useEffect(() => { onSelectRef.current = onSelect; });

  useEffect(() => {
    let cancelled = false;
    loadKakaoMaps()
      .then((kakao) => {
        if (cancelled || !box.current) return;
        box.current.innerHTML = "";
        const map = new kakao.maps.Map(box.current, { center: new kakao.maps.LatLng(36.5, 127.8), level: 8 });
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

  useEffect(() => {
    if (!ready) return;
    const { kakao } = window;
    const map = mapRef.current;
    const pos = (p) => new kakao.maps.LatLng(p.lat, p.lng);
    const objects = [];

    course.nearby.forEach((p) => {
      const el = document.createElement("span");
      el.className = "map-dot map-dot--nearby";
      el.dataset.tip = `${PLACE_TYPES[p.type].label} · ${p.title}`;
      objects.push(new kakao.maps.CustomOverlay({ map, position: pos(p), content: el, zIndex: 1 }));
    });

    objects.push(new kakao.maps.Polyline({
      map, path: course.places.map(pos),
      strokeWeight: 4, strokeColor: "#2E5E46", strokeOpacity: 0.9, strokeStyle: "shortdash",
    }));

    course.legs.forEach((leg, i) => {
      const a = course.places[i];
      const b = course.places[i + 1];
      const el = document.createElement("span");
      el.className = `map-leg${leg.estimated ? " map-leg--estimated" : ""}`;
      el.textContent = `${leg.estimated ? "약 " : ""}${leg.minutes}분`;
      objects.push(new kakao.maps.CustomOverlay({
        map, position: new kakao.maps.LatLng((a.lat + b.lat) / 2, (a.lng + b.lng) / 2), content: el, zIndex: 2,
      }));
    });

    marks.current.clear();
    course.places.forEach((p, i) => {
      const el = document.createElement("button");
      el.type = "button";
      el.className = "map-course-mark";
      el.innerHTML = placeMarkHtml(p.type, i + 1);
      el.setAttribute("aria-label", `${i + 1}번 ${p.title}`);
      el.addEventListener("click", () => onSelectRef.current(p.id));
      marks.current.set(p.id, el);
      objects.push(new kakao.maps.CustomOverlay({ map, position: pos(p), content: el, zIndex: 5, clickable: true }));
    });

    // 처음엔 코스 전체가 보이게
    const bounds = new kakao.maps.LatLngBounds();
    course.places.forEach((p) => bounds.extend(pos(p)));
    map.setBounds(bounds, 60, 60, 60, 60);

    return () => objects.forEach((o) => o.setMap(null));
  }, [ready, course]);

  // 카드 클릭 → 해당 마커 강조
  useEffect(() => {
    if (!ready) return;
    marks.current.forEach((el, id) => el.classList.toggle("is-active", id === active));
    const p = course.places.find((x) => x.id === active);
    if (p) mapRef.current.panTo(new window.kakao.maps.LatLng(p.lat, p.lng));
  }, [ready, active, course]);

  return (
    <div className="course-map">
      <div ref={box} className="course-map__canvas" hidden={failed} role="img" aria-label="코스 지도" />
      {failed && <p className="course-map__failed">지도를 불러오지 못했어요. 왼쪽 일정은 그대로 볼 수 있어요.</p>}
      <ul className="map-legend map-legend--static" aria-label="범례">
        <li><span className="legend-icon legend-icon--festival" aria-hidden="true" />축제</li>
        <li><span className="legend-icon legend-icon--attraction" aria-hidden="true" />관광지</li>
        <li><span className="legend-icon legend-icon--food" aria-hidden="true" />음식점</li>
        <li><span className="legend-icon legend-icon--route" aria-hidden="true" />코스 경로</li>
      </ul>
      <p className="course-map__credit">지도 : 카카오맵</p>
    </div>
  );
}

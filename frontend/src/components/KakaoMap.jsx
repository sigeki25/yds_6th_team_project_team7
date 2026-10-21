import { useEffect, useRef, useState } from "react";
import { loadKakaoMaps } from "../lib/kakao.js";
import { SOURCE_TEXT } from "../lib/festival.js";

/** D110-8 위치 지도: 카카오맵, 축제 위치 핀 1개 + 출처 안내 */
export default function KakaoMap({ lat, lng, title }) {
  const box = useRef(null);
  const hasCoords = lat != null && lng != null;
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!hasCoords) return;
    let cancelled = false;
    loadKakaoMaps()
      .then((kakao) => {
        if (cancelled || !box.current) return;
        box.current.innerHTML = "";
        const pos = new kakao.maps.LatLng(lat, lng);
        const map = new kakao.maps.Map(box.current, { center: pos, level: 4 });
        map.setZoomable(false); // 페이지 스크롤과 겹치지 않게 휠 확대는 끔
        map.addControl(new kakao.maps.ZoomControl(), kakao.maps.ControlPosition.RIGHT);
        new kakao.maps.Marker({ map, position: pos, title });
      })
      .catch((err) => {
        if (cancelled) return;
        console.error(err);
        setFailed(true);
      });
    return () => { cancelled = true; };
  }, [hasCoords, lat, lng, title]);

  return (
    <div className="detail__map">
      <div ref={box} className="detail__map-canvas" role="img" aria-label={`${title} 위치 지도`} />
      {!hasCoords && <p className="detail__map-empty">위치 정보 없음</p>}
      {hasCoords && failed && <p className="detail__map-empty">지도를 불러오지 못했어요</p>}
      <p className="detail__map-source">{SOURCE_TEXT}</p>
    </div>
  );
}

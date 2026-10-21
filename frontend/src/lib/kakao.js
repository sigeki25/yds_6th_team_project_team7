// 카카오맵 JavaScript SDK 를 한 번만 불러옴
let kakaoPromise;

export function loadKakaoMaps() {
  kakaoPromise ??= new Promise((resolve, reject) => {
    const key = document.querySelector('meta[name="kakao-js-key"]')?.content ?? "";
    if (!key || key.startsWith("{{")) return reject(new Error("KAKAO_JS_KEY 없음"));
    const timer = setTimeout(() => reject(new Error("카카오맵 응답 없음 (도메인 등록 확인)")), 8000);
    const script = document.createElement("script");
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(key)}&autoload=false`;
    script.onload = () => {
      if (!window.kakao?.maps) return reject(new Error("카카오맵 SDK 로드 실패"));
      window.kakao.maps.load(() => { clearTimeout(timer); resolve(window.kakao); });
    };
    script.onerror = () => { clearTimeout(timer); reject(new Error("카카오맵 SDK 로드 실패 (도메인 등록 확인)")); };
    document.head.append(script);
  });
  return kakaoPromise;
}

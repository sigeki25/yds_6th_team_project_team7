# frontend (React + Vite)

지역 코스 지도의 화면입니다. 지금 있는 화면은 L110 축제 목록, D110 축제 상세입니다.

## 처음 한 번

```bash
cd frontend
npm install
```

## 개발할 때

FastAPI 와 Vite 개발 서버를 같이 띄웁니다. `/api` 요청은 Vite 가 FastAPI(8000) 로 넘깁니다.

```bash
# 터미널 1 (저장소 루트)
uvicorn main:app --reload

# 터미널 2
cd frontend
npm run dev
```

브라우저에서 http://localhost:5173/festivals 를 엽니다. 저장하면 바로 반영됩니다.

## FastAPI 하나로 띄울 때

```bash
cd frontend
npm run build      # 결과가 저장소 루트의 view 폴더에 생김
cd ..
uvicorn main:app --reload
```

브라우저에서 http://localhost:8000/festivals 를 엽니다. `view` 폴더는 빌드 결과라 git 에 올리지 않습니다.

## 알아 둘 것

- **데이터**: 백엔드 `/api/festivals` 가 준비되기 전이라 `public/mock` 의 TourAPI 스냅샷을 씁니다. `src/api/festivals.js` 의 `USE_MOCK` 을 `false` 로 바꾸면 실제 API 를 부릅니다. 기대하는 응답 형식은 그 파일 맨 위에 있습니다.
- **카카오맵**: 저장소 루트 `.env` 의 `KAKAO_JS_KEY` 를 씁니다. 카카오 개발자 콘솔 › 플랫폼 › Web 에 `http://localhost:5173`, `http://localhost:8000` 을 등록해야 지도가 뜹니다.

## 폴더

```
src/
  api/         백엔드 호출 (mock 포함)
  components/  헤더 · 축제 카드 · 배지 · 토스트 · 카카오맵 등 공통 부품
  lib/         날짜 · 상태 계산 등 공통 함수
  pages/       화면 (FestivalListPage = L110, FestivalDetailPage = D110)
  styles/      CSS (색상은 UI 설계서 CM20 값)
public/
  mock/        TourAPI 스냅샷
  data/        시·도 / 시·군·구 목록 (TourAPI 법정동 코드)
```

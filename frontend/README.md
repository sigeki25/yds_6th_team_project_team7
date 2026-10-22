# frontend (React + Vite)

지역 코스 지도의 화면입니다. UI 설계서 v0.1 의 H110 · H120 지도 홈, CM10 AI 코스 도우미, L110 축제 목록, D110 축제 상세, R110 코스 결과, E110 예외, M110 모바일 배치가 있습니다.

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

브라우저에서 http://localhost:5173 을 엽니다. 저장하면 바로 반영됩니다.

## FastAPI 하나로 띄울 때

```bash
cd frontend
npm run build      # 결과가 저장소 루트의 view 폴더에 생김
cd ..
uvicorn main:app --reload
```

브라우저에서 http://localhost:8000 을 엽니다. `view` 폴더는 빌드 결과라 git 에 올리지 않습니다.

## 알아 둘 것

- **데이터**: 기본은 `public/mock` 의 TourAPI 스냅샷을 씁니다. 축제는 chroma 브랜치 백엔드(`GET /festivals`)에 맞춰 두어 `src/api/festivals.js` 의 `USE_MOCK` 을 `false` 로 바꾸면 실제 API 를 부릅니다 (개발 서버가 `/api/festivals` → `/festivals` 로 넘김). 관광지 · 음식점(`/api/places`)은 엔드포인트가 없어 계속 mock 입니다. 기대하는 응답 형식은 그 파일 맨 위에 있습니다.
- **AI 코스 도우미**: `/api/chat` 이 준비되기 전이라 `src/api/chat.js` 가 규칙으로 흉내 냅니다 (AI 호출 없음, 이동 시간은 직선거리 어림). `USE_MOCK` 을 `false` 로 바꾸면 실제 API 를 부릅니다. 요청 · 응답 형식은 그 파일 맨 위에 있습니다.
- **대화 · 코스**: 저장하지 않습니다. 새로고침하면 사라지고, `/course` 를 바로 열면 지도 홈으로 돌아갑니다.
- **권역 코드**: `capital` · `gangwon` 같은 값은 임시입니다 (`src/lib/regions.js`). 백엔드와 맞추면 바꿉니다.
- **전국 지도**: 통계청 2013 시·도 경계([southkorea-maps](https://github.com/southkorea/southkorea-maps))로 만든 SVG 경로입니다 (`src/lib/koreaMap.js`, 자동 생성).
- **카카오맵**: 저장소 루트 `.env` 의 `KAKAO_JS_KEY` 를 씁니다. 카카오 개발자 콘솔 › 플랫폼 › Web 에 `http://localhost:5173`, `http://localhost:8000` 을 등록해야 지도가 뜹니다.

## 폴더

```
src/
  api/         백엔드 호출 (mock 포함)
  components/  헤더 · 축제 카드 · 채팅 패널 · 전국 지도 · 카카오맵 등 부품
  lib/         날짜 · 상태 계산 등 공통 함수
  course/      AI 코스 도우미 대화 · 코스 상태 (화면을 옮겨도 유지)
  pages/       화면 (HomePage = H110 · H120, FestivalListPage = L110,
               FestivalDetailPage = D110, CoursePage = R110, NotFoundPage = E110)
  styles/      CSS (색상은 UI 설계서 CM20 값)
public/
  mock/        TourAPI 스냅샷
  data/        시·도 / 시·군·구 목록 (TourAPI 법정동 코드)
```

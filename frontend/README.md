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

- **축제 데이터**: 백엔드 `GET /api/festivals` (chroma DB, 요청 · 응답은 `tour_api.py` 형식) 를 부릅니다. 백엔드를 처음 받았으면 루트에서 `python chroma_insert_data.py` 를 실행해 `chroma_db` 를 만들어야 목록이 나옵니다. 백엔드 없이 화면만 볼 때는 `src/api/festivals.js` 의 `USE_MOCK` 을 `true` 로 바꾸면 `public/mock` 스냅샷을 씁니다. 요청 · 응답 형식은 그 파일 맨 위에 있습니다.
- **관광지 · 음식점**: 권역 단위로 받지 않습니다 (TourAPI 호출량). 코스가 만들어지면 응답의 `course.nearby` 로 코스 주변 것만 지도에 찍습니다.
- **AI 코스 도우미**: `src/api/chat.js` 는 실제 `POST /api/chat` 을 호출합니다. 로컬 Ollama 서버와 모델이 필요합니다 (루트 README 참고). 모의 시연은 해당 파일의 `USE_MOCK` 을 명시적으로 켠 경우에만 사용합니다. 요청 · 응답 형식은 그 파일 맨 위에 있습니다.
- **대화 · 코스**: 저장하지 않습니다. 새로고침하면 사라지고, `/course` 를 바로 열면 지도 홈으로 돌아갑니다.
- **권역 코드**: `capital` · `gangwon` 같은 값은 화면에서만 씁니다 (`src/lib/regions.js`). 백엔드는 권역 대신 지역 이름("강릉")을 주고, 화면이 권역 코드로 바꿔 씁니다.
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

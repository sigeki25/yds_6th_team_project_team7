# 지역 코스 지도

국내 축제를 찾아보고, 대화에서 추출한 여행 조건으로 주변 관광지·음식점을 묶는 React + FastAPI 프로토타입입니다. Ollama는 조건 추출을 담당하고, Python은 TourAPI·카카오 데이터와 거리·시간 제한을 이용해 코스를 구성합니다.

## 실행 준비

개발 검증 환경: macOS arm64, Python 3.14.5, Node.js 25.9.0. 다른 환경에서는 패키지 설치와 모델 실행을 별도 확인해야 합니다.

```sh
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
cp '.env 양식' .env  # 처음 설정할 때만; 기존 .env를 덮어쓰지 마세요
```

`.env`에 `TOUR_API_KEY`, `KAKAO_API_KEY`(REST 키), `KAKAO_JS_KEY`(JavaScript 키)를 입력합니다. JavaScript 키는 브라우저용 공개 키이며 REST 키와 다릅니다. 카카오 Web 플랫폼에 `http://localhost:8000`, 개발 서버 사용 시 `http://localhost:5173`을 등록합니다.

### 로컬 AI

Ollama를 설치한 뒤 서버와 모델을 준비합니다. macOS Homebrew 예시:

```sh
brew install ollama
ollama serve
```

다른 터미널에서:

```sh
ollama pull gemma4:e4b
ollama list
```

`OLLAMA_MODEL`(기본 gemma4:e4b), `OLLAMA_BASE_URL`(기본 http://localhost:11434), `OLLAMA_TIMEOUT`(호출당 기본 90초)을 `.env`에서 설정할 수 있습니다. 조건 추출 실패 시 한 번 재시도합니다. JSON 강제 출력이 지원되지 않는다는 명시적인 501 오류에는 동일 모델의 일반 JSON 응답을 검증하여 사용합니다. 조건 추출은 사고 출력을 끄고 최대 1024 토큰으로 제한합니다.

모델 최초 다운로드와 최초 추론에는 시간이 걸립니다. Ollama를 별도 앱이나 서비스로 이미 실행하고 있다면 서버를 중복 실행하지 않습니다.

### 축제 데이터

```sh
python chroma_insert_data.py
```

저장소의 2026-10-21 스냅샷 296건을 로컬 `chroma_db`에 적재합니다. 이 데이터는 자동 갱신되지 않습니다. 최신 행사 수집·갱신 스케줄은 별도 구현 대상입니다.

### 프로그램 실행

```sh
cd frontend
npm ci
npm run build
cd ..
python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

브라우저에서 http://localhost:8000 을 엽니다. Ollama 서버도 함께 실행되어 있어야 실제 AI 대화가 가능합니다.

프론트 개발 중에는 백엔드를 켠 상태에서 `cd frontend && npm run dev`로 Vite를 실행합니다. `/api`는 8000 포트로 프록시됩니다.

## 구현 범위

- 축제 목록·상세: Chroma 메타데이터 검색 및 TourAPI 상세.
- 채팅: 실제 `/api/chat` → Ollama 조건 추출 → 코스 생성.
- 코스: 자동차 이동 기준, 반나절 240분/하루 480분 이내 체류+이동 시간. 길찾기 실패 시 추정 구간 표시.
- 운영시간·휴무: TourAPI 안내 정보 표시. 실제 방문 시각의 영업 여부를 보장하지 않습니다.
- 대화·코스: 브라우저 메모리에만 유지합니다. 새로고침하면 사라집니다.
- Chroma 벡터 유사도/RAG 추천, 사용자 계정, 서버 일일 사용 제한, 자동 데이터 갱신은 구현 범위에 포함되지 않습니다.

`frontend/src/api/chat.js`의 `USE_MOCK`은 기본 false입니다. 로컬 모델이 실패해도 모의 AI 응답으로 바꿔 성공한 것처럼 표시하지 않습니다.

## 검증

```sh
python -m unittest discover -s tests -v
cd frontend
node --test src/api/chat.test.js
npm run lint
npm run build
```

루트 `test_tour_api.py`, `test_kakao_api.py`는 외부 API를 실제 호출하는 수동 진단 스크립트입니다. API 사용량을 소모하고 실패를 출력한 뒤 계속 진행하므로 자동 회귀 테스트와 구분합니다.

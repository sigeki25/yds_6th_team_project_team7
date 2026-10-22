"""카카오 API 호출 함수 모음

함수 목록 (모두 가공된 dict 를 돌려준다)
  - get_route()     자동차 경로 · 소요시간 · 거리 (카카오모빌리티 길찾기 /v1/directions)
  - search_place()  장소 이름 · 주소 → 좌표 (카카오 로컬 키워드 검색, 없으면 주소 검색)

좌표는 TourAPI 의 "mapx", "mapy" 를 그대로 넣으면 된다.
  mapx = 경도(longitude, 127.xxx),  mapy = 위도(latitude, 37.xxx)
아래 모양을 모두 받는다 (값은 문자열이어도 됨)
  {"title": "가락 옥토버페스트", "mapx": "127.1107532009", "mapy": "37.4960246566"}  ← TourAPI 원본
  {"title": "가락 옥토버페스트", "lng": 127.1107532009, "lat": 37.4960246566}       ← tour_api.py 결과
  (127.1107532009, 37.4960246566)                                                    ← (경도, 위도)

get_route() 반환 형식
  {
    "distance": 12345,          전체 거리 (m)
    "duration": 2100,           전체 소요시간 (초)
    "distanceText": "12.3km",
    "durationText": "35분",
    "taxiFare": 15800,          예상 택시비 (원). 없으면 None
    "toll": 0,                  통행료 (원). 없으면 None
    "legs": [                   구간별 (A→B, B→C ...)
      {"from": "A 이름", "to": "B 이름", "distance": 5000, "duration": 900,
       "distanceText": "5.0km", "durationText": "15분"}
    ],
    "path": [[경도, 위도], ...]  include_path=True 일 때만. 지도에 경로 선 그릴 때 사용
  }

search_place() 반환 형식
  {"total": 전체 개수, "items": [
    {"name", "address", "roadAddress", "category", "phone", "url",
     "mapx": "127.0...", "mapy": "37.5...",   ← TourAPI 와 같은 이름 (문자열)
     "lng": 127.0..., "lat": 37.5...}          ← tour_api.location_based_list(lng=, lat=) 에 바로 사용
  ]}

키는 저장소 루트 .env 의 KAKAO_API_KEY 를 읽는다 (카카오 디벨로퍼스 'REST API 키').
길찾기는 자동차 기준만 지원한다 (카카오모빌리티 API 에 도보·대중교통 없음).
"""
from __future__ import annotations

import logging
import os

import requests
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

DIRECTIONS_URL = "https://apis-navi.kakaomobility.com/v1/directions"
KEYWORD_URL = "https://dapi.kakao.com/v2/local/search/keyword.json"
ADDRESS_URL = "https://dapi.kakao.com/v2/local/search/address.json"
TIMEOUT = 15  # 초

MAX_WAYPOINTS = 5  # 출발 · 도착 사이 경유지 최대 개수 (카카오 제한) → 한 번에 최대 7곳
PRIORITIES = ("RECOMMEND", "TIME", "DISTANCE")  # 추천 경로 / 최단 시간 / 최단 거리

# 대한민국 좌표 범위 (mapx, mapy 를 거꾸로 넣었는지 확인용)
_LNG_RANGE = (124.0, 132.0)
_LAT_RANGE = (33.0, 39.0)


class KakaoApiError(Exception):
    """카카오 API 호출 실패 (키 오류, 권한 미설정, 경로 없음 등)"""


# ──────────────────────────────────────────────────────────────
# 1. 공통 호출
# ──────────────────────────────────────────────────────────────
def _headers() -> dict:
    key = (os.getenv("KAKAO_API_KEY") or "").strip()
    if not key:
        raise KakaoApiError("KAKAO_API_KEY 가 비어 있습니다. 저장소 루트 .env 파일에 REST API 키를 넣어 주세요.")
    return {"Authorization": f"KakaoAK {key}"}


def _get(name: str, url: str, params: dict) -> dict:
    try:
        res = requests.get(url, params=params, headers=_headers(), timeout=TIMEOUT)
    except requests.RequestException as e:
        raise KakaoApiError(f"{name} 연결 실패: {e}") from e

    if res.status_code == 401:
        raise KakaoApiError(f"{name} 키 오류(401): .env 의 KAKAO_API_KEY 가 'REST API 키'인지 확인하세요. "
                            f"({_error_message(res)})")
    if res.status_code == 403:
        raise KakaoApiError(f"{name} 권한 없음(403): 카카오 디벨로퍼스 > 내 앱 > 카카오맵 사용 설정이 "
                            f"ON 인지 확인하세요. ({_error_message(res)})")
    if res.status_code != 200:
        raise KakaoApiError(f"{name} HTTP {res.status_code}: {_error_message(res)}")
    try:
        return res.json()
    except ValueError as e:
        raise KakaoApiError(f"{name} 응답이 JSON 이 아닙니다: {res.text[:200]}") from e


def _error_message(res) -> str:
    try:
        data = res.json()
        return str(data.get("message") or data.get("msg") or data)[:200]
    except ValueError:
        return res.text[:200]


# ──────────────────────────────────────────────────────────────
# 2. 경로 · 소요시간 (3-2 코스 만들기용)
# ──────────────────────────────────────────────────────────────
def get_route(points: list, priority: str = "RECOMMEND", include_path: bool = False) -> dict:
    """여러 장소를 순서대로 자동차로 이동할 때의 거리 · 소요시간

    points        장소 목록 (순서대로). 2곳 이상 7곳 이하.
                  TourAPI 항목을 그대로 넣으면 됨 (mapx, mapy 사용, title 은 구간 이름에 사용)
    priority      RECOMMEND(추천, 기본) / TIME(최단 시간) / DISTANCE(최단 거리)
    include_path  True 면 지도에 그릴 경로 좌표(path)도 돌려줌 (데이터가 커져서 기본은 False)
    """
    if not isinstance(points, (list, tuple)) or len(points) < 2:
        raise ValueError("points 에는 장소가 2곳 이상 있어야 합니다 (출발, 도착).")
    if len(points) > MAX_WAYPOINTS + 2:
        raise ValueError(f"한 번에 최대 {MAX_WAYPOINTS + 2}곳까지 계산할 수 있습니다 (지금 {len(points)}곳).")
    priority = (priority or "RECOMMEND").upper()
    if priority not in PRIORITIES:
        raise ValueError(f"priority 는 {', '.join(PRIORITIES)} 중 하나여야 합니다.")

    coords = [_to_xy(p, i) for i, p in enumerate(points)]
    names = [_name(p) for p in points]

    params = {
        "origin": _fmt(coords[0]),
        "destination": _fmt(coords[-1]),
        "priority": priority,
        "summary": "false",  # 구간별(sections) 정보까지 받기
    }
    if len(coords) > 2:
        params["waypoints"] = "|".join(_fmt(c) for c in coords[1:-1])

    data = _get("길찾기", DIRECTIONS_URL, params)
    routes = data.get("routes") or []
    if not routes:
        raise KakaoApiError(f"길찾기 응답에 경로가 없습니다: {str(data)[:200]}")
    route = routes[0]

    code = route.get("result_code")
    if code == 104 and len(coords) == 2:
        # 출발지와 도착지가 5m 이내 = 같은 장소 → 이동 없음
        return _route_result(0, 0, None, None, [_leg(names[0], names[1], 0, 0)], [] if include_path else None)
    if code != 0:
        raise KakaoApiError(f"길찾기 실패({code}): {route.get('result_msg', '')}")

    summary = route.get("summary") or {}
    fare = summary.get("fare") or {}
    sections = route.get("sections") or []

    legs = []
    for i, sec in enumerate(sections):
        legs.append(_leg(names[i] if i < len(names) else None,
                         names[i + 1] if i + 1 < len(names) else None,
                         sec.get("distance", 0), sec.get("duration", 0)))

    path = None
    if include_path:
        path = []
        for sec in sections:
            for road in sec.get("roads") or []:
                v = road.get("vertexes") or []
                path.extend([v[j], v[j + 1]] for j in range(0, len(v) - 1, 2))

    return _route_result(summary.get("distance", 0), summary.get("duration", 0),
                         fare.get("taxi"), fare.get("toll"), legs, path)


def _route_result(distance, duration, taxi, toll, legs, path) -> dict:
    result = {
        "distance": int(distance),
        "duration": int(duration),
        "distanceText": _distance_text(distance),
        "durationText": _duration_text(duration),
        "taxiFare": taxi,
        "toll": toll,
        "legs": legs,
    }
    if path is not None:
        result["path"] = path
    return result


def _leg(start, end, distance, duration) -> dict:
    return {
        "from": start,
        "to": end,
        "distance": int(distance),
        "duration": int(duration),
        "distanceText": _distance_text(distance),
        "durationText": _duration_text(duration),
    }


# ──────────────────────────────────────────────────────────────
# 3. 장소 이름 · 주소 → 좌표 (출발지 · 지역 좌표 찾기용)
# ──────────────────────────────────────────────────────────────
def search_place(query: str, size: int = 5) -> dict:
    """장소 이름이나 주소로 좌표 찾기

    query  "서울역", "강릉시청", "서울 중구 세종대로 110" 등
    size   받을 개수 (1~15)
    키워드 검색 결과가 없으면 주소 검색으로 한 번 더 찾는다.
    """
    if not query or not query.strip():
        raise ValueError("query(검색어)는 꼭 넣어야 합니다.")
    query = query.strip()
    size = max(1, min(int(size), 15))

    data = _get("장소 검색", KEYWORD_URL, {"query": query, "size": size})
    docs = data.get("documents") or []
    if docs:
        items = [_place_item(
            name=d.get("place_name"), address=d.get("address_name"), road=d.get("road_address_name"),
            category=d.get("category_name"), phone=d.get("phone"), url=d.get("place_url"),
            x=d.get("x"), y=d.get("y"),
        ) for d in docs]
    else:
        data = _get("주소 검색", ADDRESS_URL, {"query": query, "size": size})
        docs = data.get("documents") or []
        items = [_place_item(
            name=d.get("address_name"), address=(d.get("address") or {}).get("address_name") or d.get("address_name"),
            road=(d.get("road_address") or {}).get("address_name"),
            category=None, phone=None, url=None, x=d.get("x"), y=d.get("y"),
        ) for d in docs]

    total = (data.get("meta") or {}).get("total_count")
    items = [i for i in items if i["lng"] is not None and i["lat"] is not None]
    return {"total": total if isinstance(total, int) else len(items), "items": items}


def _place_item(name, address, road, category, phone, url, x, y) -> dict:
    lng, lat = _num(x), _num(y)
    return {
        "name": name or None,
        "address": address or None,
        "roadAddress": road or None,
        "category": category or None,
        "phone": phone or None,
        "url": url or None,
        "mapx": str(x) if lng is not None else None,
        "mapy": str(y) if lat is not None else None,
        "lng": lng,
        "lat": lat,
    }


# ──────────────────────────────────────────────────────────────
# 4. 작은 도우미 함수들
# ──────────────────────────────────────────────────────────────
def _to_xy(point, index: int = 0) -> tuple:
    """장소 하나 → (경도, 위도). mapx/mapy, lng/lat, x/y, (경도, 위도) 모두 받음"""
    if isinstance(point, dict):
        x = next((point.get(k) for k in ("mapx", "lng", "x") if point.get(k) not in (None, "")), None)
        y = next((point.get(k) for k in ("mapy", "lat", "y") if point.get(k) not in (None, "")), None)
    elif isinstance(point, (list, tuple)) and len(point) == 2:
        x, y = point
    else:
        raise ValueError(f"{index + 1}번째 장소 형식이 잘못됐습니다: {point!r}")

    lng, lat = _num(x), _num(y)
    if lng is None or lat is None:
        raise ValueError(f"{index + 1}번째 장소({_name(point) or point!r})에 좌표(mapx, mapy)가 없습니다.")
    # 잘못된 좌표는 고치지 않고 오류로 알림 (자동으로 고치면 잘못 넘긴 쪽의 문제가 숨겨짐)
    if _in(lng, _LAT_RANGE) and _in(lat, _LNG_RANGE):
        raise ValueError(f"{index + 1}번째 장소의 경도·위도가 바뀌어 있습니다: mapx(경도)={x}, mapy(위도)={y}. "
                         f"mapx 에는 127.xxx 같은 경도, mapy 에는 37.xxx 같은 위도를 넣어야 합니다.")
    if not (_in(lng, _LNG_RANGE) and _in(lat, _LAT_RANGE)):
        raise ValueError(f"{index + 1}번째 장소 좌표가 국내 범위가 아닙니다: 경도 {lng}, 위도 {lat}")
    return lng, lat


def _name(point):
    if isinstance(point, dict):
        return point.get("title") or point.get("name")
    return None


def _fmt(xy: tuple) -> str:
    return f"{xy[0]},{xy[1]}"


def _num(value) -> float | None:
    try:
        n = float(value)
    except (TypeError, ValueError):
        return None
    return n if n != 0 else None


def _in(value: float, rng: tuple) -> bool:
    return rng[0] <= value <= rng[1]


def _distance_text(meters) -> str:
    meters = int(meters or 0)
    if meters < 1000:
        return f"{meters}m"
    return f"{meters / 1000:.1f}km"


def _duration_text(seconds) -> str:
    minutes = round(int(seconds or 0) / 60)
    if seconds and minutes == 0:
        minutes = 1  # 1분 미만은 1분으로
    hours, minutes = divmod(minutes, 60)
    if hours and minutes:
        return f"{hours}시간 {minutes}분"
    if hours:
        return f"{hours}시간"
    return f"{minutes}분"

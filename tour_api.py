"""TourAPI (한국관광공사_국문 관광정보 서비스_GW, KorService2) 호출 함수 모음

공식 문서: https://www.data.go.kr/data/15101578/openapi.do

함수 목록 (모두 가공된 dict 를 돌려준다)
  - area_based_list()      지역기반 관광정보조회   /areaBasedList2
  - location_based_list()  위치기반 관광정보조회   /locationBasedList2
  - search_keyword()       키워드 검색 조회        /searchKeyword2
  - search_festival()      행사정보조회            /searchFestival2
  - get_festival_detail()  축제 상세 (detailCommon2 + detailIntro2 를 합침)

목록 함수의 반환 형식
  {"total": 전체 개수, "page": 페이지, "size": 한 페이지 수, "items": [...]}

  search_festival() 의 items  → Festival (프론트 frontend/src/api/festivals.js 맨 위 형식)
      { id, title, startDate:"2026-10-16", endDate, sidoCode, sido, sigunguCode, sigungu,
        category, image, lat, lng }
  나머지 목록 함수의 items      → Place
      { id, contentTypeId, title, address, tel, image, lat, lng,
        sidoCode, sido, sigunguCode, sigungu, category, distance }
  get_festival_detail()         → FestivalDetail = Festival + { address, tel, sponsor, fee,
                                    homepage, overview, place, playtime }

  값이 없으면 None (JSON 으로 바꾸면 null). TourAPI 원본 값만 넣고 추정값은 넣지 않는다.

키는 저장소 루트 .env 의 TOUR_API_KEY 를 읽는다 (공공데이터포털 '일반 인증키').
"""
from __future__ import annotations

import json
import logging
import os
import re
from datetime import datetime
from html import unescape
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

BASE_URL = "https://apis.data.go.kr/B551011/KorService2"
MOBILE_OS = "WEB"
MOBILE_APP = "YearDreamSchool 6th study"  # 서비스명. 바꿔도 됨
TIMEOUT = 30  # 공공데이터포털 서버가 느릴 때가 있어서 넉넉하게 (초)

MAX_RADIUS = 20000  # locationBasedList2 최대 반경 (m)

# 관광 타입 (contentTypeId). 목록 함수에서 원하는 종류만 걸러 받을 때 사용
CONTENT_TYPES = {
    "관광지": 12,
    "문화시설": 14,
    "축제공연행사": 15,
    "여행코스": 25,
    "레포츠": 28,
    "숙박": 32,
    "쇼핑": 38,
    "음식점": 39,
}
FESTIVAL_TYPE_ID = 15


class TourApiError(Exception):
    """TourAPI 호출 실패 (키 오류, 트래픽 초과, 서버 오류 등)"""


# ──────────────────────────────────────────────────────────────
# 1. 공통 호출
# ──────────────────────────────────────────────────────────────
def _service_key() -> str:
    key = (os.getenv("TOUR_API_KEY") or "").strip()
    if not key:
        raise TourApiError("TOUR_API_KEY 가 비어 있습니다. 저장소 루트 .env 파일에 키를 넣어 주세요.")
    return key


def _call(operation: str, params: dict) -> dict:
    """TourAPI 를 호출하고 {"total": int, "items": [원본 item, ...]} 를 돌려준다.

    - 값이 None 이거나 "" 인 파라미터는 보내지 않는다 (= 필터 없음, 전체)
    - 한글 keyword 인코딩은 requests 가 알아서 한다
    """
    query = {
        "serviceKey": _service_key(),
        "MobileOS": MOBILE_OS,
        "MobileApp": MOBILE_APP,
        "_type": "json",
    }
    query.update({k: v for k, v in params.items() if v is not None and v != ""})

    try:
        res = requests.get(f"{BASE_URL}/{operation}", params=query, timeout=TIMEOUT)
    except requests.RequestException as e:
        raise TourApiError(f"{operation} 연결 실패: {e}") from e

    text = res.text.strip()
    # 키 오류·트래픽 초과 때는 _type=json 이어도 XML 로 오는 경우가 있다
    if text.startswith("<"):
        # returnAuthMsg 가 제일 구체적 (예: SERVICE_KEY_IS_NOT_REGISTERED_ERROR = 키 오류)
        msg = None
        for tag in ("returnAuthMsg", "resultMsg", "errMsg"):
            m = re.search(rf"<{tag}>([^<]+)</{tag}>", text)
            if m:
                msg = m.group(1)
                break
        raise TourApiError(f"{operation} 오류: {msg or text[:200]}")
    if res.status_code != 200:
        raise TourApiError(f"{operation} HTTP {res.status_code}: {text[:200]}")

    try:
        data = json.loads(text)
    except ValueError as e:
        raise TourApiError(f"{operation} 응답이 JSON 이 아닙니다: {text[:200]}") from e

    # 오류 응답은 {"resultCode": "10", "resultMsg": "..."} 처럼 response 없이 올 때도 있다
    response = data.get("response", data)
    header = response.get("header") or {}
    code = header.get("resultCode", response.get("resultCode"))
    if code not in (None, "0000", "0"):
        msg = header.get("resultMsg", response.get("resultMsg", ""))
        raise TourApiError(f"{operation} 오류 {code}: {msg}")

    body = response.get("body") or {}
    items = body.get("items")
    # 결과가 없으면 items 가 "" 로 오고, 1건이면 list 가 아니라 dict 로 올 수 있다
    raw = items.get("item", []) if isinstance(items, dict) else []
    if isinstance(raw, dict):
        raw = [raw]
    return {"total": _to_int(body.get("totalCount")) or len(raw), "items": raw}


# ──────────────────────────────────────────────────────────────
# 2. 요청 함수 4개
# ──────────────────────────────────────────────────────────────
def area_based_list(sido: str = None, sigungu: str = None, content_type_id: int = None,
                    page: int = 1, size: int = 10, arrange: str = "C") -> dict:
    """지역기반 관광정보조회 (/areaBasedList2)

    sido            법정동 시/도 코드 2자리 문자열 (예: "41" 경기도). 없으면 전국
    sigungu         법정동 시/군/구 코드 3자리 문자열 (예: "110"). sido 와 같이 써야 의미가 있음
    content_type_id 관광 타입 (CONTENT_TYPES 참고, 예: 12 관광지, 39 음식점). 없으면 전체
    arrange         정렬. A=제목순, C=수정일순, D=생성일순 (O/Q/R 은 이미지 있는 것만)
    """
    result = _call("areaBasedList2", {
        "numOfRows": size, "pageNo": page, "arrange": arrange,
        "contentTypeId": content_type_id,
        "lDongRegnCd": sido, "lDongSignguCd": sigungu,
    })
    return _page(result, page, size, _to_place)


def location_based_list(lng: float, lat: float, radius: int = 5000, content_type_id: int = None,
                        page: int = 1, size: int = 10, arrange: str = "E") -> dict:
    """위치기반 관광정보조회 (/locationBasedList2)

    lng, lat        경도(mapX), 위도(mapY) — WGS84. 카카오 API 좌표를 그대로 넣으면 됨
                    (카카오 응답의 x = 경도, y = 위도)
    radius          반경 (m). 최대 20000 (20km)
    content_type_id 관광 타입 (예: 39 음식점만 보고 싶으면 39)
    arrange         E=거리순 (기본). A=제목순, C=수정일순, D=생성일순
    결과 item 의 distance 에 기준점으로부터 거리(m)가 들어간다
    """
    if lng is None or lat is None:
        raise ValueError("lng(경도), lat(위도)는 꼭 넣어야 합니다.")
    radius = max(1, min(int(radius), MAX_RADIUS))
    result = _call("locationBasedList2", {
        "numOfRows": size, "pageNo": page, "arrange": arrange,
        "contentTypeId": content_type_id,
        "mapX": str(lng), "mapY": str(lat), "radius": str(radius),
    })
    return _page(result, page, size, _to_place)


def search_keyword(keyword: str, sido: str = None, sigungu: str = None, content_type_id: int = None,
                   page: int = 1, size: int = 10, arrange: str = "C") -> dict:
    """키워드 검색 조회 (/searchKeyword2)

    keyword  검색어 (예: "불꽃축제"). 한글 그대로 넣으면 됨
    sido, sigungu, content_type_id 는 area_based_list 와 같음 (없어도 됨)
    """
    if not keyword or not keyword.strip():
        raise ValueError("keyword(검색어)는 꼭 넣어야 합니다.")
    result = _call("searchKeyword2", {
        "numOfRows": size, "pageNo": page, "arrange": arrange,
        "keyword": keyword.strip(),
        "contentTypeId": content_type_id,
        "lDongRegnCd": sido, "lDongSignguCd": sigungu,
    })
    return _page(result, page, size, _to_place)


def search_festival(start_date: str, end_date: str = None, sido: str = None, sigungu: str = None,
                    page: int = 1, size: int = 10, arrange: str = "A") -> dict:
    """행사정보조회 (/searchFestival2)

    start_date  행사 시작일 (필수). "20261101" 또는 "2026-11-01" 둘 다 가능
    end_date    행사 종료일 (없어도 됨)
    sido, sigungu 는 area_based_list 와 같음
    items 는 프론트 Festival 형식으로 돌려준다
    """
    start = _to_api_date(start_date)
    if not start:
        raise ValueError("start_date 는 YYYYMMDD 또는 YYYY-MM-DD 형식으로 꼭 넣어야 합니다.")
    end = _to_api_date(end_date) if end_date else None
    result = _call("searchFestival2", {
        "numOfRows": size, "pageNo": page, "arrange": arrange,
        "eventStartDate": start, "eventEndDate": end,
        "lDongRegnCd": sido, "lDongSignguCd": sigungu,
    })
    return _page(result, page, size, _to_festival)


# ──────────────────────────────────────────────────────────────
# 3. 축제 상세 (프론트 D110 화면용)
# ──────────────────────────────────────────────────────────────
def get_festival_detail(content_id: str) -> dict | None:
    """축제 하나의 상세 정보. 없는 축제면 None (→ 백엔드에서 404 로 돌려주면 됨)

    detailCommon2(주소·전화·홈페이지·소개)와 detailIntro2(주최·요금·장소·시간)를 합친다.
    호출이 2번 들어가므로 개발 키 하루 호출 제한에 주의.
    """
    common = _call("detailCommon2", {"contentId": content_id})["items"]
    if not common:
        return None
    c = common[0]
    intro_items = _call("detailIntro2", {"contentId": content_id, "contentTypeId": FESTIVAL_TYPE_ID})["items"]
    i = intro_items[0] if intro_items else {}

    detail = _to_festival({**c, **_pick(i, "eventstartdate", "eventenddate")})
    sponsors = [s for s in (_clean(i.get("sponsor1")), _clean(i.get("sponsor2"))) if s]
    detail.update({
        "address": _join(c.get("addr1"), c.get("addr2")),
        "tel": _clean(c.get("tel")) or _clean(i.get("sponsor1tel")),
        "sponsor": " / ".join(dict.fromkeys(sponsors)) or None,
        "fee": _clean(i.get("usetimefestival")),
        "homepage": _extract_url(c.get("homepage")) or _extract_url(i.get("eventhomepage")),
        "overview": _clean(c.get("overview")),
        "place": _clean(i.get("eventplace")),
        "playtime": _clean(i.get("playtime")),
    })
    return detail


# ──────────────────────────────────────────────────────────────
# 4. 가공 (원본 item → 사용하기 쉬운 dict)
# ──────────────────────────────────────────────────────────────
def _page(result: dict, page: int, size: int, convert) -> dict:
    return {
        "total": result["total"],
        "page": page,
        "size": size,
        "items": [convert(item) for item in result["items"]],
    }


def _base(item: dict) -> dict:
    sido_code = _clean(item.get("lDongRegnCd"))
    sigungu_code = _clean(item.get("lDongSignguCd"))
    sido, sigungu = _region_names(sido_code, sigungu_code, item.get("addr1"))
    return {
        "id": _clean(item.get("contentid")),
        "title": _clean(item.get("title")),
        "sidoCode": sido_code,
        "sido": sido,
        "sigunguCode": sigungu_code,
        "sigungu": sigungu,
        "category": _clean(item.get("lclsSystm3")),  # TourAPI 분류체계 코드 (예: EV010400)
        "image": _https(_clean(item.get("firstimage")) or _clean(item.get("firstimage2"))),
        "lat": _to_coord(item.get("mapy")),  # mapy = 위도
        "lng": _to_coord(item.get("mapx")),  # mapx = 경도
    }


def _to_festival(item: dict) -> dict:
    b = _base(item)
    start = _from_api_date(item.get("eventstartdate"))
    return {
        "id": b["id"],
        "title": b["title"],
        "startDate": start,
        "endDate": _from_api_date(item.get("eventenddate")) or start,
        "sidoCode": b["sidoCode"],
        "sido": b["sido"],
        "sigunguCode": b["sigunguCode"],
        "sigungu": b["sigungu"],
        "category": b["category"],
        "image": b["image"],
        "lat": b["lat"],
        "lng": b["lng"],
    }


def _to_place(item: dict) -> dict:
    b = _base(item)
    dist = item.get("dist")
    return {
        "id": b["id"],
        "contentTypeId": _to_int(item.get("contenttypeid")),
        "title": b["title"],
        "address": _join(item.get("addr1"), item.get("addr2")),
        "tel": _clean(item.get("tel")),
        "image": b["image"],
        "lat": b["lat"],
        "lng": b["lng"],
        "sidoCode": b["sidoCode"],
        "sido": b["sido"],
        "sigunguCode": b["sigunguCode"],
        "sigungu": b["sigungu"],
        "category": b["category"],
        "distance": round(float(dist)) if _is_number(dist) else None,  # m, 위치기반 조회에서만
    }


# ── 지역 이름 (법정동 코드 → 이름) ──────────────────────────────
# 프론트의 frontend/public/data/regions.json 이 있으면 그걸 쓰고, 없으면 아래 표 + 주소로 보완
_SIDO_NAMES = {
    "11": "서울특별시", "12": "전남광주통합특별시", "26": "부산광역시", "27": "대구광역시",
    "28": "인천광역시", "29": "광주광역시", "30": "대전광역시", "31": "울산광역시",
    "36110": "세종특별자치시", "41": "경기도", "42": "강원특별자치도", "43": "충청북도",
    "44": "충청남도", "45": "전북특별자치도", "46": "전라남도", "47": "경상북도",
    "48": "경상남도", "50": "제주특별자치도", "51": "강원특별자치도", "52": "전북특별자치도",
}
_REGIONS_JSON = Path(__file__).resolve().parent / "frontend" / "public" / "data" / "regions.json"
_regions_cache = None


def _regions() -> dict:
    """{시도코드: (시도이름, {시군구코드: 시군구이름})}"""
    global _regions_cache
    if _regions_cache is None:
        _regions_cache = {}
        try:
            for r in json.loads(_REGIONS_JSON.read_text(encoding="utf-8")):
                _regions_cache[r["code"]] = (r["name"], {s["code"]: s["name"] for s in r.get("sigungu", [])})
        except (OSError, ValueError, KeyError):
            logger.info("regions.json 을 못 읽어서 기본 시도 표와 주소로 지역 이름을 채웁니다.")
    return _regions_cache


def _region_names(sido_code, sigungu_code, addr1) -> tuple:
    sido, sigungu = None, None
    if sido_code:
        entry = _regions().get(sido_code)
        if entry:
            sido = entry[0]
            sigungu = entry[1].get(sigungu_code) if sigungu_code else None
        else:
            sido = _SIDO_NAMES.get(sido_code)
    # 이름을 못 찾았으면 주소 앞부분에서 보완 ("충청남도 논산시 강경읍 ..." → 충청남도 / 논산시)
    parts = (_clean(addr1) or "").split()
    if not sido and parts:
        sido = parts[0]
    if not sigungu and sigungu_code and len(parts) > 1:
        sigungu = parts[1]
    return sido, sigungu


# ── 작은 도우미 함수들 ───────────────────────────────────────────
def _clean(value) -> str | None:
    """HTML 태그·엔티티를 지우고 앞뒤 공백 정리. 비어 있으면 None"""
    if value is None:
        return None
    text = str(value)
    text = re.sub(r"<br\s*/?>", "\n", text, flags=re.I)
    text = re.sub(r"<[^>]+>", "", text)
    text = unescape(text).replace("\xa0", " ")
    lines = [re.sub(r"[ \t]+", " ", line).strip() for line in text.splitlines()]
    text = "\n".join(line for line in lines if line).strip()
    return text or None


def _extract_url(html) -> str | None:
    """homepage 는 '<a href="http://...">...</a>' 형태로 온다 → 주소만 꺼냄"""
    if not html:
        return None
    m = re.search(r'href\s*=\s*["\']([^"\']+)["\']', str(html), flags=re.I)
    url = m.group(1) if m else None
    if not url:
        m = re.search(r"(https?://[^\s\"'<>]+|www\.[^\s\"'<>]+)", _clean(html) or "")
        url = m.group(1) if m else None
    if not url:
        return None
    url = url.strip()
    return url if url.lower().startswith("http") else f"https://{url}"


def _https(url) -> str | None:
    """이미지 주소가 http:// 로 오면 https:// 로 (https 서버에서 http 이미지는 막히기 때문)"""
    if url and url.startswith("http://"):
        return "https://" + url[len("http://"):]
    return url


def _join(*parts) -> str | None:
    text = " ".join(p for p in (_clean(x) for x in parts) if p)
    return text or None


def _pick(d: dict, *keys) -> dict:
    return {k: d[k] for k in keys if d.get(k)}


def _is_number(value) -> bool:
    try:
        float(value)
        return True
    except (TypeError, ValueError):
        return False


def _to_int(value) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _to_coord(value) -> float | None:
    """좌표 문자열 → 숫자. 없거나 0 이면 None"""
    if not _is_number(value):
        return None
    n = float(value)
    return n if n != 0 else None


def _to_api_date(value) -> str | None:
    """'2026-11-01' / '20261101' → '20261101'"""
    if not value:
        return None
    digits = re.sub(r"\D", "", str(value))
    try:
        datetime.strptime(digits, "%Y%m%d")
    except ValueError:
        return None
    return digits


def _from_api_date(value) -> str | None:
    """'20261101' → '2026-11-01'"""
    digits = _to_api_date(value)
    return f"{digits[:4]}-{digits[4:6]}-{digits[6:]}" if digits else None

"""코스 만들기 (UI 설계서 CM10-7)"""
import logging
import math
import re
from concurrent.futures import ThreadPoolExecutor
from datetime import date

from chroma import search_festival_data
from kakao_api import get_route, search_place
from tour_api import CONTENT_TYPES, _call, _clean, location_based_list, search_keyword

logger = logging.getLogger(__name__)

SEARCH_RADIUS = 10000  # 중심에서 몇 m 안의 장소를 찾을지 (최대 20000)
# 코스에 넣는 장소 종류 → TourAPI 관광 타입 (축제는 나중에 chroma DB 에서)
PLACE_TYPES = {'attraction': CONTENT_TYPES['관광지'], 'food': CONTENT_TYPES['음식점']}
# 코스에 넣지 않을 분류 (TourAPI lclsSystm3 코드). 이상한 장소가 또 보이면 여기에 추가
EXCLUDED_CATEGORIES = {
    'VE120300',  # 기타문화시설 (복지관, 노인회, 문화센터)
    'VE010100',  # 랜드마크 > 건물 (해변 화장실 등)
    'VE010600',  # 랜드마크 > 터널
    'EX050100',  # 온천 / 사우나 / 스파
    'VE050200',  # 리조트 (수영장 등)
    'HS030200',  # 종교성지 > 기독교 (동네 교회)
    'HS030400',  # 종교성지 > 기타 (성당 등)
}

STAY_MIN = {'festival': 90, 'attraction': 60, 'food': 60}   # 장소별 머무는 시간(분), 프론트 목업과 같음
TIME_LIMIT = {'half': 240, 'day': 480}      # 체류 + 이동 합계 (반나절 4시간, 하루 8시간)
# 첫 관광지 다음에 이어 붙일 순서
NEXT_ORDER = {'half': ['food', 'attraction'], 'day': ['attraction', 'food', 'attraction', 'food']}
NEXT_MAX_KM = 10  # 다음 장소는 이 거리 안에서만 고름
MIN_GAP_KM = 1    # 관광지끼리는 1km 이상 떨어진 곳 (같은 곳 안의 시설이 연달아 뽑히지 않게)
START_MAX_KM = 2  # 이름으로 찾은 출발점이 카카오 위치에서 이 거리 안이어야 같은 곳으로 인정

# 취향(preference)에 이 단어가 있으면 → 먼저 고를 관광지 분류 (lclsSystm3 코드 앞부분)
PREFERENCE_CATEGORIES = {
    '바다': ('NA02',), '해변': ('NA02',), '호수': ('NA02',),     # 자연경관(하천·해양)
    '산': ('NA01',), '등산': ('NA01',),                          # 자연경관(산)
    '자연': ('NA',), '숲': ('NA',),
    '공원': ('VE03', 'NA04'),                                     # 도시공원, 자연공원
    '산책': ('VE03', 'VE04', 'NA04'), '걷기': ('VE03', 'VE04', 'NA04'),  # 공원, 문화거리
    '역사': ('HS01', 'HS02'), '유적': ('HS01', 'HS02'), '문화재': ('HS01', 'HS02'),
    '절': ('HS0301',), '사찰': ('HS0301',),                      # 종교성지 > 불교
    '체험': ('EX',),
}
ROAD_FACTOR = 1.35  # 직선거리 → 실제 도로 거리 어림 (프론트 목업과 같음)
CAR_KMH = 35        # 어림할 때 차 속도 (시속, km)

DURATION_NAMES = {'half': '반나절', 'day': '하루'}
NEARBY_KM = 8    # 코스에 안 들어간 주변 장소(지도 회색 점)를 출발점에서 몇 km 까지 보여 줄지
NEARBY_MAX = 30
FESTIVAL_SEARCH_ROWS = 300  # 축제 DB 가 300개 정도라 반경 안의 축제를 한 번에 다 받음
# detailIntro2 에서 운영시간이 들어 있는 항목 (프론트 chat.js 설명과 같음)
HOURS_FIELDS = {'attraction': 'usetime', 'food': 'opentimefood'}

def visit_date_of(conditions:dict) -> tuple[str, bool]:
    """방문 날짜와, 날짜를 말하지 않아서 오늘로 정했는지 여부

    프론트 Course 의 baseDate, baseDateDefault 에 그대로 들어감
    예: {"date": "2026-11-03"} → ("2026-11-03", False)
        {"date": None}         → ("2026-10-22", True)  (오늘)
    """
    if conditions['date'] and conditions['date'] != date.today().isoformat():
        return conditions['date'], False
    return date.today().isoformat(), True

def region_center(region:str) -> dict | None:
    """지역 이름("강릉")을 좌표로 바꿈. 못 찾거나 호출이 실패하면 None

    돌려주는 값 예: {"name": "강릉역", "lat": 37.76, "lng": 128.89}
    """
    try:
        items = search_place(region, size=1)['items']
    except Exception:  # 키 오류, 시간 초과 등
        logger.exception('지역 좌표 찾기 실패: %s', region)
        return None
    if not items:
        return None
    return {'name': items[0]['name'], 'lat': items[0]['lat'], 'lng': items[0]['lng']}

def nearby_places(center:dict, size:int=50) -> list[dict] | None:
    """중심 좌표 주변의 관광지 · 음식점 (가까운 순). 호출이 실패하면 None

    돌려주는 값 예: [{"id": "126508", "type": "attraction", "title": "경포해변",
                      "lat": 37.80, "lng": 128.90, "address": ..., "image": ..., "distance": 1200}, ...]
    """
    places = []
    for place_type, content_type_id in PLACE_TYPES.items():
        try:
            result = location_based_list(lng=center['lng'], lat=center['lat'], radius=SEARCH_RADIUS,
                                         content_type_id=content_type_id, size=size)
        except Exception:  # 키 오류, 하루 호출 수 초과, 시간 초과 등
            logger.exception('주변 장소 가져오기 실패: %s', place_type)
            return None
        # 좌표가 없는 장소(지도에 못 그림)와 코스에 안 맞는 분류는 뺌
        places += [{**p, 'type': place_type} for p in result['items']
                   if p['lat'] is not None and p['lng'] is not None
                   and p['category'] not in EXCLUDED_CATEGORIES]
    return places

def same_name(title:str, name:str) -> bool:
    """이름이 같거나 그 이름으로 끝나면 True (띄어쓰기 무시)

    예: ('서산 해미읍성', '해미읍성') → True, ('한복남 전주한옥마을점', '전주한옥마을') → False
    """
    title, name = title.replace(' ', ''), name.replace(' ', '')
    return title == name or title.endswith(name)

def start_place(center:dict) -> dict | None:
    """카카오가 찾은 대표 관광지(예: 해미읍성)를 TourAPI 에서 다시 찾아 출발점으로. 못 찾으면 None"""
    try:
        items = search_keyword(center['name'], content_type_id=PLACE_TYPES['attraction'], size=5)['items']
    except Exception:  # 실패해도 가까운 관광지로 출발하면 되니까 코스는 계속 만듦
        logger.exception('출발점 찾기 실패: %s', center['name'])
        return None
    for p in items:
        if (p['title'] and p['lat'] is not None and p['lng'] is not None
                and same_name(p['title'], center['name']) and distance_km(center, p) < START_MAX_KM):
            return {**p, 'type': 'attraction'}
    return None

def festivals_near(center:dict, visit_date:str) -> list[dict]:
    """방문일에 열리는 근처 축제 (가까운 순). 없거나 실패하면 []

    축제는 하루 한 번 받아 둔 chroma DB 에서 찾음 (TourAPI 호출 없음)
    """
    day = visit_date.replace('-', '')  # chroma 는 날짜가 'YYYYMMDD'
    try:
        # 종료일 >= 방문일, 시작일 <= 방문일 → 방문일에 열리는 축제
        result = search_festival_data(numOfRows=FESTIVAL_SEARCH_ROWS, mapx=str(center['lng']),
                                      mapy=str(center['lat']), radius=str(SEARCH_RADIUS),
                                      searchstartdate=day, searchenddate=day, arrange='dist')
    except Exception:  # DB 가 없거나 오류여도 축제만 빼고 코스는 만듦
        logger.exception('축제 찾기 실패')
        return []
    # 응답에 상세 주소가 없어서 시도 + 시군구로 씀
    return [{'id': i['id'], 'type': 'festival', 'title': i['title'],
             'address': ' '.join(filter(None, (i.get('sido'), i.get('sigungu')))) or None,
             'image': i['image'] or None,
             'lat': i['lat'], 'lng': i['lng'], 'category': i['category']}
            for i in result['items']]

def distance_km(a:dict, b:dict) -> float:
    """두 장소의 직선거리 (km)"""
    lat1, lng1, lat2, lng2 = map(math.radians, (a['lat'], a['lng'], b['lat'], b['lng']))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lng2 - lng1) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))

def estimate_km(a:dict, b:dict) -> float:
    """차로 가는 거리 어림 (직선거리 × 1.35)"""
    return distance_km(a, b) * ROAD_FACTOR

def estimate_minutes(a:dict, b:dict) -> int:
    """차로 걸리는 시간 어림 (시속 35km). 길찾기 전에 시간 맞추기용"""
    return max(3, round(estimate_km(a, b) / CAR_KMH * 60))

def course_minutes(chosen:list[dict]) -> int:
    """체류 시간 + 이동 시간(어림)"""
    stay = sum(STAY_MIN[p['type']] for p in chosen)
    move = sum(estimate_minutes(a, b) for a, b in zip(chosen, chosen[1:]))
    return stay + move

def nearest(places:list[dict], current:dict, place_type:str, chosen:list[dict],
            preferred:tuple[str, ...] = ()) -> dict | None:
    """current 에서 가장 가까운 place_type 장소 (이미 고른 곳 제외). 없으면 None

    preferred(취향 분류)에 맞는 곳이 거리 안에 있으면 그곳을 먼저 고름
    """
    if preferred:
        liked = [p for p in places if (p['category'] or '').startswith(preferred)]
        found = nearest(liked, current, place_type, chosen)
        if found is not None:
            return found
    chosen_ids = {c['id'] for c in chosen}
    best, best_km = None, NEXT_MAX_KM
    for p in places:
        if p['type'] != place_type or p['id'] in chosen_ids:
            continue
        if place_type == 'attraction' and any(
                distance_km(p, c) < MIN_GAP_KM for c in chosen if c['type'] == 'attraction'):
            continue
        km = distance_km(current, p)
        if km < best_km:
            best, best_km = p, km
    return best

def preference_categories(preference:str | None) -> tuple[str, ...]:
    """취향 글에서 먼저 고를 분류를 찾음. 예: '바다' → ('NA02',), '맛집' → ()

    한 글자 단어('산', '절')는 '산책', '부산' 에 걸리지 않게 따로 떨어진 단어일 때만 인정
    """
    if not preference:
        return ()
    words = re.split(r'[\s,·/]+', preference)
    found = []
    for word, prefixes in PREFERENCE_CATEGORIES.items():
        if (word in words) if len(word) == 1 else (word in preference):
            found += [p for p in prefixes if p not in found]
    return tuple(found)

def pick_places(places:list[dict], duration:str, start:dict | None = None,
                preferred:tuple[str, ...] = ()) -> list[dict]:
    """start(없으면 가장 가까운 관광지)에서 출발해 순서대로 가까운 곳을 이어 붙임. 출발할 곳이 없으면 []"""
    if start is None:
        attractions = [p for p in places if p['type'] == 'attraction']
        if not attractions:
            return []
        # 취향에 맞는 관광지가 있으면 그중 가장 가까운 곳에서 출발 (nearby_places 가 가까운 순)
        liked = [p for p in attractions if (p['category'] or '').startswith(preferred)] if preferred else []
        start = (liked or attractions)[0]
    chosen = [start]
    for place_type in NEXT_ORDER[duration]:
        # 취향은 관광지에만 적용 (음식점은 가까운 곳)
        nxt = nearest(places, chosen[-1], place_type, chosen, preferred if place_type == 'attraction' else ())
        if nxt is None:  # 근처에 없으면 (예: 음식점이 적은 지역) 건너뜀
            continue
        if course_minutes(chosen + [nxt]) > TIME_LIMIT[duration]:
            break
        chosen.append(nxt)
    return chosen

def place_hours(place:dict) -> str | None:
    """코스 장소 하나의 운영시간 (TourAPI 원본 글, 태그만 지움). 축제이거나 없거나 실패하면 None"""
    field = HOURS_FIELDS.get(place['type'])
    if field is None:  # 축제는 목록에 기간이 있어서 안 부름
        return None
    try:
        items = _call('detailIntro2', {'contentId': place['id'],
                                       'contentTypeId': PLACE_TYPES[place['type']]})['items']
    except Exception:  # 운영시간을 못 받아도 코스는 그대로 보여 줌
        logger.exception('운영시간 가져오기 실패: %s', place['title'])
        return None
    return _clean(items[0].get(field)) if items else None

def route_legs(chosen:list[dict]) -> list[dict] | None:
    """장소 사이 자동차 이동 (카카오 길찾기, 코스 전체를 한 번에). 실패하면 None

    돌려주는 값 (프론트 Course.legs 형식): [{"minutes": 5, "km": 1.8, "estimated": False}, ...]
    """
    if len(chosen) < 2:
        return []
    try:
        route = get_route(chosen)  # lat, lng, title 이 있는 dict 를 그대로 넣으면 됨
    except Exception:  # 키 오류, 경로 없음, 시간 초과 등
        logger.exception('길찾기 실패')
        return None
    if len(route['legs']) != len(chosen) - 1:  # 구간 수가 안 맞으면 믿을 수 없어서 실패로 봄
        return None
    return [{'minutes': max(1, round(leg['duration'] / 60)),
             'km': round(leg['distance'] / 1000, 1),
             'estimated': False} for leg in route['legs']]

def total_minutes(chosen:list[dict], legs:list[dict]) -> int:
    """체류 시간 + 이동 시간 (legs 기준)"""
    return sum(STAY_MIN[p['type']] for p in chosen) + sum(leg['minutes'] for leg in legs)

def fit_time_limit(chosen:list[dict], legs:list[dict], duration:str) -> tuple[list[dict], list[dict]]:
    """실제 이동 시간으로 다시 재서 시간을 넘으면 마지막 장소부터 뺌"""
    while len(chosen) > 1 and total_minutes(chosen, legs) > TIME_LIMIT[duration]:
        chosen, legs = chosen[:-1], legs[:-1]
    return chosen, legs

def estimated_legs(chosen:list[dict]) -> list[dict]:
    """길찾기가 실패했을 때 어림한 이동 (프론트에 "추정"으로 표시됨)"""
    return [{'minutes': estimate_minutes(a, b),
             'km': round(estimate_km(a, b), 1),
             'estimated': True} for a, b in zip(chosen, chosen[1:])]

def with_josa(word:str) -> str:
    """'부모님' → '부모님과', '친구' → '친구와' (받침이 있으면 과, 없으면 와)"""
    last = word[-1]
    if '가' <= last <= '힣' and (ord(last) - ord('가')) % 28:
        return word + '과'
    return word + '와'

def course_title(conditions:dict) -> str:
    """예: '부모님과 서산 반나절', '강릉 하루'"""
    who = with_josa(conditions['companion']) + ' ' if conditions['companion'] else ''
    return f"{who}{conditions['region']} {DURATION_NAMES[conditions['duration']]}"

def place_reason(i:int, chosen:list[dict], legs:list[dict], base_date_default:bool) -> str:
    """장소마다 붙는 한 줄 설명 (축제 문구는 프론트 목업과 같음)"""
    if chosen[i]['type'] == 'festival':
        return '지금 열리고 있는 축제예요' if base_date_default else '방문일에 열리는 축제예요'
    if i == 0:
        return '코스를 시작하는 곳이에요'
    return f"{chosen[i - 1]['title']}에서 차로 {legs[i - 1]['minutes']}분"

def build_course(conditions:dict) -> tuple[dict | None, str | None]:
    """조건으로 코스를 만듦 (프론트 chat.js 의 Course 형식)

    돌려주는 값: (코스, None), 실패하면 (None, 이유)
      'no_region' 지역을 못 찾음 / 'api' 장소 가져오기 실패 / 'no_places' 코스로 묶을 장소가 없음
    """
    base_date, base_date_default = visit_date_of(conditions)            # ①
    center = region_center(conditions['region'])                        # ②
    if center is None:
        return None, 'no_region'
    places = nearby_places(center)                                      # ③
    if places is None:
        return None, 'api'
    duration = conditions['duration']
    preferred = preference_categories(conditions['preference'])
    festivals = festivals_near(center, base_date)
    # 출발점: 방문일에 열리는 가장 가까운 축제 → 대표 관광지(1-a) → 가장 가까운 관광지
    start = festivals[0] if festivals else start_place(center)
    chosen = pick_places(places, duration, start, preferred)                  # ④
    if not chosen:
        return None, 'no_places'
    legs = route_legs(chosen) or estimated_legs(chosen)                 # ⑤ 실패하면 ⑥
    chosen, legs = fit_time_limit(chosen, legs, duration)               # ⑤
    # 운영시간은 장소마다 따로 불러야 해서 동시에 부름 (하나가 느려도 전체가 30초 이상 걸리지 않게)
    with ThreadPoolExecutor() as pool:
        hours = list(pool.map(place_hours, chosen))

    chosen_ids = {p['id'] for p in chosen}
    nearby = [{'id': p['id'], 'type': p['type'], 'title': p['title'], 'lat': p['lat'], 'lng': p['lng']}
              for p in festivals + places
              if p['id'] not in chosen_ids and distance_km(chosen[0], p) < NEARBY_KM]
    return {
        'title': course_title(conditions),
        'duration': duration,
        'baseDate': base_date,
        'baseDateDefault': base_date_default,
        'region': conditions['region'],
        'totalKm': round(sum(leg['km'] for leg in legs), 1),
        'moveMin': sum(leg['minutes'] for leg in legs),
        'totalMin': total_minutes(chosen, legs),
        'estimated': any(leg['estimated'] for leg in legs),
        'places': [{'id': p['id'], 'type': p['type'], 'title': p['title'], 'address': p['address'],
                    'image': p['image'], 'lat': p['lat'], 'lng': p['lng'],
                    'stayMin': STAY_MIN[p['type']], 'hours': hours[i],
                    'reason': place_reason(i, chosen, legs, base_date_default),
                    # 축제는 상세 화면(D110)으로 갈 수 있게 축제 id 를 붙임
                    **({'festivalId': p['id']} if p['type'] == 'festival' else {})}
                   for i, p in enumerate(chosen)],
        'legs': legs,
        'nearby': nearby[:NEARBY_MAX],
    }, None

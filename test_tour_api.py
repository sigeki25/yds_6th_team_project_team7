"""tour_api.py 실제 호출 테스트

저장소 루트에서 실행:
    python test_tour_api.py

함수마다 결과 개수와 첫 번째 항목을 출력한다. 전부 [성공] 이면 OK.
호출 횟수: 약 10번 (개발 키 하루 제한이 있으니 너무 자주 돌리지 말 것)
"""
import json
from datetime import date

import tour_api


def show(name, func):
    print(f"\n===== {name} =====")
    try:
        result = func()
    except Exception as e:  # 실패해도 다음 테스트는 계속
        print(f"[실패] {type(e).__name__}: {e}")
        return None
    if isinstance(result, dict) and "items" in result:
        print(f"[성공] 전체 {result['total']}건 중 {len(result['items'])}건 받음")
        first = result["items"][0] if result["items"] else None
    else:
        print("[성공]" if result else "[성공] 결과 없음")
        first = result
    print(json.dumps(first, ensure_ascii=False, indent=2))
    return result


today = date.today().strftime("%Y%m%d")

# 1. 지역기반: 경기도(41) 관광지(12)
attractions = show("areaBasedList2 - 경기도 관광지",
                   lambda: tour_api.area_based_list(sido="41", content_type_id=12, size=3))

# 2. 위치기반: 서울시청 근처 2km 음식점(39)
foods = show("locationBasedList2 - 서울시청 2km 음식점",
             lambda: tour_api.location_based_list(lng=126.9780, lat=37.5665, radius=2000, content_type_id=39, size=3))

# 3. 키워드 검색
show("searchKeyword2 - '불꽃축제'",
     lambda: tour_api.search_keyword("불꽃축제", size=3))

# 4. 행사: 오늘 이후 서울(11) 축제
festivals = show("searchFestival2 - 오늘 이후 서울 축제",
                 lambda: tour_api.search_festival(start_date=today, sido="11", size=3))

# 5. 상세: 4번에서 받은 첫 축제
if festivals and festivals["items"]:
    fid = festivals["items"][0]["id"]
    show(f"detailCommon2 + detailIntro2 - 축제 {fid} 상세",
         lambda: tour_api.get_festival_detail(fid))

# 6. 소개정보(시간 · 쉬는 날): 축제 · 관광지 · 음식점 각각 하나씩
for label, result in (("축제", festivals), ("관광지", attractions), ("음식점", foods)):
    if result and result["items"]:
        first = result["items"][0]
        # 축제 목록에는 contentTypeId 가 없어서 15 로 지정
        type_id = first.get("contentTypeId") or tour_api.FESTIVAL_TYPE_ID
        def intro_summary():
            intro = tour_api.get_intro(first["id"], type_id)
            # details 는 길어서 빼고 출력
            return {k: v for k, v in intro.items() if k != "details"} if intro else None
        show(f"detailIntro2 - {label} {first['id']} 시간 · 쉬는 날", intro_summary)

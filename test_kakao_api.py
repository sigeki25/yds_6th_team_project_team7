"""kakao_api.py 실제 호출 테스트

저장소 루트에서 실행:
    python test_kakao_api.py

테스트마다 결과를 출력한다. 전부 [성공] 이면 OK.
호출 횟수: 약 4번
"""
import json

import kakao_api


def show(name, func):
    print(f"\n===== {name} =====")
    try:
        result = func()
    except Exception as e:  # 실패해도 다음 테스트는 계속
        print(f"[실패] {type(e).__name__}: {e}")
        return None
    print("[성공]")
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return result


# TourAPI 원본 형식 그대로 (mapx = 경도, mapy = 위도, 값이 문자열)
garak = {"title": "가락 옥토버페스트", "mapx": "127.1107532009", "mapy": "37.4960246566"}
ganggyeong = {"title": "강경 국가유산야행", "mapx": "127.0173957", "mapy": "36.1615935"}
# tour_api.py 결과 형식 (lng, lat 숫자)
city_hall = {"title": "서울시청", "lng": 126.9779692, "lat": 37.566535}

# 1. 장소 이름 → 좌표
show("search_place - '서울시청'",
     lambda: kakao_api.search_place("서울시청", size=2))

# 2. 두 곳 사이 소요시간 (TourAPI mapx, mapy 그대로)
show("get_route - 가락 옥토버페스트 → 강경 국가유산야행",
     lambda: kakao_api.get_route([garak, ganggyeong]))

# 3. 세 곳 순서대로 (구간별 시간 legs 확인)
show("get_route - 서울시청 → 가락 옥토버페스트 → 강경 국가유산야행",
     lambda: kakao_api.get_route([city_hall, garak, ganggyeong]))

# 4. 지도용 경로 좌표 (개수만 출력)
def path_count():
    r = kakao_api.get_route([city_hall, garak], include_path=True)
    return {"durationText": r["durationText"], "path 좌표 개수": len(r["path"]), "첫 좌표": r["path"][0]}

show("get_route - 경로 좌표(path)", path_count)

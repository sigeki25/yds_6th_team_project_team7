import logging
from typing import Dict, Any

from fastapi import FastAPI, Depends, Request

from chroma import FilterSearchFestivalData, search_festival_data, FilterSearchFestivalOriginalData, \
    convert_FilterSearchFestival_to_original
from tour_api import search_keyword, location_based_list, area_based_list, search_festival, get_festival_detail

from view_routes import router as view_router

from chat_api import router as chat_router

app = FastAPI()
# app.mount("/view", StaticFiles(directory="view", check_dir=False))  # view 는 frontend 빌드 결과
app.include_router(view_router)

# logger 설정
logging.basicConfig(
    level=logging.INFO,
    format='%(levelname)s:     [%(name)s] %(message)s - %(asctime)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

@app.get("/")
def main():
    pass
    # return RedirectResponse("/view/index.html")


@app.get("/api/festivals")
def festivals(params: FilterSearchFestivalData = Depends()):
    result = search_festival_data(**convert_FilterSearchFestival_to_original(params))
    return result

# 행사 상세정보조회
@app.get("/api/festivals/{id}")
def festivals(id: str):
    result = get_festival_detail(content_id=id)
    return result

# @app.get("/api/old/festivals")
# def festivals(params: FilterSearchFestivalOriginalData = Depends()):
#     result = search_festival_data(**params.model_dump())
#     return result

# 지역기반 관광정보조회
@app.get("/api/areaBasedList")
def area_based_list_(request: Request):
    params = dict(request.query_params)
    result = area_based_list(**params)
    return result

# 위치기반 관광정보조회
@app.get("/api/locationBasedList")
def location_based_list_(lng: float, lat: float, request: Request):
    params = dict(request.query_params)
    result = location_based_list(**params)
    return result

# 키워드 검색 조회
@app.get("/api/searchKeyword")
def search_keyword_(keyword: str, request: Request):
    params = dict(request.query_params)
    result = search_keyword(**params)
    return result

# 행사정보조회
@app.get("/api/searchFestival")
def search_festival_(start_date: str, keyword: str, request: Request):
    params = dict(request.query_params)
    result = search_festival(**params)
    return result

# 행사정보조회
# @app.get("/api/detailFestival")
# def get_festival_detail_(content_id: str):
#     result = get_festival_detail(content_id)
#     return result

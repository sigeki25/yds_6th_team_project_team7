import json
from typing import Dict, Any

import chromadb
from chromadb.api.models import Collection
from haversine import haversine
from pydantic import BaseModel

from tour_api import _region_names

client = chromadb.PersistentClient(path="chroma_db")
collection_festival = client.get_or_create_collection(name="searchFestival")


# /old/festivals 원본 입력 변수들
class FilterSearchFestivalOriginalData(BaseModel):
    numOfRows: int = 10  # 한번에 조회할 수
    pageNo: int = 1  # 페이지 수
    contentid: str | None = None  # 조건 - id : 하나만 반환됨
    contenttypeid: str | None = None  # 조건 - 관광타입 ID
    searchstartdate: str | None = None  # 조건 - 시작 날짜 (YYYYMMDD)
    searchenddate: str | None = None  # 조건 - 종료 날짜 (YYYYMMDD)
    mapx: str | None = None  # 조건 - GPS X좌표(WGS84 경도좌표) : mapy와 같이 입력
    mapy: str | None = None  # 조건 - GPS Y좌표(WGS84 경도좌표) : mapx와 같이 입력
    radius: str | None = None  # 조건 - 거리 반경(단위: m) : mapx, mapy가 필수
    lDongRegnCd: str | None = None  # 조건 - 법정동 시도 코드
    lDongSignguCd: str | None = None  # 조건 - 법정동 시군구 코드
    lclsSystm1: str | None = None  # 조건 - 분류체계 대분류
    lclsSystm2: str | None = None  # 조건 - 분류체계 중분류
    lclsSystm3: str | None = None  # 조건 - 분류체계 소분류
    arrange: str | None = None  # 조건 - 정렬 조건 : Response 변수명으로 지정
    reverse: bool | None = None  # 조건 - 정렬 방식 : True면 내림차순, False나 없으면 오름차순


# /festivals 입력 변수들
class FilterSearchFestivalData(BaseModel):
    size: int = 10  # (numOfRows)한번에 조회할 수
    page: int = 1  # (pageNo)페이지 수
    id: str | None = None  # 조건(contentid) - id : 하나만 반환됨
    content_type_id: int | None = None  # 조건(contenttypeid) - 관광타입 ID
    startDate: str | None = None  # 조건(searchstartdate) - 시작 날짜 (YYYYMMDD)
    endDate: str | None = None  # 조건(searchenddate) - 종료 날짜 (YYYYMMDD)
    lng: float | None = None  # 조건(mapx) - GPS X좌표(WGS84 경도좌표) : mapy와 같이 입력
    lat: float | None = None  # 조건(mapy) - GPS Y좌표(WGS84 경도좌표) : mapx와 같이 입력
    radius: int | None = None  # 조건 - 거리 반경(단위: m) : mapx, mapy가 필수
    sido: str | None = None  # 조건(lDongRegnCd) - 법정동 시도 코드
    sigungu: str | None = None  # 조건(lDongSignguCd) - 법정동 시군구 코드
    category: str | None = None  # 조건(lclsSystm3) - 분류체계 소분류
    arrange: str | None = None  # 조건 - 정렬 조건 : Response 변수명으로 지정


def convert_FilterSearchFestival_to_original(model: FilterSearchFestivalData) -> Dict[Any, Any]:
    params = model.model_dump()
    new_params = {}
    new_params["numOfRows"] = params.get("size", 10)
    new_params["pageNo"] = params.get("page", 10)
    new_params["contentid"] = params.get("id")
    new_params["contenttypeid"] = str(v) if (v := params.get('content_type_id')) is not None else None
    # new_params["searchstartdate"] = params.get("startDate")
    new_params["searchstartdate"] = (v2 if len((v2 := str(v))) == 8 else f"{v2[:4]}{v2[5:7]}{v2[8:10]}") if (v := params.get("startDate")) is not None else None
    new_params["searchenddate"] = (v2 if len((v2 := str(v))) == 8 else f"{v2[:4]}{v2[5:7]}{v2[8:10]}") if (v := params.get("endDate")) is not None else None
    new_params["mapx"] = str(v) if (v := params.get('lng')) is not None else None
    new_params["mapy"] = str(v) if (v := params.get('lat')) is not None else None
    new_params["radius"] = str(v) if (v := params.get('radius')) is not None else None
    new_params["lDongRegnCd"] = params.get("sido", None)
    new_params["lDongSignguCd"] = params.get("sigungu", None)
    new_params["lclsSystm3"] = params.get("category", None)
    new_params["arrange"] = params.get("arrange", None)
    if new_params["arrange"] is not None:
        if len(new_params["arrange"]) == 1:
            if new_params["arrange"] == "A":  # 제목순
                new_params["arrange"] = "title"
            elif new_params["arrange"] == "C":  # 수정일순
                new_params["arrange"] = None  # 수정일 반환 없음
            elif new_params["arrange"] == "D":  # 생성일순
                new_params["arrange"] = None  # 생성일 반환 없음
            elif new_params["arrange"] == "E":  # 거리순
                new_params["arrange"] = "dist"
            elif new_params["arrange"] == "distance":  # 거리순
                new_params["arrange"] = "dist"
            elif new_params["arrange"] == "startDate":  # 거리순
                new_params["arrange"] = "eventstartdate"
            elif new_params["arrange"] == "endDate":  # 거리순
                new_params["arrange"] = "eventenddate"
    new_params["reverse"] = None
    return new_params


# Response(출력) 변수들
"""
{
    "header": {
        "resultCode": "0000",                           # 코드
        "resultMsg": "OK"                               # 성공
    },
    "body": {
        "items": {
            "item": [
                {
                    "addr1": "서울특별시 중구 정동",     # 주소1
                    "addr2": "(세종대로 19길 124)",      # 주소2
                    "zipcode": "04519",                 # 우편번호
                    "contentid": "142233",              # 콘텐츠 ID : ID 값
                    "contenttypeid": "15",              # 관광타입 ID
                    "title": "정동문화축제",              # 제목
                    "cpyrhtDivCd": "Type3",             # 저작권 유형
                    "lDongRegnCd": "11",                # 법정동 시도 코드
                    "lDongSignguCd": "140",             # 법정동 시군구 코드
                    "tel": "02-3701-1603",              # 전화번호
                    "firstimage": "https://tong.visitkorea.or.kr/cms/resource/49/4117049_image2_1.jpg",     # 대표이미지(원본)
                    "firstimage2": "https://tong.visitkorea.or.kr/cms/resource/49/4117049_image3_1.jpg",    # 대표이미지(썸네일)
                    "createdtime": "20070831090000",    # 등록일
                    "modifiedtime": "20261002102021",   # 콘텐츠 수정일
                    "eventstartdate": "20261016",       # 행사 시작일
                    "eventenddate": "20261017",         # 행사 종료일
                    "mapx": "126.9753470000",           # GPS X좌표(WGS84 경도좌표)
                    "mapy": "37.5670422000",            # GPS Y좌표(WGS84 경도좌표)
                    "mlevel": "6",                      # Map Level
                    "lclsSystm1": "EV",                 # 분류체계 대분류
                    "lclsSystm2": "EV01",               # 분류체계 중분류
                    "lclsSystm3": "EV010600",           # 분류체계 소분류
                    "dist": "794.3025769230144"         # GPS 좌표 거리(mapx, mapy를 요청해야 생성)
                },
                {
                ...
                }
            ]
        },
        "numOfRows": 10,                                # Response에서 받는 item의 개수
        "pageNo": pageNo,                               # Response의 페이지 번호
        "totalCount": len(datalist)                     # 조건으로 검색된 데이터의 총 개수
    }
}

"""


def insert_data():
    with open('./file/response_searchFestival2_296_261021.json', 'r', encoding='utf-8') as f:
        data = json.load(f)
        items = data["response"]["body"]["items"]["item"]
        # print(item)
        for item in items:
            collection_festival.add(
                documents=[item["title"]],
                metadatas=[{
                    "addr1": item["addr1"],
                    "addr2": item["addr2"],
                    "zipcode": item["zipcode"],
                    "contenttypeid": item["contenttypeid"],
                    "createdtime": int(item["createdtime"]),
                    "eventstartdate": int(item["eventstartdate"]),
                    "eventenddate": int(item["eventenddate"]),
                    "firstimage": item["firstimage"],
                    "firstimage2": item["firstimage2"],
                    "cpyrhtDivCd": item["cpyrhtDivCd"],
                    "mapx": item["mapx"],
                    "mapy": item["mapy"],
                    "mlevel": item["mlevel"],
                    "modifiedtime": int(item["modifiedtime"]),
                    "tel": item["tel"],
                    "lDongRegnCd": item["lDongRegnCd"],
                    "lDongSignguCd": item["lDongSignguCd"],
                    "lclsSystm1": item["lclsSystm1"],
                    "lclsSystm2": item["lclsSystm2"],
                    "lclsSystm3": item["lclsSystm3"],
                }],
                ids=[item["contentid"]],
            )
            print("one insert")
        print("insert success")


# insert_data()  # 최초 1회 실행(테이블 생성)

def search_festival_data(
        numOfRows: int = 10, pageNo: int = 1,
        contentid: str | None = None, contenttypeid: str | None = None,
        searchstartdate: str | None = None, searchenddate: str | None = None,
        mapx: str | None = None, mapy: str | None = None, radius: str | None = None,
        lDongRegnCd: str | None = None, lDongSignguCd: str | None = None,
        lclsSystm1: str | None = None, lclsSystm2: str | None = None, lclsSystm3: str | None = None,
        arrange: str | None = None, reverse: bool | None = None,
):
    if contentid is not None:
        return to_response(to_json_festival(collection_festival.get(
            ids=[contentid],
            include=[
                "documents",
                "metadatas",
            ]
        )), pageNo, numOfRows)
    wherelist = []
    if contenttypeid is not None:
        wherelist.append({"contenttypeid": contenttypeid})
    if searchstartdate is not None:
        wherelist.append({"eventenddate": {"$gte": int(searchstartdate)}})
    if searchenddate is not None:
        wherelist.append({"eventstartdate": {"$lte": int(searchenddate)}})
    if lDongRegnCd is not None:
        wherelist.append({"lDongRegnCd": lDongRegnCd})
    if lDongSignguCd is not None:
        wherelist.append({"lDongSignguCd": lDongSignguCd})
    if lclsSystm1 is not None:
        wherelist.append({"lclsSystm1": lclsSystm1})
    if lclsSystm2 is not None:
        wherelist.append({"lclsSystm2": lclsSystm2})
    if lclsSystm3 is not None:
        wherelist.append({"lclsSystm3": lclsSystm3})

    where = None
    if len(wherelist) == 1:
        where = wherelist[0]
    elif len(wherelist) > 1:
        where = {"$and": wherelist}
    jsonData = to_json_festival(collection_festival.get(
        where=where,
        include=[
            "documents",
            "metadatas",
        ],
        # 이후의 처리로 인해 값이 더 줄어들어 처리 후에 나눔
        # limit=numOfRows,
        # offset=(pageNo - 1) * numOfRows,
    ))
    if mapx is not None and mapy is not None:
        for data in jsonData:
            data["dist"] = str(haversine((float(mapy), float(mapx)), (float(data["mapy"]), float(data["mapx"]))) * 1000)
        if radius is not None:
            jsonData = [data for data in jsonData if float(data["dist"]) <= float(radius)]
    if arrange is not None:
        if reverse is None:
            reverse = False
        if arrange in ["contentid", "contenttypeid", "dist", "mapx", "mapy", "createdtime", "modifiedtime",
                       "eventstartdate", "eventenddate"]:
            jsonData = sorted(
                jsonData,
                key=lambda x: float(x.get(arrange, 0)),
                reverse=reverse  # True면 내림차순(최신순), False면 오름차순
            )
        else:
            jsonData = sorted(
                jsonData,
                key=lambda x: x.get(arrange, ""),
                reverse=reverse  # True면 내림차순(최신순), False면 오름차순
            )
        # for i in jsonData:
        #     print(i[arrange])
        #     print(i["eventstartdate"] + "-" + i["eventenddate"])
    return to_response(jsonData, pageNo, numOfRows)


def to_json_festival(collection: Collection):
    list = []
    for ids, documents, metadatas in zip(collection["ids"], collection["documents"], collection["metadatas"]):
        data = {}
        data["title"] = documents
        data["contentid"] = ids
        data.update(metadatas)
        data["createdtime"] = str(data.get("createdtime", ""))
        data["modifiedtime"] = str(data.get("modifiedtime", ""))
        data["eventstartdate"] = str(data.get("eventstartdate", ""))
        data["eventenddate"] = str(data.get("eventenddate", ""))
        list.append(data)
    return list

def to_response_original(datalist: list, pageNo: int = 1, numOfRows: int = 10):
    data = datalist[(pageNo - 1) * numOfRows: pageNo * numOfRows]
    return {
        "header": {
            "resultCode": "0000",
            "resultMsg": "OK"
        },
        "body": {
            "items": {
                "item": data
            },
            "numOfRows": len(data),
            "pageNo": pageNo,
            "totalCount": len(datalist)
        }
    }

def to_response(datalist: list, pageNo: int = 1, numOfRows: int = 10):
    datas = datalist[(pageNo - 1) * numOfRows: pageNo * numOfRows]
    new_datas = []
    for data in datas:
        new_data = {}
        new_data["id"] = data.get("contentid", "")
        new_data["title"] = data.get("title", "")
        new_data["startDate"] = data.get("eventstartdate", "")
        if len(new_data["startDate"]) == 8:
            new_data["startDate"] = f"{new_data['startDate'][:4]}-{new_data['startDate'][4:6]}-{new_data['startDate'][6:8]}"
        new_data["endDate"] = data.get("eventenddate", "")
        if len(new_data["endDate"]) == 8:
            new_data["endDate"] = f"{new_data['endDate'][:4]}-{new_data['endDate'][4:6]}-{new_data['endDate'][6:8]}"
        new_data["sidoCode"] = data.get("lDongRegnCd", "")
        new_data["sigunguCode"] = data.get("lDongSignguCd", "")
        if "addr1" in data:
            new_data["sido"], new_data["sigungu"] = _region_names(new_data["sidoCode"], new_data["sigunguCode"], data.get("addr1"))
        new_data["category"] = data.get("lclsSystm3", "")
        new_data["image"] = data.get("firstimage", "")
        new_data["lat"] = float(data.get("mapy", "0"))
        new_data["lng"] = float(data.get("mapx", "0"))
        if "dist" in data:
            new_data["distance"] = float(data.get("dist"))
        new_datas.append(new_data)
    return {
        "total": len(datalist),
        "page": pageNo,
        "size": len(new_datas),
        "items":  new_datas
    }

# search_data(lDongRegnCd="11", arrange="eventstartdate")  # 테스트

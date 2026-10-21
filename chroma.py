import json

import chromadb
from chromadb.api.models import Collection
from haversine import haversine
from pydantic import BaseModel

client = chromadb.PersistentClient(path="./chroma_db")
collection = client.get_or_create_collection(name="searchFestival2")

# /festivals 입력 변수들
class FilterSearchData(BaseModel):
    numOfRows: int = 10                     # 한번에 조회할 수
    pageNo: int = 1                         # 페이지 수
    contentid: str | None = None            # 조건 - id : 하나만 반환됨
    contenttypeid: str | None = None        # 조건 - 관광타입 ID
    searchstartdate: str | None = None      # 조건 - 시작 날짜 (YYYYMMDD)
    searchenddate: str | None = None        # 조건 - 종료 날짜 (YYYYMMDD)
    mapx: str | None = None                 # 조건 - GPS X좌표(WGS84 경도좌표) : mapy와 같이 입력
    mapy: str | None = None                 # 조건 - GPS Y좌표(WGS84 경도좌표) : mapx와 같이 입력
    radius: str | None = None               # 조건 - 거리 반경(단위: m) : mapx, mapy가 필수
    lDongRegnCd: str | None = None          # 조건 - 법정동 시도 코드
    lDongSignguCd: str | None = None        # 조건 - 법정동 시군구 코드
    lclsSystm1: str | None = None           # 조건 - 분류체계 대분류
    lclsSystm2: str | None = None           # 조건 - 분류체계 중분류
    lclsSystm3: str | None = None           # 조건 - 분류체계 소분류
    arrange: str | None = None              # 조건 - 정렬 조건 : Response 변수명으로 지정
    reverse: bool | None = None             # 조건 - 정렬 방식 : True면 내림차순, False나 없으면 오름차순

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
            collection.add(
                documents=[item["title"]],
                metadatas=[{
                    "addr1": item["addr1"],
                    "addr2": item["addr2"],
                    "zipcode": item["zipcode"],
                    "contenttypeid": item["contenttypeid"],
                    "createdtime": item["createdtime"],
                    "eventstartdate": item["eventstartdate"],
                    "eventenddate": item["eventenddate"],
                    "firstimage": item["firstimage"],
                    "firstimage2": item["firstimage2"],
                    "cpyrhtDivCd": item["cpyrhtDivCd"],
                    "mapx": item["mapx"],
                    "mapy": item["mapy"],
                    "mlevel": item["mlevel"],
                    "modifiedtime": item["modifiedtime"],
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

def search_data(
        numOfRows: int = 10, pageNo: int = 1,
        contentid: str | None = None, contenttypeid: str | None = None,
        searchstartdate: str | None = None, searchenddate: str | None = None,
        mapx: str | None = None, mapy: str | None = None, radius: str | None = None,
        lDongRegnCd: str | None = None, lDongSignguCd: str | None = None,
        lclsSystm1: str | None = None, lclsSystm2: str | None = None, lclsSystm3: str | None = None,
        arrange: str | None = None, reverse: bool | None = None,
):
    if contentid is not None:
        return to_response(to_json(collection.get(
            ids=[contentid],
            include=[
                "documents",
                "metadatas",
            ]
        )), pageNo, numOfRows)
    where = {}
    if contenttypeid is not None:
        where["contenttypeid"] = contenttypeid
    if searchstartdate is not None:
        where["eventenddate"] = {"$gte": searchstartdate}
    if searchenddate is not None:
        where["eventstartdate"] = {"$lte": searchenddate}
    if lDongRegnCd is not None:
        where["lDongRegnCd"] = lDongRegnCd
    if lDongSignguCd is not None:
        where["lDongSignguCd"] = lDongSignguCd
    if lclsSystm1 is not None:
        where["lclsSystm1"] = lclsSystm1
    if lclsSystm2 is not None:
        where["lclsSystm2"] = lclsSystm2
    if lclsSystm3 is not None:
        where["lclsSystm3"] = lclsSystm3
    jsonData = to_json(collection.get(
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
        jsonData = sorted(
            jsonData,
            key=lambda x: x.get(arrange, 0),
            reverse=reverse  # True면 내림차순(최신순), False면 오름차순
        )
    return to_response(jsonData, pageNo, numOfRows)


def to_json(collection: Collection):
    list = []
    for ids, documents, metadatas in zip(collection["ids"], collection["documents"], collection["metadatas"]):
        data = {}
        data["title"] = documents
        data["contentid"] = ids
        data.update(metadatas)
        list.append(data)
    return list

def to_response(datalist: list, pageNo: int = 1, numOfRows: int = 10):
    data = datalist[(pageNo - 1) * numOfRows : pageNo * numOfRows]
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

# search_data(lDongRegnCd="11", arrange="eventstartdate")  # 테스트

import json

import chromadb
from chromadb.api.models import Collection
from pydantic import BaseModel

client = chromadb.PersistentClient(path="./chroma_db")
collection = client.get_or_create_collection(name="searchFestival2")


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


class FilterSearchData(BaseModel):
    numOfRows: int = 10
    pageNo: int = 1
    contentid: str | None = None
    contenttypeid: str | None = None
    searchstartdate: str | None = None
    searchenddate: str | None = None
    mapx: str | None = None
    mapy: str | None = None
    lDongRegnCd: str | None = None
    lDongSignguCd: str | None = None
    lclsSystm1: str | None = None
    lclsSystm2: str | None = None
    lclsSystm3: str | None = None
    arrange: str | None = None
    reverse: bool | None = None

def search_data(
        numOfRows: int = 10, pageNo: int = 1,
        contentid: str | None = None, contenttypeid: str | None = None,
        searchstartdate: str | None = None, searchenddate: str | None = None,
        mapx: str | None = None, mapy: str | None = None,
        lDongRegnCd: str | None = None, lDongSignguCd: str | None = None,
        lclsSystm1: str | None = None, lclsSystm2: str | None = None, lclsSystm3: str | None = None,
        arrange: str | None = None, reverse: bool | None = None,
):
    if contentid is not None:
        return to_json(collection.get(
            ids=[contentid],
            include=[
                "documents",
                "metadatas",
            ]
        ))
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
        limit=numOfRows,
        offset=(pageNo - 1) * numOfRows,
    ))
    if arrange is not None:
        if reverse is None:
            reverse = False
        jsonData = sorted(
            jsonData,
            key=lambda x: x.get(arrange, 0),
            reverse=reverse  # True면 내림차순(최신순), False면 오름차순
        )
    return jsonData


def to_json(collection: Collection):
    list = []
    for ids, documents, metadatas in zip(collection["ids"], collection["documents"], collection["metadatas"]):
        data = {}
        data["title"] = documents
        data["contentid"] = ids
        data.update(metadatas)
        list.append(data)
    return list


# search_data(lDongRegnCd="11", arrange="eventstartdate")  # 테스트

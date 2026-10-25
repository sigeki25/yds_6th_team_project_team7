import json
from pathlib import Path

from chroma import collection_festival


def insert_data():
    with open(Path(__file__).resolve().parent / 'file/response_searchFestival2_296_261021.json', 'r', encoding='utf-8') as f:
        data = json.load(f)
        items = data["response"]["body"]["items"]["item"]
        # print(item)
        BATCH_SIZE = 200
        for i in range(0, len(items), BATCH_SIZE):
            batch = items[i:i + BATCH_SIZE]
            collection_festival.upsert(
                documents=[item["title"] for item in batch],
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
                } for item in batch],
                ids=[item["contentid"] for item in batch],
            )
            print(f"insert {len(batch)} data")
        print("insert success")


if __name__ == "__main__":
    insert_data()
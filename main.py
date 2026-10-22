import logging

from fastapi import FastAPI, Depends
from starlette.staticfiles import StaticFiles

from chroma import FilterSearchFestivalData, search_festival_data, FilterSearchFestivalOriginalData, \
    convert_FilterSearchFestival_to_original

app = FastAPI()
# app.mount("/view", StaticFiles(directory="view"))

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

@app.get("/api/festivals/{id}")
def festivals(id: str):
    result = search_festival_data(contentid=id)
    return result


@app.get("/api/old/festivals")
def festivals(params: FilterSearchFestivalOriginalData = Depends()):
    result = search_festival_data(**params.model_dump())
    return result
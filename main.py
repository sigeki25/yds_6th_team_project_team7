import logging

from fastapi import FastAPI
from starlette.staticfiles import StaticFiles

from chat_api import router as chat_router

app = FastAPI()
# app.mount("/view", StaticFiles(directory="view"))  # view 폴더가 없으면 서버가 안 켜져서 주석 처리
app.include_router(chat_router)

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
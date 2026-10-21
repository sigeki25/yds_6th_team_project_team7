import logging

from fastapi import FastAPI
from starlette.staticfiles import StaticFiles

from view_routes import router as view_router

app = FastAPI()
app.mount("/view", StaticFiles(directory="view", check_dir=False))  # view 는 frontend 빌드 결과
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
import logging

from fastapi import FastAPI
from starlette.staticfiles import StaticFiles

app = FastAPI()
app.mount("/view", StaticFiles(directory="view"))

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
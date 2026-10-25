import logging
from pathlib import Path
from typing import Annotated

from fastapi import FastAPI, HTTPException, Query
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator, model_validator

from chroma import (
    FilterSearchFestivalData, search_festival_data, FilterSearchFestivalOriginalData,
    convert_FilterSearchFestival_to_original, normalize_date,
)
from tour_api import (
    search_keyword, location_based_list, area_based_list, search_festival,
    get_festival_detail, TourApiError,
)
from view_routes import router as view_router
from chat_api import router as chat_router

app = FastAPI()
app.mount("/view", StaticFiles(directory=Path(__file__).resolve().parent / "view", check_dir=False), name="view")
app.include_router(view_router)
app.include_router(chat_router)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def _tour_result(operation, **params):
    try:
        return operation(**params)
    except TourApiError:
        # Upstream errors can contain authenticated request URLs. Never return/log them.
        logger.warning("TourAPI request failed: %s", getattr(operation, "__name__", "request"))
        raise HTTPException(status_code=502, detail="관광정보 서비스에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.") from None
    except ValueError:
        raise HTTPException(status_code=422, detail="요청 값을 확인해 주세요.") from None


@app.get("/api/festivals")
def festivals(params: Annotated[FilterSearchFestivalData, Query()]):
    return search_festival_data(**convert_FilterSearchFestival_to_original(params))


@app.get("/api/festivals/{id}")
def festival_detail(id: str):
    result = _tour_result(get_festival_detail, content_id=id)
    if result is None:
        raise HTTPException(status_code=404, detail="축제를 찾을 수 없습니다.")
    return result


class PageParams(BaseModel):
    page: int = Field(default=1, ge=1)
    size: int = Field(default=10, ge=1, le=1000)
    arrange: str = "C"
    lclsSystm3: str | None = None


class AreaParams(PageParams):
    sido: str | None = None
    sigungu: str | None = None
    content_type_id: int | None = None


class LocationParams(PageParams):
    lng: float = Field(ge=-180, le=180)
    lat: float = Field(ge=-90, le=90)
    radius: int = Field(default=5000, ge=1, le=20000)
    content_type_id: int | None = None
    arrange: str = "E"


class KeywordParams(AreaParams):
    keyword: str = Field(min_length=1)

    @field_validator("keyword")
    @classmethod
    def validate_keyword(cls, value):
        if not value.strip():
            raise ValueError("keyword must not be blank")
        return value.strip()


class FestivalParams(PageParams):
    start_date: str
    end_date: str | None = None
    sido: str | None = None
    sigungu: str | None = None
    arrange: str = "A"

    @field_validator("start_date", "end_date")
    @classmethod
    def validate_date(cls, value):
        return normalize_date(value)

    @model_validator(mode="after")
    def validate_range(self):
        if self.end_date and self.start_date > self.end_date:
            raise ValueError("start_date must be on or before end_date")
        return self


@app.get("/api/areaBasedList")
def area_based_list_(params: Annotated[AreaParams, Query()]):
    return _tour_result(area_based_list, **params.model_dump())


@app.get("/api/locationBasedList")
def location_based_list_(params: Annotated[LocationParams, Query()]):
    return _tour_result(location_based_list, **params.model_dump())


@app.get("/api/searchKeyword")
def search_keyword_(params: Annotated[KeywordParams, Query()]):
    return _tour_result(search_keyword, **params.model_dump())


@app.get("/api/searchFestival")
def search_festival_(params: Annotated[FestivalParams, Query()]):
    return _tour_result(search_festival, **params.model_dump())

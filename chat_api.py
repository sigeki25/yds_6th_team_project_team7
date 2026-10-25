"""Validated contract for the real AI course assistant."""
from datetime import date
from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel, Field, ConfigDict, field_validator

from llm import handle_chat

router = APIRouter(prefix="/api")
CHAT_MAX_LENGTH = 200


class ChatMessage(BaseModel):
    role: Literal['user', 'assistant']
    content: str = Field(max_length=4000)


class PreviousPlace(BaseModel):
    id: str = Field(min_length=1, max_length=80)
    type: Literal['festival', 'attraction', 'food']
    title: str = Field(min_length=1, max_length=300)
    lat: float = Field(ge=33, le=39, allow_inf_nan=False)
    lng: float = Field(ge=124, le=132, allow_inf_nan=False)
    address: str | None = Field(default=None, max_length=500)
    image: str | None = Field(default=None, max_length=2000)
    category: str | None = Field(default=None, max_length=80)


class PreviousCourse(BaseModel):
    # Only these fields are used; client totals and route estimates are recomputed.
    region: str = Field(min_length=1, max_length=100)
    duration: Literal['half', 'day']
    baseDate: date
    baseDateDefault: bool = False
    places: list[PreviousPlace] = Field(min_length=1, max_length=8)

    @field_validator('places')
    @classmethod
    def unique_places(cls, places):
        if len({p.id for p in places}) != len(places):
            raise ValueError('코스 장소 ID는 중복될 수 없습니다.')
        return places


class ChatRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    message: str = Field(min_length=1, max_length=CHAT_MAX_LENGTH)
    history: list[ChatMessage] = Field(default_factory=list, max_length=40)
    region: str | None = Field(default=None, max_length=100)
    festival_id: str | None = Field(default=None, pattern=r'^\d{1,30}$')
    previous_course: PreviousCourse | None = None


@router.post('/chat')
def chat(req: ChatRequest) -> dict:
    return handle_chat(
        req.message, [h.model_dump() for h in req.history],
        region=req.region, festival_id=req.festival_id,
        previous_course=req.previous_course.model_dump(mode='json') if req.previous_course else None,
    )

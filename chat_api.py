"""AI 코스 도우미 API (UI 설계서 CM10)

요청 { message, history: [{role, content}] } → 응답은 handle_chat() 반환값 그대로
"""
from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel, Field

from llm import handle_chat

router = APIRouter(prefix="/api")

CHAT_MAX_LENGTH = 200  # 프론트 chat.js 의 CHAT_MAX_LENGTH 와 같음

class ChatMessage(BaseModel):
    role: Literal['user', 'assistant']
    content: str

class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=CHAT_MAX_LENGTH)
    history: list[ChatMessage] = []

@router.post("/chat")
def chat(req: ChatRequest) -> dict:
    # async 가 아닌 def: LLM 호출이 끝날 때까지 기다리는 함수라 FastAPI 가 따로 실행하게 함
    return handle_chat(req.message, [h.model_dump() for h in req.history])

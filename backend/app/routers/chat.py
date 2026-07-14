from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
import httpx, os
from ..config import settings
from ..security import get_current_user
from ..models.user import User

router = APIRouter(prefix="/api/chat", tags=["chat"])

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: list[ChatMessage]

class ChatResponse(BaseModel):
    reply: str

SYSTEM_PROMPT = "You are InsurCare AI, an expert healthcare prior authorization assistant. Be concise and professional."

@router.post("", response_model=ChatResponse)
async def chat(req: ChatRequest, user: User = Depends(get_current_user)):
    key = settings.GEMINI_API_KEY or os.environ.get("GEMINI_API_KEY", "")
    if not key:
        raise HTTPException(500, "GEMINI_API_KEY not configured")

    contents = [{"role": m.role, "parts": [{"text": m.content}]} for m in req.messages]

    async with httpx.AsyncClient(timeout=60) as c:
        r = await c.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
            params={"key": key},
            json={
                "system_instruction": {"parts": [{"text": SYSTEM_PROMPT}]},
                "contents": contents,
                "generationConfig": {"maxOutputTokens": 1000},
            },
        )
        if not r.is_success:
            raise HTTPException(502, f"Gemini API error: {r.status_code}")
        data = r.json()
        text = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
        return ChatResponse(reply=text or "Sorry, I encountered an error. Please try again.")

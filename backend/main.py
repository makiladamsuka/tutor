import os
from uuid import uuid4

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from tutor.agent import answer_question, build_deck, build_flashcards, summarise_page
from tutor.llm import DEFAULT_CHAT_MODEL, get_client
from tutor.models import (
    ChatRequest,
    ChatResponse,
    Deck,
    Flashcard,
    FlashcardRequest,
    ModeRequest,
    SessionRequest,
    SessionResponse,
)
from tutor.rag import chunk_blocks, embed_texts
from tutor.store import Session, get, put

load_dotenv()

app = FastAPI(title="Tutor Backend")

# Allow the Chrome extension (any extension ID) and local dev frontends.
# Using a regex so we don't have to hardcode the extension ID, which
# changes between unpacked dev installs.
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^(chrome-extension://.+|http://localhost(:\d+)?|http://127\.0\.0\.1(:\d+)?)$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"ok": True}


@app.get("/test/openai")
def test_openai():
    if not os.getenv("OPENAI_API_KEY"):
        raise HTTPException(
            status_code=500,
            detail="OPENAI_API_KEY is not set. Create backend/.env from .env.example and paste your key.",
        )
    response = get_client().chat.completions.create(
        model=DEFAULT_CHAT_MODEL,
        messages=[{"role": "user", "content": "Say hi in 5 words."}],
        max_tokens=20,
    )
    return {"reply": response.choices[0].message.content}


@app.post("/session", response_model=SessionResponse)
def create_session(payload: SessionRequest) -> SessionResponse:
    if not payload.blocks:
        raise HTTPException(
            status_code=400,
            detail="blocks must contain at least one item",
        )

    session_id = uuid4().hex
    try:
        header = summarise_page(payload.title, payload.blocks)
        chunks = chunk_blocks(payload.blocks)
        chunk_embeddings = embed_texts([c.text for c in chunks])
    except RuntimeError as exc:
        # `get_client()` raises RuntimeError when OPENAI_API_KEY is missing.
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    put(
        Session(
            session_id=session_id,
            title=payload.title,
            url=payload.url,
            blocks=list(payload.blocks),
            header_summary=header,
            chunks=chunks,
            embeddings=chunk_embeddings,
        )
    )
    return SessionResponse(session_id=session_id, header_summary=header)


@app.post("/mode", response_model=Deck)
def post_mode(payload: ModeRequest) -> Deck:
    session = get(payload.session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="session_id not found")
    if not session.chunks:
        # Should be unreachable: /session always populates chunks. Defensive.
        raise HTTPException(
            status_code=409,
            detail="session has no chunks; recreate it via POST /session",
        )
    try:
        return build_deck(session, payload.mode, payload.lang)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/chat", response_model=ChatResponse)
def post_chat(payload: ChatRequest) -> ChatResponse:
    if not payload.text.strip():
        raise HTTPException(status_code=400, detail="text must not be empty")
    session = get(payload.session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="session_id not found")
    try:
        reply, anchors = answer_question(session, payload.text)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return ChatResponse(reply=reply, highlight_anchor_ids=anchors)


@app.post("/flashcards", response_model=list[Flashcard])
def post_flashcards(payload: FlashcardRequest) -> list[Flashcard]:
    if payload.n < 1 or payload.n > 20:
        raise HTTPException(
            status_code=400,
            detail="n must be between 1 and 20",
        )
    session = get(payload.session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="session_id not found")
    if not session.chunks:
        # Should be unreachable: /session always populates chunks. Defensive.
        raise HTTPException(
            status_code=409,
            detail="session has no chunks; recreate it via POST /session",
        )
    try:
        return build_flashcards(session, payload.n)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

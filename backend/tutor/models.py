"""Pydantic schemas for the backend's HTTP API.

Kept in one file for now since the surface is small; split when it grows.
The shapes here are the source of truth that the frontend's TypeScript types
mirror (see the root README's "Frontend integration contract" section).
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


# === Shared types ===

Mode = Literal["teach", "summarise", "quiz", "explain_simply"]
Lang = Literal["en", "hi", "si", "ta"]


# === POST /session ===

class Block(BaseModel):
    id: str
    text: str


class SessionRequest(BaseModel):
    title: str
    url: str
    blocks: list[Block]


class SessionResponse(BaseModel):
    session_id: str
    header_summary: str


# === POST /mode ===

class ModeRequest(BaseModel):
    session_id: str
    mode: Mode
    lang: Lang = "en"


class Slide(BaseModel):
    title: str
    bullets: list[str]


class Segment(BaseModel):
    id: str
    say: str
    slide: Slide
    anchor_ids: list[str] = Field(default_factory=list)


class Deck(BaseModel):
    title: str
    segments: list[Segment]


# === POST /chat ===

class ChatRequest(BaseModel):
    session_id: str
    text: str


class ChatResponse(BaseModel):
    reply: str
    highlight_anchor_ids: list[str] = Field(default_factory=list)


# === POST /flashcards ===

class FlashcardRequest(BaseModel):
    session_id: str
    n: int = 8


class Flashcard(BaseModel):
    q: str
    a: str
    source_chunk_id: str

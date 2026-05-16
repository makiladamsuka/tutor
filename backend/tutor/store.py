"""In-memory session store.

Sessions live for the lifetime of the uvicorn process. There is no
persistence; restart the server to wipe everything. This is intentional for
the MVP — the session payload is large but cheap to recreate from the page.

Generated decks (`POST /mode`) and flashcards (`POST /flashcards`) are cached
per session so repeat requests with the same mode/lang or `n` skip the LLM.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from tutor.models import Block, Deck, Flashcard, Lang, Mode
from tutor.rag import Chunk


@dataclass
class Session:
    session_id: str
    title: str
    url: str
    blocks: list[Block]
    header_summary: str
    chunks: list[Chunk] = field(default_factory=list)
    # (len(chunks), 1536) L2-normalised matrix from `tutor.rag.embed_texts`.
    # `None` only during construction; populated by the time the session is
    # `put()` into the store from the `/session` endpoint.
    embeddings: np.ndarray | None = None
    # Cached LLM outputs keyed by "mode:lang" (e.g. "quiz:en").
    decks: dict[str, Deck] = field(default_factory=dict)
    # Cached flashcard lists keyed by requested count `n`.
    flashcards_by_n: dict[int, list[Flashcard]] = field(default_factory=dict)


_sessions: dict[str, Session] = {}


def deck_cache_key(mode: Mode, lang: Lang) -> str:
    return f"{mode}:{lang}"


def get_deck(session: Session, mode: Mode, lang: Lang) -> Deck | None:
    return session.decks.get(deck_cache_key(mode, lang))


def put_deck(session: Session, mode: Mode, lang: Lang, deck: Deck) -> None:
    session.decks[deck_cache_key(mode, lang)] = deck


def get_flashcards(session: Session, n: int) -> list[Flashcard] | None:
    return session.flashcards_by_n.get(n)


def put_flashcards(session: Session, n: int, cards: list[Flashcard]) -> None:
    session.flashcards_by_n[n] = cards


def put(session: Session) -> None:
    _sessions[session.session_id] = session


def get(session_id: str) -> Session | None:
    return _sessions.get(session_id)

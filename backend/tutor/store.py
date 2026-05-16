"""In-memory session store.

Sessions live for the lifetime of the uvicorn process. There is no
persistence; restart the server to wipe everything. This is intentional for
the MVP — the session payload is large but cheap to recreate from the page.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from tutor.models import Block
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


_sessions: dict[str, Session] = {}


def put(session: Session) -> None:
    _sessions[session.session_id] = session


def get(session_id: str) -> Session | None:
    return _sessions.get(session_id)

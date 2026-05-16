"""In-memory session store.

Sessions live for the lifetime of the uvicorn process. There is no
persistence; restart the server to wipe everything. This is intentional for
the MVP — the session payload is large but cheap to recreate from the page.

Step 7 (chunking + RAG) will add `chunks` and `embeddings` fields populated
when the session is created.
"""

from __future__ import annotations

from dataclasses import dataclass

from tutor.models import Block


@dataclass
class Session:
    session_id: str
    title: str
    url: str
    blocks: list[Block]
    header_summary: str
    # Step 7 will add:
    # chunks: list[Chunk] = field(default_factory=list)
    # embeddings: np.ndarray | None = None


_sessions: dict[str, Session] = {}


def put(session: Session) -> None:
    _sessions[session.session_id] = session


def get(session_id: str) -> Session | None:
    return _sessions.get(session_id)

"""Thin OpenAI client wrapper.

Exposes a lazily-constructed singleton client and the model names we use
across the project. Endpoints should call `get_client()` rather than
constructing `OpenAI()` directly so we share a single HTTP connection pool.
"""

from __future__ import annotations

import os

from openai import OpenAI

DEFAULT_CHAT_MODEL = "gpt-4o-mini"
DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small"


_client: OpenAI | None = None


def get_client() -> OpenAI:
    """Return a process-wide OpenAI client.

    Raises RuntimeError if `OPENAI_API_KEY` is not set in the environment;
    callers should map this to an HTTP error appropriate for their endpoint.
    """
    global _client
    if _client is None:
        if not os.getenv("OPENAI_API_KEY"):
            raise RuntimeError(
                "OPENAI_API_KEY is not set. Create backend/.env from "
                ".env.example and paste your key."
            )
        _client = OpenAI()
    return _client

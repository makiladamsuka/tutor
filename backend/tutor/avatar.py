"""Provision Beyond Presence calls for the frontend.

POST `/api/create-call` with an optional `deck` creates a disposable BP agent
that narrates each segment's `say` text; the frontend drives segments via
LiveKit `SAY:` chat messages.
"""

from __future__ import annotations

import os
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from tutor.avatar_config import AvatarCatalog, load_avatar_catalog, resolve_agent_id

BEY_API_BASE = os.environ.get("BEY_API_BASE", "https://api.bey.dev")


def _bey_api_key() -> str:
    return os.environ.get("BEY_API_KEY", "")


_avatar_id_cache: dict[str, str] = {}


class NarrationSegment(BaseModel):
    say: str = Field(min_length=1)


class NarrationDeck(BaseModel):
    title: str = Field(min_length=1)
    segments: list[NarrationSegment] = Field(min_length=1)


class CreateCallRequest(BaseModel):
    deck: Optional[NarrationDeck] = None
    name: str = Field(default="Tutor")
    avatar_id: Optional[str] = Field(
        default=None,
        description="Catalog id from GET /api/avatars (not the Bey visual avatar_id).",
    )


class AvatarListItem(BaseModel):
    id: str
    label: str


class AvatarListResponse(BaseModel):
    default_id: str
    avatars: list[AvatarListItem]


class CreateCallResponse(BaseModel):
    call_id: str
    livekit_url: str
    livekit_token: str
    agent_id: Optional[str] = None


router = APIRouter(tags=["avatar"])


def _bey_headers(api_key: str) -> dict[str, str]:
    return {
        "x-api-key": api_key,
        "Content-Type": "application/json",
    }


def _catalog_for_api() -> AvatarCatalog:
    try:
        return load_avatar_catalog()
    except ValueError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


def _resolve_template_agent_id(avatar_key: Optional[str]) -> str:
    try:
        _, agent_id = resolve_agent_id(avatar_key)
        return agent_id
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


async def _get_template_avatar_id(
    client: httpx.AsyncClient,
    api_key: str,
    template_agent_id: str,
) -> str:
    if template_agent_id in _avatar_id_cache:
        return _avatar_id_cache[template_agent_id]

    resp = await client.get(
        f"{BEY_API_BASE}/v1/agents/{template_agent_id}",
        headers=_bey_headers(api_key),
    )
    if resp.status_code >= 400:
        raise HTTPException(
            status_code=resp.status_code,
            detail=f"Beyond Presence get-agent failed: {resp.text}",
        )
    bey_avatar_id = resp.json().get("avatar_id")
    if not bey_avatar_id:
        raise HTTPException(
            status_code=502,
            detail="Beyond Presence get-agent response missing avatar_id.",
        )
    _avatar_id_cache[template_agent_id] = bey_avatar_id
    return bey_avatar_id


_NARRATOR_SYSTEM_PROMPT = """You are a tutor narrating a slideshow. The lesson \
is "{title}". There are {n} segments below, numbered [1] through [{n}]. You \
MUST read each segment EXACTLY as written, word-for-word. Do NOT paraphrase, \
summarise, expand, translate, or add any commentary of your own.

CRITICAL RULES:
1. Segment [1] has already been spoken as the opening greeting. Do NOT speak \
it again.
2. When the learner says "next", "continue", "go on", "okay", or anything \
similar that signals "move on", read the NEXT segment verbatim and STOP.
3. If they ask a question, answer in ONE short sentence based on the segment \
content, then say exactly: "Ready for the next part?" and STOP.
4. Never read more than one segment per turn. Never invent new content. \
Never combine segments.
5. After reading segment [{n}], say exactly: "That's the end of this lesson." \
and stop. Ignore further "next" requests.
6. If the learner's message starts with "SAY:" (case-insensitive), read \
EVERYTHING after the colon verbatim, exactly as written, and STOP. Do NOT \
add commentary, do NOT advance the segment counter, do NOT treat it as a \
question. This is an explicit speak-aloud override.

SCRIPT (segments to read verbatim):
{segments_block}
"""


def _build_narrator_system_prompt(deck: NarrationDeck) -> str:
    segments_block = "\n".join(
        f"[{i + 1}] {seg.say}" for i, seg in enumerate(deck.segments)
    )
    return _NARRATOR_SYSTEM_PROMPT.format(
        title=deck.title,
        n=len(deck.segments),
        segments_block=segments_block,
    )


_BEY_SYSTEM_PROMPT_MAX = 10_000
_BEY_GREETING_MAX = 1_000


async def _create_disposable_agent(
    client: httpx.AsyncClient,
    api_key: str,
    name: str,
    deck: NarrationDeck,
    template_agent_id: str,
) -> str:
    if not deck.segments:
        raise HTTPException(
            status_code=400,
            detail="deck.segments must contain at least one segment.",
        )

    avatar_id = await _get_template_avatar_id(client, api_key, template_agent_id)
    system_prompt = _build_narrator_system_prompt(deck)[:_BEY_SYSTEM_PROMPT_MAX]
    greeting = deck.segments[0].say[:_BEY_GREETING_MAX]

    resp = await client.post(
        f"{BEY_API_BASE}/v1/agents",
        headers=_bey_headers(api_key),
        json={
            "name": name,
            "avatar_id": avatar_id,
            "system_prompt": system_prompt,
            "greeting": greeting,
        },
    )
    if resp.status_code >= 400:
        raise HTTPException(
            status_code=resp.status_code,
            detail=f"Beyond Presence create-agent failed: {resp.text}",
        )
    return resp.json()["id"]


@router.get("/api/avatars", response_model=AvatarListResponse)
def list_avatars() -> AvatarListResponse:
    catalog = _catalog_for_api()
    configured = [a for a in catalog.avatars if a.agent_id]
    if not configured:
        raise HTTPException(
            status_code=500,
            detail="No avatars configured. Set BEY_AGENT_ID or BEY_AVATARS in backend/.env",
        )
    return AvatarListResponse(
        default_id=catalog.default_id,
        avatars=[AvatarListItem(id=a.id, label=a.label) for a in configured],
    )


@router.post("/api/create-call", response_model=CreateCallResponse)
async def create_call(payload: CreateCallRequest | None = None) -> CreateCallResponse:
    api_key = _bey_api_key()
    if not api_key:
        raise HTTPException(status_code=500, detail="BEY_API_KEY is not set on the server.")

    payload = payload or CreateCallRequest()
    template_agent_id = _resolve_template_agent_id(payload.avatar_id)

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            if payload.deck is not None:
                agent_id = await _create_disposable_agent(
                    client,
                    api_key,
                    payload.name,
                    payload.deck,
                    template_agent_id,
                )
            else:
                agent_id = template_agent_id

            resp = await client.post(
                f"{BEY_API_BASE}/v1/calls",
                headers=_bey_headers(api_key),
                json={
                    "agent_id": agent_id,
                    "livekit_username": "Student",
                },
            )
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Beyond Presence request failed: {exc}",
        ) from exc

    if resp.status_code >= 400:
        raise HTTPException(
            status_code=resp.status_code,
            detail=f"Beyond Presence create-call failed: {resp.text}",
        )

    data = resp.json()
    return CreateCallResponse(
        call_id=data["id"],
        livekit_url=data["livekit_url"],
        livekit_token=data["livekit_token"],
        agent_id=agent_id if payload.deck is not None else None,
    )

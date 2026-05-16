"""Load Beyond Presence tutor avatars from env or a single default agent."""

from __future__ import annotations

import json
import os
from typing import Optional

from pydantic import BaseModel, Field


class AvatarOption(BaseModel):
    id: str = Field(min_length=1)
    label: str = Field(min_length=1)
    agent_id: str = Field(min_length=1)


class AvatarCatalog(BaseModel):
    default_id: str
    avatars: list[AvatarOption] = Field(min_length=1)


def _parse_bey_avatars_json(raw: str) -> list[AvatarOption]:
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError(f"BEY_AVATARS is not valid JSON: {exc}") from exc

    if not isinstance(data, list) or not data:
        raise ValueError("BEY_AVATARS must be a non-empty JSON array.")

    return [AvatarOption.model_validate(item) for item in data]


def load_avatar_catalog() -> AvatarCatalog:
    """Resolve configured avatars. Raises ValueError on invalid BEY_AVATARS."""
    raw = os.environ.get("BEY_AVATARS", "").strip()
    if raw:
        avatars = _parse_bey_avatars_json(raw)
        ids = [a.id for a in avatars]
        if len(ids) != len(set(ids)):
            raise ValueError("BEY_AVATARS entries must have unique id values.")
        default_id = os.environ.get("BEY_DEFAULT_AVATAR_ID", "").strip() or avatars[0].id
        if default_id not in ids:
            raise ValueError(
                f"BEY_DEFAULT_AVATAR_ID={default_id!r} is not in BEY_AVATARS."
            )
        return AvatarCatalog(default_id=default_id, avatars=avatars)

    agent_id = os.environ.get("BEY_AGENT_ID") or os.environ.get("BEY_AVATAR_ID", "")
    if not agent_id.strip():
        return AvatarCatalog(
            default_id="default",
            avatars=[
                AvatarOption(
                    id="default",
                    label="Default tutor",
                    agent_id="",
                )
            ],
        )

    label = os.environ.get("BEY_AVATAR_LABEL", "Default tutor").strip() or "Default tutor"
    return AvatarCatalog(
        default_id="default",
        avatars=[AvatarOption(id="default", label=label, agent_id=agent_id.strip())],
    )


def resolve_agent_id(avatar_key: Optional[str]) -> tuple[str, str]:
    """Return (catalog_id, bey_agent_id). Raises ValueError if unknown or unset."""
    catalog = load_avatar_catalog()
    key = (avatar_key or "").strip() or catalog.default_id

    for option in catalog.avatars:
        if option.id == key:
            if not option.agent_id:
                raise ValueError(
                    f"Avatar {key!r} has no agent_id. Set BEY_AGENT_ID or BEY_AVATARS."
                )
            return option.id, option.agent_id

    raise ValueError(f"Unknown avatar id {key!r}. Valid: {[a.id for a in catalog.avatars]}")

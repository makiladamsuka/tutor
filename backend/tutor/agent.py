"""LLM-driven generation logic.

Two responsibilities:

- `summarise_page` (used by `POST /session`) — one-line header summary the
  side panel shows while the user picks a mode.
- `build_deck` (used by `POST /mode`) — produces a structured `Deck` of
  segments tailored to one of the four teaching modes, grounded in the
  session's chunks and tagged with `anchor_ids` so the frontend can light
  up the right paragraphs on the live page.

All prompts live here so language tweaks happen in one place.
"""

from __future__ import annotations

import json
from typing import Any

from tutor.llm import DEFAULT_CHAT_MODEL, get_client
from tutor.models import Block, Deck, Flashcard, Lang, Mode, Segment
from tutor.rag import Chunk, retrieve
from tutor.store import Session

# === Header summary (Step 6) ===

_HEADER_SYSTEM_PROMPT = (
    "You are a concise assistant. Summarise the given web page in ONE short "
    "sentence (max 20 words). Return only the sentence, with no quotes, no "
    "leading 'Summary:' label, and no trailing punctuation other than a "
    "single period."
)

# Cap the user-message size so the header call stays cheap regardless of
# page length. The first ~2000 characters of joined block text are enough
# for a one-line gist on any reasonable article.
_PAGE_PREVIEW_CHARS = 2000


def summarise_page(title: str, blocks: list[Block]) -> str:
    """Return a one-sentence summary of the page.

    Uses only a preview of the page content (the first `_PAGE_PREVIEW_CHARS`
    characters of joined blocks) so this stays a small, fast LLM call. The
    full content is preserved in the session for later RAG.
    """
    preview = " ".join(b.text for b in blocks)[:_PAGE_PREVIEW_CHARS]
    user_msg = f"Title: {title}\n\nContent:\n{preview}"
    response = get_client().chat.completions.create(
        model=DEFAULT_CHAT_MODEL,
        messages=[
            {"role": "system", "content": _HEADER_SYSTEM_PROMPT},
            {"role": "user", "content": user_msg},
        ],
        max_tokens=60,
        temperature=0.3,
    )
    return (response.choices[0].message.content or "").strip()


# === Deck builder (Step 8) ===

# Strict JSON schema mirroring the pydantic Deck/Segment/Slide shape in
# tutor/models.py. OpenAI's strict mode requires every property to appear
# in `required` and `additionalProperties: false` on every object — the
# model can then never return malformed JSON, so we don't need any defensive
# parsing fallback below.
_DECK_JSON_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},
        "segments": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "string"},
                    "say": {"type": "string"},
                    "slide": {
                        "type": "object",
                        "properties": {
                            "title": {"type": "string"},
                            "bullets": {
                                "type": "array",
                                "items": {"type": "string"},
                            },
                        },
                        "required": ["title", "bullets"],
                        "additionalProperties": False,
                    },
                    "anchor_ids": {
                        "type": "array",
                        "items": {"type": "string"},
                    },
                },
                "required": ["id", "say", "slide", "anchor_ids"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["title", "segments"],
    "additionalProperties": False,
}


_DECK_INSTRUCTIONS = """Produce a Deck JSON object with:
- `title`: a short title summarising the deck (3-7 words).
- `segments`: an ordered list of 5 to 8 segments. Each segment has:
  - `id`: "s1", "s2", "s3", ... in order, no gaps.
  - `say`: what the avatar should speak aloud (see mode rules above).
  - `slide.title`: the slide heading (3-8 words).
  - `slide.bullets`: 3-5 short bullets (see mode rules above).
  - `anchor_ids`: list of block IDs (e.g. ["b3","b5"]) drawn from the
    SOURCE CHUNKS the user message provides. MUST be non-empty and may
    only reference IDs that actually appeared in those chunks. Pick the
    1-3 most relevant blocks per segment.

Output language: {lang}. All natural-language fields (`title`, `say`,
`slide.title`, `slide.bullets`) must be written in this language. IDs
(`id`, `anchor_ids`) are language-agnostic strings — leave them as-is."""


_TEACH_RULES = """Mode: TEACH ME.
You are a patient tutor walking the learner through the page in pedagogical
order, building understanding one concept at a time.
- `say`: 2-4 sentences, conversational, as if explaining to a student
  sitting next to you. Connect this beat to the previous one.
- `slide.bullets`: the KEY TEACHING POINTS for this beat — short phrases
  (not full sentences) the learner reads while the avatar elaborates.
- `anchor_ids`: the blocks you are teaching in this beat (1-3 block IDs)
  so the live page highlights them."""


_SUMMARISE_RULES = """Mode: SUMMARISE.
Each segment covers one section of the page. Together the segments are a
condensed read-through.
- `say`: 1-3 sentences narrating the takeaway of this section.
- `slide.bullets`: the SUMMARY BULLETS for that section — concise,
  scannable, the kind of bullets a student would put in their notes.
- `anchor_ids`: the blocks this summary section is grounded in (1-3 block
  IDs) so the live page highlights the source text."""


_QUIZ_RULES = """Mode: QUIZ ME.
Each segment is exactly ONE quiz question plus its answer reveal.
- `say`: read the question, then literally write "..." (a beat for the
  learner to think), then reveal the answer with one short reasoning
  sentence. 3-6 sentences total.
- `slide.bullets`: JUST THE QUESTION TEXT, optionally followed by 2-4
  multiple-choice options ("A) ...", "B) ...", etc.). Do NOT put the
  answer on the slide — the learner sees only the question while
  listening to the avatar reveal.
- `anchor_ids`: the blocks where the answer is grounded so the live page
  highlights the source while the avatar reveals."""


_EXPLAIN_SIMPLY_RULES = """Mode: EXPLAIN SIMPLY.
Audience: a curious 12-year-old. Avoid jargon. Use concrete everyday
analogies (kitchen, sports, animals, common objects).
- `say`: 2-4 sentences in plain language with at least one analogy.
- `slide.bullets`: 3-5 short, plain-English bullets. No technical terms
  unless the bullet itself defines them in simple words.
- `anchor_ids`: the blocks this simple explanation refers to (1-3 block
  IDs) so the live page highlights the matching paragraphs."""


def _build_system_prompt(mode_rules: str) -> str:
    return f"{mode_rules}\n\n{_DECK_INSTRUCTIONS}"


_SYSTEM_PROMPTS: dict[Mode, str] = {
    "teach": _build_system_prompt(_TEACH_RULES),
    "summarise": _build_system_prompt(_SUMMARISE_RULES),
    "quiz": _build_system_prompt(_QUIZ_RULES),
    "explain_simply": _build_system_prompt(_EXPLAIN_SIMPLY_RULES),
}


def build_deck(session: Session, mode: Mode, lang: Lang) -> Deck:
    """Generate a `Deck` for `session` in the requested `mode` and `lang`.

    Pipeline: pack every chunk in the session as labelled context, build a
    mode-specific system prompt, call `gpt-4o-mini` with strict JSON-schema
    response format, validate via pydantic, return the `Deck`.

    Raises `ValueError` if the session has no chunks (the route maps that
    to HTTP 409). Raises `RuntimeError` (from `get_client`) if the API key
    is missing (route maps to 500).
    """
    if not session.chunks:
        raise ValueError("session has no chunks")

    system_prompt = _SYSTEM_PROMPTS[mode].format(lang=lang)

    chunk_blocks_section = "\n\n".join(
        f"Chunk {c.id} (from blocks {','.join(c.block_ids)}):\n{c.text}"
        for c in session.chunks
    )
    user_msg = (
        f"Page title: {session.title}\n\n"
        f"SOURCE CHUNKS (only these block IDs are valid for anchor_ids):\n\n"
        f"{chunk_blocks_section}"
    )

    response = get_client().chat.completions.create(
        model=DEFAULT_CHAT_MODEL,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_msg},
        ],
        response_format={
            "type": "json_schema",
            "json_schema": {
                "name": "Deck",
                "strict": True,
                "schema": _DECK_JSON_SCHEMA,
            },
        },
        temperature=0.4,
    )
    content = response.choices[0].message.content or "{}"
    deck = Deck.model_validate_json(content)
    return ensure_segment_anchors(deck, session.chunks)


def _valid_block_ids(chunks: list[Chunk]) -> set[str]:
    ids: set[str] = set()
    for chunk in chunks:
        ids.update(chunk.block_ids)
    return ids


def ensure_segment_anchors(deck: Deck, chunks: list[Chunk]) -> Deck:
    """Ensure every segment has highlightable block IDs (all modes)."""
    if not chunks:
        return deck

    valid = _valid_block_ids(chunks)
    updated: list[Segment] = []
    for i, seg in enumerate(deck.segments):
        filtered = [aid for aid in seg.anchor_ids if aid in valid]
        if not filtered:
            chunk = chunks[i % len(chunks)]
            filtered = list(chunk.block_ids)[:3]
        updated.append(seg.model_copy(update={"anchor_ids": filtered}))

    return deck.model_copy(update={"segments": updated})


# === Free-text chat (Step 9) ===

_CHAT_SYSTEM_PROMPT = """You are a tutor speaking aloud to a learner about \
the web page they are viewing. Answer the learner's question using ONLY \
the SOURCE CHUNKS below — do not use outside knowledge.

If the answer is not present in the chunks, say something like "I can \
only help with what's on this page" — don't guess.

Keep answers conversational and short (1-3 sentences, max ~60 words), \
suitable for being spoken aloud by a TTS avatar. No bullet lists, no \
markdown — plain spoken prose only."""


def answer_question(session: Session, text: str) -> tuple[str, list[str]]:
    """Answer `text` grounded in the session's page content.

    Pipeline: retrieve top-4 chunks via cosine similarity, stuff them into
    a grounded system prompt, ask `gpt-4o-mini` for a short conversational
    reply, return the reply plus the deterministic ordered-union of the
    retrieved chunks' `block_ids` (which the frontend uses as
    `page:highlight` anchor IDs while the avatar speaks).

    The anchor list is computed server-side rather than asked from the
    LLM: the chunks ARE what grounded the answer, so highlighting their
    blocks is correct by construction and frees the LLM from a second
    job.
    """
    chunks = retrieve(session.chunks, session.embeddings, text, k=4)
    if not chunks:
        return ("I can only help with what's on this page.", [])

    context = "\n\n".join(
        f"[blocks {','.join(c.block_ids)}]\n{c.text}" for c in chunks
    )
    user_msg = f"SOURCE CHUNKS:\n\n{context}\n\nLearner question: {text}"

    response = get_client().chat.completions.create(
        model=DEFAULT_CHAT_MODEL,
        messages=[
            {"role": "system", "content": _CHAT_SYSTEM_PROMPT},
            {"role": "user", "content": user_msg},
        ],
        max_tokens=150,
        temperature=0.4,
    )
    reply = (response.choices[0].message.content or "").strip()

    seen: set[str] = set()
    anchors: list[str] = []
    for c in chunks:
        for bid in c.block_ids:
            if bid not in seen:
                seen.add(bid)
                anchors.append(bid)

    return reply, anchors


# === Flashcards (Step 10) ===

_FLASHCARDS_SYSTEM_PROMPT = """You are a study-aid generator. Produce \
exactly {n} flashcards from the SOURCE BLOCKS the user provides. Cover \
the full breadth of the page — spread cards across blocks rather than \
clustering on one section.

Each card:
- `q`: a single clear question (one sentence, no preamble).
- `a`: a concise answer (1-2 sentences) that fully answers the question.
- `source_chunk_id`: the SINGLE most relevant block ID (e.g. "b3") \
copied verbatim from the bracketed prefix of one of the SOURCE BLOCKS. \
This MUST be one of the block IDs shown to you (b1, b2, ...). Never \
invent IDs and never use any other prefix.

Use ONLY the source blocks. No outside knowledge."""


# OpenAI strict mode requires an object root, but our HTTP wire shape is a
# top-level array. We work around that by asking the LLM for
# {"cards": [...]} and unwrapping in `build_flashcards`.
_FLASHCARDS_JSON_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "cards": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "q": {"type": "string"},
                    "a": {"type": "string"},
                    "source_chunk_id": {"type": "string"},
                },
                "required": ["q", "a", "source_chunk_id"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["cards"],
    "additionalProperties": False,
}


def build_flashcards(session: Session, n: int) -> list[Flashcard]:
    """Generate exactly `n` flashcards from the whole page.

    Like `build_deck`, this uses ALL of the page as context (not RAG
    retrieval) so the cards span the whole page rather than clustering
    on one query. Strict JSON schema guarantees the shape; the cards-
    wrapping trick is just to satisfy OpenAI's "object root" requirement
    while keeping the HTTP response a plain JSON array.

    Implementation note: we feed `session.blocks` rather than
    `session.chunks` even though both cover the same content. `chunk.text`
    concatenates several blocks together, so labelling a chunk as
    "Chunk c1" would (a) leak `c*` IDs the LLM might echo back into
    `source_chunk_id` and (b) blur the per-block boundaries the LLM
    needs to pick the single best `b*` ID. Iterating over blocks
    directly gives the model unambiguous `b*`-labelled context.

    Note: `source_chunk_id` is named historically — per the wire
    contract it carries a `b*` block ID, not a `c*` chunk ID. The
    frontend never sees `c*` IDs.
    """
    if not session.chunks:
        # We require chunks/embeddings to mark the session as "ready",
        # not because we use them here — `session.blocks` is the source.
        raise ValueError("session has no chunks")

    system_prompt = _FLASHCARDS_SYSTEM_PROMPT.format(n=n)
    blocks_section = "\n\n".join(
        f"[{block.id}] {block.text}" for block in session.blocks
    )
    user_msg = (
        f"Page title: {session.title}\n\n"
        f"SOURCE BLOCKS (each line is prefixed by its block ID in "
        f"square brackets; only these IDs are valid values for "
        f"source_chunk_id):\n\n"
        f"{blocks_section}"
    )

    response = get_client().chat.completions.create(
        model=DEFAULT_CHAT_MODEL,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_msg},
        ],
        response_format={
            "type": "json_schema",
            "json_schema": {
                "name": "FlashcardList",
                "strict": True,
                "schema": _FLASHCARDS_JSON_SCHEMA,
            },
        },
        temperature=0.4,
    )
    content = response.choices[0].message.content or '{"cards": []}'
    payload = json.loads(content)
    return [Flashcard.model_validate(c) for c in payload["cards"]]

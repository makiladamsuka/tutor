# Tutor Backend

FastAPI service that powers the Tutor Chrome extension. It accepts a web
page's extracted text, chunks and embeds it, and serves four teaching modes
(**Teach me**, **Summarise**, **Quiz me**, **Explain simply**), free-form
**chat**, and **flashcard** generation — all grounded in the page content
and all over plain HTTP. The frontend renders the responses next to a
Beyond Presence avatar and a synced slide deck.

The product-wide plan lives in [`../.cursor/plans/interactive-wiki-tutor_1e075354.plan.md`](../.cursor/plans/interactive-wiki-tutor_1e075354.plan.md).
This file is the backend-only build journal.

## Stack

- Python 3.12+ (Python 3.14 in the current dev venv)
- [FastAPI](https://fastapi.tiangolo.com/) + [uvicorn](https://www.uvicorn.org/)
- [OpenAI](https://platform.openai.com/) for chat + embeddings (`gpt-4o-mini`, `text-embedding-3-small`)
- numpy for cosine-similarity retrieval (no FAISS — overkill at this scale)
- pydantic for request/response schemas
- [`uv`](https://docs.astral.sh/uv/) as the package manager and runner

## Quick start

```bash
cd backend
uv venv
source .venv/bin/activate
uv sync
cp .env.example .env   # then edit .env and paste your OPENAI_API_KEY
uv run uvicorn main:app --reload
```

Then open http://localhost:8000/docs for the auto-generated Swagger UI.

## Build playbook

The backend is built step by step. Each step has a single "done when" check;
don't move to the next step until the current one passes.

| #  | Step                       | Status |
| -- | -------------------------- | ------ |
| 1  | Tooling + venv (`uv`)      | done   |
| 2  | Hello FastAPI + `/health`  | done   |
| 3  | OpenAI smoke test          | done   |
| 4  | CORS for the extension     | done   |
| 5  | Project layout (`tutor/`)  | done   |
| 6  | `POST /session`            | done   |
| 7  | Chunking + RAG             | done   |
| 8  | `POST /mode`               | done   |
| 9  | `POST /chat`               | done   |
| 10 | `POST /flashcards`         | done   |

### 1. Tooling and venv — done

```bash
cd backend
uv init --bare --python 3.12
uv venv
source .venv/bin/activate
```

**Done when** `python --version` works inside `.venv` and `which python` ends
with `backend/.venv/bin/python`.

### 2. Hello FastAPI — done

```bash
uv add fastapi 'uvicorn[standard]'
uv run uvicorn main:app --reload
curl localhost:8000/health   # → {"ok":true}
```

`main.py` is a one-route FastAPI app with `GET /health`.

**Done when** `/health` returns `{"ok":true}` and `/docs` shows the Swagger UI.

### 3. OpenAI smoke test — done

```bash
uv add openai python-dotenv
cp .env.example .env   # then edit .env and paste your real OPENAI_API_KEY
```

`main.py` calls `load_dotenv()` at startup so the `OPENAI_API_KEY` from
`.env` is read into the process environment. A temporary `GET /test/openai`
endpoint calls `gpt-4o-mini` with "say hi in 5 words" and returned a real
response (`HTTP 200 {"reply":"Hello there, how are you?"}`). The endpoint is
kept in for ongoing connection checks during the rest of the build and will
be removed once `POST /session` and friends exist. The OpenAI client is
constructed lazily via `tutor.llm.get_client()` (Step 5).

**Done when** ✓ confirmed: OpenAI returns a real chat completion through the
backend.

### 4. CORS for the extension — done

`main.py` registers `CORSMiddleware` with an `allow_origin_regex` that
matches Chrome extensions (any extension ID), `http://localhost`, and
`http://127.0.0.1` (with or without a port). Credentials, all methods, and
all headers are allowed because the side panel will send `Content-Type:
application/json` and may use cookies later.

```python
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^(chrome-extension://.+|http://localhost(:\d+)?|http://127\.0\.0\.1(:\d+)?)$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

**Done when** ✓ confirmed: requests from `chrome-extension://...` and
`http://localhost:5173` return a matching `Access-Control-Allow-Origin`;
unrelated origins do not.

### 5. Project layout — done

Created the `backend/tutor/` package so `main.py` stays a thin route file:

- **`tutor/__init__.py`** — empty marker.
- **`tutor/llm.py`** — exposes `get_client()` (a process-wide singleton
  `OpenAI` client) plus `DEFAULT_CHAT_MODEL = "gpt-4o-mini"` and
  `DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small"`. Endpoints call
  `get_client()` instead of constructing `OpenAI()` themselves so we share a
  single HTTP connection pool. Raises `RuntimeError` if `OPENAI_API_KEY` is
  missing; `main.py` translates that into an `HTTPException`.
- **`tutor/models.py`** — pydantic schemas for every endpoint we'll build:
  `Block`, `SessionRequest`/`SessionResponse`, `ModeRequest`, `Slide`,
  `Segment`, `Deck`, `ChatRequest`/`ChatResponse`, `FlashcardRequest`,
  `Flashcard`, plus `Mode` and `Lang` literals. These are the source of
  truth that the frontend's TypeScript types mirror (see the root README).

`main.py` was reduced to: `load_dotenv`, the `FastAPI` app, CORS middleware,
`GET /health`, and the temporary `GET /test/openai` (now using `get_client()`).

**Done when** ✓ confirmed: `uvicorn --reload` picks up the moved code and both
`/health` and `/test/openai` still return 200 with valid bodies.

### 6. `POST /session` — done

The entry-point for every flow. The side panel calls this right after the
content script has extracted the page.

**Request — `SessionRequest` (`tutor/models.py`)**

```json
{
  "title": "Photosynthesis",
  "url": "https://en.wikipedia.org/wiki/Photosynthesis",
  "blocks": [
    { "id": "b1", "text": "Photosynthesis is a biological process..." },
    { "id": "b2", "text": "It mainly occurs in chloroplasts..." }
  ]
}
```

`blocks` are the ordered, top-to-bottom paragraphs the content script pulled
out via Readability. The `id`s are stable per-page anchors that downstream
endpoints (`/mode`, `/chat`) reference in their `anchor_ids` so the content
script knows which paragraphs to highlight.

**Response — `SessionResponse`**

```json
{
  "session_id": "084f22b285bf4b6cbd81c8f953d7ed9c",
  "header_summary": "Photosynthesis converts light energy into chemical energy in plants, producing glucose and oxygen from carbon dioxide and water."
}
```

**Pieces added**

- **`tutor/store.py`** — `Session` dataclass + `_sessions: dict[str, Session]`
  + `put()` / `get()`. Pure in-memory; restart wipes everything. (Extended
  in Step 7 with `chunks` and `embeddings`.)
- **`tutor/agent.py`** — `summarise_page(title, blocks) -> str`. Sends only
  the first 2000 chars of joined block text to `gpt-4o-mini` so this stays a
  small, fast call (max 60 tokens, temperature 0.3). (Extended in Step 8
  with the four mode prompts and `build_deck`.)
- **`main.py`** — `@app.post("/session", response_model=SessionResponse)`.
  Validates `blocks` is non-empty (400), generates `uuid4().hex`, calls
  `summarise_page()`, stores the `Session`, returns the response. The
  `RuntimeError` from `get_client()` is mapped to HTTP 500 with the
  "OPENAI_API_KEY is not set" message.

**Done when** ✓ confirmed:

- `POST /session` with a valid body → 200 with `session_id` and a sensible
  `header_summary`.
- Empty `blocks` → 400 `{"detail":"blocks must contain at least one item"}`.
- Missing required field → 422 from pydantic.

### 7. Chunking + RAG — done

```bash
uv add tiktoken numpy
```

`tutor/rag.py` exposes three functions plus a `Chunk` dataclass:

- **`chunk_blocks(blocks, target_tokens=500) -> list[Chunk]`** — greedy
  packing of consecutive blocks into ~500-token chunks (token count via
  `tiktoken.get_encoding("cl100k_base")`). Each chunk keeps the list of
  source `block_ids` it spans, so the LLM's grounding can be traced back
  to specific paragraphs for highlighting. Oversized single blocks are
  kept as their own chunk (no mid-paragraph splits in v1).
- **`embed_texts(texts) -> np.ndarray`** — one `text-embedding-3-small`
  call for the whole batch, returns an `(n, 1536)` `float32` matrix with
  rows L2-normalised so cosine ranking is a single dot product.
- **`retrieve(chunks, embeddings, query, k=4) -> list[Chunk]`** — embeds
  the query (one extra API call), computes `query @ embeddings.T`, and
  returns the top-`k` chunks in score order.

**`Session` (in `tutor/store.py`)** gains two fields populated at
`/session` creation time:

```python
chunks: list[Chunk] = field(default_factory=list)
embeddings: np.ndarray | None = None  # (len(chunks), 1536), L2-normalised
```

**`POST /session`** now does, after the header summary:

```python
chunks = chunk_blocks(payload.blocks)
chunk_embeddings = embed_texts([c.text for c in chunks])
```

…and stashes both on the `Session`. End-to-end latency for `/session` is
~4-5s on a small page (one chat completion + one embeddings call).

**Done when** ✓ confirmed: a heredoc verification script over an 8-block
photosynthesis page chunks correctly (8 blocks → 3 chunks at
target_tokens=120), produces an `(n, 1536)` matrix with row norms ≈ 1.0,
and retrieves the relevant chunk for queries like "what does chlorophyll
do?" and "explain the Calvin cycle" on top-1. Live `POST /session` still
returns 200 with the right shape and now stores chunks + embeddings
server-side.

### 8. `POST /mode` — done

Body: `{session_id, mode, lang}`. Modes: `teach | summarise | quiz | explain_simply`.

Each mode is a system prompt in `tutor/agent.py`. All four ask OpenAI for the
same structured shape:

```json
{
  "title": "...",
  "segments": [
    {
      "id": "s1",
      "say": "What the avatar should speak.",
      "slide": {
        "title": "Slide title",
        "bullets": ["...", "..."]
      },
      "anchor_ids": ["b1"]
    }
  ]
}
```

Only the `bullets` content varies by mode (driven by the per-mode system prompt):

| Mode | `bullets` content |
| --- | --- |
| **Teach me** | the key teaching points the avatar is currently saying |
| **Quiz me** | the question text (avatar reads it; slide displays it) |
| **Summarise** | summary bullets for that section |
| **Explain simply** | simplified explanation bullets |

`anchor_ids` are the stable block IDs from the original page extraction; the
side panel forwards them to the content script so the live page highlights as
the avatar speaks.

**Pieces added**

- **`tutor/agent.py`**:
  - `_DECK_JSON_SCHEMA` — strict OpenAI JSON schema mirroring the pydantic
    `Deck` shape (every field listed in `required`,
    `additionalProperties: false` everywhere). Strict mode means the model
    can never return malformed JSON, so no defensive parsing is needed.
  - `_DECK_INSTRUCTIONS` — the shared "5-8 segments, anchor_ids must be
    drawn from the chunk metadata, output language is `{lang}`" preamble.
  - `_TEACH_RULES`, `_SUMMARISE_RULES`, `_QUIZ_RULES`,
    `_EXPLAIN_SIMPLY_RULES` — per-mode pedagogy paragraphs prepended to
    the shared instructions, accessed via `_SYSTEM_PROMPTS[mode]`.
  - `build_deck(session, mode, lang) -> Deck` — packs every chunk in the
    session as labelled context (`Chunk c2 (from blocks b4,b5,b6): ...`),
    calls `gpt-4o-mini` with strict JSON schema response format
    (`temperature=0.4`), validates via `Deck.model_validate_json`, returns.
- **`main.py`**:
  - `@app.post("/mode", response_model=Deck)` — looks up the session via
    `store.get` (404 if missing), defensively rejects sessions with no
    chunks (409, unreachable in practice since `/session` always populates
    chunks), maps the API-key `RuntimeError` to 500.

Quiz mode behaviour: each segment is one Q+A pair. `say` reads the
question, writes "..." for a thinking beat, then reveals the answer with a
brief reasoning sentence. `slide.bullets` shows only the question (with
optional A/B/C/D options) so the user can read along while the avatar
reveals.

**Done when** ✓ confirmed:

- All four modes return a valid `Deck` in 5-15s on the photosynthesis test
  page (8 blocks → 3 chunks). Visible per-mode bullet shape difference:
  `teach` short teaching phrases; `summarise` gist bullets; `quiz` a
  question per segment with answer in `say`; `explain_simply` plain
  English with everyday analogies (recipe, kitchen, etc).
- Every segment's `anchor_ids` is a non-empty subset of the page's block
  IDs (`b1`-`b8` in the test).
- 404 fires for unknown `session_id`; 422 fires for unknown `mode` or
  `lang` literals (with helpful pydantic error message).

### 9. `POST /chat` — done

Body: `{session_id, text}`. Returns `{reply, highlight_anchor_ids}` in a
single HTTP response — there is no streaming protocol on the wire. The
avatar's TTS provides the perceived stream.

```json
// request
{ "session_id": "9f3b...", "text": "what does chlorophyll do?" }

// response
{
  "reply": "Chlorophyll is the green pigment in plant cells that absorbs light, mainly in the blue and red wavelengths. It plays a crucial role in photosynthesis by helping convert light energy into chemical energy stored in glucose.",
  "highlight_anchor_ids": ["b1", "b2", "b3"]
}
```

**Pieces added**

- **`tutor/agent.py`**:
  - `_CHAT_SYSTEM_PROMPT` — instructs the model to ground strictly in the
    SOURCE CHUNKS, refuse when absent, and keep the reply conversational
    (1-3 sentences, ~60 words max, no markdown) so the avatar can speak
    it cleanly via TTS.
  - `answer_question(session, text) -> tuple[str, list[str]]` — calls
    `retrieve(k=4)` from `tutor/rag.py`, packs the retrieved chunks as
    labelled context (`[blocks b4,b5,b6]\n<chunk text>`), asks
    `gpt-4o-mini` for a short reply (`max_tokens=150`, `temperature=0.4`),
    and computes the **ordered union of block_ids** across the retrieved
    chunks deterministically. The LLM does NOT pick anchors — the chunks
    are by definition what grounded the answer, so highlighting their
    blocks is correct by construction and frees the LLM from a second
    job.
- **`main.py`**:
  - `@app.post("/chat", response_model=ChatResponse)` — 400 on empty /
    whitespace `text`, 404 on missing `session_id`, 500 on missing API
    key. The route is intentionally simple; all the work is in
    `answer_question`.

**Refusal behaviour**

When the user asks something outside the page's content, the model
returns the literal phrase suggested in the system prompt:

```
Q: who won the 2026 Eurovision?
A: I can only help with what's on this page.
```

This is a soft refusal driven by the prompt; we don't enforce it in
code (no similarity-threshold gate). Acceptable for MVP — gpt-4o-mini
follows the instruction reliably.

**No `lang` field**

`ChatRequest` is just `{session_id, text}`. Phase 1 chat is English-only
because that's what the avatar speaks. Adding `lang` later is a
non-breaking pydantic extension when needed.

**Anchor scope on small pages**

On the photosynthesis test page (8 blocks → 3 chunks), `k=4` retrieves
all chunks and the anchor union covers `b1`-`b8`. On a real Wikipedia
article (30+ chunks) retrieval picks a much tighter set, so this
broadening is purely a small-corpus artefact, not a contract issue.

**Done when** ✓ confirmed:

- Three on-topic queries (chlorophyll, Calvin cycle, CAM plants) return
  sensible 1-3-sentence replies in 1-3s each, every reply has non-empty
  `highlight_anchor_ids`.
- Off-topic refusal probe (Eurovision) returns "I can only help with
  what's on this page." instead of hallucinating.
- 404 on bad `session_id`, 400 on empty `text`, 422 on missing `text`.

### 10. `POST /flashcards` — done

Body: `{session_id, n=8}` (`n` defaults to 8 via pydantic, capped at 1..20
in the route). Returns a top-level JSON array of `n` flashcards generated
from the page:

```json
[
  {
    "q": "What is photosynthesis and why is it important for life on Earth?",
    "a": "Photosynthesis is a biological process used by plants, algae, and some bacteria to convert light energy into chemical energy stored in glucose. It is the primary source of energy for nearly all life on Earth.",
    "source_chunk_id": "b1"
  },
  ...
]
```

**Pieces added**

- **`tutor/agent.py`**:
  - `_FLASHCARDS_SYSTEM_PROMPT` — instructs the model to produce exactly
    `{n}` cards, spread them across blocks rather than clustering on one
    section, and copy `source_chunk_id` verbatim from the bracketed
    block-ID prefix of the source blocks.
  - `_FLASHCARDS_JSON_SCHEMA` — strict OpenAI JSON schema. OpenAI's strict
    mode requires an **object root**, but our wire shape is a top-level
    array, so we ask the LLM for `{ "cards": [Flashcard, ...] }` and
    unwrap server-side. The HTTP response stays a plain JSON array per
    the contract in the root README.
  - `build_flashcards(session, n) -> list[Flashcard]` — packs every
    `session.blocks` entry as `[b3] <text>` labelled context, calls
    `gpt-4o-mini` with strict JSON schema response format
    (`temperature=0.4`), `json.loads` the content, and validates each
    card via `Flashcard.model_validate`.
- **`main.py`**:
  - `@app.post("/flashcards", response_model=list[Flashcard])` — 400 if
    `n` is outside `1..20` (a soft cap that keeps token cost predictable;
    raise later if needed), 404 on missing `session_id`, 409 on the
    defensive chunkless-session case, 500 on `RuntimeError` (missing API
    key).

**Why blocks instead of chunks**

Like `/mode`, flashcards must cover the **whole** page (not RAG retrieval),
so we feed every paragraph in. Empirically, labelling per-chunk
("`Chunk c1 (from blocks b1,b2,b3)`") leaks the `c*` ID into the response
because the LLM picks the first identifier it sees. Iterating
`session.blocks` directly and labelling each line as `[b1] <text>`,
`[b2] <text>`, ... gives the model unambiguous `b*`-only context. Coverage
is identical to "all chunks" since chunks are just groups of consecutive
blocks.

**`source_chunk_id` is actually a block ID**

The field name predates the chunk-vs-block split. Per the contract in the
root README and `frontend/CONCEPTS.md`, **the frontend never sees `c*`
IDs**. `source_chunk_id` carries the single most relevant `b*` ID — the
paragraph a learner should re-read to verify the answer — so the side
panel can offer a "see source" highlight that reuses the same anchor flow
as `/mode` and `/chat`.

**Done when** ✓ confirmed on the photosynthesis test page (8 blocks):

- `n: 5` → exactly 5 cards spanning 5 distinct blocks (e.g.
  `b1, b2, b3, b4, b7`), every `source_chunk_id` is a real `b*` ID.
- `n: 10` → exactly 10 cards covering all 8 blocks, with a couple of
  near-duplicate concepts re-using the same anchor.
- `n` omitted → 8 cards (pydantic default), one per block.
- `n: 0` and `n: 99` → 400 `{"detail":"n must be between 1 and 20"}`.
- Bad `session_id` → 404 `{"detail":"session_id not found"}`.

Latency is ~5-10s for `n=8`, similar to `/mode` since both are large
structured outputs.

## Done

Backend playbook is **10/10**. The full feature surface — `/health`,
`/test/openai`, `/session`, `/mode`, `/chat`, `/flashcards` — is now
exercisable end-to-end in Swagger UI alone, no frontend required. Next
phase is the Chrome extension: see [`../frontend/README.md`](../frontend/README.md)
and [`../frontend/CONCEPTS.md`](../frontend/CONCEPTS.md) for the spec.

The temporary `GET /test/openai` route can be deleted any time now — it
served its purpose during Steps 3-4 and is no longer needed for
diagnostics.

## Out of scope (handled later)

- Beyond Presence webhook (`POST /bey/llm`) — added when the keys are in hand.
  Reuses the agent.
- Auth / multi-user accounts.
- Persistent storage. Sessions are in-memory only and cleared when the server
  restarts.

## Layout

```
backend/
├── main.py              # FastAPI app, route registration only
├── pyproject.toml
├── .env                 # not committed
├── .env.example
└── tutor/
    ├── __init__.py
    ├── llm.py           # OpenAI client wrapper
    ├── models.py        # pydantic schemas (request/response shapes)
    ├── store.py         # in-memory Session store
    ├── rag.py           # Chunk, chunk_blocks, embed_texts, retrieve
    └── agent.py         # summarise_page + build_deck + answer_question
                         #   + build_flashcards (and their prompts/schemas)
```

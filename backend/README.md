# Tutor Backend

FastAPI service that powers the Tutor Chrome extension. It accepts a web page's
extracted text, chunks and embeds it, and serves four teaching modes
(**Teach me**, **Summarise**, **Quiz me**, **Explain simply**) plus a
free-chat WebSocket — all grounded in the page content. The frontend renders
the responses next to a Beyond Presence avatar and a synced slide deck.

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
| 7  | Chunking + RAG             | next   |
| 8  | `POST /mode`               | todo   |
| 9  | `POST /chat`               | todo   |
| 10 | `POST /flashcards`         | todo   |

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
  + `put()` / `get()`. Pure in-memory; restart wipes everything. Fields for
  `chunks` and `embeddings` will be added in Step 7.
- **`tutor/agent.py`** — `summarise_page(title, blocks) -> str`. Sends only
  the first 2000 chars of joined block text to `gpt-4o-mini` so this stays a
  small, fast call (max 60 tokens, temperature 0.3). Step 8 will grow this
  file with the four mode prompts.
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

### 7. Chunking + RAG (`tutor/rag.py`)

- `chunk(text, target_tokens=500)` using `tiktoken`
- `embed(texts) -> np.ndarray` with `text-embedding-3-small`
- `retrieve(session_id, query, k=4)` using numpy cosine similarity

```bash
uv add tiktoken numpy
```

**Done when** a script over a long article returns relevant chunks for a query.

### 8. `POST /mode`

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

Use OpenAI structured output (`response_format={"type":"json_schema",...}`) to
guarantee shape.

**Done when** `mode=summarise` returns valid JSON.

### 9. `POST /chat`

Body: `{session_id, text}`. Returns `{reply, highlight_anchor_ids}` in a single
HTTP response — there is no streaming protocol on the wire. The avatar's TTS
provides the perceived stream.

```json
// request
{ "session_id": "9f3b...", "text": "what does chlorophyll do?" }

// response
{
  "reply": "Chlorophyll is the green pigment...",
  "highlight_anchor_ids": ["b2"]
}
```

Pipeline: embed the user text → cosine-rank against the session's chunks →
take top-4 → stuff into the system prompt → call OpenAI → return reply plus
the anchor IDs of the chunks that grounded the answer.

**Done when** `curl -X POST localhost:8000/chat -d '{"session_id":"...","text":"what is X?"}'`
returns a JSON body with both `reply` and `highlight_anchor_ids` populated.

### 10. `POST /flashcards`

Body: `{session_id, n=8}`. Returns `[{q, a, source_chunk_id}]` generated from
the session content.

**Done when** the response is a clean JSON list of cards.

## Out of scope (handled later)

- Beyond Presence webhook (`POST /bey/llm`) — added when the keys are in hand.
  Reuses the agent.
- Auth / multi-user accounts.
- Persistent storage. Sessions are in-memory only and cleared when the server
  restarts.

## Layout (target, not all yet present)

```
backend/
├── main.py              # FastAPI app, route registration only
├── pyproject.toml
├── .env                 # not committed
├── .env.example
└── tutor/
    ├── __init__.py
    ├── llm.py           # OpenAI client wrapper
    ├── models.py        # pydantic schemas
    ├── rag.py           # chunk, embed, retrieve
    └── agent.py         # mode prompts + JSON-schema response shape
```

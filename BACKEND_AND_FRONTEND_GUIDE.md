# Tutor — Backend internals & frontend build guide

This document explains **how the Python backend works end-to-end** and **how to run / evolve the code under [`frontend/`](frontend/)**. For the full HTTP contract (request/response TypeScript shapes), see **[`README.md`](README.md)**. For step-by-step backend history, see **[`backend/README.md`](backend/README.md)**. For IDs, highlighting, and Beyond Presence patterns, see **[`frontend/CONCEPTS.md`](frontend/CONCEPTS.md)**.

---

## Part A — How the backend works

### Stack

| Piece | Role |
| ----- | ---- |
| **FastAPI** (`backend/main.py`) | HTTP routes, validation, HTTP errors |
| **`tutor/models.py`** | Pydantic schemas — API contract |
| **`tutor/llm.py`** | Singleton OpenAI client (`OPENAI_API_KEY` via `.env`) |
| **`tutor/store.py`** | In-memory `Session` map (`session_id` → session); **no database** |
| **`tutor/rag.py`** | Chunk text (~500 tokens), embed (`text-embedding-3-small`), cosine retrieval |
| **`tutor/agent.py`** | Prompts + `summarise_page`, `build_deck`, `answer_question`, `build_flashcards` |

### Lifecycle (mental model)

1. The **Chrome extension** (future panel) sends extracted **`blocks`** with stable **`b*`** IDs.
2. **`POST /session`** creates a **`session_id`**, summarises the page, **chunks + embeds** all content, stores everything in RAM.
3. **`POST /mode`** feeds **all chunks** to the LLM with mode-specific instructions → **`Deck`** (segments with **`say`**, **`slide`**, **`anchor_ids`**).
4. **`POST /chat`** embeds the **user question**, retrieves **top-k chunks**, grounds the reply, returns **`highlight_anchor_ids`** (deterministic from retrieved chunks — not picked by the LLM).
5. **`POST /flashcards`** feeds **all blocks** (labelled `[b1] text…`) to the LLM → **`n`** flashcards; `source_chunk_id` is a **`b*`** block id despite the name (historical).

Sessions vanish when **uvicorn** restarts.

### Request → modules map

```
POST /session   → summarise_page + chunk_blocks + embed_texts → store.put(Session)
POST /mode      → store.get → build_deck (uses ALL chunks)
POST /chat      → store.get → answer_question → retrieve(k=4) + chat completion
POST /flashcards → store.get → build_flashcards (uses ALL blocks; schema unwrap `{cards}`)
GET /health     → no OpenAI
GET /test/openai → smoke test (optional dev helper)
```

### RAG (retrieval) in plain language

- **Chunking**: consecutive paragraphs are packed until roughly ~500 tokens (`tiktoken`), yielding **`Chunk`** rows with ids like `c1`, `c2`… and **`block_ids`** listing which **`b*`** paragraphs each chunk spans.
- **Embeddings**: each chunk’s text is embedded once at session creation; vectors are **L2-normalised** so cosine similarity is a **dot product**.
- **Where retrieval is used**: only **`POST /chat`** (`retrieve(..., k=4)`). **`/mode`** and **`/flashcards`** intentionally use **full context** so outputs cover the whole page, not just one query neighbourhood.

### Teaching modes (`POST /mode`)

All four modes share the same **`Deck`** JSON shape. Only prompts differ (`tutor/agent.py`):

| `mode` | Behaviour (high level) |
| ------ | ---------------------- |
| `teach` | Pedagogical walkthrough; bullets = key teaching points |
| `summarise` | Condensed sections; bullets = note-style summary |
| `quiz` | One question per segment on slide; avatar reveals answer after `...` in `say` |
| `explain_simply` | Plain language + analogies; bullets stay simple |

Responses use OpenAI **structured output** (strict JSON schema) so pydantic validation stays reliable.

### Beyond Presence on the backend

**Not required for the current API.** The backend returns **text**. The extension passes **`say`** / **`reply`** strings into the Beyond Presence widget. A future **voice webhook** (`POST /bey/llm` or similar) would be backend work **only when** you adopt BP’s server-driven conversation pattern — see **`frontend/CONCEPTS.md`** (“Pattern A push” vs “Pattern B webhook”).

### Running & testing the backend

```bash
cd backend
uv sync
cp .env.example .env   # add OPENAI_API_KEY
uv run uvicorn main:app --reload
```

- API docs: **http://localhost:8000/docs**
- CORS allows **`chrome-extension://*`** and **`http://localhost`** / **`127.0.0.1`** (with ports) so the panel can `fetch` the API.

---

## Part B — Frontend folder: how to build & what you’re building

### Current state vs target

| Topic | Today (`frontend/`) | Target (per [`frontend/README.md`](frontend/README.md)) |
| ----- | ------------------- | ------------------------------------------------------- |
| Tooling | **Next.js 16** (`next dev` / `next build`) | **Vite + React + TypeScript + `@crxjs/vite-plugin`** |
| Purpose | App Router demo + placeholder `BeyondPresenceVideo` | **Chrome MV3 extension**: content script + background + side panel |
| Shipping | Not a loadable extension bundle | **`dist/`** loaded via **Load unpacked** |

The Next.js project is **boilerplate from before** the extension architecture was chosen. You can **develop UI prototypes** with it, but **shipping** the tutor requires migrating to **Vite + crxjs** (one build for panel + workers + content script).

### Build commands (today — Next.js in `frontend/`)

From the repository root:

```bash
cd frontend
npm install
npm run dev      # http://localhost:3000 — local web dev
npm run build    # production Next.js build
npm run start    # run production server after build
npm run lint     # eslint
```

These commands apply to the **existing** `package.json`. They do **not** yet produce a **`manifest.json`** Chrome extension unless you add that tooling yourself.

### Target workflow (after Vite + crxjs migration)

When the repo matches the layout in **`frontend/README.md`**:

```bash
cd frontend
npm install
npm run dev      # watch → outputs extension bundle (e.g. dist/)
```

Then in Chrome: **`chrome://extensions`** → **Developer mode** → **Load unpacked** → select **`frontend/dist`** (or whatever folder crxjs emits).

Keep the backend running separately:

```bash
cd backend && uv run uvicorn main:app --reload
```

### What the frontend must implement (checklist)

Use this as an implementation order (same as **`frontend/README.md`** “Suggested first slice”):

1. **MV3 manifest + side panel entry** that opens your UI.
2. **Content script**: Readability extraction → **`blocks`** with **`b*`** ids → message **`page:extracted`** via background.
3. **`POST /session`** — store **`session_id`**, show **`header_summary`**.
4. **Mode UI + `POST /mode`** — render deck segments (slides); wire **`anchor_ids`** to **`page:highlight`**.
5. **Slide deck state machine** — pause / prev / next / resume + BP **`say`** (see root **`README.md`**).
6. **`POST /chat`** — question box, speak **`reply`**, highlight **`highlight_anchor_ids`**.
7. **`POST /flashcards`** (optional UI) — study cards; **`source_chunk_id`** → highlight “source” paragraph.

Message shapes (`page:extracted`, `page:highlight`, etc.) are specified in **`README.md`** § Frontend integration contract.

### Useful references

| Doc | Contents |
| --- | -------- |
| [`README.md`](README.md) | Canonical API + Chrome message protocol + slide state diagram |
| [`backend/README.md`](backend/README.md) | Backend playbook (10/10), verification notes |
| [`frontend/README.md`](frontend/README.md) | Extension architecture, dependencies, migration notes |
| [`frontend/CONCEPTS.md`](frontend/CONCEPTS.md) | `b*` / `s*` / `c*` ids, three channels per segment, BP push vs webhook |

---

## Quick endpoint cheat sheet

| Method | Path | Purpose |
| ------ | ---- | ------- |
| GET | `/health` | Liveness |
| GET | `/test/openai` | Dev-only OpenAI ping |
| POST | `/session` | Create session + summary + chunks + embeddings |
| POST | `/mode` | Deck for `teach` \| `summarise` \| `quiz` \| `explain_simply` |
| POST | `/chat` | Grounded Q&A + highlight ids |
| POST | `/flashcards` | `n` flashcards (1–20); default `n=8` |

All POST bodies/responses are JSON; see **`README.md`** for exact fields.

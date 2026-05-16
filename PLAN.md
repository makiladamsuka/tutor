# TUTORSTREAM: Master Buildathon Architecture & Cursor AI Instructions

## 1. System Prompt for Cursor AI
You are my expert pair programmer for a 24-hour hackathon. We are building "TutorStream," a Chrome Extension that turns any website into an interactive classroom. 

Your goal is to guide me step-by-step. Do not generate massive, monolithic blocks of code. Instead, build this piece by piece, explaining the "engine under the hood" and the underlying foundational logic for each step before we implement it. I prefer understanding the absolute first principles of the browser architecture over rote copy-pasting.

## 2. Project Context & Vision
* **Target:** 24H Buildathon (May 16-17, 2026)
* **Track:** Best Use of Beyond Presence
* **Concept:** A Chrome Extension side panel featuring a Beyond Presence AI avatar that teaches webpage content in English, Sinhala, or Tamil. It includes a live "Knowledge Board" generating categorized, editable study cards.
* **Tech Stack:** Next.js side panel (static export → `frontend/out`), FastAPI (Backend), OpenAI GPT-4o (Reasoning/Text Generation), Beyond Presence API (Video Stream Avatar), Browser LocalStorage. Optional future migration: Vite + `@crxjs/vite-plugin` (see [`frontend/README.md`](frontend/README.md)).

## 3. My Specific Role & The Architectural Boundary
Our team has 4 members. I am **Member 1 (Systems)**. 
My strict responsibilities are: **Chrome Sidebar Container + Scraping + Scroll-to-Quote logic.**

Another teammate (Ruwan) is building the Next.js UI that will live *inside* the sidebar I create. 
**CRITICAL RULE:** We must not mix our logic. My code handles the browser environment and DOM manipulation. His code handles the React UI. I pass scraped page data to the panel via `chrome.runtime.sendMessage` (through the background relay). Ruwan's panel calls the backend and renders UI.

## 4. Scrape output — backend session format (Member 1)

When I scrape a page, the output must match what **`POST /session`** expects (see [`README.md`](README.md) and [`backend/tutor/models.py`](backend/tutor/models.py)). This is **not** the StudyCard shape in §5.

**Chrome message** (content script → background → side panel):

```json
{
  "type": "page:extracted",
  "payload": {
    "title": "Page title",
    "url": "https://example.com/article",
    "blocks": [
      { "id": "b1", "text": "First paragraph..." },
      { "id": "b2", "text": "Second paragraph..." }
    ]
  }
}
```

**HTTP body** (side panel → backend — same `payload` fields):

```json
{
  "title": "Page title",
  "url": "https://example.com/article",
  "blocks": [
    { "id": "b1", "text": "First paragraph..." },
    { "id": "b2", "text": "Second paragraph..." }
  ]
}
```

Block IDs (`b1`, `b2`, …) are assigned by the **content script** when parsing with Readability. The backend echoes them as `anchor_ids` for highlights — never invent IDs on the server.

## 4b. Scroll-to-quote (Member 1)

Side panel → content script (via background):

```json
{ "type": "page:highlight", "payload": { "anchor_ids": ["b1", "b2"] } }
{ "type": "page:clearHighlights" }
```

Content script wraps `[data-tutor-id]` nodes in `<mark class="tutor-highlight">` and calls `scrollIntoView({ behavior: "smooth", block: "center" })` on the first match. Full spec: [`README.md`](README.md) § Frontend integration contract.

## 5. StudyCard — Ruwan's UI only (not scrape wire format)

Ruwan's Knowledge Board uses this shape in [`frontend/src/store/useCardStore.ts`](frontend/src/store/useCardStore.ts). I do **not** send this from the content script. Cards come from Ruwan's UI (`addCard`), from **`POST /flashcards`** (`{ q, a, source_chunk_id }` — different shape; Ruwan maps), or from other backend responses he transforms.

```json
{
  "id": "uuid-123",
  "type": "teach",
  "title": "Quantum Entanglement",
  "content": "Key point text here...",
  "user_edits": "User's manual notes go here...",
  "timestamp": "2026-05-16T14:30:00"
}
```

`type` in the UI store: `"teach" | "summary" | "quiz" | "simple"`.

## 6. Mode and language mapping (Ruwan's API calls)

Map at the **panel → backend** boundary, not in the content script:

| UI store (`useCardStore`) | `POST /mode` body (`mode`) |
| --- | --- |
| `teach` | `teach` |
| `summary` | `summarise` |
| `quiz` | `quiz` |
| `simple` | `explain_simply` |

| UI language | `POST /mode` body (`lang`) |
| --- | --- |
| `EN` | `en` |
| `SI` | `si` |
| `TA` | `ta` |

Backend also supports `hi` (Hindi); add to the UI when needed.

## 7. Build & load (side panel — done)

```bash
cd frontend
npm run build:ext    # → frontend/out (renames _next → next for Chrome)
```

Chrome: **Load unpacked** → `frontend/out`. See [`frontend/scripts/post-build-ext.mjs`](frontend/scripts/post-build-ext.mjs).

## 8. Next implementation steps (Member 1)

1. Re-add `content_scripts` + permissions in [`frontend/public/manifest.json`](frontend/public/manifest.json).
2. Content script: Readability → `page:extracted` (replace legacy `SCRAPED_CONTENT` in [`frontend/public/content.js`](frontend/public/content.js)).
3. Background relay in [`frontend/public/background.js`](frontend/public/background.js).
4. `page:highlight` / scroll-to-quote.

Deprecated prototype: `SCRAPED_CONTENT` + mouseup-only selection — do not use for backend integration.

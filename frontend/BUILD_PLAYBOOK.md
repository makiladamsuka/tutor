# Frontend build playbook (steps 1–13)

This is the **step-by-step journal** for building the Tutor Chrome extension UI, in the same spirit as [`../backend/README.md`](../backend/README.md). Contracts live in the root [`README.md`](../README.md); concepts (IDs, BP push pattern, slide state machine) in [`CONCEPTS.md`](CONCEPTS.md).

## Demo goal (what “working” looks like for testing)

You open a **real article page** (start with **Wikipedia** or **MDN**). In the **side panel**:

1. Click **Scrape** (or **Use this page**) — the content script extracts paragraphs with stable **`b1`, `b2`, …** ids and sends them to the panel.
2. Click **Start session** (or auto-run after scrape) — panel calls **`POST /session`** → you see **`header_summary`** and store **`session_id`**.
3. You see buttons: **Teach**, **Summarise**, **Quiz me**, **Explain simply** — each calls **`POST /mode`** with that mode and shows the returned **deck** (title + segments / slides).
4. Optionally: **Chat** box → **`POST /chat`**; **Flashcards** → **`POST /flashcards`**.

If those calls succeed against **`http://localhost:8000`** (backend running), the **frontend is correctly talking to the backend**. Avatar (Beyond Presence) and polished highlighting can come **after** this vertical slice.

---

## Prerequisites

- **Node.js** LTS + npm (or pnpm).
- **Chrome**: `chrome://extensions` → Developer mode → Load unpacked.
- **Backend**: from [`../backend/README.md`](../backend/README.md) — `uv run uvicorn main:app --reload`; check [`GET /health`](http://localhost:8000/health) and `/docs`.

---

## Step 1 — Tooling and extension skeleton

**What:** Replace or supersede the current **Next.js** boilerplate with **Vite + React + TypeScript + [@crxjs/vite-plugin](https://crxjs.dev/vite-plugin)** so one build outputs a loadable **MV3** extension (`dist/`).

**Do:**

- `manifest_version: 3`, **side_panel** default path, **background** service worker entry, **content_scripts** for `https://*/*` (and `http` if you need it).
- `npm run dev` (watch) and `npm run build`.

**Done when:**

```bash
cd frontend && npm install && npm run build
```

Then Chrome → **`chrome://extensions`** → **Developer mode** → **Load unpacked** → select **`frontend/dist/`**. Click the extension’s toolbar icon: **Side panel** opens with placeholder title **“Tutor”** (no Chrome extension errors).

Verification on a tab: open **`https://en.wikipedia.org/wiki/Photosynthesis`** (or any article). Open DevTools **on that page’s console** (not the side panel): you should see **`[tutor] content script loaded`** once.

**Repo layout after Step 1:** [`manifest.config.ts`](manifest.config.ts), [`vite.config.ts`](vite.config.ts), [`src/sidepanel/`](src/sidepanel/) (React panel), [`src/background/index.ts`](src/background/index.ts), [`src/content/index.ts`](src/content/index.ts). Previous Next.js UI was removed; see [`STEP1_NOTE.md`](STEP1_NOTE.md).

---

## Step 2 — Background worker as message hub

**What:** Side panel and content script **cannot** message each other directly; the **service worker** relays everything.

**Do:**

- Typed messages: `{ type, payload }` (see root [`README.md`](../README.md) § Chrome protocol).
- Background receives from panel + content script; uses **`chrome.tabs.sendMessage(tabId, …)`** to target the active tab’s content script.

**Done when:**

```bash
cd frontend && npm run build
# Reload extension at chrome://extensions
```

| Check | Where |
| ----- | ----- |
| Panel ping | Side panel → **Ping background** → green status with `pong from background` and tab id |
| Background log | Extension card → **Service worker** → Console: `[tutor] ping from panel` |
| Content auto-ping | Open `https://en.wikipedia.org/...` with side panel open → **Content script** section shows URL |
| Relay to page | After panel ping, **page** DevTools console: `[tutor] content script received ping` |

**Code:** [`src/shared/messages.ts`](src/shared/messages.ts), [`src/shared/messaging.ts`](src/shared/messaging.ts), [`src/background/index.ts`](src/background/index.ts) (router + `chrome.tabs.sendMessage`).

---

## Step 3 — Content script on real pages

**What:** Script injects on pages like Wikipedia so Step 4 can run in context.

**Do:**

- Minimal inject + console marker on `document_idle`.
- Manifest `content_scripts` matches `http://*/*` and `https://*/*` (from Step 1).

**Already implemented:** Step 1 [`manifest.config.ts`](manifest.config.ts) + Step 2 [`src/content/index.ts`](src/content/index.ts) (`[tutor] content script loaded`, `hub:content-ping`). No separate bundle—this step is **sign-off + hardening**.

**Done when:**

```bash
cd frontend && npm run build
# Reload extension at chrome://extensions
```

| Check | Where |
| ----- | ----- |
| Inject log | Open `https://en.wikipedia.org/wiki/Photosynthesis` → **page** DevTools Console → `[tutor] content script loaded` with `host:` (once per navigation) |
| Panel sees inject | Side panel → **Injected on active tab** shows the Wikipedia URL (or **Refresh content status** with article tab focused) |
| Negative | `chrome://extensions` or `chrome://newtab` → no inject log; panel inject section stays empty |

**Next:** Step 4 (Readability + `page:extracted`).

---

## Step 4 — Scrape: Readability + `page:extracted`

**What:** This is your **Scrape** button flow: extract article text into **`blocks`**, assign **`b1`, `b2`, …**, tag DOM with **`data-tutor-id`**, keep **`Map<id, HTMLElement>`** for later highlights.

**Do:**

- Add **`@mozilla/readability`**; clone document, parse, split into blocks.
- Send **`{ type: "page:extracted", payload: { title, url, blocks } }`** via background to panel.

**Done when:**

```bash
cd frontend && npm run build
# Reload extension at chrome://extensions
```

| Check | Expected |
| ----- | ---------- |
| Wikipedia Scrape | Panel shows title + **N blocks** (N > 0) + first 3 preview lines |
| Page DOM | Article paragraphs have `data-tutor-id="b1"` etc. (inspect in DevTools) |
| Payload shape | `{ title, url, blocks: [{ id, text }] }` — same as **`POST /session`** body |
| Re-scrape | Second Scrape refreshes tags without duplicate ids |

**Code:** [`src/content/extract.ts`](src/content/extract.ts), [`src/content/index.ts`](src/content/index.ts) (`page:requestExtract`), background `page:extracted` forward, panel **Scrape this page**.

---

## Step 5 — API client + base URL

**What:** One module that knows **`API_BASE = http://localhost:8000`** and wraps **`fetch`** for JSON.

**Do:**

- Helpers: `postSession`, `postMode`, `postChat`, `postFlashcards` (optional Zod validation).

**Done when:**

```bash
# terminal 1
cd backend && uv run uvicorn main:app --reload

# terminal 2
cd frontend && npm run build
# Reload extension at chrome://extensions
```

| Check | Expected |
| ----- | ---------- |
| Health | Side panel → **Check health** → “Backend ok” |
| Session | **Test POST /session** (after scrape or fallback) → `session_id` + `header_summary` |
| Swagger | Same body succeeds at http://localhost:8000/docs |

**Code:** [`src/shared/api.ts`](src/shared/api.ts), [`src/shared/apiTypes.ts`](src/shared/apiTypes.ts), panel **Backend** section in [`src/sidepanel/App.tsx`](src/sidepanel/App.tsx).

---

## Step 6 — Wire Scrape → session

**What:** Primary flow: **Scrape** then **Start session** → **`POST /session`** with scraped `{ title, url, blocks }`. Store **`session_id`**, show **`header_summary`**. Mode buttons visible but disabled until session exists (wired in Step 7).

**Do:**

- Panel: **Session** section with **Start session** (scraped payload only; no fallback on primary button).
- Clear session state on new **`page:extracted`** (re-scrape invalidates old session).
- **Modes** row: Teach, Summarise, Quiz me, Explain simply — `disabled` until `session_id`.
- **Debug** `<details>`: Check health, Test POST /session (fallback), ping/inject tools.
- Scrape button: clear **Scraping…** in `finally` after background ack (not only on `page:extracted`).

**Verify:**

```bash
cd backend && uv run uvicorn main:app --reload
cd frontend && npm run build && npm run lint
# Reload extension in chrome://extensions
```

| Check | Expected |
|-------|----------|
| No scrape | **Start session** disabled; hint to scrape first |
| Scrape → Start session | **`header_summary`** prominent; **`session_id`** shown |
| Re-scrape | Previous session cleared until **Start session** again |
| Modes | Four buttons visible, disabled until session |
| Backend | `http://localhost:8000/docs` — session created; modes in Step 7 |

**Done when:** Wikipedia → Scrape → Start session (large pages may wait on embeddings) → read summary → mode buttons enable; build + lint pass.

---

## Step 7 — Mode buttons → `POST /mode`

**What:** Buttons **Teach**, **Summarise**, **Quiz me**, **Explain simply** call **`POST /mode`** with `{ session_id, mode, lang: "en" }`. Panel renders the returned **`Deck`** (all segments stacked; no Prev/Next yet).

**Do:**

- `handleMode` → `postMode`; store `deck`, `activeMode`; loading + error UX.
- Clear deck on re-scrape and on new **Start session**.
- [`DeckView.tsx`](src/sidepanel/DeckView.tsx): `title`, each `slide.title` + `slide.bullets`; segment `id` for debug. **`say`** not shown (Step 10).

**Verify:**

```bash
cd backend && uv run uvicorn main:app --reload
cd frontend && npm run build && npm run lint
# Reload extension
```

| Check | Expected |
|-------|----------|
| No session | Mode buttons disabled |
| Click Teach | Loading → deck with title + 5–8 segments |
| Click same mode again | Near-instant (backend cache hit; same deck content) |
| Click Quiz | Different bullets (questions, not teach points) |
| Re-scrape | Deck cleared until new session + mode click |
| Backend | `/docs` POST /mode 200 with same `session_id` |

**Done when:** Wikipedia → Scrape → Start session → each mode (~5–15s) shows a distinct deck; build + lint pass. **No avatar** — proves frontend ↔ backend for modes.

---

## Step 8 — Slide navigation state machine (without TTS)

**What:** One slide at a time with **Prev / Next / Resume** and **Speaking / Held** state ([`deckPlayback.ts`](src/sidepanel/deckPlayback.ts), [`DeckPlayer.tsx`](src/sidepanel/DeckPlayer.tsx)). `say` logged to console until Step 10.

**Do:**

- `segmentIndex` + `playbackState`; reset when deck loads or clears.
- Prev/Next → **Held**, change slide, `avatar.pause()` stub; Resume → **Speaking**, log current `say`.
- No auto-advance until Step 10 `audio_complete`.

**Verify:**

| Check | Expected |
|-------|----------|
| Load Teach deck | Slide 1 of N, status **Speaking**, console `say` for s1 |
| Next | Slide 2, **Held**, no new `say` until Resume |
| Resume | **Speaking**, console `say` for current slide |
| Prev at slide 1 | Button disabled |
| Next at last slide | Button disabled |
| New mode | Index resets to 1, fresh deck |

**Done when:** Manual segment navigation matches README state machine; build + lint pass.

---

## Step 9 — Highlights: `page:highlight` / `clearHighlights`

**What:** When the active deck segment changes, panel sends **`page:highlight`** with that segment’s **`anchor_ids`**; content script marks `[data-tutor-id]` nodes and scrolls the first match.

**Do:**

- [`frontend/src/content/highlight.ts`](src/content/highlight.ts) — `highlightBlocks`, `clearHighlights`, `.tutor-highlight` styles.
- Background forwards `page:highlight` / `page:clearHighlights` to the active http(s) tab.
- [`deckPlayback.ts`](src/sidepanel/deckPlayback.ts) — `highlightAnchors` / `clearPageHighlights`; called from `speakSegment`, Prev/Next, Resume; clear on `clearDeck`.

**Verify:**

```bash
cd frontend && npm run build && npm run lint
# Reload extension
```

| Check | Expected |
|-------|----------|
| Scrape Wikipedia | `data-tutor-id` on paragraphs (DevTools on article tab) |
| Load Teach, slide 1 | Yellow marks on relevant paragraphs; page scrolls |
| Next / Prev | Highlights move to new segment’s blocks |
| Resume | Highlights refresh for current slide |
| Re-scrape | Old marks cleared (`clearPageHighlights` in `clearDeck`) |

**Done when:** Wikipedia → Scrape → session → mode → highlights follow slide changes on the **article tab**; build + lint pass.

---

## Step 10 — Beyond Presence (optional for “backend test”; required for full product)

**What:** Replace logging **`say`** with **`avatar.say(...)`**; Prev/Next → **`pause`**; on **`audio_complete`** advance segment when auto-playing.

**Done when:** Avatar reads each segment in sync with slides + highlights.

---

## Step 11 — Chat → `POST /chat`

**What:** Input box → **`POST /chat`** → show **`reply`**; speak via BP if Step 10 done; send **`highlight_anchor_ids`** to content script.

**Done when:** Question about page content returns grounded reply + highlights.

---

## Step 12 — Flashcards → `POST /flashcards` (optional)

**What:** Button + **`n`** input → **`POST /flashcards`** → list or flip UI; **`source_chunk_id`** is a **`b*`** block id — use for “show source” highlight.

**Done when:** Cards render and source ids highlight correctly.

---

## Step 13 — Polish + journal hygiene

**What:** Loading states, error toasts (network, 404 session), disable double-submit on expensive routes; optional **`chrome.storage.local`** for notes.

**Do:**

- Update this file or [`README.md`](README.md) **Status** as steps complete.

**Done when:** Stable demo: Wikipedia → Scrape → session → each mode button → (optional) chat — all against local backend.

---

## Quick reference: your test clicks vs API

| UI action        | Backend call        | Main proof                         |
| ---------------- | ------------------- | ---------------------------------- |
| Scrape           | (none; local only)  | `blocks` ready for session         |
| Start session    | `POST /session`     | `session_id`, `header_summary`    |
| Teach / … modes | `POST /mode`        | `Deck` JSON                        |
| Chat             | `POST /chat`        | `reply`, `highlight_anchor_ids`    |
| Flashcards       | `POST /flashcards`  | Array of `{ q, a, source_chunk_id }` |

---

## Related docs

| File | Purpose |
| ---- | ------- |
| [`README.md`](../README.md) | HTTP + message protocol reference |
| [`CONCEPTS.md`](CONCEPTS.md) | `b*` / `s*` / BP push vs webhook |
| [`BACKEND_AND_FRONTEND_GUIDE.md`](../BACKEND_AND_FRONTEND_GUIDE.md) | Backend overview + frontend migration notes |

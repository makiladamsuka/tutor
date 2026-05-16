# Tutor frontend — setup guide

How to install dependencies, build the Chrome extension, load it in Chrome, and run it against the local backend.

For architecture and API contracts, see [`README.md`](README.md) and [`BUILD_PLAYBOOK.md`](BUILD_PLAYBOOK.md).

---

## Prerequisites

| Requirement | Notes |
|-------------|--------|
| **Node.js** | LTS (18+ or 20+). Includes **npm**. Check: `node -v` and `npm -v`. |
| **Google Chrome** (or Chromium) | MV3 extensions; side panel support. |
| **Backend** (for full flow) | [`../backend/README.md`](../backend/README.md) — FastAPI on `http://localhost:8000`. |

The extension UI builds without the backend, but **Scrape → Start session → modes** need the API running.

---

## 1. Install dependencies

From the repo root:

```bash
cd frontend
npm install
```

This installs React, Vite, `@crxjs/vite-plugin`, Readability, and TypeScript tooling (`package-lock.json` is committed).

---

## 2. npm scripts

Run these from the **`frontend/`** directory:

| Command | What it does |
|---------|----------------|
| `npm run dev` | **Development** — Vite watch mode. Rebuilds the extension on file changes. Use while coding. |
| `npm run build` | **Production build** — TypeScript check (`tsc --noEmit`) then Vite → output in **`dist/`**. |
| `npm run lint` | ESLint over the frontend source. |
| `npm run preview` | Vite preview server (optional; **not** how you test the extension — use Load unpacked below). |

**Typical workflow**

```bash
# One-off production build
npm run build

# Or watch while developing
npm run dev
```

After every build (or when `dev` recompiles), **reload the extension** in Chrome (see below).

---

## 3. Load the extension in Chrome

The loadable extension is the **`frontend/dist/`** folder (created by `npm run build` or `npm run dev`).

1. Open **`chrome://extensions`** in Chrome.
2. Turn on **Developer mode** (top-right toggle).
3. Click **Load unpacked**.
4. Select the **`dist`** folder inside this project:
   ```
   /path/to/tutor/frontend/dist
   ```
5. Pin the extension (puzzle icon → Tutor → pin) if you want quick access.

**Open the side panel**

- Click the Tutor toolbar icon, or  
- Right-click the icon → open side panel (wording may vary by Chrome version).

You should see the **Tutor** panel (subtitle shows the current build step, e.g. Step 8).

---

## 4. After you change code

1. Save your edits.
2. Run **`npm run build`** (or keep **`npm run dev`** running).
3. Go to **`chrome://extensions`**.
4. Click **Reload** on the Tutor card (circular arrow).

If behavior looks stale, also **hard-refresh the article tab** (Wikipedia) or close and reopen the side panel.

---

## 5. Run with the backend (recommended)

In a **second terminal**, from the repo:

```bash
cd backend
cp .env.example .env   # once: add OPENAI_API_KEY
uv run uvicorn main:app --reload
```

Check:

- [http://localhost:8000/health](http://localhost:8000/health) → `{"ok":true}`
- [http://localhost:8000/docs](http://localhost:8000/docs) → Swagger UI

The panel calls **`http://localhost:8000`** (see [`src/shared/api.ts`](src/shared/api.ts)). CORS is already configured for `chrome-extension://` origins.

---

## 5b. Beyond Presence avatar (Step 10, optional)

```bash
cd frontend
cp .env.example .env
# Edit .env: VITE_BEY_AGENT_ID=<your-agent-id from https://app.bey.chat/myAgents → Embed>
npm run build
```

Reload the extension after changing `.env`. Without an agent id, slides still **speak** via browser TTS; the iframe shows a placeholder.

---

## 6. Quick manual test

1. Open an article, e.g. [Photosynthesis (Wikipedia)](https://en.wikipedia.org/wiki/Photosynthesis).
2. **Focus that tab** (not the side panel).
3. Open the Tutor side panel.
4. **Scrape this page** → block count and previews.
5. **Start session** → summary + `session_id` (may take a while on long pages).
6. Click a mode (**Teach**, **Summarise**, etc.) → wait for the deck (first request can take ~30–60s on large pages; repeat clicks use backend cache).
7. Click a mode → hear each slide spoken; watch auto-advance (Step 10).
8. Use **Prev / Next / Resume** — Next/Prev hold speech; Resume continues.

**Content script check:** On the article tab, DevTools → Console → you should see `[tutor] content script loaded` after reload.

**Panel debug:** Expand **Debug** in the panel → **Ping background**, **Check health**.

---

## 7. Troubleshooting

| Problem | Try |
|---------|-----|
| **Load unpacked** greyed out or fails | Run `npm run build` first; select **`frontend/dist`**, not `frontend/`. |
| **Receiving end does not exist** on scrape | Reload extension; focus an **http(s)** article tab; reload the Wikipedia tab. |
| **Failed to fetch** in panel | Start backend: `cd backend && uv run uvicorn main:app --reload`. |
| Changes not visible | `npm run build` → Reload extension on `chrome://extensions`. |
| Side panel empty / errors | DevTools → right-click panel → Inspect; check Console for errors. |
| **Scraping…** stuck | Refocus article tab, scrape again; check content script console. |
| Mode stuck on **Loading…** | Wait on large pages; check backend logs and `OPENAI_API_KEY`. |

---

## 8. Project layout (short)

```
frontend/
├── dist/                 # Build output — load THIS in Chrome
├── manifest.config.ts    # MV3 manifest (crxjs)
├── vite.config.ts
├── package.json
├── src/
│   ├── sidepanel/        # React UI (App.tsx, DeckPlayer, …)
│   ├── background/       # Service worker message hub
│   ├── content/          # Readability scrape + highlights
│   ├── sidepanel/avatar/ # BP iframe + browser TTS (Step 10)
│   └── shared/           # API client, messages, types
├── SETUP.md              # This file
├── BUILD_PLAYBOOK.md     # Step-by-step build journal
└── README.md             # Full frontend spec
```

---

## 9. Optional: dev vs production

- **`npm run dev`** — faster iteration; `dist/` updates on save; still reload the extension in Chrome after changes.
- **`npm run build`** — stricter (TypeScript + optimized bundle); use before sharing or committing.

Always run **`npm run lint`** before opening a PR:

```bash
npm run lint
```

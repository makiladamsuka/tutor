# Tutor Frontend

The user-facing side of the Tutor product: a Chrome MV3 extension that opens
a side panel with a Beyond Presence avatar, syncs a live **Knowledge Board** with the avatar's
speech, allows inline editing for categorized exports, and highlights paragraphs on the live page as the avatar walks
through them.

> **Backend / API status:** [`../backend/README.md`](../backend/README.md)
> **Full product plan + phasing:** [`../.cursor/plans/interactive-wiki-tutor_1e075354.plan.md`](../.cursor/plans/interactive-wiki-tutor_1e075354.plan.md)
> **Canonical contract:** [`../README.md`](../README.md) — this file repeats
> the frontend-relevant parts so you don't have to bounce between docs.

## What you're building

A Chrome MV3 extension with three runtime pieces:

1. **Content script** — runs inside every page. Uses Mozilla's
   [Readability.js](https://github.com/mozilla/readability) to extract clean
   article text into ordered "blocks" with stable IDs, tags the live DOM
   with `data-tutor-id` markers, and accepts highlight commands.
2. **Background service worker** — relays messages between the content
   script and the side panel (Chrome doesn't let them talk directly).
3. **Side panel** — Next.js/React app. Renders the avatar widget (Beyond Presence),
   the Knowledge Board (study cards), mode buttons, the chat box, and handles categorized exports. Calls
   the FastAPI backend over HTTP.

```mermaid
flowchart LR
    Page["Web page DOM"] -->|Readability| CS[Content script]
    CS <-->|chrome.runtime| BG[Background worker]
    BG <-->|chrome.runtime| Panel[Side panel React app]
    Panel <-->|"fetch (CORS)"| BE[FastAPI backend]
    Panel --> Avatar[Beyond Presence widget]
    Panel <-->|"Save/Load Cards"| LS[(Chrome LocalStorage)]
    BG -->|highlight ids| CS
    CS -->|"<mark> + scrollIntoView"| Page
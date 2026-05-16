# tutor

A Chrome side-panel extension where a Beyond Presence avatar tutor teaches you
whatever web page you're on. Auto-reads the page, offers four teaching modes
(**Teach me**, **Summarise**, **Quiz me**, **Explain simply**), supports free
chat, and shows synced slides with notes that you can pause and rewind through
like a real lecture.

## Repository layout

- [`backend/`](backend/) — FastAPI service. OpenAI for chat + embeddings,
  numpy for retrieval, WebSockets for streaming. See
  [`backend/README.md`](backend/README.md) for the build playbook.
- [`frontend/`](frontend/) — React + Vite + TypeScript side-panel UI. Same
  bundle ships inside the Chrome MV3 extension.

## Plan

The full product plan, priorities (MUST / SHOULD / NICE), demo script, and
phasing live in
[`.cursor/plans/interactive-wiki-tutor_1e075354.plan.md`](.cursor/plans/interactive-wiki-tutor_1e075354.plan.md).

## Status

Backend is at Step 2 of 10 (Hello FastAPI working). See
[`backend/README.md`](backend/README.md) for what's next.

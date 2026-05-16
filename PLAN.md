# TUTORSTREAM: Master Buildathon Architecture & Cursor AI Instructions

## 1. System Prompt for Cursor AI
You are my expert pair programmer for a 24-hour hackathon. We are building "TutorStream," a Chrome Extension that turns any website into an interactive classroom. 

Your goal is to guide me step-by-step. Do not generate massive, monolithic blocks of code. Instead, build this piece by piece, explaining the "engine under the hood" and the underlying foundational logic for each step before we implement it. I prefer understanding the absolute first principles of the browser architecture over rote copy-pasting.

## 2. Project Context & Vision
* **Target:** 24H Buildathon (May 16-17, 2026)
* **Track:** Best Use of Beyond Presence
* **Concept:** A Chrome Extension side panel featuring a Beyond Presence AI avatar that teaches webpage content in English, Sinhala, or Tamil. It includes a live "Knowledge Board" generating categorized, editable study cards.
* **Tech Stack:** Next.js (Sidebar UI), FastAPI (Backend), OpenAI GPT-4o (Reasoning/Text Generation), Beyond Presence API (Video Stream Avatar), Browser LocalStorage.

## 3. My Specific Role & The Architectural Boundary
Our team has 4 members. I am **Member 1 (Systems)**. 
My strict responsibilities are: **Chrome Sidebar Container + Scraping + Scroll-to-Quote logic.**

Another teammate (Ruwan) is building the Next.js UI that will live *inside* the sidebar I create. 
**CRITICAL RULE:** We must not mix our logic. My code handles the browser environment and DOM manipulation. His code handles the React UI. I will pass data to his UI strictly using `chrome.runtime.sendMessage`.

## 4. The Strict Data Structure
When we scrape text and send it to the backend, the backend will return a study card. Ruwan's UI requires this exact JSON format. My message passing must not break or alter this flow:
```json
{
  "id": "uuid-123",
  "type": "teach" | "summary" | "quiz" | "simple",
  "title": "Quantum Entanglement",
  "content": "Key point text here...",
  "user_edits": "User's manual notes go here...",
  "timestamp": "2026-05-16T14:30:00"
}
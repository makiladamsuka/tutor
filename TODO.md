# TutorStream - Member 2 (Frontend) Task List

## 1. Project Setup & Base UI
- [ ] Initialize Next.js project.
- [ ] Configure Next.js to run as a Chrome Extension Side Panel.
- [ ] Create the main layout (Video container top, Knowledge Board bottom, Control toggles).

## 2. Tagged State Management (The "Knowledge Board")
- [ ] Define TypeScript interface for the `StudyCard` object (id, type, title, content, user_edits, timestamp).
- [ ] Set up global state management (e.g., Zustand or React Context) for the cards.
- [ ] Implement Browser `LocalStorage` syncing for the state so data persists.
- [ ] Build the `Card` UI component.
- [ ] Implement inline editing on the `Card` component (updating the `user_edits` property).
- [ ] Build Mode toggles (Teach Me, Summarize, Quiz Me, Simply).
- [ ] Build Language toggles (English, Sinhala, Tamil).

## 3. Beyond Presence Video Component
- [ ] Integrate the Beyond Presence API/SDK.
- [ ] Build the real-time video streaming component (Target: Avatar alive by 1 PM).
- [ ] Set up listeners/props to receive sentiment data from the backend.
- [ ] Trigger micro-expressions based on sentiment data (e.g., empathetic look).
- [ ] Implement Idle Animations ("Empathetic Listening" - blinking/tilting head when user types/reads).
- [ ] Implement Contextual Backgrounds (change background based on current website context).

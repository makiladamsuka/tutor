/** HTTP API types — mirror backend/tutor/models.py */

import type { Block } from "./messages";

export type { Block };

export type Mode = "teach" | "summarise" | "quiz" | "explain_simply";
export type Lang = "en" | "hi" | "si" | "ta";

export type SessionRequest = {
  title: string;
  url: string;
  blocks: Block[];
};

export type SessionResponse = {
  session_id: string;
  header_summary: string;
};

export type ModeRequest = {
  session_id: string;
  mode: Mode;
  lang?: Lang;
  regenerate?: boolean;
};

export type Slide = {
  title: string;
  bullets: string[];
};

export type Segment = {
  id: string;
  say: string;
  slide: Slide;
  anchor_ids: string[];
};

export type Deck = {
  title: string;
  segments: Segment[];
};

export type ChatRequest = {
  session_id: string;
  text: string;
};

export type ChatResponse = {
  reply: string;
  highlight_anchor_ids: string[];
};

export type FlashcardRequest = {
  session_id: string;
  n?: number;
  regenerate?: boolean;
};

export type Flashcard = {
  q: string;
  a: string;
  source_chunk_id: string;
};

export type HealthResponse = {
  ok: boolean;
};

/** GET /api/avatars */
export type AvatarListItem = {
  id: string;
  label: string;
  image_url?: string | null;
};

export type AvatarListResponse = {
  default_id: string;
  avatars: AvatarListItem[];
};

/** POST /api/create-call — Beyond Presence + LiveKit (avatar.py) */
export type CreateCallRequest = {
  deck: Deck;
  name?: string;
  /** Catalog id from GET /api/avatars */
  avatar_id?: string;
};

export type CreateCallResponse = {
  call_id: string;
  livekit_url: string;
  livekit_token: string;
  agent_id?: string | null;
};

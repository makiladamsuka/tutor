/** Backend HTTP client (Step 5). */

import type {
  ChatRequest,
  ChatResponse,
  Deck,
  Flashcard,
  FlashcardRequest,
  HealthResponse,
  ModeRequest,
  SessionRequest,
  SessionResponse,
} from "./apiTypes";

export const API_BASE = "http://localhost:8000";

type FastApiErrorBody = {
  detail?: string | Array<{ msg?: string }>;
};

function formatApiError(status: number, body: unknown): string {
  if (body && typeof body === "object" && "detail" in body) {
    const detail = (body as FastApiErrorBody).detail;
    if (typeof detail === "string") {
      return `${status}: ${detail}`;
    }
    if (Array.isArray(detail)) {
      const msg = detail.map((d) => d.msg).filter(Boolean).join("; ");
      if (msg) {
        return `${status}: ${msg}`;
      }
    }
  }
  return `${status}: request failed`;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  const text = await response.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    data = text;
  }

  if (!response.ok) {
    throw new Error(formatApiError(response.status, data));
  }

  return data as T;
}

export function getHealth(): Promise<HealthResponse> {
  return apiFetch<HealthResponse>("/health");
}

export function postSession(body: SessionRequest): Promise<SessionResponse> {
  return apiFetch<SessionResponse>("/session", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function postMode(body: ModeRequest): Promise<Deck> {
  return apiFetch<Deck>("/mode", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function postChat(body: ChatRequest): Promise<ChatResponse> {
  return apiFetch<ChatResponse>("/chat", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function postFlashcards(
  body: FlashcardRequest,
): Promise<Flashcard[]> {
  return apiFetch<Flashcard[]>("/flashcards", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const API_BASE = "http://localhost:8000";

export type SessionPayload = {
  title: string;
  url: string;
  blocks: Array<{ id: string; text: string }>;
};

export type SessionResponse = {
  session_id: string;
  header_summary: string;
};

export async function createSession(
  body: SessionPayload
): Promise<SessionResponse> {
  const res = await fetch(`${API_BASE}/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(detail || `HTTP ${res.status}`);
  }

  return res.json() as Promise<SessionResponse>;
}

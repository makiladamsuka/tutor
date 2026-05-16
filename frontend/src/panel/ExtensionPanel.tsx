import { useCallback, useEffect, useState } from "react";
import { createSession, type SessionPayload } from "../lib/api";

type Status =
  | { kind: "idle" }
  | { kind: "extracting" }
  | { kind: "extracted"; blocks: number; title: string }
  | { kind: "session"; sessionId: string; headerSummary: string; blocks: number }
  | { kind: "error"; message: string };

export default function ExtensionPanel() {
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const handleExtracted = useCallback(async (payload: SessionPayload) => {
    if (payload.blocks.length === 0) {
      setStatus({
        kind: "error",
        message: "No readable content found on this page.",
      });
      return;
    }

    setStatus({
      kind: "extracted",
      blocks: payload.blocks.length,
      title: payload.title,
    });

    try {
      const session = await createSession(payload);
      setStatus({
        kind: "session",
        sessionId: session.session_id,
        headerSummary: session.header_summary,
        blocks: payload.blocks.length,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to reach backend";
      setStatus({
        kind: "error",
        message: `Scraped ${payload.blocks.length} blocks, but backend error: ${message}`,
      });
    }
  }, []);

  useEffect(() => {
    if (typeof chrome === "undefined" || !chrome.runtime?.onMessage) {
      return;
    }

    const listener = (message: {
      type?: string;
      payload?: SessionPayload;
    }) => {
      if (message?.type === "page:extracted" && message.payload) {
        void handleExtracted(message.payload);
      }
    };

    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [handleExtracted]);

  const activate = () => {
    setStatus({ kind: "extracting" });

    if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
      setStatus({
        kind: "error",
        message: "Chrome extension APIs are not available.",
      });
      return;
    }

    const runExtract = (tabId?: number) => {
      chrome.runtime.sendMessage(
        { type: "page:extract", tabId },
        (response) => {
          if (chrome.runtime.lastError) {
            setStatus({
              kind: "error",
              message:
                chrome.runtime.lastError.message ?? "Message failed",
            });
            return;
          }
          if (response?.error) {
            setStatus({ kind: "error", message: String(response.error) });
            return;
          }
          if (response?.payload) {
            void handleExtracted(response.payload as SessionPayload);
          }
        }
      );
    };

    if (chrome.tabs?.query) {
      chrome.tabs.query(
        { active: true, lastFocusedWindow: true },
        (tabs) => {
          runExtract(tabs[0]?.id);
        }
      );
    } else {
      runExtract();
    }
  };

  return (
    <>
      <button
        type="button"
        className="btn"
        onClick={activate}
        disabled={status.kind === "extracting"}
      >
        {status.kind === "extracting"
          ? "Extracting…"
          : "Activate on this page"}
      </button>

      {status.kind === "extracting" && (
        <p className="muted">
          Scraping the active tab… (first time? refresh the page tab)
        </p>
      )}

      {status.kind === "extracted" && (
        <p className="hint">
          Extracted {status.blocks} blocks from &ldquo;{status.title}&rdquo;.
          Sending to backend…
        </p>
      )}

      {status.kind === "session" && (
        <div className="card">
          <p className="card-meta">
            {status.blocks} blocks · session {status.sessionId.slice(0, 8)}…
          </p>
          <p className="card-summary">{status.headerSummary}</p>
        </div>
      )}

      {status.kind === "error" && <p className="error">{status.message}</p>}

      {status.kind === "idle" && (
        <p className="muted">
          Open a readable article (e.g. Wikipedia), then activate to scrape and
          start a tutoring session.
        </p>
      )}
    </>
  );
}

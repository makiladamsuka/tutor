import { useCallback, useEffect, useState } from "react";
import { getHealth, postSession } from "../shared/api";
import type { SessionRequest } from "../shared/apiTypes";
import type { PageExtractedPayload } from "../shared/messages";
import {
  onBackgroundMessage,
  sendToBackground,
  SERVICE_WORKER_HINT,
} from "../shared/messaging";

const FALLBACK_SESSION_BODY: SessionRequest = {
  title: "Tutor API test",
  url: "https://example.com/test",
  blocks: [
    { id: "b1", text: "Photosynthesis converts light energy into chemical energy." },
    { id: "b2", text: "Chlorophyll in chloroplasts absorbs light for the process." },
  ],
};

function formatError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/Receiving end does not exist/i.test(msg)) {
    return `${msg}\n\n${SERVICE_WORKER_HINT}`;
  }
  if (/Failed to fetch/i.test(msg)) {
    return `${msg}\n\nIs the backend running? cd backend && uv run uvicorn main:app --reload`;
  }
  return msg;
}

function truncate(text: string, max = 120): string {
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, max)}…`;
}

export default function App() {
  const [pong, setPong] = useState<string | null>(null);
  const [contentPing, setContentPing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pinging, setPinging] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [scrapeError, setScrapeError] = useState<string | null>(null);
  const [extracted, setExtracted] = useState<PageExtractedPayload | null>(
    null,
  );
  const [healthStatus, setHealthStatus] = useState<string | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [checkingHealth, setCheckingHealth] = useState(false);
  const [sessionResult, setSessionResult] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [testingSession, setTestingSession] = useState(false);

  const requestContentStatus = useCallback(async () => {
    try {
      await sendToBackground({ type: "hub:request-content-status" });
    } catch {
      // Content section stays empty until user has an article tab + reload.
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onBackgroundMessage((msg) => {
      if (msg.type === "hub:content-ping") {
        const url = msg.payload?.url ?? "(no url)";
        setContentPing(`${url} @ ${new Date().toLocaleTimeString()}`);
      }
      if (msg.type === "page:extracted") {
        setExtracted(msg.payload);
        setScraping(false);
        if (msg.payload.blocks.length === 0) {
          setScrapeError(
            "Extraction returned no blocks. Try an article page (Wikipedia, MDN).",
          );
        } else {
          setScrapeError(null);
        }
      }
    });
    void requestContentStatus();
    return unsubscribe;
  }, [requestContentStatus]);

  async function handleCheckHealth() {
    setHealthError(null);
    setHealthStatus(null);
    setCheckingHealth(true);
    try {
      const res = await getHealth();
      setHealthStatus(res.ok ? "Backend ok" : "Unexpected health response");
    } catch (err) {
      setHealthError(formatError(err));
    } finally {
      setCheckingHealth(false);
    }
  }

  async function handleTestSession() {
    setSessionError(null);
    setSessionResult(null);
    setTestingSession(true);
    const body: SessionRequest =
      extracted && extracted.blocks.length > 0
        ? {
            title: extracted.title,
            url: extracted.url,
            blocks: extracted.blocks,
          }
        : FALLBACK_SESSION_BODY;
    try {
      const res = await postSession(body);
      const idShort =
        res.session_id.length > 12
          ? `${res.session_id.slice(0, 12)}…`
          : res.session_id;
      setSessionResult(
        `session_id: ${idShort}\n${res.header_summary}`,
      );
    } catch (err) {
      setSessionError(formatError(err));
    } finally {
      setTestingSession(false);
    }
  }

  async function handlePing() {
    setError(null);
    setPinging(true);
    try {
      const response = await sendToBackground({
        type: "hub:ping",
        payload: { source: "panel" },
      });
      if (response?.type === "hub:pong") {
        const { from, tabId } = response.payload;
        const tabPart =
          tabId !== undefined
            ? ` · tab ${tabId}`
            : " · no http(s) tab (focus Wikipedia, not this panel)";
        setPong(
          `pong from ${from}${tabPart} @ ${new Date().toLocaleTimeString()}`,
        );
      } else {
        setPong("unexpected response from background");
      }
    } catch (err) {
      setError(formatError(err));
    } finally {
      setPinging(false);
    }
  }

  async function handleScrape() {
    setScrapeError(null);
    setScraping(true);
    try {
      await sendToBackground({ type: "page:requestExtract" });
    } catch (err) {
      setScraping(false);
      setScrapeError(formatError(err));
    }
  }

  const previewBlocks = extracted?.blocks.slice(0, 3) ?? [];

  return (
    <main className="panel-root">
      <h1>Tutor</h1>
      <p className="panel-subtitle">Steps 4–5: scrape + backend API</p>

      <section className="panel-section">
        <h2 className="panel-heading">Scrape</h2>
        <button
          type="button"
          className="panel-button"
          onClick={() => void handleScrape()}
          disabled={scraping}
        >
          {scraping ? "Scraping…" : "Scrape this page"}
        </button>
        {scrapeError && (
          <p className="panel-status panel-status--err panel-status--pre">
            {scrapeError}
          </p>
        )}
        {extracted && extracted.blocks.length > 0 && (
          <div className="panel-scrape-result">
            <p className="panel-status panel-status--ok">
              <strong>{extracted.title}</strong>
            </p>
            <p className="panel-hint">{extracted.url}</p>
            <p className="panel-status panel-status--ok">
              {extracted.blocks.length} blocks (b1–b{extracted.blocks.length})
            </p>
            <ul className="panel-block-preview">
              {previewBlocks.map((block) => (
                <li key={block.id}>
                  <span className="panel-block-id">{block.id}</span>{" "}
                  {truncate(block.text)}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="panel-section">
        <h2 className="panel-heading">Backend</h2>
        <p className="panel-hint">http://localhost:8000 — run uvicorn first.</p>
        <button
          type="button"
          className="panel-button panel-button--secondary"
          onClick={() => void handleCheckHealth()}
          disabled={checkingHealth}
        >
          {checkingHealth ? "Checking…" : "Check health"}
        </button>
        {healthStatus && (
          <p className="panel-status panel-status--ok">{healthStatus}</p>
        )}
        {healthError && (
          <p className="panel-status panel-status--err panel-status--pre">
            {healthError}
          </p>
        )}
        <button
          type="button"
          className="panel-button"
          onClick={() => void handleTestSession()}
          disabled={testingSession}
        >
          {testingSession ? "Calling /session…" : "Test POST /session"}
        </button>
        <p className="panel-hint">
          Uses scraped page if available; otherwise a 2-block test payload.
        </p>
        {sessionResult && (
          <p className="panel-status panel-status--ok panel-status--pre">
            {sessionResult}
          </p>
        )}
        {sessionError && (
          <p className="panel-status panel-status--err panel-status--pre">
            {sessionError}
          </p>
        )}
      </section>

      <details className="panel-details">
        <summary className="panel-details-summary">Debug (steps 2–3)</summary>

        <section className="panel-section">
          <button
            type="button"
            className="panel-button"
            onClick={() => void handlePing()}
            disabled={pinging}
          >
            {pinging ? "Pinging…" : "Ping background"}
          </button>
          {pong && <p className="panel-status panel-status--ok">{pong}</p>}
          {error && (
            <p className="panel-status panel-status--err panel-status--pre">
              {error}
            </p>
          )}
        </section>

        <section className="panel-section">
          <h2 className="panel-heading">Injected on active tab</h2>
          {contentPing ? (
            <p className="panel-status panel-status--ok">{contentPing}</p>
          ) : (
            <p className="panel-hint">
              Focus an http(s) article tab, then click below.
            </p>
          )}
          <button
            type="button"
            className="panel-button panel-button--secondary"
            onClick={() => void requestContentStatus()}
          >
            Refresh content status
          </button>
        </section>
      </details>
    </main>
  );
}

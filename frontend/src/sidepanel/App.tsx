import { useCallback, useEffect, useState } from "react";
import type { PageExtractedPayload } from "../shared/messages";
import {
  onBackgroundMessage,
  sendToBackground,
  SERVICE_WORKER_HINT,
} from "../shared/messaging";

function formatError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/Receiving end does not exist/i.test(msg)) {
    return `${msg}\n\n${SERVICE_WORKER_HINT}`;
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
      <p className="panel-subtitle">Step 4: scrape article blocks</p>

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

import { useCallback, useEffect, useRef, useState } from "react";
import { getHealth, postMode, postSession } from "../shared/api";
import type { Deck, Mode, SessionRequest } from "../shared/apiTypes";
import { AvatarPanel } from "./avatar";
import { say as speakWelcome } from "./avatar/speechController";
import ChatPanel from "./ChatPanel";
import DeckPlayer from "./DeckPlayer";
import {
  clearPageHighlights,
  highlightAnchors,
  onSpeechEnd,
  pauseAvatar,
  playSegmentAt,
  type PlaybackState,
} from "./deckPlayback";
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

const MODE_BUTTONS: { mode: Mode; label: string }[] = [
  { mode: "teach", label: "Teach" },
  { mode: "summarise", label: "Summarise" },
  { mode: "quiz", label: "Quiz me" },
  { mode: "explain_simply", label: "Explain simply" },
];

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

function clearSession(
  setSessionId: (v: string | null) => void,
  setHeaderSummary: (v: string | null) => void,
  setSessionError: (v: string | null) => void,
): void {
  setSessionId(null);
  setHeaderSummary(null);
  setSessionError(null);
}

function modeLabel(mode: Mode): string {
  return MODE_BUTTONS.find((b) => b.mode === mode)?.label ?? mode;
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
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [headerSummary, setHeaderSummary] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [startingSession, setStartingSession] = useState(false);
  const [healthStatus, setHealthStatus] = useState<string | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [checkingHealth, setCheckingHealth] = useState(false);
  const [devSessionResult, setDevSessionResult] = useState<string | null>(null);
  const [devSessionError, setDevSessionError] = useState<string | null>(null);
  const [testingSession, setTestingSession] = useState(false);
  const [activeMode, setActiveMode] = useState<Mode | null>(null);
  const [deck, setDeck] = useState<Deck | null>(null);
  const [loadingMode, setLoadingMode] = useState<Mode | null>(null);
  const [modeError, setModeError] = useState<string | null>(null);
  const [segmentIndex, setSegmentIndex] = useState(0);
  const [playbackState, setPlaybackState] =
    useState<PlaybackState>("speaking");
  const [deckComplete, setDeckComplete] = useState(false);

  const deckRef = useRef(deck);
  const playbackRef = useRef(playbackState);
  const segmentIndexRef = useRef(segmentIndex);

  useEffect(() => {
    deckRef.current = deck;
  }, [deck]);

  useEffect(() => {
    playbackRef.current = playbackState;
  }, [playbackState]);

  useEffect(() => {
    segmentIndexRef.current = segmentIndex;
  }, [segmentIndex]);

  const clearDeck = useCallback(() => {
    pauseAvatar();
    setDeck(null);
    setActiveMode(null);
    setModeError(null);
    setLoadingMode(null);
    setSegmentIndex(0);
    setPlaybackState("speaking");
    setDeckComplete(false);
    clearPageHighlights();
  }, []);

  const requestContentStatus = useCallback(async () => {
    try {
      await sendToBackground({ type: "hub:request-content-status" });
    } catch {
      // Content section stays empty until user has an article tab + reload.
    }
  }, []);

  useEffect(() => {
    if (!deck?.segments.length) {
      return;
    }
    const idx = Math.min(
      Math.max(0, segmentIndex),
      deck.segments.length - 1,
    );
    const ids = deck.segments[idx]?.anchor_ids ?? [];
    if (ids.length > 0) {
      highlightAnchors(ids);
    }
  }, [deck, segmentIndex, activeMode]);

  useEffect(() => {
    return onSpeechEnd(() => {
      const currentDeck = deckRef.current;
      if (!currentDeck?.segments.length) {
        return;
      }
      if (playbackRef.current !== "speaking") {
        return;
      }

      const idx = segmentIndexRef.current;
      const lastIndex = currentDeck.segments.length - 1;

      if (idx >= lastIndex) {
        setDeckComplete(true);
        return;
      }

      setDeckComplete(false);
      const nextIndex = idx + 1;
      setSegmentIndex(nextIndex);
      playSegmentAt(currentDeck, nextIndex, {
        speak: true,
        highlight: false,
      });
    });
  }, []);

  useEffect(() => {
    const unsubscribe = onBackgroundMessage((msg) => {
      if (msg.type === "hub:content-ping") {
        const url = msg.payload?.url ?? "(no url)";
        setContentPing(`${url} @ ${new Date().toLocaleTimeString()}`);
      }
      if (msg.type === "page:extracted") {
        setExtracted(msg.payload);
        clearSession(setSessionId, setHeaderSummary, setSessionError);
        clearDeck();
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
  }, [requestContentStatus, clearDeck]);

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

  async function handleStartSession() {
    if (!extracted || extracted.blocks.length === 0) {
      setSessionError("Scrape this page first.");
      return;
    }

    setSessionError(null);
    clearDeck();
    setStartingSession(true);
    try {
      const res = await postSession({
        title: extracted.title,
        url: extracted.url,
        blocks: extracted.blocks,
      });
      setSessionId(res.session_id);
      setHeaderSummary(res.header_summary);
      const intro = res.header_summary.trim();
      if (intro) {
        speakWelcome(
          `Session started. ${intro} Choose a mode when you are ready to begin.`,
        );
      }
    } catch (err) {
      setSessionId(null);
      setHeaderSummary(null);
      setSessionError(formatError(err));
    } finally {
      setStartingSession(false);
    }
  }

  async function handleTestSession() {
    setDevSessionError(null);
    setDevSessionResult(null);
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
      setDevSessionResult(
        `session_id: ${idShort}\n${res.header_summary}`,
      );
    } catch (err) {
      setDevSessionError(formatError(err));
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

  function clampedSegmentIndex(forDeck: Deck): number {
    const n = forDeck.segments.length;
    if (n === 0) {
      return 0;
    }
    return Math.min(Math.max(0, segmentIndex), n - 1);
  }

  function handleDeckPrev() {
    if (!deck || deck.segments.length === 0) {
      return;
    }
    const idx = clampedSegmentIndex(deck);
    if (idx <= 0) {
      return;
    }
    if (playbackState === "speaking") {
      pauseAvatar();
    }
    setDeckComplete(false);
    setSegmentIndex(idx - 1);
    setPlaybackState("held");
  }

  function handleDeckNext() {
    if (!deck || deck.segments.length === 0) {
      return;
    }
    const idx = clampedSegmentIndex(deck);
    if (idx >= deck.segments.length - 1) {
      return;
    }
    if (playbackState === "speaking") {
      pauseAvatar();
    }
    setDeckComplete(false);
    setSegmentIndex(idx + 1);
    setPlaybackState("held");
  }

  function handleDeckResume() {
    if (!deck || playbackState !== "held") {
      return;
    }
    const idx = clampedSegmentIndex(deck);
    if (!deck.segments[idx]) {
      return;
    }
    setDeckComplete(false);
    setPlaybackState("speaking");
    playSegmentAt(deck, idx, { speak: true, highlight: false });
  }

  async function handleMode(mode: Mode) {
    if (!sessionId) {
      return;
    }

    setModeError(null);
    setLoadingMode(mode);
    pauseAvatar();
    setDeck(null);
    setActiveMode(null);
    setDeckComplete(false);
    clearPageHighlights();
    try {
      const result = await postMode({
        session_id: sessionId,
        mode,
        lang: "en",
      });
      const segments = result.segments ?? [];
      if (segments.length === 0) {
        setModeError("Mode returned an empty deck. Try again.");
        return;
      }
      setSegmentIndex(0);
      setPlaybackState("speaking");
      setActiveMode(mode);
      setDeck(result);
      playSegmentAt(result, 0, { speak: true, highlight: false });
    } catch (err) {
      setDeck(null);
      setActiveMode(null);
      setModeError(formatError(err));
    } finally {
      setLoadingMode(null);
    }
  }

  async function handleScrape() {
    setScrapeError(null);
    setScraping(true);
    try {
      await sendToBackground({ type: "page:requestExtract" });
    } catch (err) {
      setScrapeError(formatError(err));
    } finally {
      setScraping(false);
    }
  }

  const previewBlocks = extracted?.blocks.slice(0, 3) ?? [];
  const canStartSession =
    Boolean(extracted && extracted.blocks.length > 0) && !startingSession;
  const deckSegmentCount = deck?.segments.length ?? 0;
  const safeSegmentIndex =
    deckSegmentCount === 0
      ? 0
      : Math.min(segmentIndex, deckSegmentCount - 1);

  const currentSegment =
    deck && deckSegmentCount > 0 ? deck.segments[safeSegmentIndex] : null;
  const currentSay =
    deck && playbackState === "speaking" && currentSegment
      ? currentSegment.say
      : deck && playbackState === "held" && currentSegment
        ? currentSegment.say
        : null;
  const slideLabel =
    deck && activeMode && deckSegmentCount > 0
      ? `${modeLabel(activeMode)} · slide ${safeSegmentIndex + 1} of ${deckSegmentCount}`
      : null;

  return (
    <main className="panel-root">
      <h1>Tutor</h1>
      <p className="panel-subtitle">
        Tutor: session-linked avatar + lesson voice + highlights
      </p>

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
        <h2 className="panel-heading">Session</h2>
        <button
          type="button"
          className="panel-button"
          onClick={() => void handleStartSession()}
          disabled={!canStartSession}
        >
          {startingSession ? "Starting session…" : "Start session"}
        </button>
        {!extracted?.blocks.length && (
          <p className="panel-hint">Scrape an article page to enable.</p>
        )}
        {sessionError && (
          <p className="panel-status panel-status--err panel-status--pre">
            {sessionError}
          </p>
        )}
        {headerSummary && (
          <div className="panel-session-result">
            <p className="panel-summary">{headerSummary}</p>
            {sessionId && (
              <p className="panel-hint panel-session-id">
                session_id: <code>{sessionId}</code>
              </p>
            )}
          </div>
        )}
      </section>

      <AvatarPanel
        sessionId={sessionId}
        articleTitle={extracted?.title ?? null}
        headerSummary={headerSummary}
        currentSay={currentSay}
        slideLabel={slideLabel}
      />

      <section className="panel-section">
        <h2 className="panel-heading">Modes</h2>
        {!sessionId && (
          <p className="panel-hint">Start a session to enable modes.</p>
        )}
        <div className="panel-mode-buttons">
          {MODE_BUTTONS.map(({ mode, label }) => {
            const isLoading = loadingMode === mode;
            const isActive = activeMode === mode && deck !== null;
            return (
              <button
                key={mode}
                type="button"
                className={[
                  "panel-button",
                  "panel-button--mode",
                  isActive ? "panel-button--active" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                disabled={!sessionId || loadingMode !== null}
                onClick={() => void handleMode(mode)}
                title={sessionId ? undefined : "Start a session first"}
              >
                {isLoading ? "Loading…" : label}
              </button>
            );
          })}
        </div>
        {loadingMode && !(deck && activeMode === loadingMode) && (
          <p className="panel-hint">
            Generating deck ({modeLabel(loadingMode)})… Large pages can take
            up to a minute.
          </p>
        )}
        {modeError && (
          <p className="panel-status panel-status--err panel-status--pre">
            {modeError}
          </p>
        )}
        {deck && activeMode && deckSegmentCount > 0 && (
          <>
            <DeckPlayer
              deck={deck}
              mode={activeMode}
              segmentIndex={safeSegmentIndex}
              playbackState={playbackState}
              deckComplete={deckComplete}
              onPrev={handleDeckPrev}
              onNext={handleDeckNext}
              onResume={handleDeckResume}
            />
            <p className="panel-hint">
              Lesson voice reads each slide on the article tab. Highlights follow
              the current slide. Prev/Next holds speech; Resume continues
              auto-advance.
            </p>
          </>
        )}
      </section>

      <ChatPanel sessionId={sessionId} disabled={loadingMode !== null} />

      <details className="panel-details">
        <summary className="panel-details-summary">Debug</summary>

        <section className="panel-section">
          <h2 className="panel-heading">Backend</h2>
          <p className="panel-hint">http://localhost:8000</p>
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
            className="panel-button panel-button--secondary"
            onClick={() => void handleTestSession()}
            disabled={testingSession}
          >
            {testingSession ? "Calling /session…" : "Test POST /session"}
          </button>
          <p className="panel-hint">
            Dev only: uses scrape if available, else 2-block fallback.
          </p>
          {devSessionResult && (
            <p className="panel-status panel-status--ok panel-status--pre">
              {devSessionResult}
            </p>
          )}
          {devSessionError && (
            <p className="panel-status panel-status--err panel-status--pre">
              {devSessionError}
            </p>
          )}
        </section>

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

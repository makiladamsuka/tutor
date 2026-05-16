import { useTutorSpeaking } from "./useTutorSpeaking";

export type AvatarPanelProps = {
  sessionId: string | null;
  articleTitle: string | null;
  headerSummary: string | null;
  currentSay: string | null;
  slideLabel: string | null;
};

function truncate(text: string, max = 280): string {
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, max)}…`;
}

export default function AvatarPanel({
  sessionId,
  articleTitle,
  headerSummary,
  currentSay,
  slideLabel,
}: AvatarPanelProps) {
  const isSpeaking = useTutorSpeaking();

  if (!sessionId) {
    return (
      <section className="panel-section panel-avatar">
        <h2 className="panel-heading">Tutor</h2>
        <p className="panel-hint panel-avatar-placeholder">
          Start a session to wake the tutor for this article.
        </p>
      </section>
    );
  }

  const statusLabel = isSpeaking
    ? "Speaking…"
    : currentSay
      ? "Paused"
      : headerSummary
        ? "Ready"
        : "Connected";

  return (
    <section className="panel-section panel-avatar">
      <h2 className="panel-heading">Tutor</h2>
      {articleTitle && (
        <p className="panel-hint panel-avatar-article">
          Article: <strong>{articleTitle}</strong>
        </p>
      )}

      <div
        className={[
          "panel-avatar-presenter",
          isSpeaking ? "panel-avatar-presenter--speaking" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        aria-live="polite"
      >
        <div className="panel-avatar-portrait" aria-hidden>
          <span className="panel-avatar-portrait-inner" />
        </div>
        <p className="panel-avatar-status">{statusLabel}</p>
        <div className="panel-avatar-wave" aria-hidden>
          <span />
          <span />
          <span />
          <span />
        </div>
      </div>

      {headerSummary && !currentSay && (
        <p className="panel-summary panel-avatar-context">{headerSummary}</p>
      )}

      {currentSay && (
        <div className="panel-avatar-lesson">
          {slideLabel && (
            <p className="panel-hint panel-avatar-lesson-label">{slideLabel}</p>
          )}
          <p className="panel-avatar-lesson-say">{truncate(currentSay)}</p>
        </div>
      )}

      <p className="panel-hint panel-avatar-mic-hint">
        The tutor reads each slide aloud and highlights the article. Use Chat
        below to ask questions.
      </p>
    </section>
  );
}

import { useState } from "react";
import { postChat } from "../shared/api";
import { pauseAvatar, speakText } from "./deckPlayback";
import { highlightAnchors } from "./deckPlayback";

type ChatPanelProps = {
  sessionId: string | null;
  disabled?: boolean;
};

export default function ChatPanel({ sessionId, disabled = false }: ChatPanelProps) {
  const [text, setText] = useState("");
  const [reply, setReply] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!sessionId || !trimmed || sending) {
      return;
    }

    setError(null);
    setReply(null);
    setSending(true);
    pauseAvatar();

    try {
      const res = await postChat({ session_id: sessionId, text: trimmed });
      setReply(res.reply);
      setText("");
      if (res.highlight_anchor_ids.length > 0) {
        highlightAnchors(res.highlight_anchor_ids);
      }
      if (res.reply.trim()) {
        speakText(res.reply);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  }

  const blocked = !sessionId || disabled;

  return (
    <section className="panel-section panel-chat">
      <h2 className="panel-heading">Chat</h2>
      {!sessionId && (
        <p className="panel-hint">Start a session to ask questions about the page.</p>
      )}
      <form className="panel-chat-form" onSubmit={(e) => void handleSubmit(e)}>
        <div className="panel-chat-row">
          <input
            type="text"
            className="panel-chat-input"
            placeholder="Ask about this article…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={blocked || sending}
            aria-label="Chat message"
          />
          <button
            type="submit"
            className="panel-button panel-button--secondary"
            disabled={blocked || sending || !text.trim()}
          >
            {sending ? "…" : "Send"}
          </button>
        </div>
      </form>
      {reply && (
        <p className="panel-summary panel-chat-reply">{reply}</p>
      )}
      {error && (
        <p className="panel-status panel-status--err panel-status--pre">{error}</p>
      )}
    </section>
  );
}

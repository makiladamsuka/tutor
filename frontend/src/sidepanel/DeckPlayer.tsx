import type { Deck, Mode } from "../shared/apiTypes";
import type { PlaybackState } from "./deckPlayback";

const MODE_LABELS: Record<Mode, string> = {
  teach: "Teach",
  summarise: "Summarise",
  quiz: "Quiz me",
  explain_simply: "Explain simply",
};

type DeckPlayerProps = {
  deck: Deck;
  mode: Mode | null;
  segmentIndex: number;
  playbackState: PlaybackState;
  deckComplete?: boolean;
  onPrev: () => void;
  onNext: () => void;
  onReplay: () => void;
};

export default function DeckPlayer({
  deck,
  mode,
  segmentIndex,
  playbackState,
  deckComplete = false,
  onPrev,
  onNext,
  onReplay,
}: DeckPlayerProps) {
  const total = deck.segments.length;
  const safeIndex =
    total === 0 ? 0 : Math.min(Math.max(0, segmentIndex), total - 1);
  const segment = deck.segments[safeIndex];
  const modeLabel = mode ? MODE_LABELS[mode] : null;
  const atStart = safeIndex === 0;
  const atEnd = safeIndex >= total - 1;

  if (!segment) {
    return (
      <article className="panel-deck">
        <p className="panel-status panel-status--err">
          Deck has no slides to show.
        </p>
      </article>
    );
  }

  return (
    <article className="panel-deck">
      <h3 className="panel-deck-title">{deck.title}</h3>
      {modeLabel && (
        <p className="panel-hint panel-deck-mode">Mode: {modeLabel}</p>
      )}
      <p className="panel-deck-progress">
        Slide {safeIndex + 1} of {total}{" "}
        <span className="panel-deck-segment-id">({segment.id})</span>
      </p>
      <p className="panel-deck-playback">
        {playbackState === "speaking" ? "Speaking" : "Paused"}
      </p>

      <div className="panel-deck-segment panel-deck-segment--current">
        <h4 className="panel-deck-segment-title">{segment.slide.title}</h4>
        <ul className="panel-deck-bullets">
          {segment.slide.bullets.map((bullet, i) => (
            <li key={`${segment.id}-b${i}`}>{bullet}</li>
          ))}
        </ul>
      </div>

      <div className="panel-deck-nav">
        <button
          type="button"
          className="panel-button panel-button--nav"
          disabled={atStart}
          onClick={onPrev}
        >
          Prev
        </button>
        <button
          type="button"
          className="panel-button panel-button--nav"
          disabled={atEnd}
          onClick={onNext}
        >
          Next
        </button>
        <button
          type="button"
          className="panel-button panel-button--nav"
          onClick={onReplay}
        >
          Replay slide
        </button>
      </div>
      {deckComplete && atEnd && playbackState === "speaking" && (
        <p className="panel-status panel-status--ok">Deck complete.</p>
      )}
      <p className="panel-hint panel-deck-nav-hint">
        Prev/Next moves slides and the tutor speaks the new card. Auto-advance
        continues after each slide finishes.
      </p>
    </article>
  );
}

import type { Deck, Mode } from "../shared/apiTypes";

const MODE_LABELS: Record<Mode, string> = {
  teach: "Teach",
  summarise: "Summarise",
  quiz: "Quiz me",
  explain_simply: "Explain simply",
};

type DeckViewProps = {
  deck: Deck;
  mode: Mode | null;
};

export default function DeckView({ deck, mode }: DeckViewProps) {
  const modeLabel = mode ? MODE_LABELS[mode] : null;

  return (
    <article className="panel-deck">
      <h3 className="panel-deck-title">{deck.title}</h3>
      {modeLabel && (
        <p className="panel-hint panel-deck-mode">Mode: {modeLabel}</p>
      )}
      <ol className="panel-deck-segments">
        {deck.segments.map((segment) => (
          <li key={segment.id} className="panel-deck-segment">
            <h4 className="panel-deck-segment-title">{segment.slide.title}</h4>
            <ul className="panel-deck-bullets">
              {segment.slide.bullets.map((bullet, i) => (
                <li key={`${segment.id}-b${i}`}>{bullet}</li>
              ))}
            </ul>
            <p className="panel-deck-segment-id">{segment.id}</p>
          </li>
        ))}
      </ol>
    </article>
  );
}

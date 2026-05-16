import type { Deck, Segment } from "../shared/apiTypes";
import { say as speechSay, pause as speechPause, onSpeechEnd } from "./avatar/speechController";
import { sendToBackground } from "../shared/messaging";

export type PlaybackState = "speaking" | "held";

export type PlaySegmentOptions = {
  /** Speak `segment.say` via browser TTS (default true). */
  speak?: boolean;
  /** Send highlights to the article tab (default true). */
  highlight?: boolean;
};

export { onSpeechEnd };

export function highlightAnchors(anchorIds: string[]): void {
  if (anchorIds.length === 0) {
    console.warn("[tutor] no anchor_ids to highlight — re-scrape the page");
    return;
  }
  void sendToBackground({
    type: "page:highlight",
    payload: { anchor_ids: anchorIds },
  }).catch((err) => {
    console.warn("[tutor] highlight failed:", err);
  });
}

export function clearPageHighlights(): void {
  void sendToBackground({ type: "page:clearHighlights" });
}

function clampIndex(deck: Deck, index: number): number {
  const n = deck.segments.length;
  if (n === 0) {
    return 0;
  }
  return Math.min(Math.max(0, index), n - 1);
}

/** Single entry point for slide audio + optional highlights. */
export function playSegmentAt(
  deck: Deck,
  index: number,
  options: PlaySegmentOptions = {},
): void {
  const { speak = true, highlight = true } = options;
  const segment = deck.segments[clampIndex(deck, index)];
  if (!segment) {
    return;
  }
  if (highlight) {
    highlightAnchors(segment.anchor_ids);
  }
  if (speak) {
    speechSay(segment.say);
  }
}

export function speakSegment(segment: Segment): void {
  if (segment.anchor_ids.length > 0) {
    highlightAnchors(segment.anchor_ids);
  }
  speechSay(segment.say);
}

export function pauseAvatar(): void {
  speechPause();
}

import type { Deck, Segment } from "../shared/apiTypes";
import { say as fallbackSay } from "./avatar/speechController";
import { sendToBackground } from "../shared/messaging";

export type PlaybackState = "speaking" | "held";

export type AvatarBridge = {
  sendSay: (text: string) => void;
  isConnected: () => boolean;
};

let avatarBridge: AvatarBridge | null = null;

export function registerAvatarBridge(bridge: AvatarBridge | null): void {
  avatarBridge = bridge;
}

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

export function speakText(text: string): void {
  const trimmed = text.trim();
  if (!trimmed) {
    return;
  }
  if (avatarBridge?.isConnected()) {
    avatarBridge.sendSay(trimmed);
    return;
  }
  fallbackSay(trimmed);
}

export function speakSegment(segment: Segment): void {
  if (segment.anchor_ids.length > 0) {
    highlightAnchors(segment.anchor_ids);
  }
  speakText(segment.say);
}

export function playSegmentAt(
  deck: Deck,
  index: number,
  options: { speak?: boolean; highlight?: boolean } = {},
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
    speakSegment(segment);
  }
}

export function pauseAvatar(): void {
  console.info("[tutor] avatar.pause()");
}

import type { Segment } from "../shared/apiTypes";
import { sendToBackground } from "../shared/messaging";

export type PlaybackState = "speaking" | "held";

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

/** Step 8 stub — Step 10 replaces with avatar.say(). */
export function speakSegment(segment: Segment): void {
  console.info("[tutor] say:", segment.say);
  highlightAnchors(segment.anchor_ids);
}

/** Step 8 stub — Step 10 replaces with avatar.pause(). */
export function pauseAvatar(): void {
  console.info("[tutor] avatar.pause()");
}

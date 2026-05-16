import type { Segment } from "../shared/apiTypes";

export type PlaybackState = "speaking" | "held";

/** Step 8 stub — Step 10 replaces with avatar.say(). */
export function speakSegment(segment: Segment): void {
  console.info("[tutor] say:", segment.say);
  console.info("[tutor] anchor_ids:", segment.anchor_ids);
}

/** Step 8 stub — Step 10 replaces with avatar.pause(). */
export function pauseAvatar(): void {
  console.info("[tutor] avatar.pause()");
}

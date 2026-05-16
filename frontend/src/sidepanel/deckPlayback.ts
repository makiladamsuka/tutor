import type { Segment } from "../shared/apiTypes";

export type PlaybackState = "speaking" | "held";

export type AvatarBridge = {
  sendSay: (text: string) => void;
  isConnected: () => boolean;
};

let avatarBridge: AvatarBridge | null = null;

export function registerAvatarBridge(bridge: AvatarBridge | null): void {
  avatarBridge = bridge;
}

export function speakSegment(segment: Segment): void {
  const text = segment.say.trim();
  if (!text) {
    return;
  }
  if (avatarBridge?.isConnected()) {
    avatarBridge.sendSay(text);
    return;
  }
  console.info("[tutor] say:", segment.say);
  console.info("[tutor] anchor_ids:", segment.anchor_ids);
}

export function pauseAvatar(): void {
  console.info("[tutor] avatar.pause()");
}

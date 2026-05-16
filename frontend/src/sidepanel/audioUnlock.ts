/** Unlock LiveKit audio using recent user gestures (no extra button). */

let unlockFn: (() => Promise<void>) | null = null;
let lastGestureAt = 0;
let audioCtx: AudioContext | null = null;

/** Deck generation can take a minute; keep gesture valid while user waits. */
const GESTURE_WINDOW_MS = 120_000;

export function registerLiveKitAudioUnlock(fn: (() => Promise<void>) | null): void {
  unlockFn = fn;
  if (fn && Date.now() - lastGestureAt < GESTURE_WINDOW_MS) {
    void tryUnlock();
  }
}

/** Call on any panel click/tap so Chrome allows playback when the room connects. */
export function markPanelUserGesture(): void {
  lastGestureAt = Date.now();
  try {
    audioCtx ??= new AudioContext();
    void audioCtx.resume();
  } catch {
    /* AudioContext optional */
  }
  void tryUnlock();
}

export function requestLiveKitAudioUnlock(): void {
  markPanelUserGesture();
}

async function tryUnlock(): Promise<void> {
  if (!unlockFn) {
    return;
  }
  try {
    await unlockFn();
  } catch (err) {
    console.warn("[tutor] startAudio failed:", err);
  }
}

export function shouldAutoUnlock(): boolean {
  return Date.now() - lastGestureAt < GESTURE_WINDOW_MS;
}

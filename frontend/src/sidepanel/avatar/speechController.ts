/** Tutor voice for deck `say` lines and chat replies (browser TTS). */

type SpeechListener = () => void;

const endListeners = new Set<SpeechListener>();
const startListeners = new Set<SpeechListener>();
let generation = 0;

function notifyStart(): void {
  for (const listener of startListeners) {
    listener();
  }
}

function notifyEnd(completedGeneration: number): void {
  if (completedGeneration !== generation) {
    return;
  }
  notifyEndListeners();
}

function notifyEndListeners(): void {
  for (const listener of endListeners) {
    listener();
  }
}

export function onSpeechStart(listener: SpeechListener): () => void {
  startListeners.add(listener);
  return () => startListeners.delete(listener);
}

export function onSpeechEnd(listener: SpeechListener): () => void {
  endListeners.add(listener);
  return () => endListeners.delete(listener);
}

export function isSpeaking(): boolean {
  return window.speechSynthesis.speaking;
}

export function pause(): void {
  generation += 1;
  window.speechSynthesis.cancel();
  notifyEndListeners();
}

export function say(text: string): void {
  const trimmed = text.trim();
  if (!trimmed) {
    notifyEnd(++generation);
    return;
  }

  if (!("speechSynthesis" in window)) {
    console.warn("[tutor] speechSynthesis not available");
    notifyEnd(++generation);
    return;
  }

  pause();
  const utterGeneration = generation;

  const utterance = new SpeechSynthesisUtterance(trimmed);
  utterance.lang = "en-US";
  utterance.rate = 1;

  utterance.onstart = () => notifyStart();
  utterance.onend = () => notifyEnd(utterGeneration);
  utterance.onerror = () => {
    console.warn("[tutor] speech synthesis error");
    notifyEnd(utterGeneration);
  };

  window.speechSynthesis.speak(utterance);
}

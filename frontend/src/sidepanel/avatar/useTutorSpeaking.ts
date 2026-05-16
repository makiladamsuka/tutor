import { useEffect, useState } from "react";
import { isSpeaking, onSpeechEnd, onSpeechStart } from "./speechController";

/** Tracks whether the tutor is currently speaking (TTS active). */
export function useTutorSpeaking(): boolean {
  const [speaking, setSpeaking] = useState(isSpeaking);

  useEffect(() => {
    const onStart = () => setSpeaking(true);
    const onEnd = () => setSpeaking(false);
    const unsubStart = onSpeechStart(onStart);
    const unsubEnd = onSpeechEnd(onEnd);
    return () => {
      unsubStart();
      unsubEnd();
    };
  }, []);

  return speaking;
}

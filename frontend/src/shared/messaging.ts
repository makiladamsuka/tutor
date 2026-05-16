import { isTutorMessage, type TutorMessage } from "./messages";

const RETRYABLE =
  /Receiving end does not exist|message port closed before a response/i;

function sendToBackgroundOnce(
  message: TutorMessage,
): Promise<TutorMessage | undefined> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(err.message));
        return;
      }
      resolve(isTutorMessage(response) ? response : undefined);
    });
  });
}

export function sendToBackground(
  message: TutorMessage,
  options?: { retries?: number; delayMs?: number },
): Promise<TutorMessage | undefined> {
  const retries = options?.retries ?? 5;
  const delayMs = options?.delayMs ?? 120;

  return (async () => {
    let lastError: Error | undefined;
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        return await sendToBackgroundOnce(message);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (!RETRYABLE.test(lastError.message) || attempt === retries - 1) {
          throw lastError;
        }
        await new Promise((r) => setTimeout(r, delayMs * (attempt + 1)));
      }
    }
    throw lastError ?? new Error("sendToBackground failed");
  })();
}

export function onBackgroundMessage(
  handler: (message: TutorMessage) => void,
): () => void {
  const listener = (message: unknown) => {
    if (isTutorMessage(message)) {
      handler(message);
    }
  };
  chrome.runtime.onMessage.addListener(listener);
  return () => chrome.runtime.onMessage.removeListener(listener);
}

export const SERVICE_WORKER_HINT =
  "Service worker not reachable. At chrome://extensions, click Reload on TutorStream, then refresh the article tab.";

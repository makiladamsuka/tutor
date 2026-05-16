/** Injected on http(s) pages — inject (Step 3), hub (Step 2), scrape (Step 4). */

import { extractPage } from "./extract";
import {
  isTabMessage,
  type HubContentPingMessage,
  type HubPongMessage,
  type PageExtractedMessage,
} from "../shared/messages";

function isHttpPage(): boolean {
  return (
    location.protocol === "http:" || location.protocol === "https:"
  );
}

if (isHttpPage()) {
  console.info("[tutor] content script loaded", { host: location.hostname });
}

function sendContentPing(attempt = 0): void {
  if (!isHttpPage()) {
    return;
  }

  const message: HubContentPingMessage = {
    type: "hub:content-ping",
    payload: { url: location.href },
  };
  chrome.runtime.sendMessage(message, () => {
    const err = chrome.runtime.lastError;
    if (err && attempt < 8) {
      setTimeout(() => sendContentPing(attempt + 1), 150 * (attempt + 1));
    }
  });
}

function forwardExtracted(message: PageExtractedMessage, attempt = 0): void {
  chrome.runtime.sendMessage(message, () => {
    const err = chrome.runtime.lastError;
    if (err && attempt < 8) {
      setTimeout(() => forwardExtracted(message, attempt + 1), 150 * (attempt + 1));
    }
  });
}

function runExtract(): PageExtractedMessage {
  const result = extractPage();
  if (!result.ok) {
    console.warn("[tutor] extract failed", result.error);
  }
  return { type: "page:extracted", payload: result.payload };
}

chrome.runtime.onMessage.addListener((raw, _sender, sendResponse) => {
  if (!isTabMessage(raw)) {
    return false;
  }

  if (raw.type === "page:requestExtract") {
    try {
      const extracted = runExtract();
      forwardExtracted(extracted);
      sendResponse({
        type: "hub:pong",
        payload: { from: "content" },
      } satisfies HubPongMessage);
    } catch (err) {
      console.error("[tutor] extract threw", err);
      forwardExtracted({
        type: "page:extracted",
        payload: {
          title: document.title,
          url: location.href,
          blocks: [],
        },
      });
      sendResponse({
        type: "hub:pong",
        payload: { from: "content" },
      } satisfies HubPongMessage);
    }
    return true;
  }

  if (raw.type === "hub:request-content-ping") {
    sendContentPing();
    sendResponse({
      type: "hub:pong",
      payload: { from: "content" },
    } satisfies HubPongMessage);
    return true;
  }

  if (raw.type === "hub:ping") {
    console.info("[tutor] content script received ping");
    sendResponse({
      type: "hub:pong",
      payload: { from: "content" },
    } satisfies HubPongMessage);
    return true;
  }

  return false;
});

if (isHttpPage()) {
  sendContentPing();
}

/** Chrome runtime message protocol — hub (Step 2) + page (later steps). */

export type Block = { id: string; text: string };

export type PageExtractedPayload = {
  title: string;
  url: string;
  blocks: Block[];
};

export type HubPingMessage = {
  type: "hub:ping";
  payload?: { source?: "panel" | "background" };
};

export type HubPongMessage = {
  type: "hub:pong";
  payload: { from: "background" | "content"; tabId?: number };
};

export type HubContentPingMessage = {
  type: "hub:content-ping";
  payload?: { url: string };
};

/** Panel → background: ask active tab content script to re-send hub:content-ping. */
export type HubRequestContentStatusMessage = {
  type: "hub:request-content-status";
};

/** Background → content script: re-send hub:content-ping. */
export type HubRequestContentPingMessage = {
  type: "hub:request-content-ping";
};

/** Content script → panel (via background). Step 4+. */
export type PageExtractedMessage = {
  type: "page:extracted";
  payload: PageExtractedPayload;
};

/** Panel → content script (via background). Step 4+. */
export type PageRequestExtractMessage = {
  type: "page:requestExtract";
};

/** Panel → content script (via background). Step 9+. */
export type PageHighlightMessage = {
  type: "page:highlight";
  payload: { anchor_ids: string[] };
};

export type PageClearHighlightsMessage = {
  type: "page:clearHighlights";
};

export type TutorMessage =
  | HubPingMessage
  | HubPongMessage
  | HubContentPingMessage
  | HubRequestContentStatusMessage
  | PageExtractedMessage
  | PageRequestExtractMessage
  | PageHighlightMessage
  | PageClearHighlightsMessage;

/** Tab-targeted messages (not part of TutorMessage union). */
export type TabMessage =
  | HubPingMessage
  | HubRequestContentPingMessage
  | PageRequestExtractMessage
  | PageHighlightMessage
  | PageClearHighlightsMessage;

const TUTOR_MESSAGE_TYPES: TutorMessage["type"][] = [
  "hub:ping",
  "hub:pong",
  "hub:content-ping",
  "hub:request-content-status",
  "page:extracted",
  "page:requestExtract",
  "page:highlight",
  "page:clearHighlights",
];

export function isTutorMessage(value: unknown): value is TutorMessage {
  if (typeof value !== "object" || value === null || !("type" in value)) {
    return false;
  }
  const type = (value as { type: unknown }).type;
  return (
    typeof type === "string" &&
    (TUTOR_MESSAGE_TYPES as string[]).includes(type)
  );
}

export function isTabMessage(value: unknown): value is TabMessage {
  if (typeof value !== "object" || value === null || !("type" in value)) {
    return false;
  }
  const type = (value as { type: unknown }).type;
  return (
    type === "hub:ping" ||
    type === "hub:request-content-ping" ||
    type === "page:requestExtract" ||
    type === "page:highlight" ||
    type === "page:clearHighlights"
  );
}

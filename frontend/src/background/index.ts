/** MV3 service worker — message hub (Step 2). */

import {
  isTutorMessage,
  type HubPingMessage,
  type HubPongMessage,
  type TutorMessage,
} from "../shared/messages";

console.info("[tutor] service worker started");

// Register before any other setup so the panel always has a message receiver.
chrome.runtime.onMessage.addListener((raw, sender, sendResponse) => {
  if (!isTutorMessage(raw)) {
    console.warn("[tutor] unknown message", raw);
    return false;
  }

  void handleMessage(raw, sender).then((reply) => {
    if (reply) {
      sendResponse(reply);
    }
  });

  return true;
});

chrome.runtime.onInstalled.addListener(() => {
  console.info("[tutor] extension installed");
});

try {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
} catch (err) {
  console.warn("[tutor] sidePanel.setPanelBehavior failed", err);
}

async function getActiveTabId(): Promise<number | undefined> {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  const id = tab?.id;
  if (id === undefined) {
    return undefined;
  }
  // Side panel focus can make the active tab the panel page — skip non-http(s).
  if (tab.url?.startsWith("http://") || tab.url?.startsWith("https://")) {
    return id;
  }
  return undefined;
}

async function pingContentScript(
  tabId: number,
): Promise<HubPongMessage | undefined> {
  const ping: HubPingMessage = {
    type: "hub:ping",
    payload: { source: "background" },
  };
  try {
    const response = await chrome.tabs.sendMessage(tabId, ping);
    return isTutorMessage(response) && response.type === "hub:pong"
      ? response
      : undefined;
  } catch (err) {
    console.warn("[tutor] tabs.sendMessage failed", err);
    return undefined;
  }
}

async function requestContentPing(tabId: number): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "hub:request-content-ping" });
  } catch (err) {
    console.warn("[tutor] request content ping failed", err);
  }
}

async function requestPageExtract(tabId: number): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "page:requestExtract" });
  } catch (err) {
    console.warn("[tutor] page:requestExtract failed", err);
    throw err;
  }
}

async function forwardToPanel(message: TutorMessage): Promise<void> {
  try {
    await chrome.runtime.sendMessage(message);
  } catch {
    // Panel closed — expected.
  }
}

async function handleMessage(
  message: TutorMessage,
  sender: chrome.runtime.MessageSender,
): Promise<TutorMessage | undefined> {
  switch (message.type) {
    case "hub:ping": {
      if (sender.tab) {
        console.info("[tutor] ping from content tab", sender.tab.id);
        return {
          type: "hub:pong",
          payload: { from: "background", tabId: sender.tab.id },
        };
      }

      console.info("[tutor] ping from panel");
      const tabId = await getActiveTabId();
      if (tabId !== undefined) {
        const contentPong = await pingContentScript(tabId);
        if (contentPong) {
          console.info("[tutor] content script pong", contentPong.payload);
        }
      }

      return {
        type: "hub:pong",
        payload: { from: "background", tabId },
      };
    }

    case "hub:request-content-status": {
      const tabId = await getActiveTabId();
      if (tabId !== undefined) {
        await requestContentPing(tabId);
      }
      return {
        type: "hub:pong",
        payload: { from: "background", tabId },
      };
    }

    case "hub:content-ping": {
      console.info("[tutor] content-ping", message.payload?.url);
      await forwardToPanel(message);
      return {
        type: "hub:pong",
        payload: { from: "background" },
      };
    }

    case "page:requestExtract": {
      if (sender.tab) {
        console.warn("[tutor] page:requestExtract from content tab, ignored");
        return undefined;
      }
      const tabId = await getActiveTabId();
      if (tabId === undefined) {
        console.warn("[tutor] page:requestExtract — no http(s) active tab");
        return {
          type: "hub:pong",
          payload: { from: "background" },
        };
      }
      console.info("[tutor] page:requestExtract → tab", tabId);
      await requestPageExtract(tabId);
      return {
        type: "hub:pong",
        payload: { from: "background", tabId },
      };
    }

    case "page:extracted": {
      console.info(
        "[tutor] page:extracted",
        message.payload.title,
        message.payload.blocks.length,
        "blocks",
      );
      await forwardToPanel(message);
      return {
        type: "hub:pong",
        payload: { from: "background" },
      };
    }

    default:
      console.warn("[tutor] unhandled message type", message.type);
      return undefined;
  }
}

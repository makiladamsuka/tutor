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

/** Tab where we last scraped / got content-ping — used when side panel has focus. */
let lastArticleTabId: number | undefined;

function rememberArticleTab(tabId: number | undefined): void {
  if (tabId !== undefined) {
    lastArticleTabId = tabId;
  }
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

/** Prefer focused http(s) tab; fall back to last scraped article tab. */
async function getArticleTabId(): Promise<number | undefined> {
  const active = await getActiveTabId();
  if (active !== undefined) {
    return active;
  }
  if (lastArticleTabId === undefined) {
    return undefined;
  }
  try {
    const tab = await chrome.tabs.get(lastArticleTabId);
    if (tab.url?.startsWith("http://") || tab.url?.startsWith("https://")) {
      return lastArticleTabId;
    }
  } catch {
    lastArticleTabId = undefined;
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

async function forwardToContentTab(
  message: TutorMessage,
): Promise<number | undefined> {
  const tabId = await getArticleTabId();
  if (tabId === undefined) {
    console.warn(
      "[tutor]",
      message.type,
      "— no article tab (scrape the page first, or focus the article tab)",
    );
    return undefined;
  }
  try {
    await chrome.tabs.sendMessage(tabId, message);
    console.info("[tutor]", message.type, "→ tab", tabId);
    return tabId;
  } catch (err) {
    console.warn(
      "[tutor]",
      message.type,
      "forward failed — reload the article tab at chrome://extensions",
      err,
    );
    return undefined;
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
      rememberArticleTab(sender.tab?.id);
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
      const tabId = await getArticleTabId();
      if (tabId === undefined) {
        console.warn(
          "[tutor] page:requestExtract — focus the article tab, then scrape",
        );
        return {
          type: "hub:pong",
          payload: { from: "background" },
        };
      }
      rememberArticleTab(tabId);
      console.info("[tutor] page:requestExtract → tab", tabId);
      await requestPageExtract(tabId);
      return {
        type: "hub:pong",
        payload: { from: "background", tabId },
      };
    }

    case "page:extracted": {
      rememberArticleTab(sender.tab?.id);
      console.info(
        "[tutor] page:extracted",
        message.payload.title,
        message.payload.blocks.length,
        "blocks",
        "tab",
        sender.tab?.id,
      );
      await forwardToPanel(message);
      return {
        type: "hub:pong",
        payload: { from: "background" },
      };
    }

    case "page:highlight": {
      if (sender.tab) {
        console.warn("[tutor] page:highlight from content tab, ignored");
        return undefined;
      }
      const tabId = await forwardToContentTab(message);
      return {
        type: "hub:pong",
        payload: { from: "background", tabId },
      };
    }

    case "page:clearHighlights": {
      if (sender.tab) {
        console.warn("[tutor] page:clearHighlights from content tab, ignored");
        return undefined;
      }
      const tabId = await forwardToContentTab(message);
      return {
        type: "hub:pong",
        payload: { from: "background", tabId },
      };
    }

    default:
      console.warn("[tutor] unhandled message type", message.type);
      return undefined;
  }
}

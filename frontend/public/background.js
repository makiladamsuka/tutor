chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

let lastActiveTabId = null;

async function resolveTargetTabId(message, sender) {
  if (message?.tabId != null) {
    return message.tabId;
  }
  if (sender.tab?.id != null) {
    return sender.tab.id;
  }
  const [tab] = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });
  if (tab?.id != null) {
    return tab.id;
  }
  return lastActiveTabId;
}

async function refreshActiveTab() {
  const [tab] = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });
  if (tab?.id != null) {
    lastActiveTabId = tab.id;
  }
}

chrome.tabs.onActivated.addListener(({ tabId }) => {
  lastActiveTabId = tabId;
});

chrome.windows.onFocusChanged.addListener(() => {
  refreshActiveTab();
});

refreshActiveTab();

const PANEL_TO_CONTENT = new Set([
  "page:extract",
  "page:highlight",
  "page:clearHighlights",
]);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message?.type || !PANEL_TO_CONTENT.has(message.type)) {
    return;
  }

  const contentMessage = { type: message.type };
  if (message.type === "page:highlight" && message.payload) {
    contentMessage.payload = message.payload;
  }

  resolveTargetTabId(message, sender).then((tabId) => {
    if (tabId == null) {
      sendResponse({
        error:
          "No active tab found. Click the page tab, then try Activate again.",
      });
      return;
    }

    chrome.tabs.sendMessage(tabId, contentMessage, (response) => {
      if (chrome.runtime.lastError) {
        const err = chrome.runtime.lastError.message ?? "tab_message_failed";
        sendResponse({
          error:
            err.includes("Receiving end does not exist") ||
            err.includes("Could not establish connection")
              ? "Content script not loaded. Refresh the page tab, then try again."
              : err,
        });
        return;
      }

      if (message.type === "page:extract" && response?.payload) {
        chrome.runtime
          .sendMessage({
            type: "page:extracted",
            payload: response.payload,
          })
          .catch(() => {});
      }

      sendResponse(response ?? { ok: true });
    });
  });

  return true;
});

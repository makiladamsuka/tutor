chrome.action.onClicked.addListener((tab) => {
  // Opens the side panel when the extension icon is clicked
  chrome.sidePanel.open({ windowId: tab.windowId });
});

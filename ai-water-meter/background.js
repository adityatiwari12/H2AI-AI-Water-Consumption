chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "OPEN_ANALYSIS") {
    chrome.windows.create({
      url: chrome.runtime.getURL("popup/popup.html"),
      type: "popup",
      width: 380,
      height: 520,
    });
  }
});

const HOST = "ai.robotheads.orchestra";
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "orchestra-scan-site",
      title: "Scan this site with Robot Orchestra…",
      contexts: ["page"],
    });
  });
  if (chrome.sidePanel?.setPanelBehavior) {
    void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  }
});
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== "orchestra-scan-site" || !tab?.id || !/^https?:/i.test(tab.url || "")) return;
  void chrome.storage.session.set({
    pendingScan: { tabId: tab.id, url: tab.url, title: tab.title || "" },
  }).then(() => chrome.sidePanel.open({ tabId: tab.id }));
});
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (
    !["browser-ping", "browser-context", "copilot-task"].includes(message?.type)
  )
    return;
  chrome.runtime.sendNativeMessage(HOST, message, (response) => {
    const error = chrome.runtime.lastError;
    sendResponse(
      error
        ? { ok: false, error: error.message }
        : response || { ok: false, error: "Desktop app did not respond." },
    );
  });
  return true;
});

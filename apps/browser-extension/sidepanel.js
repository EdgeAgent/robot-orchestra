import { crawlSite, toHermesContext } from "./crawler.mjs";

const thread = document.querySelector("#thread");
const form = document.querySelector("#ask-form");
const prompt = document.querySelector("#prompt");
const askButton = document.querySelector("#ask");
const titleEl = document.querySelector("#tab-title");
const urlEl = document.querySelector("#tab-url");
const statusEl = document.querySelector("#share-status");
const connectionEl = document.querySelector("#connection");
const scanButton = document.querySelector("#scan");
const cancelButton = document.querySelector("#cancel-scan");
const scanStatus = document.querySelector("#scan-status");
const scanProgress = document.querySelector("#scan-progress");
const scanResults = document.querySelector("#scan-results");
const scanPages = document.querySelector("#scan-pages");
const scanSummaryTitle = document.querySelector("#scan-summary-title");
const includeScan = document.querySelector("#include-scan");
const maxPagesSelect = document.querySelector("#max-pages");
const saveScanButton = document.querySelector("#save-scan");
const saveScanStatus = document.querySelector("#save-scan-status");
let activeContext = null;
let activeTabId = null;
let crawlController = null;
let crawlContext = null;
let crawlResult = null;

function bubble(text, kind = "assistant") {
  const el = document.createElement("div");
  el.className = `bubble ${kind}`;
  el.textContent = text;
  thread.append(el);
  thread.scrollTop = thread.scrollHeight;
  return el;
}
async function currentPage() {
  const [tab] = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });
  if (!tab?.id || !/^https?:/.test(tab.url || "")) {
    throw new Error(
      "Open a regular web page first. Browser-internal pages cannot be shared or scanned.",
    );
  }
  let selectedText = "";
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.getSelection()?.toString().slice(0, 12000) || "",
    });
    selectedText = result?.result || "";
  } catch {
    throw new Error(
      "Click the Orchestra toolbar button on this tab to grant temporary page access, then try again.",
    );
  }
  return { tabId: tab.id, url: tab.url, title: tab.title || "", selectedText };
}
async function refreshActivePage() {
  try {
    const context = await currentPage();
    activeContext = context;
    activeTabId = context.tabId;
    titleEl.textContent = context.title || "Untitled page";
    urlEl.textContent = context.url;
    scanButton.disabled = false;
    scanStatus.textContent =
      "Site access is requested only when you start a scan.";
  } catch (error) {
    activeContext = null;
    activeTabId = null;
    titleEl.textContent = "No regular page available";
    urlEl.textContent = error.message;
    scanButton.disabled = true;
    scanStatus.textContent = "Open a regular HTTP/HTTPS page to scan.";
  }
}
function nativeSend(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      const error = chrome.runtime.lastError;
      if (error)
        return reject(
          new Error(
            `${error.message}. Is the Robot Orchestra desktop app installed and open?`,
          ),
        );
      if (!response?.ok)
        return reject(
          new Error(
            response?.error || "The desktop app did not accept the request.",
          ),
        );
      resolve(response);
    });
  });
}
async function probeDesktop() {
  try {
    await nativeSend({ type: "browser-ping" });
    connectionEl.style.background = "#79d9ac";
    connectionEl.title = "Desktop app connected";
  } catch {
    connectionEl.style.background = "#d7a66b";
    connectionEl.title = "Open the desktop app to connect";
  }
}
function clearCrawl() {
  crawlContext = null;
  crawlResult = null;
  includeScan.checked = false;
  scanResults.hidden = true;
  scanPages.replaceChildren();
  scanProgress.hidden = true;
  scanStatus.textContent = "No scan running.";
}
function showCrawl(result) {
  crawlResult = result;
  crawlContext = toHermesContext(result);
  scanPages.replaceChildren();
  for (const page of result.pages.slice(0, 12)) {
    const row = document.createElement("article");
    row.className = "scan-page-row";
    const heading = document.createElement("b");
    heading.textContent = page.title || "Untitled page";
    const link = document.createElement("small");
    link.textContent = page.url;
    const snippet = document.createElement("p");
    snippet.textContent = page.text.slice(0, 260) || "No readable text found.";
    row.append(heading, link, snippet);
    scanPages.append(row);
  }
  const skipped = result.errors.length;
  scanSummaryTitle.textContent = `${result.pages.length} pages read${skipped ? ` · ${skipped} skipped` : ""} · ${result.robotsStatus === "checked" ? "robots.txt checked" : "robots.txt unavailable"}`;
  scanResults.hidden = false;
  scanStatus.textContent = result.cancelled
    ? "Scan stopped. Partial results are available below."
    : `Scan complete: ${result.pages.length} readable pages from ${new URL(result.origin).hostname}.`;
  scanProgress.hidden = false;
  scanProgress.value = result.visited;
}

// Cache the active tab before a scan click so the permission request itself
// stays directly inside the user's click gesture.
async function initializePanel() {
  try {
    const { pendingScan } = await chrome.storage.session.get("pendingScan");
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (pendingScan && tab?.id === pendingScan.tabId) {
      await chrome.storage.session.remove("pendingScan");
      activeContext = { tabId: tab.id, url: pendingScan.url, title: pendingScan.title || "", selectedText: "" };
      activeTabId = tab.id;
      titleEl.textContent = activeContext.title || "Untitled page";
      urlEl.textContent = activeContext.url;
      scanButton.disabled = false;
      scanStatus.textContent = "Right-click request ready. Confirm this site and click Scan this site; Chrome will ask permission.";
      scanButton.focus();
      return;
    }
  } catch { /* Fall back to the active page preview. */ }
  void refreshActivePage();
}
void initializePanel();
chrome.tabs.onActivated.addListener(() => void refreshActivePage());
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (
    tabId === activeTabId &&
    (changeInfo.url || changeInfo.status === "complete")
  )
    void refreshActivePage();
});

chrome.permissions.onRemoved.addListener((removed) => {
  if (
    !activeContext ||
    !removed.origins?.some((pattern) =>
      pattern.startsWith(new URL(activeContext.url).origin),
    )
  )
    return;
  if (!crawlController)
    scanStatus.textContent =
      "Site permission was removed. Start a new scan to request access again.";
});

document.querySelector("#share").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  statusEl.textContent = "Reading the active tab…";
  try {
    const context = await currentPage();
    activeContext = context;
    activeTabId = context.tabId;
    await nativeSend({ type: "browser-context", context });
    titleEl.textContent = context.title || "Untitled page";
    urlEl.textContent = context.url;
    statusEl.textContent = context.selectedText
      ? "Shared tab and selected text."
      : "Shared tab details. Select page text to include an excerpt.";
    connectionEl.style.background = "#79d9ac";
    connectionEl.title = "Desktop app connected";
  } catch (error) {
    statusEl.textContent = error.message;
    connectionEl.style.background = "#d98282";
  } finally {
    button.disabled = false;
  }
});

scanButton.addEventListener("click", () => {
  if (crawlController) return;
  if (!activeContext || !activeTabId) {
    scanStatus.textContent = "Refresh the current tab and try again.";
    void refreshActivePage();
    return;
  }
  let origin;
  const startUrl = activeContext.url;
  try {
    origin = new URL(startUrl).origin;
  } catch {
    scanStatus.textContent = "The current page URL is not valid.";
    return;
  }
  scanButton.disabled = true;
  scanStatus.textContent = `Requesting permission for ${new URL(origin).hostname}…`;
  // Per-site host access is optional and requested only after this explicit click.
  chrome.permissions.request({ origins: [`${origin}/*`] }, (granted) => {
    const permissionError = chrome.runtime.lastError;
    if (permissionError) {
      scanStatus.textContent = permissionError.message;
      scanButton.disabled = false;
      return;
    }
    if (!granted) {
      scanStatus.textContent =
        "Site access was not granted; no pages were read.";
      scanButton.disabled = false;
      return;
    }
    const controller = new AbortController();
    crawlController = controller;
    const maxPages = Number(maxPagesSelect.value) || 25;
    scanProgress.hidden = false;
    scanProgress.max = maxPages;
    scanProgress.value = 0;
    scanResults.hidden = true;
    includeScan.checked = false;
    cancelButton.hidden = false;
    scanStatus.textContent = `Starting a same-origin scan · up to ${maxPages} pages…`;
    void crawlSite(startUrl, {
      maxPages,
      maxDepth: 2,
      signal: controller.signal,
      onProgress: (progress) => {
        scanProgress.value = Math.min(progress.visited, maxPages);
        scanStatus.textContent = `Read ${progress.found} · visited ${progress.visited}/${maxPages} · queued ${progress.queued}${progress.current ? ` · ${String(progress.current).slice(0, 60)}` : ""}`;
      },
    })
      .then(showCrawl)
      .catch((error) => {
        scanStatus.textContent =
          error.message || "The site scan could not complete.";
      })
      .finally(() => {
        crawlController = null;
        scanButton.disabled = false;
        cancelButton.hidden = true;
      });
  });
});
cancelButton.addEventListener("click", () => {
  crawlController?.abort();
  cancelButton.disabled = true;
  scanStatus.textContent = "Stopping the scan…";
  window.setTimeout(() => {
    cancelButton.disabled = false;
  }, 400);
});
document.querySelector("#clear-scan").addEventListener("click", clearCrawl);
saveScanButton.addEventListener("click", async () => {
  if (!crawlContext) return;
  saveScanButton.disabled = true;
  saveScanStatus.textContent = "Saving reviewed scan text to this computer…";
  try {
    const result = await nativeSend({ type: "browser-save-scan", context: crawlContext, pageCount: crawlResult?.pages.length || 0 });
    saveScanStatus.textContent = result.message || "Saved to your local Brain.";
  } catch (error) {
    saveScanStatus.textContent = error.message;
  } finally {
    saveScanButton.disabled = false;
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const task = prompt.value.trim();
  if (!task) return;
  askButton.disabled = true;
  bubble(task, "user");
  prompt.value = "";
  const waiting = bubble(
    includeScan.checked && crawlContext
      ? "Sending your request and chosen site-scan excerpt to the selected model…"
      : "Sending this request to the selected model…",
  );
  try {
    const context =
      includeScan.checked && crawlContext ? crawlContext : await currentPage();
    const result = await nativeSend({ type: "copilot-task", task, context });
    titleEl.textContent = context.title || "Untitled page";
    urlEl.textContent = context.url;
    connectionEl.style.background = "#79d9ac";
    connectionEl.title = "Desktop app connected";
    waiting.textContent =
      result.message ||
      "The selected model accepted the request. Open Robot Orchestra to view the task activity.";
    if (includeScan.checked && crawlContext) includeScan.checked = false;
  } catch (error) {
    waiting.className = "bubble error";
    waiting.textContent = error.message;
    connectionEl.style.background = "#d98282";
  } finally {
    askButton.disabled = false;
  }
});

void probeDesktop();

const DEFAULT_TARGET_URL = "https://crazy-learning.onrender.com";

const getTargetUrl = async () => {
  const stored = await chrome.storage.sync.get(["linguaFlowTargetUrl"]);
  return stored.linguaFlowTargetUrl || DEFAULT_TARGET_URL;
};

const getBestSourceTitle = async (tab) => {
  if (!tab?.id) {
    return tab?.title || DEFAULT_TARGET_URL;
  }

  try {
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: "linguaflow-get-selection",
    });
    if (response?.source) {
      return response.source;
    }
  } catch {
    // content script may not answer on some pages
  }

  return tab?.title || (() => {
    try {
      return new URL(tab?.url || DEFAULT_TARGET_URL).hostname;
    } catch {
      return "Web Clip";
    }
  })();
};

const buildImportUrl = async ({ text, type, source, url: sourceUrl }) => {
  const targetUrl = await getTargetUrl();
  const url = new URL(targetUrl);
  url.searchParams.set("clipText", text);
  url.searchParams.set("clipType", type);
  url.searchParams.set("clipSource", source || "Web Clip");
  if (sourceUrl) {
    url.searchParams.set("clipUrl", sourceUrl);
  }
  return url.toString();
};

const openLinguaFlowImport = async ({ text, type, source, url: sourceUrl }) => {
  if (!text) return;
  const url = await buildImportUrl({ text, type, source, url: sourceUrl });
  const targetOrigin = new URL(url).origin;
  const tabs = await chrome.tabs.query({});
  const existingTab = tabs.find((tab) => {
    if (!tab.url) return false;
    try {
      return new URL(tab.url).origin === targetOrigin;
    } catch {
      return false;
    }
  });

  if (existingTab?.id) {
    await chrome.tabs.update(existingTab.id, { url, active: true });
    if (typeof existingTab.windowId === "number") {
      await chrome.windows.update(existingTab.windowId, { focused: true });
    }
    return;
  }

  await chrome.tabs.create({ url });
};

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "linguaflow-save-word",
    title: "Save to LinguaFlow as Word",
    contexts: ["selection"],
  });
  chrome.contextMenus.create({
    id: "linguaflow-save-sentence",
    title: "Save to LinguaFlow as Sentence",
    contexts: ["selection"],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const text = (info.selectionText || "").trim();
  if (!text) return;
  const type = info.menuItemId === "linguaflow-save-word" ? "word" : "sentence";
  const source = await getBestSourceTitle(tab);
  openLinguaFlowImport({
    text,
    type,
    source,
    url: tab?.url,
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "linguaflow-save-selection") {
    openLinguaFlowImport(message.payload).then(() => sendResponse({ ok: true }));
    return true;
  }
  return false;
});

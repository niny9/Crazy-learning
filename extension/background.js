const DEFAULT_TARGET_URL = "https://crazy-learning.onrender.com";

const getTargetUrl = async () => {
  const stored = await chrome.storage.sync.get(["linguaFlowTargetUrl"]);
  return stored.linguaFlowTargetUrl || DEFAULT_TARGET_URL;
};

const getClipperSettings = async () => {
  const stored = await chrome.storage.sync.get([
    "linguaFlowTargetUrl",
    "linguaFlowClipperToken",
  ]);

  return {
    targetUrl: stored.linguaFlowTargetUrl || DEFAULT_TARGET_URL,
    clipperToken: stored.linguaflowClipperToken || stored.linguaFlowClipperToken || "",
  };
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

const tryDirectImport = async ({ text, type, source, url: sourceUrl }) => {
  const settings = await getClipperSettings();
  if (!settings.clipperToken) {
    return { ok: false, reason: "missing-config" };
  }

  try {
    const endpoint = new URL("/api/clipper/import", settings.targetUrl).toString();
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        clipperToken: settings.clipperToken,
        text,
        type,
        source,
        sourceUrl,
        language: "English",
      }),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      return { ok: false, reason: errorBody?.error || `http-${response.status}` };
    }

    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "network-error" };
  }
};

const saveSelectionToLinguaFlow = async ({ text, type, source, url: sourceUrl }) => {
  const directResult = await tryDirectImport({ text, type, source, url: sourceUrl });
  if (directResult.ok) {
    return { ok: true, mode: "direct" };
  }

  await openLinguaFlowImport({ text, type, source, url: sourceUrl });
  return { ok: true, mode: "page", reason: directResult.reason };
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
  await saveSelectionToLinguaFlow({
    text,
    type,
    source,
    url: tab?.url,
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "linguaflow-save-selection") {
    saveSelectionToLinguaFlow(message.payload)
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : "save-failed" }));
    return true;
  }
  return false;
});

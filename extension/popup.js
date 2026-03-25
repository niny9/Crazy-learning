const DEFAULT_TARGET_URL = "https://crazy-learning.onrender.com";

const clipTextInput = document.getElementById("clipText");
const clipTypeInput = document.getElementById("clipType");
const clipSourceInput = document.getElementById("clipSource");
const targetUrlInput = document.getElementById("targetUrl");
const clipperTokenInput = document.getElementById("clipperToken");
const statusNode = document.getElementById("status");
const saveWordButton = document.getElementById("saveWord");
const saveSentenceButton = document.getElementById("saveSentence");

const setStatus = (message) => {
  statusNode.textContent = message || "";
};

const inferClipType = (text) => {
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.length > 2 ? "sentence" : "word";
};

const readSelectionFromActiveTab = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    return null;
  }

  try {
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: "linguaflow-get-selection",
    });
    if (response?.text) {
      return response;
    }
  } catch {
    // content script may not be available on browser internal pages
  }

  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const selection = window.getSelection();
        return {
          text: (selection?.toString() || "").trim(),
          source: document.title || window.location.hostname,
          url: window.location.href,
        };
      },
    });
    return result?.result || null;
  } catch {
    return null;
  }
};

const bootstrap = async () => {
  const storage = await chrome.storage.local.get(["linguaflowLastSelection"]);
  const syncStorage = await chrome.storage.sync.get([
    "linguaFlowTargetUrl",
    "linguaFlowClipperToken",
  ]);
  const liveSelection = await readSelectionFromActiveTab();
  const fallbackSelection = storage.linguaflowLastSelection || {};
  const text = liveSelection?.text || fallbackSelection.text || "";
  clipTextInput.value = text;
  clipTypeInput.value = inferClipType(text);
  clipSourceInput.value = liveSelection?.source || fallbackSelection.source || "";
  targetUrlInput.value = syncStorage.linguaFlowTargetUrl || DEFAULT_TARGET_URL;
  clipperTokenInput.value = syncStorage.linguaFlowClipperToken || "";

  if (liveSelection?.text) {
    await chrome.storage.local.set({
      linguaflowLastSelection: {
        text: liveSelection.text,
        source: liveSelection.source || fallbackSelection.source || "",
        url: liveSelection.url || fallbackSelection.url || "",
        updatedAt: Date.now(),
      },
    });
    setStatus("Selection captured from current page.");
  }
};

const saveTargetUrl = async () => {
  const nextValue = targetUrlInput.value.trim() || DEFAULT_TARGET_URL;
  await chrome.storage.sync.set({ linguaFlowTargetUrl: nextValue });
};

const saveDirectImportConfig = async () => {
  await chrome.storage.sync.set({
    linguaFlowClipperToken: clipperTokenInput.value.trim(),
  });
};

const sendSelection = async (type) => {
  const text = clipTextInput.value.trim();
  if (!text) {
    setStatus("Please select something first.");
    return;
  }

  await saveTargetUrl();
  await saveDirectImportConfig();

  const local = await chrome.storage.local.get(["linguaflowLastSelection"]);
  const source = clipSourceInput.value.trim() || local.linguaflowLastSelection?.source || "Web Clip";
  const sourceUrl = local.linguaflowLastSelection?.url || "";

  chrome.runtime.sendMessage(
    {
      type: "linguaflow-save-selection",
      payload: {
        text,
        type,
        source,
        url: sourceUrl,
      },
    },
    (response) => {
      if (response?.ok && response?.mode === "direct") {
        setStatus(type === "word" ? "Word saved directly." : "Sentence saved directly.");
        return;
      }
      if (response?.ok) {
        setStatus(type === "word" ? "Opened LinguaFlow to finish saving." : "Opened LinguaFlow to finish saving.");
        return;
      }
      setStatus(`Save failed: ${response?.error || "unknown error"}`);
    }
  );
};

saveWordButton.addEventListener("click", () => sendSelection("word"));
saveSentenceButton.addEventListener("click", () => sendSelection("sentence"));
clipTextInput.addEventListener("input", () => {
  clipTypeInput.value = inferClipType(clipTextInput.value);
});
clipTypeInput.addEventListener("change", () => {
  setStatus(`Default type set to ${clipTypeInput.value}.`);
});
targetUrlInput.addEventListener("change", () => {
  void saveTargetUrl();
  setStatus("LinguaFlow URL updated.");
});
clipperTokenInput.addEventListener("change", () => {
  void saveDirectImportConfig();
  setStatus("Clipper token saved.");
});

document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "enter") {
    event.preventDefault();
    void sendSelection(clipTypeInput.value);
  }
});

void bootstrap();

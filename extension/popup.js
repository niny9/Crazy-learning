const DEFAULT_TARGET_URL = "https://crazy-learning.onrender.com";

const clipTextInput = document.getElementById("clipText");
const clipTypeInput = document.getElementById("clipType");
const clipSourceInput = document.getElementById("clipSource");
const targetUrlInput = document.getElementById("targetUrl");
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

const bootstrap = async () => {
  const storage = await chrome.storage.local.get(["linguaflowLastSelection"]);
  const syncStorage = await chrome.storage.sync.get(["linguaFlowTargetUrl"]);
  const text = storage.linguaflowLastSelection?.text || "";
  clipTextInput.value = text;
  clipTypeInput.value = inferClipType(text);
  clipSourceInput.value = storage.linguaflowLastSelection?.source || "";
  targetUrlInput.value = syncStorage.linguaFlowTargetUrl || DEFAULT_TARGET_URL;
};

const saveTargetUrl = async () => {
  const nextValue = targetUrlInput.value.trim() || DEFAULT_TARGET_URL;
  await chrome.storage.sync.set({ linguaFlowTargetUrl: nextValue });
};

const sendSelection = async (type) => {
  const text = clipTextInput.value.trim();
  if (!text) {
    setStatus("Please select something first.");
    return;
  }

  await saveTargetUrl();

  const local = await chrome.storage.local.get(["linguaflowLastSelection"]);
  const source = clipSourceInput.value.trim() || local.linguaflowLastSelection?.source || "Web Clip";

  chrome.runtime.sendMessage(
    {
      type: "linguaflow-save-selection",
      payload: {
        text,
        type,
        source,
      },
    },
    () => {
      setStatus(type === "word" ? "Word sent to LinguaFlow." : "Sentence sent to LinguaFlow.");
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

document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "enter") {
    event.preventDefault();
    void sendSelection(clipTypeInput.value);
  }
});

void bootstrap();

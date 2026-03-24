const getBestPageTitle = () => {
  const candidates = [
    document.querySelector('meta[property="og:title"]')?.getAttribute("content"),
    document.querySelector('meta[name="twitter:title"]')?.getAttribute("content"),
    document.querySelector("article h1")?.textContent,
    document.querySelector("main h1")?.textContent,
    document.querySelector("h1")?.textContent,
    document.title,
  ];

  return candidates.map((item) => (item || "").trim()).find(Boolean) || window.location.hostname;
};

const storeSelection = () => {
  const selection = window.getSelection();
  const text = (selection?.toString() || "").trim();
  if (!text) return;
  chrome.storage.local.set({
    linguaflowLastSelection: {
      text,
      source: getBestPageTitle(),
      url: window.location.href,
      updatedAt: Date.now(),
    },
  });
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "linguaflow-get-selection") {
    const selection = window.getSelection();
    const text = (selection?.toString() || "").trim();
    sendResponse({
      text,
      source: getBestPageTitle(),
      url: window.location.href,
    });
    return true;
  }
  return false;
});

document.addEventListener("mouseup", () => {
  window.setTimeout(storeSelection, 0);
});

document.addEventListener("keyup", (event) => {
  if (event.key === "Shift" || event.key === "ArrowLeft" || event.key === "ArrowRight") {
    window.setTimeout(storeSelection, 0);
  }
});

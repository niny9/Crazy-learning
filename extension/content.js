const storeSelection = () => {
  const selection = window.getSelection();
  const text = (selection?.toString() || "").trim();
  if (!text) return;
  chrome.storage.local.set({
    linguaflowLastSelection: {
      text,
      source: document.title || window.location.hostname,
      url: window.location.href,
      updatedAt: Date.now(),
    },
  });
};

document.addEventListener("mouseup", () => {
  window.setTimeout(storeSelection, 0);
});

document.addEventListener("keyup", (event) => {
  if (event.key === "Shift" || event.key === "ArrowLeft" || event.key === "ArrowRight") {
    window.setTimeout(storeSelection, 0);
  }
});

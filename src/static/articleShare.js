document.addEventListener("click", async (event) => {
  const button = event.target.closest(".article-share-button");
  if (!button) {
    return;
  }

  const url = new URL(button.dataset.shareUrl || window.location.pathname, window.location.origin).toString();
  const title = button.dataset.shareTitle || document.title;
  const shareData = { title, url };

  try {
    if (navigator.share) {
      await navigator.share(shareData);
    } else if (navigator.clipboard) {
      await navigator.clipboard.writeText(url);
      button.dataset.originalLabel = button.dataset.originalLabel || button.textContent.trim();
      button.querySelector("span:last-child").textContent = "Copied";
      window.setTimeout(() => {
        const label = button.querySelector("span:last-child");
        if (label) {
          label.textContent = button.dataset.originalLabel || "Share";
        }
      }, 1600);
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return;
    }
    throw error;
  }
});

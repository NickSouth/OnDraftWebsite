function initializeHtmlVideoUploader(root = document) {
  root.querySelectorAll("[data-html-video-uploader]").forEach((uploader) => {
    if (uploader.dataset.htmlVideoReady === "true") {
      return;
    }
    uploader.dataset.htmlVideoReady = "true";

    const input = uploader.querySelector("[data-html-video-input]");
    const button = uploader.querySelector("[data-html-video-upload]");
    const status = uploader.querySelector("[data-html-video-status]");

    function setStatus(message, state = "idle") {
      if (!status) {
        return;
      }
      status.textContent = message;
      status.dataset.state = state;
    }

    button?.addEventListener("click", async () => {
      const file = input?.files?.[0];
      if (!file) {
        setStatus("Choose a video before uploading.", "error");
        input?.focus();
        return;
      }

      const formData = new FormData();
      formData.append("htmlVideo", file);
      button.disabled = true;
      setStatus("Uploading video...", "pending");

      try {
        const response = await fetch("/articles/html-videos", {
          method: "POST",
          body: formData,
          credentials: "same-origin",
          headers: {
            Accept: "application/json",
          },
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.url) {
          throw new Error(payload.error || "Unable to upload that video.");
        }
        const markup = `<video src="${payload.url}" controls preload="metadata"></video>`;
        await navigator.clipboard?.writeText(markup).catch(() => undefined);
        setStatus(`${payload.url} copied as a video tag.`, "success");
        input.value = "";
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Unable to upload that video.", "error");
      } finally {
        button.disabled = false;
      }
    });
  });
}

document.addEventListener("DOMContentLoaded", () => initializeHtmlVideoUploader());
document.body.addEventListener("htmx:afterSwap", (event) => initializeHtmlVideoUploader(event.target));

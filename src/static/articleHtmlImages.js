function initializeHtmlImageUploader(root = document) {
  root.querySelectorAll("[data-html-image-uploader]").forEach((uploader) => {
    if (uploader.dataset.htmlImageReady === "true") {
      return;
    }
    uploader.dataset.htmlImageReady = "true";

    const input = uploader.querySelector("[data-html-image-input]");
    const button = uploader.querySelector("[data-html-image-upload]");
    const status = uploader.querySelector("[data-html-image-status]");

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
        setStatus("Choose an image before uploading.", "error");
        input?.focus();
        return;
      }

      const formData = new FormData();
      formData.append("htmlImage", file);
      button.disabled = true;
      setStatus("Uploading image...", "pending");

      try {
        const response = await fetch("/articles/html-images", {
          method: "POST",
          body: formData,
          credentials: "same-origin",
          headers: {
            Accept: "application/json",
          },
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.url) {
          throw new Error(payload.error || "Unable to upload that image.");
        }
        const markup = `<img src="${payload.url}" alt="">`;
        await navigator.clipboard?.writeText(markup).catch(() => undefined);
        setStatus(`${payload.url} copied as an image tag.`, "success");
        input.value = "";
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Unable to upload that image.", "error");
      } finally {
        button.disabled = false;
      }
    });
  });
}

document.addEventListener("DOMContentLoaded", () => initializeHtmlImageUploader());
document.body.addEventListener("htmx:afterSwap", (event) => initializeHtmlImageUploader(event.target));

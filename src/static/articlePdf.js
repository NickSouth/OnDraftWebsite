import * as pdfjsLib from "/vendor/pdfjs/build/pdf.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc = "/vendor/pdfjs/build/pdf.worker.mjs";

async function renderPdfArticle(container) {
  const pdfUrl = container.dataset.pdfUrl;
  if (!pdfUrl) {
    return;
  }

  const status = container.querySelector(".article-pdf-status");
  const pages = container.querySelector(".article-pdf-pages");

  try {
    const pdf = await pdfjsLib.getDocument(pdfUrl).promise;
    if (status) {
      status.textContent = "";
    }

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const containerWidth = Math.min(pages.clientWidth || 760, 980);
      const unscaledViewport = page.getViewport({ scale: 1 });
      const scale = containerWidth / unscaledViewport.width;
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");

      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.className = "article-pdf-page";
      canvas.setAttribute("aria-label", `Page ${pageNumber}`);
      pages.append(canvas);

      await page.render({ canvasContext: context, viewport }).promise;
    }
  } catch {
    if (status) {
      status.textContent = "Unable to render this PDF in the page.";
    }
  }
}

document.querySelectorAll("[data-pdf-url]").forEach((container) => {
  renderPdfArticle(container);
});

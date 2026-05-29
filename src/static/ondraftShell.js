(() => {
  let loaderTimeout = null;
  const isLocalNavigation = (link, event) => {
    if (!link || event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return false;
    }
    if (link.target || link.hasAttribute("download") || link.closest("[data-skip-global-loader]")) {
      return false;
    }
    const href = link.getAttribute("href") || "";
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
      return false;
    }
    const url = new URL(link.href, window.location.href);
    if (url.origin !== window.location.origin) {
      return false;
    }
    return url.pathname !== window.location.pathname || url.search !== window.location.search;
  };

  const showLoader = () => {
    window.clearTimeout(loaderTimeout);
    document.getElementById("site-loader")?.classList.remove("hidden");
    document.getElementById("site-loader")?.classList.add("grid");
    loaderTimeout = window.setTimeout(hideLoader, 10000);
  };

  const hideLoader = () => {
    window.clearTimeout(loaderTimeout);
    loaderTimeout = null;
    document.getElementById("site-loader")?.classList.add("hidden");
    document.getElementById("site-loader")?.classList.remove("grid");
  };

  document.addEventListener("htmx:beforeRequest", (event) => {
    const target = event.target;
    if (target instanceof HTMLElement && target.closest("[data-skip-global-loader]")) {
      return;
    }
    showLoader();
  });

  document.addEventListener("click", (event) => {
    const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
    if (isLocalNavigation(link, event)) {
      showLoader();
    }
  }, true);

  document.addEventListener("submit", (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || form.closest("[data-skip-global-loader]") || form.hasAttribute("hx-post") || form.hasAttribute("hx-get")) {
      return;
    }
    showLoader();
  }, true);

  document.addEventListener("htmx:afterRequest", hideLoader);
  document.addEventListener("htmx:beforeSwap", hideLoader);
  document.addEventListener("htmx:afterSettle", hideLoader);
  document.addEventListener("htmx:responseError", hideLoader);
  document.addEventListener("htmx:sendError", hideLoader);
  window.addEventListener("load", hideLoader);
  window.addEventListener("pageshow", hideLoader);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      hideLoader();
    }
  });
})();

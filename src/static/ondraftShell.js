(() => {
  let loaderTimeout = null;

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

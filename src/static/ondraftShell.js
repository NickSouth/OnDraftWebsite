(() => {
  const showLoader = () => {
    document.getElementById("site-loader")?.classList.remove("hidden");
    document.getElementById("site-loader")?.classList.add("grid");
  };

  const hideLoader = () => {
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
  document.addEventListener("htmx:responseError", hideLoader);
  document.addEventListener("htmx:sendError", hideLoader);
})();

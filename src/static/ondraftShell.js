(() => {
  let loaderTimeout = null;
  let skeletonTimeout = null;
  const skeletonDelay = 300;
  const fallbackDelay = 650;
  const spellcheckSelector = [
    "textarea",
    "[contenteditable='true']",
    "input:not([type])",
    "input[type='text']",
    "input[type='search']",
  ].join(",");

  const enableSpellcheck = (root = document) => {
    if (!(root instanceof Document || root instanceof Element || root instanceof DocumentFragment)) {
      return;
    }
    const fields = root.matches?.(spellcheckSelector)
      ? [root]
      : [...root.querySelectorAll(spellcheckSelector)];
    fields.forEach((field) => {
      field.setAttribute("spellcheck", "true");
    });
  };

  const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const animateDetailsPanel = (details, opening) => {
    const summary = details.querySelector("summary");
    const panel = summary?.nextElementSibling;
    if (!summary || !panel || reducedMotion()) {
      details.open = opening;
      return;
    }

    if (opening) {
      details.open = true;
      panel.style.overflow = "hidden";
      panel.style.height = "0px";
      panel.style.opacity = "0";
      panel.offsetHeight;
      panel.style.transition = "height 240ms ease, opacity 190ms ease";
      panel.style.height = `${panel.scrollHeight}px`;
      panel.style.opacity = "1";
      window.setTimeout(() => {
        panel.style.height = "";
        panel.style.opacity = "";
        panel.style.overflow = "";
        panel.style.transition = "";
      }, 250);
      return;
    }

    panel.style.overflow = "hidden";
    panel.style.height = `${panel.scrollHeight}px`;
    panel.style.opacity = "1";
    panel.offsetHeight;
    panel.style.transition = "height 220ms ease, opacity 170ms ease";
    panel.style.height = "0px";
    panel.style.opacity = "0";
    window.setTimeout(() => {
      details.open = false;
      panel.style.height = "";
      panel.style.opacity = "";
      panel.style.overflow = "";
      panel.style.transition = "";
    }, 230);
  };

  const enhanceAnimatedDetails = (root = document) => {
    if (!(root instanceof Document || root instanceof Element || root instanceof DocumentFragment)) {
      return;
    }
    root.querySelectorAll?.(".big-board-results details").forEach((details) => {
      if (details.dataset.animatedDetails === "true") {
        return;
      }
      details.dataset.animatedDetails = "true";
      details.querySelector("summary")?.addEventListener("click", (event) => {
        event.preventDefault();
        animateDetailsPanel(details, !details.open);
      });
    });
  };

  const replayAnimationClass = (element, className) => {
    element.classList.remove(className);
    element.getBoundingClientRect();
    element.classList.add(className);
  };

  const animateSwapSurfaces = (root = document) => {
    if (!(root instanceof Document || root instanceof Element || root instanceof DocumentFragment)) {
      return;
    }

    const surfaces = root.matches?.(".od-swap-surface")
      ? [root]
      : [...root.querySelectorAll?.(".od-swap-surface") ?? []];
    surfaces.forEach((surface) => replayAnimationClass(surface, "od-swap-active"));
  };

  const activatePageStage = (root = document) => {
    if (!(root instanceof Document || root instanceof Element || root instanceof DocumentFragment)) {
      return;
    }

    const stages = root.matches?.(".od-page-stage")
      ? [root]
      : [...root.querySelectorAll?.(".od-page-stage") ?? []];
    stages.forEach((stage) => window.requestAnimationFrame(() => stage.classList.add("is-ready")));
  };

  const isLocalNavigation = (link, event) => {
    if (!link || event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return false;
    }
    if (link.target || link.hasAttribute("download") || link.hasAttribute("hx-get") || link.hasAttribute("hx-post") || link.closest("[data-skip-global-loader]")) {
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

  const skeletonNameForPath = (pathname) => {
    if (pathname === "/") return "home";
    if (pathname === "/articles") return "articles";
    if (/^\/articles\/[^/]+$/.test(pathname)) return "article";
    if (pathname === "/videos") return "videos";
    if (pathname === "/bigboard") return "bigboard";
    if (pathname === "/hottakes") return "hottakes";
    if (pathname === "/bookmarks") return "bookmarks";
    if (pathname === "/about" || pathname === "/login" || pathname === "/register" || pathname === "/reset-password") {
      return "fallback";
    }
    return null;
  };

  const templateContent = (selector) => {
    const template = document.querySelector(selector);
    return template instanceof HTMLTemplateElement ? template.content.cloneNode(true) : null;
  };

  const fillSkeletonIncludes = (fragment) => {
    fragment.querySelectorAll("[data-skeleton-include]").forEach((placeholder) => {
      const name = placeholder.getAttribute("data-skeleton-include");
      const content = templateContent(`[data-result-skeleton="${name}"]`);
      if (content) {
        placeholder.replaceWith(content);
      }
    });
  };

  const showRouteSkeleton = (url) => {
    const name = skeletonNameForPath(url.pathname);
    const pageContent = document.querySelector("#page-content > .w-full");
    if (!name || !pageContent) {
      showLoader(fallbackDelay);
      return;
    }

    window.clearTimeout(skeletonTimeout);
    skeletonTimeout = window.setTimeout(() => {
      const content = templateContent(`[data-page-skeleton="${name}"]`);
      if (!content) {
        showLoader(0);
        return;
      }
      fillSkeletonIncludes(content);
      pageContent.replaceChildren(content);
      pageContent.querySelector(".od-page-skeleton")?.classList.add("is-visible");
    }, skeletonDelay);
  };

  const skeletonConfigFrom = (source) => {
    if (!(source instanceof Element)) {
      return null;
    }
    const configured = source.closest("[data-loading-skeleton]");
    if (!configured) {
      return null;
    }
    const name = configured.getAttribute("data-loading-skeleton");
    const targetSelector = configured.getAttribute("data-loading-skeleton-target") || configured.getAttribute("hx-target");
    if (!name || !targetSelector) {
      return null;
    }
    return { name, targetSelector };
  };

  const resolvedResultSkeletonName = (name, source) => {
    if (name === "article-results") {
      const configured = source instanceof Element ? source.closest("[data-loading-skeleton]") : null;
      const view = configured?.querySelector('input[name="view"]')?.value;
      return view === "list" ? "article-results-list" : "article-results-card";
    }
    if (name === "big-board-results") {
      return window.localStorage.getItem("bigBoardView") === "list" ? "big-board-results-list" : "big-board-results-card";
    }
    return name;
  };

  const showResultSkeleton = (source) => {
    const config = skeletonConfigFrom(source);
    if (!config) {
      return false;
    }

    const target = document.querySelector(config.targetSelector);
    const skeletonName = resolvedResultSkeletonName(config.name, source);
    const content = templateContent(`[data-result-skeleton="${skeletonName}"]`);
    if (!target || !content) {
      return false;
    }

    window.clearTimeout(skeletonTimeout);
    skeletonTimeout = window.setTimeout(() => {
      const firstElement = content.firstElementChild;
      if (firstElement?.id && firstElement.id === target.id) {
        target.className = firstElement.className;
        target.replaceChildren(...firstElement.childNodes);
      } else {
        target.replaceChildren(content);
      }
      target.classList.add("od-result-skeleton-active");
    }, skeletonDelay);
    return true;
  };

  const showLoader = (delay = fallbackDelay) => {
    window.clearTimeout(loaderTimeout);
    loaderTimeout = window.setTimeout(() => {
      document.getElementById("site-loader")?.classList.remove("hidden");
      document.getElementById("site-loader")?.classList.add("grid");
    }, delay);
  };

  const clearSkeletonTimeout = () => {
    window.clearTimeout(skeletonTimeout);
    skeletonTimeout = null;
  };

  const hideLoader = () => {
    clearSkeletonTimeout();
    window.clearTimeout(loaderTimeout);
    loaderTimeout = null;
    document.getElementById("site-loader")?.classList.add("hidden");
    document.getElementById("site-loader")?.classList.remove("grid");
  };

  window.addEventListener("ondraft:hide-global-loader", hideLoader);

  document.addEventListener("htmx:beforeRequest", (event) => {
    const target = event.target;
    if (target instanceof HTMLElement && target.closest("[data-use-global-loader]")) {
      showLoader(0);
      return;
    }
    if (target instanceof HTMLElement && target.closest("[data-skip-global-loader]")) {
      showResultSkeleton(target);
      return;
    }
    if (!showResultSkeleton(target)) {
      showLoader();
    }
  });

  document.addEventListener("click", (event) => {
    const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
    if (isLocalNavigation(link, event)) {
      showRouteSkeleton(new URL(link.href, window.location.href));
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
  document.addEventListener("htmx:afterSettle", (event) => {
    hideLoader();
    enableSpellcheck(event.detail?.target || document);
    enhanceAnimatedDetails(event.detail?.target || document);
    animateSwapSurfaces(event.detail?.target || document);
    activatePageStage(event.detail?.target || document);
  });
  document.addEventListener("htmx:responseError", hideLoader);
  document.addEventListener("htmx:sendError", hideLoader);
  window.addEventListener("load", () => {
    hideLoader();
    enableSpellcheck();
    enhanceAnimatedDetails();
    animateSwapSurfaces();
    activatePageStage();
  });
  window.addEventListener("pageshow", () => {
    hideLoader();
    activatePageStage();
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      hideLoader();
    }
  });

  new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        enableSpellcheck(node);
        enhanceAnimatedDetails(node);
        animateSwapSurfaces(node);
        activatePageStage(node);
      });
    });
  }).observe(document.documentElement, { childList: true, subtree: true });
  enableSpellcheck();
  enhanceAnimatedDetails();
  animateSwapSurfaces();
  activatePageStage();
})();

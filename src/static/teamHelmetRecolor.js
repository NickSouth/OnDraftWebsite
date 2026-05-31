(() => {
  const helmetSourceCache = new Map();
  const stats = {
    cacheHits: 0,
    observedHelmets: 0,
    visibleHelmets: 0,
    requestedHelmets: 0,
  };

  function generatedHelmetSource(element) {
    const source = element.dataset.generatedHelmetSrc;
    return typeof source === "string" && /^\/generated\/helmets\/v1\/[0-9a-f]{6}-[0-9a-f]{6}\.png$/.test(source)
      ? source
      : "/teamHelmetTemplate.png";
  }

  function revealHelmet(element) {
    element.dataset.recoloredHelmet = "true";
    element.style.opacity = "1";
  }

  function loadHelmet(element) {
    if (element.dataset.recoloredHelmet === "true") {
      return;
    }

    const source = generatedHelmetSource(element);
    const cachedSource = helmetSourceCache.get(source);
    if (cachedSource) {
      stats.cacheHits += 1;
      element.src = cachedSource;
      revealHelmet(element);
      return;
    }

    stats.requestedHelmets += 1;
    helmetSourceCache.set(source, source);
    element.addEventListener("load", () => revealHelmet(element), { once: true });
    element.addEventListener("error", () => {
      element.src = "/teamHelmetTemplate.png";
      revealHelmet(element);
    }, { once: true });
    element.src = source;
  }

  const helmetObserver = "IntersectionObserver" in window
    ? new window.IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) {
          return;
        }
        helmetObserver.unobserve(entry.target);
        stats.visibleHelmets += 1;
        loadHelmet(entry.target);
      });
    }, { rootMargin: "300px 0px" })
    : null;

  function watchHelmet(element) {
    if (element.dataset.recoloredHelmet === "true" || element.dataset.helmetObserved === "true") {
      return;
    }
    if (!helmetObserver) {
      stats.visibleHelmets += 1;
      loadHelmet(element);
      return;
    }
    element.dataset.helmetObserved = "true";
    stats.observedHelmets += 1;
    helmetObserver.observe(element);
  }

  function recolorHelmets(root = document) {
    root.querySelectorAll("[data-team-helmet]").forEach((element) => {
      watchHelmet(element);
    });
  }

  document.addEventListener("DOMContentLoaded", () => recolorHelmets());
  document.body.addEventListener("htmx:afterSwap", (event) => recolorHelmets(event.target));
  window.__teamHelmetRecolor = {
    recolorHelmets,
    stats,
    cacheSize: () => helmetSourceCache.size,
  };
})();

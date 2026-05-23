(() => {
  const form = document.querySelector("[data-unsaved-new-article]");
  if (!(form instanceof HTMLFormElement)) {
    return;
  }

  let dirty = false;
  let submitted = false;
  let pendingHref = null;
  let lastFocused = null;
  let modal = null;

  const focusableSelector = "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])";

  const buildModal = () => {
    const wrapper = document.createElement("div");
    wrapper.className = "unsaved-exit-modal";
    wrapper.setAttribute("role", "dialog");
    wrapper.setAttribute("aria-modal", "true");
    wrapper.setAttribute("aria-labelledby", "unsaved-exit-title");
    wrapper.innerHTML = `
      <div class="unsaved-exit-panel">
        <p class="unsaved-exit-kicker">Unsaved article</p>
        <h2 id="unsaved-exit-title">Warning, changes have not been saved.</h2>
        <p>Confirm exit to leave this article, or stay to keep editing.</p>
        <div class="unsaved-exit-actions">
          <button type="button" class="od-secondary-link" data-unsaved-stay>Stay</button>
          <button type="button" class="od-primary-link" data-unsaved-confirm>Confirm exit</button>
        </div>
      </div>
    `;
    document.body.append(wrapper);

    wrapper.querySelector("[data-unsaved-stay]")?.addEventListener("click", closeModal);
    wrapper.querySelector("[data-unsaved-confirm]")?.addEventListener("click", () => {
      submitted = true;
      if (pendingHref) {
        window.location.href = pendingHref;
      }
    });
    wrapper.addEventListener("click", (event) => {
      if (event.target === wrapper) {
        closeModal();
      }
    });
    wrapper.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeModal();
      }
      if (event.key !== "Tab") {
        return;
      }
      const focusable = [...wrapper.querySelectorAll(focusableSelector)].filter((element) => !element.hasAttribute("disabled"));
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) {
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });

    return wrapper;
  };

  function openModal(href) {
    pendingHref = href;
    lastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    modal = modal || buildModal();
    modal.classList.add("is-open");
    modal.querySelector("[data-unsaved-stay]")?.focus();
  }

  function closeModal() {
    pendingHref = null;
    modal?.classList.remove("is-open");
    lastFocused?.focus?.();
  }

  form.addEventListener("input", () => {
    dirty = true;
  });
  form.addEventListener("change", () => {
    dirty = true;
  });
  form.addEventListener("submit", () => {
    submitted = true;
  });

  document.addEventListener("click", (event) => {
    if (!dirty || submitted || event.defaultPrevented) {
      return;
    }
    const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
    if (!(link instanceof HTMLAnchorElement)) {
      return;
    }
    if (link.target && link.target !== "_self") {
      return;
    }
    const href = link.getAttribute("href");
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
      return;
    }
    event.preventDefault();
    openModal(link.href);
  });

  window.addEventListener("beforeunload", (event) => {
    if (!dirty || submitted) {
      return;
    }
    event.preventDefault();
    event.returnValue = "";
  });
})();

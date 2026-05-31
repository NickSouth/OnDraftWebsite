function normalizeTag(value) {
  return value.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

function tagArray(value) {
  return [...new Set((value || "").split(",").map(normalizeTag).filter(Boolean))];
}

function createTagChip(tag, removeTag) {
  const chip = document.createElement("span");
  chip.className = "tag-chip";

  const label = document.createElement("span");
  label.textContent = tag;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "tag-chip-remove";
  button.setAttribute("aria-label", `Remove ${tag}`);
  button.textContent = "x";
  button.addEventListener("click", () => removeTag(tag));

  chip.append(label, button);
  return chip;
}

document.querySelectorAll("[data-tag-editor], .tag-editor").forEach((editor) => {
  const input = editor.querySelector("[data-tag-input]");
  const hiddenInput = editor.querySelector("[data-tag-value]");
  const tagList = editor.querySelector("[data-tag-list]");
  const menu = editor.querySelector("[data-tag-menu]");
  const toggle = editor.querySelector("[data-tag-toggle]");
  const tagCount = editor.querySelector("[data-tag-count]");
  const editorBox = editor.querySelector(".tag-editor-box");
  const activeTagArea = editor.querySelector(".tag-active-box") || editorBox;
  const addButton = editor.querySelector("[data-tag-add]");
  const checkboxes = [...editor.querySelectorAll("[data-tag-checkbox]")];

  if (!hiddenInput || !tagList) {
    return;
  }

  let tags = tagArray(hiddenInput.value);
  let clearButton = editor.querySelector("[data-tag-clear]");

  if (!clearButton && editorBox) {
    clearButton = document.createElement("button");
    clearButton.type = "button";
    clearButton.className = "tag-editor-clear";
    clearButton.setAttribute("data-tag-clear", "");
    clearButton.setAttribute("aria-label", "Clear selected tags");
    clearButton.setAttribute("title", "Clear selected tags");
    clearButton.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true">
        <path d="M18 6 6 18"></path>
        <path d="m6 6 12 12"></path>
      </svg>
    `;
    editorBox.append(clearButton);
  }

  function closeMenu() {
    if (!menu || !toggle) {
      return;
    }

    menu.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
  }

  function toggleMenu() {
    if (!menu || !toggle) {
      return;
    }

    const expanded = toggle.getAttribute("aria-expanded") === "true";
    menu.hidden = expanded;
    toggle.setAttribute("aria-expanded", String(!expanded));
  }

  function syncTags() {
    hiddenInput.value = tags.join(",");
    tagList.replaceChildren(...tags.map((tag) => createTagChip(tag, removeTag)));
    tagList.toggleAttribute("data-empty", tags.length === 0);
    checkboxes.forEach((checkbox) => {
      checkbox.checked = tags.includes(normalizeTag(checkbox.value));
    });
    if (tagCount) {
      tagCount.textContent = tags.length === 0 ? "Any tags" : `${tags.length} selected`;
    }
    if (clearButton) {
      clearButton.hidden = tags.length === 0;
    }
  }

  function notifyTagsChanged() {
    hiddenInput.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function addTag(value) {
    const tag = normalizeTag(value);
    if (!tag || tags.includes(tag)) {
      if (input) {
        input.value = "";
      }
      return;
    }

    tags.push(tag);
    tags.sort((first, second) => first.localeCompare(second));
    if (input) {
      input.value = "";
    }
    syncTags();
    notifyTagsChanged();
  }

  function removeTag(tag) {
    tags = tags.filter((existingTag) => existingTag !== tag);
    syncTags();
    notifyTagsChanged();
  }

  clearButton?.addEventListener("click", () => {
    tags = [];
    syncTags();
    notifyTagsChanged();
    input?.focus();
  });

  addButton?.addEventListener("click", () => {
    addTag(input?.value || "");
    input?.focus();
  });

  activeTagArea?.addEventListener("click", (event) => {
    if (event.target.closest("button, input, label, a")) {
      return;
    }
    toggleMenu();
  });

  input?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      addTag(input.value);
    }
  });

  input?.addEventListener("change", () => {
    addTag(input.value);
  });

  input?.form?.addEventListener("submit", () => {
    addTag(input.value);
  });

  checkboxes.forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      const tag = normalizeTag(checkbox.value);
      if (checkbox.checked) {
        addTag(tag);
      } else {
        removeTag(tag);
      }
    });
  });

  toggle?.addEventListener("click", () => {
    toggleMenu();
  });

  hiddenInput.addEventListener("change", () => {
    tags = tagArray(hiddenInput.value);
    syncTags();
  });

  document.addEventListener("click", (event) => {
    if (!editor.contains(event.target)) {
      closeMenu();
    }
  });

  editor.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeMenu();
    }
  });

  syncTags();
});

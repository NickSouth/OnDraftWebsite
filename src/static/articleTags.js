function normalizeTag(value) {
  return value.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
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

document.querySelectorAll(".tag-editor").forEach((editor) => {
  const input = editor.querySelector("[data-tag-input]");
  const hiddenInput = editor.querySelector("[data-tag-value]");
  const tagList = editor.querySelector("[data-tag-list]");
  let tags = (hiddenInput.value || "")
    .split(",")
    .map(normalizeTag)
    .filter(Boolean);
  tags = [...new Set(tags)];

  function syncTags() {
    hiddenInput.value = tags.join(",");
    tagList.replaceChildren(...tags.map((tag) => createTagChip(tag, removeTag)));
  }

  function addTag(value) {
    const tag = normalizeTag(value);
    if (!tag || tags.includes(tag)) {
      input.value = "";
      return;
    }

    tags.push(tag);
    input.value = "";
    syncTags();
  }

  function removeTag(tag) {
    tags = tags.filter((existingTag) => existingTag !== tag);
    syncTags();
  }

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      addTag(input.value);
    }
  });

  input.addEventListener("change", () => {
    addTag(input.value);
  });

  input.form?.addEventListener("submit", () => {
    addTag(input.value);
  });

  syncTags();
});

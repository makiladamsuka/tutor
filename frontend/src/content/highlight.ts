/** Highlight blocks on the live page by `data-tutor-id` (Step 9). */

import { getBlockNodeMap } from "./extract";

const STYLE_ID = "tutor-highlight-styles";

function ensureHighlightStyles(): void {
  if (document.getElementById(STYLE_ID)) {
    return;
  }
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    mark.tutor-highlight {
      background: rgba(255, 213, 79, 0.55);
      color: inherit;
      border-radius: 2px;
      box-decoration-break: clone;
      -webkit-box-decoration-break: clone;
    }
  `;
  document.head.appendChild(style);
}

function resolveBlockNode(blockId: string): HTMLElement | null {
  const fromMap = getBlockNodeMap().get(blockId);
  if (fromMap?.isConnected) {
    return fromMap;
  }
  const escaped =
    typeof CSS !== "undefined" && "escape" in CSS
      ? CSS.escape(blockId)
      : blockId.replace(/"/g, '\\"');
  const el = document.querySelector(`[data-tutor-id="${escaped}"]`);
  return el instanceof HTMLElement ? el : null;
}

function wrapElement(el: HTMLElement): void {
  if (el.closest("mark.tutor-highlight")) {
    return;
  }

  const mark = document.createElement("mark");
  mark.className = "tutor-highlight";

  if (el.childNodes.length === 0) {
    mark.textContent = el.textContent ?? "";
    el.textContent = "";
    el.appendChild(mark);
    return;
  }

  while (el.firstChild) {
    mark.appendChild(el.firstChild);
  }
  el.appendChild(mark);
}

/** Remove all tutor highlight marks from the page. */
export function clearHighlights(): void {
  for (const mark of document.querySelectorAll("mark.tutor-highlight")) {
    const parent = mark.parentNode;
    if (!parent) {
      continue;
    }
    while (mark.firstChild) {
      parent.insertBefore(mark.firstChild, mark);
    }
    parent.removeChild(mark);
  }
}

/** Highlight `anchor_ids` (b1, b2, …) and scroll the first match into view. */
export function highlightBlocks(anchorIds: string[]): void {
  ensureHighlightStyles();
  clearHighlights();

  if (anchorIds.length === 0) {
    console.warn("[tutor] highlight: empty anchor_ids");
    return;
  }

  console.info("[tutor] highlight:", anchorIds.join(", "));

  let firstScrollTarget: HTMLElement | null = null;

  let matched = 0;
  for (const blockId of anchorIds) {
    const node = resolveBlockNode(blockId);
    if (!node) {
      console.warn("[tutor] highlight: no node for", blockId);
      continue;
    }
    wrapElement(node);
    matched++;
    if (!firstScrollTarget) {
      firstScrollTarget = node;
    }
  }

  if (matched === 0) {
    console.warn(
      "[tutor] highlight: none of",
      anchorIds.join(", "),
      "matched DOM — Scrape this page again",
    );
    return;
  }

  firstScrollTarget?.scrollIntoView({
    behavior: "smooth",
    block: "center",
  });
}

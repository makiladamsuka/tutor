/** Readability extraction + live DOM tagging (Step 4). */

import { Readability } from "@mozilla/readability";
import type { Block, PageExtractedPayload } from "../shared/messages";

const BLOCK_SELECTOR =
  "p, h1, h2, h3, h4, h5, h6, li, blockquote, pre";

const blockNodeMap = new Map<string, HTMLElement>();

export function getBlockNodeMap(): ReadonlyMap<string, HTMLElement> {
  return blockNodeMap;
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function getLiveContentRoot(): Element {
  return (
    document.querySelector("#mw-content-text") ??
    document.querySelector("article") ??
    document.querySelector("main") ??
    document.body
  );
}

function clearTutorTags(root: Element): void {
  for (const el of root.querySelectorAll("[data-tutor-id]")) {
    el.removeAttribute("data-tutor-id");
  }
  blockNodeMap.clear();
}

function collectBlockTextsFromHtml(html: string): string[] {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const texts: string[] = [];
  for (const el of parsed.querySelectorAll(BLOCK_SELECTOR)) {
    const text = normalizeText(el.textContent ?? "");
    if (text.length > 0) {
      texts.push(text);
    }
  }
  return texts;
}

function findLiveNodeForText(
  root: Element,
  text: string,
  used: WeakSet<HTMLElement>,
): HTMLElement | undefined {
  const normalized = normalizeText(text);
  const candidates = root.querySelectorAll(BLOCK_SELECTOR);

  for (const el of candidates) {
    const node = el as HTMLElement;
    if (used.has(node)) {
      continue;
    }
    if (normalizeText(node.textContent ?? "") === normalized) {
      return node;
    }
  }

  for (const el of candidates) {
    const node = el as HTMLElement;
    if (used.has(node)) {
      continue;
    }
    const nodeText = normalizeText(node.textContent ?? "");
    if (
      nodeText.length > 0 &&
      (nodeText.includes(normalized) || normalized.includes(nodeText))
    ) {
      return node;
    }
  }

  return undefined;
}

function tagLiveDom(
  root: Element,
  blocks: Block[],
): { matched: number; unmatched: number } {
  const used = new WeakSet<HTMLElement>();
  let matched = 0;
  let unmatched = 0;

  for (const block of blocks) {
    const node = findLiveNodeForText(root, block.text, used);
    if (node) {
      node.setAttribute("data-tutor-id", block.id);
      blockNodeMap.set(block.id, node);
      used.add(node);
      matched++;
    } else {
      unmatched++;
      console.warn("[tutor] no DOM match for block", block.id);
    }
  }

  return { matched, unmatched };
}

export type ExtractResult =
  | { ok: true; payload: PageExtractedPayload; matched: number; unmatched: number }
  | { ok: false; error: string; payload: PageExtractedPayload };

export function extractPage(): ExtractResult {
  const url = location.href;
  const emptyPayload = (title: string): PageExtractedPayload => ({
    title,
    url,
    blocks: [],
  });

  const clone = document.cloneNode(true) as Document;
  const article = new Readability(clone).parse();

  if (!article?.content) {
    return {
      ok: false,
      error: "Readability could not extract article content on this page.",
      payload: emptyPayload(document.title),
    };
  }

  const title = article.title?.trim() || document.title;
  const blockTexts = collectBlockTextsFromHtml(article.content);

  if (blockTexts.length === 0) {
    return {
      ok: false,
      error: "No text blocks found after Readability parse.",
      payload: emptyPayload(title),
    };
  }

  const blocks: Block[] = blockTexts.map((text, index) => ({
    id: `b${index + 1}`,
    text,
  }));

  const root = getLiveContentRoot();
  clearTutorTags(root);
  const { matched, unmatched } = tagLiveDom(root, blocks);

  console.info("[tutor] page extracted", {
    title,
    blocks: blocks.length,
    matched,
    unmatched,
  });

  return {
    ok: true,
    payload: { title, url, blocks },
    matched,
    unmatched,
  };
}

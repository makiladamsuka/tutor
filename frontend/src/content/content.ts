import { Readability } from "@mozilla/readability";

const BLOCK_TAGS = new Set([
  "P",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "LI",
  "BLOCKQUOTE",
]);

type Block = { id: string; text: string };

const blockIdToNode = new Map<string, HTMLElement>();
const usedNodes = new WeakSet<HTMLElement>();

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function walkBlockElements(
  root: ParentNode,
  onBlock: (el: Element, text: string) => void
) {
  for (const child of root.children) {
    if (!(child instanceof HTMLElement)) continue;

    if (BLOCK_TAGS.has(child.tagName)) {
      const text = normalizeText(child.textContent ?? "");
      if (text.length > 0) {
        onBlock(child, text);
      }
      continue;
    }

    walkBlockElements(child, onBlock);
  }
}

function findLiveNode(text: string): HTMLElement | null {
  const normalized = normalizeText(text);
  if (!normalized) return null;

  const candidates = document.querySelectorAll<HTMLElement>(
    "p, h1, h2, h3, h4, h5, h6, li, blockquote"
  );

  for (const node of candidates) {
    if (usedNodes.has(node)) continue;
    if (normalizeText(node.textContent ?? "") === normalized) {
      return node;
    }
  }

  return null;
}

function tagDomNodes(blocks: Block[]) {
  blockIdToNode.clear();

  for (const block of blocks) {
    const node = findLiveNode(block.text);
    if (!node) continue;

    node.setAttribute("data-tutor-id", block.id);
    usedNodes.add(node);
    blockIdToNode.set(block.id, node);
  }
}

type SessionPayload = {
  title: string;
  url: string;
  blocks: Block[];
};

function runExtraction(): SessionPayload {
  const url = location.href;
  const parsed = new Readability(document.cloneNode(true) as Document).parse();

  if (!parsed) {
    console.warn("[TutorStream] Readability returned null for", url);
    return { title: document.title, url, blocks: [] };
  }

  const title = parsed.title || document.title;
  const container = document.createElement("div");
  container.innerHTML = parsed.content ?? "";

  const blocks: Block[] = [];
  let counter = 0;

  walkBlockElements(container, (_el, text) => {
    counter += 1;
    blocks.push({ id: `b${counter}`, text });
  });

  tagDomNodes(blocks);

  console.log(
    `[TutorStream] Extracted ${blocks.length} blocks from`,
    title
  );

  return { title, url, blocks };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "page:extract") {
    try {
      const payload = runExtraction();
      sendResponse({ ok: true, payload });
    } catch (err) {
      console.error("[TutorStream] Extraction failed:", err);
      sendResponse({
        error: err instanceof Error ? err.message : "extraction_failed",
      });
    }
    return true;
  }

  return false;
});

console.log("[TutorStream] Content script loaded");

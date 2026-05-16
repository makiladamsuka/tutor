"""Chunking, embeddings, and retrieval over a session's page content.

The pipeline:

    blocks  --chunk_blocks-->  chunks         (greedy ~target_tokens groups)
    chunks  --embed_texts-->   (n, 1536) matrix, L2-normalised
    query   --embed_texts-->   (1, 1536) vector, L2-normalised
    query @ chunks.T  -->      cosine scores
    argsort -> top-k chunks

Each `Chunk` remembers the `block_ids` it came from so downstream endpoints
(`/mode`, `/chat`) can return `anchor_ids` to the frontend for highlighting.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import tiktoken

from tutor.llm import DEFAULT_EMBEDDING_MODEL, get_client
from tutor.models import Block

# `cl100k_base` is the encoding for the gpt-4 family and (close enough for
# our purposes) for the embedding models. We only use it to estimate chunk
# size, so a few percent drift vs the true encoding is harmless.
_ENCODER = tiktoken.get_encoding("cl100k_base")

# OpenAI's `text-embedding-3-small` produces 1536-d vectors.
_EMBED_DIM = 1536


@dataclass
class Chunk:
    id: str
    text: str
    block_ids: list[str] = field(default_factory=list)


def _count_tokens(text: str) -> int:
    return len(_ENCODER.encode(text))


def chunk_blocks(blocks: list[Block], target_tokens: int = 500) -> list[Chunk]:
    """Pack consecutive blocks into ~`target_tokens`-sized chunks.

    Blocks that exceed `target_tokens` on their own are kept as a single
    oversized chunk (we don't split mid-paragraph in v1 — Wikipedia
    paragraphs run ~100-300 tokens so this is fine in practice).
    """
    chunks: list[Chunk] = []
    cur_texts: list[str] = []
    cur_block_ids: list[str] = []
    cur_tokens = 0

    for block in blocks:
        block_tokens = _count_tokens(block.text)
        if cur_texts and cur_tokens + block_tokens > target_tokens:
            chunks.append(
                Chunk(
                    id=f"c{len(chunks) + 1}",
                    text=" ".join(cur_texts),
                    block_ids=cur_block_ids,
                )
            )
            cur_texts = []
            cur_block_ids = []
            cur_tokens = 0

        cur_texts.append(block.text)
        cur_block_ids.append(block.id)
        cur_tokens += block_tokens

    if cur_texts:
        chunks.append(
            Chunk(
                id=f"c{len(chunks) + 1}",
                text=" ".join(cur_texts),
                block_ids=cur_block_ids,
            )
        )

    return chunks


def embed_texts(texts: list[str]) -> np.ndarray:
    """Embed a batch of texts and L2-normalise the rows.

    Returns an (n, 1536) float32 matrix. Normalisation lets us compute
    cosine similarity with a plain dot product (`q @ M.T`).
    """
    if not texts:
        return np.zeros((0, _EMBED_DIM), dtype=np.float32)

    response = get_client().embeddings.create(
        model=DEFAULT_EMBEDDING_MODEL,
        input=texts,
    )
    matrix = np.asarray(
        [item.embedding for item in response.data],
        dtype=np.float32,
    )
    norms = np.linalg.norm(matrix, axis=1, keepdims=True)
    # Guard against zero-norm rows (shouldn't happen for real text, but
    # cheap insurance against future weirdness).
    norms[norms == 0] = 1.0
    return matrix / norms


def retrieve(
    chunks: list[Chunk],
    embeddings: np.ndarray | None,
    query: str,
    k: int = 4,
) -> list[Chunk]:
    """Return the top-`k` chunks most relevant to `query`, ranked by cosine.

    Costs one embeddings API call per invocation. `chunks` and `embeddings`
    are typically the matching fields on a `Session`.
    """
    if embeddings is None or len(chunks) == 0:
        return []
    query_vec = embed_texts([query])  # (1, 1536), already normalised
    scores = (query_vec @ embeddings.T)[0]  # (n,)
    top_indices = np.argsort(-scores)[: min(k, len(chunks))]
    return [chunks[int(i)] for i in top_indices]

"""LLM-driven generation logic.

Today: just `summarise_page` for the one-line "header summary" the side panel
shows immediately after `POST /session`.

Step 8 will add the four mode prompts (`teach`, `summarise`, `quiz`,
`explain_simply`) and the structured-output deck builder; they all live here
so prompts are in one file.
"""

from __future__ import annotations

from tutor.llm import DEFAULT_CHAT_MODEL, get_client
from tutor.models import Block

_HEADER_SYSTEM_PROMPT = (
    "You are a concise assistant. Summarise the given web page in ONE short "
    "sentence (max 20 words). Return only the sentence, with no quotes, no "
    "leading 'Summary:' label, and no trailing punctuation other than a "
    "single period."
)

# Cap the user-message size so the header call stays cheap regardless of
# page length. The first ~2000 characters of joined block text are enough
# for a one-line gist on any reasonable article.
_PAGE_PREVIEW_CHARS = 2000


def summarise_page(title: str, blocks: list[Block]) -> str:
    """Return a one-sentence summary of the page.

    Uses only a preview of the page content (the first `_PAGE_PREVIEW_CHARS`
    characters of joined blocks) so this stays a small, fast LLM call. The
    full content is preserved in the session for later RAG.
    """
    preview = " ".join(b.text for b in blocks)[:_PAGE_PREVIEW_CHARS]
    user_msg = f"Title: {title}\n\nContent:\n{preview}"
    response = get_client().chat.completions.create(
        model=DEFAULT_CHAT_MODEL,
        messages=[
            {"role": "system", "content": _HEADER_SYSTEM_PROMPT},
            {"role": "user", "content": user_msg},
        ],
        max_tokens=60,
        temperature=0.3,
    )
    return (response.choices[0].message.content or "").strip()

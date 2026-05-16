import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from tutor.llm import DEFAULT_CHAT_MODEL, get_client

load_dotenv()

app = FastAPI(title="Tutor Backend")

# Allow the Chrome extension (any extension ID) and local dev frontends.
# Using a regex so we don't have to hardcode the extension ID, which
# changes between unpacked dev installs.
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^(chrome-extension://.+|http://localhost(:\d+)?|http://127\.0\.0\.1(:\d+)?)$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"ok": True}


@app.get("/test/openai")
def test_openai():
    if not os.getenv("OPENAI_API_KEY"):
        raise HTTPException(
            status_code=500,
            detail="OPENAI_API_KEY is not set. Create backend/.env from .env.example and paste your key.",
        )
    response = get_client().chat.completions.create(
        model=DEFAULT_CHAT_MODEL,
        messages=[{"role": "user", "content": "Say hi in 5 words."}],
        max_tokens=20,
    )
    return {"reply": response.choices[0].message.content}

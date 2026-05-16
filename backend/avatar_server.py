from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
import httpx
from dotenv import load_dotenv

load_dotenv(".env.local")

BEY_API_BASE = os.environ.get("BEY_API_BASE", "https://api.bey.dev")
BEY_API_KEY = os.environ.get("BEY_API_KEY", "")
BEY_AGENT_ID = os.environ.get(
    "BEY_AGENT_ID",
    # Falls back to the legacy env var name from earlier builds where the
    # value stored in BEY_AVATAR_ID was actually the agent ID.
    os.environ.get("BEY_AVATAR_ID", ""),
)

app = FastAPI(title="TutorStream Avatar Server")

# Allow Next.js frontend (side panel) to call this backend.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Tighten this to your frontend origin in production.
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class CreateCallResponse(BaseModel):
    call_id: str
    livekit_url: str
    livekit_token: str


@app.get("/api/create-call", response_model=CreateCallResponse)
async def create_call() -> CreateCallResponse:
    """Provision a Beyond Presence managed-agent call and return LiveKit creds.

    The frontend uses these creds with the LiveKit Client SDK to render the
    avatar directly, bypassing the bey.chat welcome / "Start Conversation"
    iframe screen entirely.
    """
    if not BEY_API_KEY:
        raise HTTPException(status_code=500, detail="BEY_API_KEY is not set on the server.")
    if not BEY_AGENT_ID:
        raise HTTPException(status_code=500, detail="BEY_AGENT_ID is not set on the server.")

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{BEY_API_BASE}/v1/calls",
                headers={
                    "x-api-key": BEY_API_KEY,
                    "Content-Type": "application/json",
                },
                json={
                    "agent_id": BEY_AGENT_ID,
                    "livekit_username": "Student",
                },
            )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Beyond Presence request failed: {exc}") from exc

    if resp.status_code >= 400:
        raise HTTPException(
            status_code=resp.status_code,
            detail=f"Beyond Presence create-call failed: {resp.text}",
        )

    data = resp.json()
    return CreateCallResponse(
        call_id=data["id"],
        livekit_url=data["livekit_url"],
        livekit_token=data["livekit_token"],
    )


@app.get("/health")
def health() -> dict[str, bool]:
    return {"ok": True}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)

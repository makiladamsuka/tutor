from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from bey import BeyondPresence
import os
from dotenv import load_dotenv

# Load environment variables from .env.local
load_dotenv(".env.local")

app = FastAPI()

# Allow Next.js frontend to communicate with this backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, restrict this to your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Beyond Presence Client
# Make sure to set BEY_API_KEY and BEY_AVATAR_ID in your environment variables
client = BeyondPresence(
    api_key=os.environ.get("BEY_API_KEY", "your_api_key_here")
)

@app.get("/api/get-avatar-token")
def get_avatar_token():
    try:
        # Create a session to get the LiveKit token
        session = client.session.create(
            avatar_id=os.environ.get("BEY_AVATAR_ID", "your_avatar_id_here")
        )
        
        return {
            "success": True,
            "livekit_token": session.livekit_token,
            "livekit_url": session.livekit_url,
            "session_id": session.id
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

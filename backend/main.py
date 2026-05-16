from fastapi import FastAPI

app = FastAPI(title="Tutor Backend")


@app.get("/health")
def health():
    return {"ok": True}

from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from backend.app.database import init_db
from backend.app.routers import comments, health, protocols


app = FastAPI(title="Evidence Copilot API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5001", "http://localhost:5001", "http://127.0.0.1:5173", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    init_db()


app.include_router(health.router)
app.include_router(protocols.router)
app.include_router(comments.router)


DIST_DIR = Path(__file__).resolve().parents[2] / "dist" / "public"
if (DIST_DIR / "assets").exists():
    app.mount("/assets", StaticFiles(directory=DIST_DIR / "assets"), name="assets")


@app.get("/{full_path:path}")
def serve_react_app(full_path: str) -> FileResponse:
    index_file = DIST_DIR / "index.html"
    requested_file = DIST_DIR / full_path
    if requested_file.exists() and requested_file.is_file():
        return FileResponse(requested_file)
    return FileResponse(index_file)

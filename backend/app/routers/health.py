from fastapi import APIRouter

from backend.app.database import DATABASE_URL

router = APIRouter()


@router.get("/health")
def health() -> dict[str, str]:
    database = "postgres" if DATABASE_URL.startswith("postgresql") else "sqlite"
    return {"status": "ok", "database": database}

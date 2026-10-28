import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import Settings, get_settings
from ..database import get_db, get_sessionmaker
from ..integrations import make_x_client
from ..models import Scan
from ..schemas import ScanCreateIn, ScanOut
from ..services.library import latest_scan, scan_out
from ..services.scan_service import create_scan, run_scan
from ..sessions import CurrentSession, require_csrf, require_session

router = APIRouter(prefix="/api/scans", tags=["scans"])


@router.post("", response_model=ScanOut, status_code=202)
def start_scan(
    background: BackgroundTasks,
    body: ScanCreateIn | None = None,
    current: CurrentSession = Depends(require_csrf),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> ScanOut:
    scan, created = create_scan(db, current.user, settings, body.mode if body else None)
    if created:
        # Runs after the response is sent. Progress is persisted, so the client polls.
        background.add_task(run_scan, scan.id, get_sessionmaker(), settings, lambda: make_x_client(settings))
    return scan_out(scan)


@router.get("/latest", response_model=ScanOut | None)
def get_latest(current: CurrentSession = Depends(require_session), db: Session = Depends(get_db)) -> ScanOut | None:
    scan = latest_scan(db, current.user)
    return scan_out(scan) if scan else None


@router.get("/{scan_id}", response_model=ScanOut)
def get_scan(
    scan_id: uuid.UUID, current: CurrentSession = Depends(require_session), db: Session = Depends(get_db)
) -> ScanOut:
    scan = db.scalar(select(Scan).where(Scan.id == scan_id, Scan.user_id == current.user.id))
    if scan is None:
        # Same response for "missing" and "someone else's" — no existence oracle.
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail={"code": "not_found", "message": "Scan not found."})
    return scan_out(scan)

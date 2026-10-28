from datetime import timedelta

from sqlalchemy import func, select

from app.config import get_settings
from app.integrations import make_x_client
from app.models import AppSession, Bookmark, User, utcnow
from app.services.retention import purge_inactive_accounts, run_maintenance

from .conftest import login, scan


def _age(db, days: int) -> None:
    for u in db.scalars(select(User)):
        u.last_seen_at = utcnow() - timedelta(days=days)
    db.commit()


def _client():
    return make_x_client(get_settings())


def test_sign_in_and_scans_refresh_last_seen(client, db):
    csrf = login(client)
    seen = db.scalar(select(User.last_seen_at))
    assert seen is not None and utcnow() - seen < timedelta(minutes=1)
    _age(db, 30)
    scan(client, csrf)
    db.expire_all()
    assert utcnow() - db.scalar(select(User.last_seen_at)) < timedelta(minutes=1)


def test_inactive_accounts_are_deleted_and_active_ones_kept(client, db):
    csrf = login(client)
    scan(client, csrf)
    _age(db, 89)
    assert purge_inactive_accounts(db, get_settings(), _client) == 0
    assert db.scalar(select(func.count()).select_from(Bookmark)) > 0

    _age(db, 91)
    assert purge_inactive_accounts(db, get_settings(), _client) == 1
    assert db.scalar(select(func.count()).select_from(User)) == 0
    assert db.scalar(select(func.count()).select_from(Bookmark)) == 0


def test_retention_zero_keeps_everything(client, db, monkeypatch):
    login(client)
    _age(db, 3650)
    monkeypatch.setenv("DATA_RETENTION_DAYS", "0")
    get_settings.cache_clear()
    assert purge_inactive_accounts(db, get_settings(), _client) == 0
    assert db.scalar(select(func.count()).select_from(User)) == 1


def test_maintenance_drops_expired_sessions(client, db):
    login(client)
    row = db.scalar(select(AppSession))
    row.expires_at = utcnow() - timedelta(seconds=1)
    db.commit()
    run_maintenance(db, get_settings(), _client)
    assert db.scalar(select(func.count()).select_from(AppSession)) == 0
    assert client.get("/api/auth/me").json()["authenticated"] is False

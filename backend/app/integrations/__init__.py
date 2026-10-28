from ..config import Settings
from .x_client import XClient


def make_x_client(settings: Settings) -> XClient:
    """The only place that decides between the live API and fixtures."""
    if settings.x_api_mode == "fixture":
        if settings.environment == "production":
            raise RuntimeError("Fixture X API is not allowed in production")
        from .x_fixtures import transport

        return XClient(settings, transport=transport(), sleep=lambda _s: None)
    return XClient(settings)

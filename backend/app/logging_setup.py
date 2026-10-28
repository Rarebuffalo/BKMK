"""Structured JSON logs. Callers pass ids and codes in `extra`, never tokens or post text."""

import json
import logging
import re
import sys

_STD = set(logging.LogRecord("", 0, "", 0, "", (), None).__dict__) | {"message", "asctime"}
# Defence in depth: scrub anything that looks like a credential if it slips into a message.
_SECRET_RE = re.compile(r"(?i)(bearer\s+|access_token=|refresh_token=|code=|code_verifier=|token=)[^\s&\"']+")


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "ts": self.formatTime(record, "%Y-%m-%dT%H:%M:%S"),
            "level": record.levelname,
            "logger": record.name,
            "msg": _SECRET_RE.sub(r"\1[redacted]", record.getMessage()),
        }
        for key, value in record.__dict__.items():
            if key not in _STD and not key.startswith("_"):
                payload[key] = value
        if record.exc_info:
            payload["exc"] = _SECRET_RE.sub(r"\1[redacted]", self.formatException(record.exc_info))
        return json.dumps(payload, default=str)


def configure_logging(level: str = "INFO") -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers[:] = [handler]
    root.setLevel(level)
    # Access logs include query strings (OAuth code/state on the callback): keep them off.
    logging.getLogger("uvicorn.access").disabled = True
    logging.getLogger("httpx").setLevel(logging.WARNING)

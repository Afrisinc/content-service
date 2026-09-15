from __future__ import annotations

import json
import logging
import sys
from datetime import datetime, timezone


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "level": record.levelname.lower(),
            "time": datetime.now(timezone.utc).isoformat(),
            "event": record.getMessage(),
            "logger": record.name,
        }
        for key, value in getattr(record, "extra_fields", {}).items():
            payload[key] = value
        if record.exc_info:
            payload["error"] = self.formatException(record.exc_info)
        return json.dumps(payload)


def get_logger(name: str) -> logging.Logger:
    logger = logging.getLogger(name)
    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(JsonFormatter())
        logger.addHandler(handler)
        logger.setLevel(logging.INFO)
        logger.propagate = False
    return logger


def log(logger: logging.Logger, level: str, event: str, **fields: object) -> None:
    record = logger.makeRecord(logger.name, getattr(logging, level.upper()), __file__, 0, event, None, None)
    record.extra_fields = fields
    logger.handle(record)

"""SQLite engine, session factory, and FastAPI session dependency.

Brightline uses a local SQLite database file. The engine and session factory
are created at import time; `get_db` is the per-request session dependency used
by the routers.
"""

from __future__ import annotations

import os
from collections.abc import Iterator
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

# Local SQLite file lives next to the app package by default. Override with
# BRIGHTLINE_DB_PATH for tests or alternate deployments.
_DEFAULT_DB_PATH = Path(__file__).resolve().parent.parent / "brightline.db"
DB_PATH = os.environ.get("BRIGHTLINE_DB_PATH", str(_DEFAULT_DB_PATH))
DATABASE_URL = f"sqlite:///{DB_PATH}"

# check_same_thread=False is the standard SQLite setting for use with the
# FastAPI/uvicorn threaded request model.
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    """Declarative base shared by all ORM models."""


def get_db() -> Iterator[Session]:
    """Yield a database session and ensure it is closed after the request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Create all tables. Imports models so they register on the metadata."""
    from app import models  # noqa: F401  (import for side-effect: table registration)

    Base.metadata.create_all(bind=engine)

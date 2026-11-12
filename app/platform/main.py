"""M1 platform application factory and uvicorn entry point."""
from __future__ import annotations

from pathlib import Path

import uvicorn
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from .api import PlatformContext, build_app
from .config import Settings
from .database import Database, audit
from .logging_setup import PlatformLogger
from .security import bootstrap_admin

REPO_ROOT = Path(__file__).resolve().parents[2]


def create_app(settings: Settings | None = None) -> FastAPI:
    """Build the M1 FastAPI app: migrations, logging, admin bootstrap, routes."""
    settings = settings or Settings.from_environ()
    db = Database(settings.db_path)
    db.initialize()
    logger = PlatformLogger(settings.log_dir, settings.env, settings.log_retention_days)
    ctx = PlatformContext(settings=settings, db=db, logger=logger)

    with db.transaction() as conn:
        if bootstrap_admin(conn, settings.admin_username, settings.admin_password):
            audit(conn, actor_id="system", actor_type="system",
                  action="admin_initialized", target_type="platform_user",
                  target_id=settings.admin_username, result="SUCCESS",
                  details={"note": "one-time OWNER initialization"})
            logger.info("admin_initialized", "one-time OWNER admin initialized")

    app = build_app(ctx)
    app.state.ctx = ctx

    dist = REPO_ROOT / "app" / "frontend" / "dist"
    if dist.is_dir():
        app.mount("/", StaticFiles(directory=str(dist), html=True), name="frontend")

    return app


def main() -> None:
    settings = Settings.from_environ()
    app = create_app(settings)
    uvicorn.run(app, host=settings.server_host, port=settings.server_port, log_config=None)


if __name__ == "__main__":
    main()

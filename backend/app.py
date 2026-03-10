"""
Monarch Dashboard — Flask API Backend
Reads from the monarch_pipeline database and serves JSON to the React frontend.

The database path defaults to ~/.monarch_pipeline/monarch.db and can be
overridden via the MONARCH_DATA_DIR environment variable (used by Docker).
"""

import os

from flask import Flask, jsonify
from flask_cors import CORS
from werkzeug.exceptions import HTTPException

from monarch_pipeline import auth  # re-export for patch("app.auth.X", ...)
from monarch_pipeline.config import DB_PATH, ensure_data_dir  # DB_PATH re-export

app = Flask(__name__)
CORS(app, origins=[
    "http://localhost",
    "http://localhost:80",
    "http://localhost:5173",
    "http://127.0.0.1",
    "http://127.0.0.1:80",
    "http://127.0.0.1:5173",
    "http://[::1]",
    "http://[::1]:80",
    "http://[::1]:5173",
])


@app.errorhandler(Exception)
def handle_unexpected_error(exc):
    if isinstance(exc, HTTPException):
        return exc
    app.logger.exception("Unhandled exception")
    return jsonify({"error": "Internal server error"}), 500


# ---------------------------------------------------------------------------
# Backward-compatible re-exports — allows `from app import X` and
# `patch("app.X", ...)` to continue working across all test files.
# ---------------------------------------------------------------------------
from db import (                                         # noqa: E402
    DASHBOARD_DDL,
    get_db,
    get_db_connection,
    init_dashboard_schema,
    get_setting,
    set_setting,
)
from ai import (                                         # noqa: E402
    _call_ai,
    _get_ai_key,
    _check_ai_rate_limit,
    _sanitize_prompt_field,
    _extract_json,
    _ai_cooldowns,
    _AI_COOLDOWN_SECONDS,
    _ai_cooldowns_lock,
)
from routes.sync import (                                # noqa: E402
    ENTITY_TABLE_MAP,
    ENTITY_RUN_ORDER,
    ENTITY_LABELS,
    scheduler,
    SYNC_JOB_ID,
    _reschedule,
    run_scheduled_sync,
    _run_sync_worker,
)
from routes.networth import (                            # noqa: E402
    BUCKET_MAP,
    TYPE_MAP,
    BUCKET_ORDER,
    BUCKET_COLORS,
    _get_bucket,
)
from routes.setup import bootstrap_token_from_env, has_token  # noqa: E402

# Blueprint registration — must come AFTER all re-exports above
from routes import register_blueprints                   # noqa: E402
register_blueprints(app)


def _startup() -> None:
    """
    Initialize the app — called from __main__ (dev) or wsgi.py (production).
    Creates the data directory, bootstraps the token from env, initialises the
    DB schema, starts the background scheduler, and restores the saved interval.
    """
    ensure_data_dir()
    bootstrap_token_from_env()
    init_dashboard_schema()
    if not scheduler.running:
        scheduler.start()
    conn = get_db()
    saved_interval = int(get_setting(conn, "sync_interval_hours", "0"))
    conn.close()
    _reschedule(saved_interval)


if __name__ == "__main__":
    _startup()
    print(f"Starting Monarch Dashboard API — reading from {DB_PATH}")
    app.run(host="0.0.0.0", port=5050, debug=os.environ.get("FLASK_DEBUG", "").lower() in ("1", "true"))

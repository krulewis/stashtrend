import asyncio
import os

from flask import Blueprint, jsonify, request, current_app
from monarch_pipeline import auth
from monarch_pipeline.config import TOKEN_PATH
import app as _app

bp = Blueprint("setup", __name__)


def bootstrap_token_from_env():
    """
    If MONARCH_TOKEN env var is set, write it to the token file and clear it
    from the environment. Called once at startup so Docker users can supply
    their token via a .env file without it persisting in process memory.
    """
    token = os.environ.pop("MONARCH_TOKEN", None)
    if token and token.strip():
        auth.save_token(token.strip(), TOKEN_PATH)
        print("[startup] Token written from MONARCH_TOKEN env var.")


def has_token() -> bool:
    """Returns True if a Monarch Money token is currently stored."""
    return auth.load_token(TOKEN_PATH) is not None


@bp.route("/api/setup/status")
def setup_status():
    """Returns whether a Monarch Money token is configured. Used by the
    frontend to decide whether to show the setup wizard or the dashboard."""
    return jsonify({"configured": _app.has_token()})


@bp.route("/api/setup/token", methods=["POST"])
def setup_token():
    """
    Accepts a Monarch Money bearer token, validates it against the live API,
    and saves it if valid. The frontend setup wizard calls this endpoint.

    Returns 200 {"ok": true} on success.
    Returns 400 {"error": "..."} if the token is missing, blank, or invalid.
    """
    token = (request.json or {}).get("token", "").strip()
    if not token:
        return jsonify({"error": "Token is required"}), 400
    try:
        asyncio.run(auth.login_with_token(token, TOKEN_PATH))
        return jsonify({"ok": True})
    except Exception as e:
        current_app.logger.exception("Token validation failed")
        return jsonify({"error": "Token validation failed. Check that your token is current."}), 400

from flask import Blueprint, jsonify, request
import app as _app

bp = Blueprint("settings", __name__)


@bp.route("/api/settings", methods=["GET"])
def get_settings():
    """
    Return the current dashboard settings.
    Response: {"sync_interval_hours": int}  — 0 means auto-sync disabled.
    """
    conn = _app.get_db()
    interval = int(_app.get_setting(conn, "sync_interval_hours", "0"))
    conn.close()
    return jsonify({"sync_interval_hours": interval})


@bp.route("/api/settings", methods=["POST"])
def update_settings():
    """
    Persist settings and apply them immediately.
    Body: {"sync_interval_hours": int}  — 0 to disable.
    Returns 400 if the value is not a non-negative integer.
    """
    data = request.get_json() or {}

    raw = data.get("sync_interval_hours")
    if raw is None:
        return jsonify({"error": "sync_interval_hours is required"}), 400

    # Reject floats explicitly (1.5 is not a whole number of hours)
    if isinstance(raw, float):
        return jsonify({"error": "sync_interval_hours must be a whole number"}), 400

    try:
        interval = int(raw)
        if str(interval) != str(raw):
            raise ValueError("not an integer")
    except (ValueError, TypeError):
        return jsonify({"error": "sync_interval_hours must be an integer"}), 400

    if interval < 0:
        return jsonify({"error": "sync_interval_hours must be >= 0"}), 400

    conn = _app.get_db()
    _app.set_setting(conn, "sync_interval_hours", str(interval))
    conn.close()

    _app._reschedule(interval)
    return jsonify({"sync_interval_hours": interval})

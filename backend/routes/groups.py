import json
import sqlite3
from collections import defaultdict

from flask import Blueprint, jsonify, request
import app as _app

bp = Blueprint("groups", __name__)


@bp.route("/api/groups", methods=["GET"])
def list_groups():
    """Return all groups with their member account IDs."""
    conn = _app.get_db()
    groups = conn.execute(
        "SELECT id, name, color, created_at FROM account_groups ORDER BY name"
    ).fetchall()

    result = []
    for g in groups:
        members = conn.execute(
            "SELECT account_id FROM account_group_members WHERE group_id = ?",
            (g["id"],)
        ).fetchall()
        result.append({
            **dict(g),
            "account_ids": [m["account_id"] for m in members],
        })

    conn.close()
    return jsonify(result)


@bp.route("/api/groups", methods=["POST"])
def create_group():
    """Create a new group. Body: {name, color, account_ids: [...]}"""
    data = request.get_json()
    name        = (data.get("name") or "").strip()
    color       = data.get("color", "#6366f1")
    account_ids = data.get("account_ids", [])

    if not name:
        return jsonify({"error": "name is required"}), 400

    conn = _app.get_db()
    try:
        cur = conn.execute(
            "INSERT INTO account_groups (name, color) VALUES (?, ?)", (name, color)
        )
        group_id = cur.lastrowid
        conn.executemany(
            "INSERT OR IGNORE INTO account_group_members (group_id, account_id) VALUES (?, ?)",
            [(group_id, aid) for aid in account_ids],
        )
        conn.commit()
    except sqlite3.IntegrityError:
        conn.close()
        return jsonify({"error": f"A group named '{name}' already exists"}), 409

    group = conn.execute(
        "SELECT id, name, color, created_at FROM account_groups WHERE id = ?", (group_id,)
    ).fetchone()
    conn.close()
    return jsonify({**dict(group), "account_ids": account_ids}), 201


@bp.route("/api/groups/<int:group_id>", methods=["PUT"])
def update_group(group_id):
    """Replace a group's name, color, and member set. Body: {name, color, account_ids}"""
    data = request.get_json()
    name        = (data.get("name") or "").strip()
    color       = data.get("color", "#6366f1")
    account_ids = data.get("account_ids", [])

    if not name:
        return jsonify({"error": "name is required"}), 400

    conn = _app.get_db()
    existing = conn.execute(
        "SELECT id FROM account_groups WHERE id = ?", (group_id,)
    ).fetchone()
    if not existing:
        conn.close()
        return jsonify({"error": "Group not found"}), 404

    try:
        conn.execute(
            "UPDATE account_groups SET name = ?, color = ? WHERE id = ?",
            (name, color, group_id)
        )
        conn.execute(
            "DELETE FROM account_group_members WHERE group_id = ?", (group_id,)
        )
        conn.executemany(
            "INSERT OR IGNORE INTO account_group_members (group_id, account_id) VALUES (?, ?)",
            [(group_id, aid) for aid in account_ids],
        )
        conn.commit()
    except sqlite3.IntegrityError:
        conn.close()
        return jsonify({"error": f"A group named '{name}' already exists"}), 409

    conn.close()
    return jsonify({"id": group_id, "name": name, "color": color, "account_ids": account_ids})


@bp.route("/api/groups/<int:group_id>", methods=["DELETE"])
def delete_group(group_id):
    """Delete a group (members cascade-deleted via FK).
    Also removes the deleted group_id from any saved group configs."""
    conn = _app.get_db()
    existing = conn.execute(
        "SELECT id FROM account_groups WHERE id = ?", (group_id,)
    ).fetchone()
    if not existing:
        conn.close()
        return jsonify({"error": "Group not found"}), 404

    conn.execute("DELETE FROM account_groups WHERE id = ?", (group_id,))
    conn.commit()

    # Remove stale group_id from saved configs
    raw = _app.get_setting(conn, "group_configs", "[]")
    try:
        configs = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        configs = []
    for c in configs:
        c["group_ids"] = [gid for gid in c.get("group_ids", []) if gid != group_id]
    _app.set_setting(conn, "group_configs", json.dumps(configs))
    # Clear active pointer if that config is now empty
    active_raw = _app.get_setting(conn, "group_active_config_id", "")
    try:
        active_id = int(active_raw) if active_raw else None
    except (ValueError, TypeError):
        active_id = None
    active_cfg = next((c for c in configs if c.get("id") == active_id), None)
    if active_cfg is not None and not active_cfg["group_ids"]:
        _app.set_setting(conn, "group_active_config_id", "")

    conn.close()
    return jsonify({"deleted": group_id})


@bp.route("/api/groups/configs", methods=["GET"])
def get_group_configs():
    """Return saved group configs and the last-active config id."""
    conn = _app.get_db()
    raw    = _app.get_setting(conn, "group_configs", "[]")
    active = _app.get_setting(conn, "group_active_config_id", "")
    conn.close()
    try:
        configs = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        configs = []
    try:
        active_id = int(active) if active else None
    except (ValueError, TypeError):
        active_id = None
    return jsonify({"configs": configs, "active_config_id": active_id})


@bp.route("/api/groups/configs", methods=["POST"])
def save_group_configs():
    """Atomically replace the full config list and persist the active config id."""
    data      = request.get_json() or {}
    configs   = data.get("configs", [])
    active_id = data.get("active_config_id")

    # Validate and sanitise each config entry
    clean = []
    for c in configs:
        name      = str(c.get("name", "")).strip()[:100]
        group_ids = [gid for gid in c.get("group_ids", []) if isinstance(gid, int)]
        if not name:
            continue
        clean.append({"id": c.get("id"), "name": name, "group_ids": group_ids})

    # Assign sequential IDs to entries that lack one
    existing_ids = {c["id"] for c in clean if c.get("id")}
    next_id = max(existing_ids, default=0) + 1
    for c in clean:
        if not c.get("id"):
            c["id"] = next_id
            next_id += 1

    conn = _app.get_db()
    _app.set_setting(conn, "group_configs", json.dumps(clean))
    _app.set_setting(conn, "group_active_config_id",
                str(active_id) if active_id is not None else "")
    conn.close()
    return jsonify({"configs": clean, "active_config_id": active_id})


@bp.route("/api/groups/history")
def groups_history():
    conn = _app.get_db()
    rows = conn.execute("""
        SELECT
            ah.date,
            ag.id    AS group_id,
            ag.name  AS group_name,
            ag.color AS color,
            SUM(ah.balance) AS total
        FROM account_history ah
        JOIN account_group_members agm ON ah.account_id = agm.account_id
        JOIN account_groups ag         ON agm.group_id  = ag.id
        GROUP BY ah.date, ag.id
        ORDER BY ah.date ASC, ag.name ASC
    """).fetchall()

    pivot      = defaultdict(dict)
    groups_meta = {}
    for row in rows:
        pivot[row["date"]][row["group_name"]] = round(row["total"] or 0, 2)
        groups_meta[row["group_name"]] = {
            "id":    row["group_id"],
            "color": row["color"],
        }

    series = [{"date": d, **vals} for d, vals in sorted(pivot.items())]
    conn.close()
    return jsonify({"series": series, "groups_meta": groups_meta})


@bp.route("/api/groups/snapshot")
def groups_snapshot():
    conn = _app.get_db()
    rows = conn.execute("""
        SELECT
            ag.id,
            ag.name,
            ag.color,
            SUM(a.current_balance) AS total,
            COUNT(a.id)            AS account_count
        FROM account_groups ag
        JOIN account_group_members agm ON ag.id   = agm.group_id
        JOIN accounts a                ON agm.account_id = a.id
        GROUP BY ag.id
        ORDER BY total DESC
    """).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

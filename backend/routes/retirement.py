import json

from flask import Blueprint, jsonify, request, current_app
import app as _app

bp = Blueprint("retirement", __name__)


@bp.route("/api/retirement")
def get_retirement():
    conn = _app.get_db()
    row = conn.execute("SELECT * FROM retirement_settings WHERE id = 1").fetchone()
    if not row:
        return jsonify({"exists": False})
    data = dict(row)
    data["exists"] = True
    data["milestones"] = json.loads(data["milestones"]) if data["milestones"] else []
    return jsonify(data)


@bp.route("/api/retirement", methods=["POST"])
def save_retirement():
    body = request.get_json() or {}

    # Finding #1: validate both ages present and are positive integers
    current_age = body.get("current_age")
    target_age = body.get("target_retirement_age")

    if current_age is None or target_age is None:
        return jsonify({"error": "current_age and target_retirement_age are required"}), 400
    if not isinstance(current_age, int) or not isinstance(target_age, int):
        return jsonify({"error": "current_age and target_retirement_age must be integers"}), 400
    if current_age <= 0 or target_age <= 0:
        return jsonify({"error": "current_age and target_retirement_age must be positive"}), 400

    # Finding #11: upper bounds on age
    if current_age > 120 or target_age > 120:
        return jsonify({"error": "Age values cannot exceed 120"}), 400

    if target_age <= current_age:
        return jsonify({"error": "target_retirement_age must be greater than current_age"}), 400

    # Validate numeric fields: type check + lower/upper bounds
    def _validate_numeric(name, val, lo, hi):
        if val is None:
            return None
        if not isinstance(val, (int, float)):
            return jsonify({"error": f"{name} must be a number"}), 400
        if val < lo:
            return jsonify({"error": f"{name} cannot be less than {lo}"}), 400
        if val > hi:
            return jsonify({"error": f"{name} cannot exceed {hi}"}), 400
        return None

    withdrawal_rate = body.get("withdrawal_rate_pct")
    err = _validate_numeric("withdrawal_rate_pct", withdrawal_rate, 0, 100)
    if err:
        return err

    expected_return = body.get("expected_return_pct")
    err = _validate_numeric("expected_return_pct", expected_return, 0, 50)
    if err:
        return err

    monthly_contribution = body.get("monthly_contribution")
    err = _validate_numeric("monthly_contribution", monthly_contribution, 0, 1_000_000)
    if err:
        return err

    desired_income = body.get("desired_annual_income")
    err = _validate_numeric("desired_annual_income", desired_income, 0, 10_000_000)
    if err:
        return err

    inflation_rate = body.get("inflation_rate_pct")
    err = _validate_numeric("inflation_rate_pct", inflation_rate, 0, 100)
    if err:
        return err

    ss_annual = body.get("social_security_annual")
    err = _validate_numeric("social_security_annual", ss_annual, 0, 10_000_000)
    if err:
        return err

    # Finding #4: validate milestones
    milestones_raw = body.get("milestones")
    if milestones_raw is not None:
        if not isinstance(milestones_raw, list):
            return jsonify({"error": "milestones must be a list"}), 400
        if len(milestones_raw) > 20:
            return jsonify({"error": "milestones may not exceed 20 items"}), 400
        for m in milestones_raw:
            if not isinstance(m, dict):
                return jsonify({"error": "Each milestone must be an object"}), 400
            if not isinstance(m.get("amount"), (int, float)) or m["amount"] <= 0:
                return jsonify({"error": "Each milestone amount must be a positive number"}), 400
            label = m.get("label", "")
            if len(str(label)) > 100:
                return jsonify({"error": "Milestone label must be 100 characters or fewer"}), 400
        milestones_json = json.dumps(milestones_raw)
    else:
        milestones_json = None

    try:
        conn = _app.get_db()
        conn.execute(
            """INSERT INTO retirement_settings
                   (id, current_age, target_retirement_age, desired_annual_income,
                    monthly_contribution, expected_return_pct, inflation_rate_pct,
                    social_security_annual, withdrawal_rate_pct, milestones)
               VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET
                   current_age             = excluded.current_age,
                   target_retirement_age   = excluded.target_retirement_age,
                   desired_annual_income   = excluded.desired_annual_income,
                   monthly_contribution    = excluded.monthly_contribution,
                   expected_return_pct     = excluded.expected_return_pct,
                   inflation_rate_pct      = excluded.inflation_rate_pct,
                   social_security_annual  = excluded.social_security_annual,
                   withdrawal_rate_pct     = excluded.withdrawal_rate_pct,
                   milestones              = excluded.milestones,
                   updated_at              = datetime('now')""",
            (
                current_age,
                target_age,
                desired_income,
                monthly_contribution,
                expected_return,
                inflation_rate if inflation_rate is not None else 2.5,
                ss_annual if ss_annual is not None else 0.0,
                withdrawal_rate if withdrawal_rate is not None else 4.0,
                milestones_json,
            ),
        )
        conn.commit()
        return jsonify({"ok": True})
    except Exception:
        current_app.logger.exception("Failed to save retirement settings")
        return jsonify({"error": "Failed to save retirement settings"}), 500

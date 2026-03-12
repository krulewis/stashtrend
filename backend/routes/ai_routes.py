import keyring.errors
from collections import defaultdict

from flask import Blueprint, jsonify, request, current_app
import app as _app
from monarch_pipeline import auth

bp = Blueprint("ai", __name__)


@bp.route("/api/ai/config", methods=["GET"])
def get_ai_config():
    """Return AI configuration status. Never returns the raw API key."""
    conn = _app.get_db()
    api_key  = _app._get_ai_key(conn)
    model    = _app.get_setting(conn, "ai_model")
    provider = _app.get_setting(conn, "ai_provider")
    base_url = _app.get_setting(conn, "ai_base_url", "")
    return jsonify({
        "configured": bool(api_key and model and provider),
        "model":      model,
        "provider":   provider,
        "base_url":   base_url,
    })


@bp.route("/api/ai/config", methods=["POST"])
def save_ai_config():
    """Persist AI provider credentials and model choice."""
    data = request.get_json() or {}
    required = ["api_key", "model", "provider"]
    missing = [k for k in required if not data.get(k)]
    if missing:
        return jsonify({"error": f"Missing required fields: {', '.join(missing)}"}), 400

    provider = data["provider"]
    if provider not in ("anthropic", "openai_compatible"):
        return jsonify({"error": "provider must be 'anthropic' or 'openai_compatible'"}), 400

    conn = _app.get_db()
    try:
        auth.save_ai_key(data["api_key"])
    except keyring.errors.KeyringError:
        _app.set_setting(conn, "ai_api_key", data["api_key"])
    _app.set_setting(conn, "ai_model",    data["model"])
    _app.set_setting(conn, "ai_provider", provider)
    _app.set_setting(conn, "ai_base_url", data.get("base_url", ""))
    return jsonify({"ok": True})


@bp.route("/api/ai/analyze", methods=["POST"])
def ai_analyze():
    """Fetch budget history, build prompt, call AI, return analysis text."""
    blocked = _app._check_ai_rate_limit("ai_analyze")
    if blocked:
        return blocked
    conn = _app.get_db()

    rows = conn.execute(
        """
        SELECT b.category_id, b.month, b.variance, c.name AS category_name
        FROM budgets b
        LEFT JOIN categories c ON c.id = b.category_id
        WHERE b.budgeted_amount IS NOT NULL
          AND (c.group_type IS NULL OR c.group_type <> 'transfer')
          AND b.month < date('now', 'start of month')
          AND b.month >= date('now', 'start of month', '-12 months')
        ORDER BY b.category_id, b.month ASC
        """
    ).fetchall()

    if not rows:
        conn.close()
        return jsonify({"error": "No budget data found. Sync budget data first."}), 400

    # Build tabular prompt data
    all_months = sorted({r["month"] for r in rows})
    cat_rows: dict = defaultdict(list)
    cat_names: dict = {}
    for row in rows:
        cat_rows[row["category_id"]].append(row)
        cat_names[row["category_id"]] = row["category_name"]

    def fmt_month(m: str) -> str:
        from datetime import datetime
        return datetime.strptime(m, "%Y-%m-%d").strftime("%b '%y")

    month_header = " | ".join(fmt_month(m) for m in all_months)
    lines = [
        f"Category           | {month_header} | Avg Variance",
        "-" * (20 + 12 * len(all_months)),
    ]
    for cid, crows in sorted(cat_rows.items(), key=lambda x: cat_names[x[0]]):
        month_map = {r["month"]: r["variance"] for r in crows}
        variances = [v for v in month_map.values() if v is not None]
        avg_var = sum(variances) / len(variances) if variances else 0
        cells = []
        for m in all_months:
            v = month_map.get(m)
            if v is None:
                cells.append("  n/a ")
            elif v >= 0:
                cells.append(f"+${v:5.0f}")
            else:
                cells.append(f"-${abs(v):5.0f}")
        avg_str = f"+${avg_var:.0f}/mo" if avg_var >= 0 else f"-${abs(avg_var):.0f}/mo"
        lines.append(f"{cat_names[cid]:<18} | {' | '.join(cells)} | {avg_str}")

    n_months = len(all_months)
    table_text = "\n".join(lines)

    prompt = f"""You are a personal finance analyst reviewing {n_months} months of budget vs. actual spending data.

Here is the data (negative variance = over budget):

{table_text}

Please analyze this data and:
1. Identify the categories that most consistently cause actual spending to exceed budget
2. Quantify the magnitude — how much over, how often
3. Note any seasonal patterns or trends
4. Give 2-3 concise, practical suggestions for addressing the worst offenders. If the user is always over or never hits a category budget, suggest modifying total budget by moving allocated funds from another category budget or reducing savings

Be specific to the numbers. Keep the response under 400 words."""

    try:
        analysis, _stop, provider = _app._call_ai(prompt, conn, max_tokens=1024)
        if analysis is None:
            return jsonify({"error": "AI not configured. Save config via /api/ai/config first."}), 400
        model = _app.get_setting(conn, "ai_model")
    except Exception:
        current_app.logger.exception("AI analysis call failed")
        return jsonify({"error": "AI analysis failed. Check server logs."}), 500
    finally:
        conn.close()

    return jsonify({"analysis": analysis, "model": model, "provider": provider})

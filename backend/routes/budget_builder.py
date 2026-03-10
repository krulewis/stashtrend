import asyncio
import json
from datetime import datetime, timezone

from flask import Blueprint, jsonify, request, current_app
import app as _app
from monarch_pipeline import auth
from monarch_pipeline.config import SESSION_PATH, TOKEN_PATH

bp = Blueprint("budget_builder", __name__)


def _build_budget_prompt(conn, profile, months_ahead):
    """Assemble the AI prompt for budget generation.

    Returns (prompt, categories, category_ids, max_tokens).
    """
    from datetime import date

    # Load regional
    regional_row = conn.execute("SELECT * FROM budget_builder_regional WHERE id = 1").fetchone()
    regional = dict(regional_row) if regional_row else {}

    # Get categories (exclude transfers)
    categories = conn.execute(
        "SELECT id, name, group_name, group_type FROM categories "
        "WHERE group_type IS NULL OR group_type <> 'transfer' "
        "ORDER BY group_name, name"
    ).fetchall()
    category_ids = {c["id"] for c in categories}

    # Get historical budget data (6 months, exclude transfers)
    history = conn.execute(
        """SELECT b.category_id, b.month, b.budgeted_amount, b.actual_amount, b.variance,
                  c.name AS category_name, c.group_name, c.group_type
           FROM budgets b
           LEFT JOIN categories c ON c.id = b.category_id
           WHERE b.budgeted_amount IS NOT NULL
             AND (c.group_type IS NULL OR c.group_type <> 'transfer')
             AND b.month < date('now', 'start of month')
             AND b.month >= date('now', 'start of month', '-6 months')
           ORDER BY c.group_name, c.name, b.month ASC"""
    ).fetchall()

    # Format category list and history
    cat_list = "\n".join(f"  - ID: {c['id']}, Name: {c['name']}, Group: {c['group_name'] or 'Other'}"
                         for c in categories)

    history_lines = []
    for h in history:
        history_lines.append(
            f"  {h['category_name']} ({h['category_id']}): {h['month']} — "
            f"budgeted=${h['budgeted_amount']:.0f}, actual=${h['actual_amount']:.0f}, "
            f"variance=${h['variance']:.0f}"
        )
    history_text = "\n".join(history_lines) if history_lines else "  No historical data available."

    # Sanitize profile fields
    income = _app._sanitize_prompt_field(str(profile.get("expected_income", "not specified")), 50)
    location = _app._sanitize_prompt_field(str(profile.get("location", "not specified")), 200)
    housing = _app._sanitize_prompt_field(str(profile.get("housing_type", "not specified")), 50)
    children = profile.get("num_children", 0)
    children_ages = profile.get("children_ages") or "[]"
    if isinstance(children_ages, str):
        try:
            children_ages = json.loads(children_ages)
        except json.JSONDecodeError:
            children_ages = []
    children_ages = [_app._sanitize_prompt_field(str(a), 50) for a in (children_ages or [])[:20]]
    events = profile.get("upcoming_events") or "[]"
    if isinstance(events, str):
        try:
            events = json.loads(events)
        except json.JSONDecodeError:
            events = []
    events = [_app._sanitize_prompt_field(str(e), 200) for e in (events or [])[:20]]
    other_info = _app._sanitize_prompt_field(str(profile.get("other_info", "none")), 1000)

    regional_text = ""
    if regional:
        regional_text = f"""
Regional cost data for {location}:
  Food: {regional.get('food_cost_trend', 'n/a')}
  Childcare: {regional.get('childcare_cost', 'n/a')}
  Gas/Fuel: {regional.get('gas_fuel_price', 'n/a')}
  Insurance: {regional.get('insurance_trend', 'n/a')}
  Electricity: {regional.get('electricity_cost', 'n/a')}"""

    # Generate future month keys
    today = date.today()
    future_months = []
    for i in range(1, months_ahead + 1):
        m = today.month + i
        y = today.year
        while m > 12:
            m -= 12
            y += 1
        future_months.append(f"{y:04d}-{m:02d}-01")

    prompt = f"""You are a personal finance budget planner. Generate budget recommendations for the next {months_ahead} month(s).

USER PROFILE:
  Expected monthly income: ${income}
  Location: {location}
  Housing: {housing}
  Children: {children} (ages: {children_ages})
  Upcoming events: {events}
  Other info: {other_info}
{regional_text}

HISTORICAL BUDGET DATA (last 6 months):
{history_text}

AVAILABLE CATEGORIES (use ONLY these exact IDs — do NOT invent new ones):
{cat_list}

FUTURE MONTHS to budget for: {', '.join(future_months)}

Return ONLY valid JSON (no markdown, no explanation) with this structure:
{{
  "recommendations": [
    {{
      "category_id": "exact_id_from_list_above",
      "category_name": "category name",
      "group_name": "group name",
      "rationale": "brief explanation for this amount",
      "months": {{"YYYY-MM-01": amount, ...}}
    }}
  ],
  "summary": "2-3 sentence overview of the budget plan",
  "total_monthly_budget": {{"YYYY-MM-01": total_amount, ...}}
}}

Rules:
- Total expenses must not exceed the expected income of ${income}/month
- Use category IDs EXACTLY as listed above
- Include amounts for each future month
- Base recommendations on historical patterns, adjusted for regional costs and trends"""

    max_tokens = 4096 + max(0, (len(categories) - 30)) * 512 // 10
    return prompt, categories, category_ids, max_tokens


def _save_budget_plan(conn, data, months_ahead):
    """Persist AI-generated budget plan to the database. Returns the saved plan dict."""
    now = datetime.now(timezone.utc).isoformat()
    line_items = data.get("recommendations", [])
    summary = data.get("summary", "")
    total_monthly = data.get("total_monthly_budget", {})
    plan_name = f"AI Plan — {datetime.now().strftime('%b %d, %Y')}"

    cursor = conn.execute(
        """INSERT INTO budget_builder_plans (name, months_ahead, line_items, summary, ai_generated_at)
           VALUES (?, ?, ?, ?, ?)""",
        (plan_name, months_ahead, json.dumps(line_items), summary, now),
    )
    plan_id = cursor.lastrowid
    conn.commit()

    return {
        "id": plan_id,
        "name": plan_name,
        "months_ahead": months_ahead,
        "line_items": line_items,
        "summary": summary,
        "total_monthly_budget": total_monthly,
        "ai_generated_at": now,
    }


@bp.route("/api/budget-builder/profile")
def get_builder_profile():
    conn = _app.get_db()
    row = conn.execute("SELECT * FROM budget_builder_profile WHERE id = 1").fetchone()
    if not row:
        return jsonify({"exists": False})
    data = dict(row)
    data["exists"] = True
    data["children_ages"] = json.loads(data["children_ages"]) if data["children_ages"] else []
    data["upcoming_events"] = json.loads(data["upcoming_events"]) if data["upcoming_events"] else []
    return jsonify(data)


@bp.route("/api/budget-builder/profile", methods=["POST"])
def save_builder_profile():
    body = request.get_json() or {}
    # Validate field lengths
    if body.get("location") and len(body["location"]) > 200:
        return jsonify({"error": "location must be 200 characters or fewer"}), 400
    if body.get("other_info") and len(body["other_info"]) > 1000:
        return jsonify({"error": "other_info must be 1000 characters or fewer"}), 400
    # Validate housing_type
    ht = body.get("housing_type")
    if ht and ht not in ("own", "rent"):
        return jsonify({"error": "housing_type must be 'own' or 'rent'"}), 400
    # Validate JSON array fields
    children_ages = body.get("children_ages")
    if children_ages is not None:
        if isinstance(children_ages, list):
            children_ages = json.dumps(children_ages)
        else:
            try:
                json.loads(children_ages)
            except (json.JSONDecodeError, TypeError):
                return jsonify({"error": "children_ages must be a valid JSON array"}), 400
    upcoming_events = body.get("upcoming_events")
    if upcoming_events is not None:
        if isinstance(upcoming_events, list):
            upcoming_events = json.dumps(upcoming_events)
        else:
            try:
                json.loads(upcoming_events)
            except (json.JSONDecodeError, TypeError):
                return jsonify({"error": "upcoming_events must be a valid JSON array"}), 400

    conn = _app.get_db()
    conn.execute(
        """INSERT INTO budget_builder_profile (id, expected_income, num_children, children_ages,
           location, housing_type, upcoming_events, other_info)
           VALUES (1, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
               expected_income = excluded.expected_income,
               num_children = excluded.num_children,
               children_ages = excluded.children_ages,
               location = excluded.location,
               housing_type = excluded.housing_type,
               upcoming_events = excluded.upcoming_events,
               other_info = excluded.other_info,
               updated_at = datetime('now')""",
        (
            body.get("expected_income"),
            body.get("num_children", 0),
            children_ages,
            body.get("location"),
            ht,
            upcoming_events,
            body.get("other_info"),
        ),
    )
    conn.commit()
    return jsonify({"ok": True})


@bp.route("/api/budget-builder/regional")
def get_builder_regional():
    conn = _app.get_db()
    row = conn.execute("SELECT * FROM budget_builder_regional WHERE id = 1").fetchone()
    if not row:
        return jsonify({"exists": False})
    data = dict(row)
    data["exists"] = True
    data["other_factors"] = json.loads(data["other_factors"]) if data["other_factors"] else []
    return jsonify(data)


@bp.route("/api/budget-builder/regional", methods=["POST"])
def save_builder_regional():
    body = request.get_json() or {}
    other_factors = body.get("other_factors")
    if other_factors is not None and isinstance(other_factors, list):
        other_factors = json.dumps(other_factors)

    conn = _app.get_db()
    conn.execute(
        """INSERT INTO budget_builder_regional (id, food_cost_trend, childcare_cost,
           gas_fuel_price, insurance_trend, electricity_cost, other_factors, source)
           VALUES (1, ?, ?, ?, ?, ?, ?, 'user_edited')
           ON CONFLICT(id) DO UPDATE SET
               food_cost_trend = excluded.food_cost_trend,
               childcare_cost = excluded.childcare_cost,
               gas_fuel_price = excluded.gas_fuel_price,
               insurance_trend = excluded.insurance_trend,
               electricity_cost = excluded.electricity_cost,
               other_factors = excluded.other_factors,
               source = 'user_edited',
               updated_at = datetime('now')""",
        (
            body.get("food_cost_trend"),
            body.get("childcare_cost"),
            body.get("gas_fuel_price"),
            body.get("insurance_trend"),
            body.get("electricity_cost"),
            other_factors,
        ),
    )
    conn.commit()
    return jsonify({"ok": True})


@bp.route("/api/budget-builder/regional/fetch", methods=["POST"])
def fetch_builder_regional_ai():
    blocked = _app._check_ai_rate_limit("fetch_builder_regional_ai")
    if blocked:
        return blocked
    conn = _app.get_db()
    # Check AI config
    api_key = _app._get_ai_key(conn)
    if not api_key:
        return jsonify({"error": "AI not configured"}), 400

    # Check profile exists with location
    profile = conn.execute("SELECT * FROM budget_builder_profile WHERE id = 1").fetchone()
    if not profile or not profile["location"]:
        return jsonify({"error": "Profile with location required before fetching regional data"}), 400

    location = _app._sanitize_prompt_field(profile["location"], 200)
    prompt = f"""You are a personal finance research assistant. For the location "{location}", provide current cost-of-living data.

Return ONLY valid JSON (no markdown, no explanation) with exactly these keys:
{{
  "food_cost_trend": "average monthly grocery cost for a household and recent trend",
  "childcare_cost": "monthly childcare cost range",
  "gas_fuel_price": "current gas price per gallon",
  "insurance_trend": "average monthly auto/health insurance costs",
  "electricity_cost": "average monthly electricity cost",
  "other_factors": []
}}

The "other_factors" array can contain objects like {{"label": "Water", "value": "$60/mo"}} for any additional notable cost factors.
Be specific with dollar amounts and percentages. Use current 2026 data."""

    try:
        text, stop_reason, provider = _app._call_ai(prompt, conn, max_tokens=1024)
        if text is None:
            return jsonify({"error": "AI not configured"}), 400
    except Exception:
        current_app.logger.exception("Regional data AI call failed")
        return jsonify({"error": "Regional data fetch failed. Check server logs."}), 500

    try:
        data = _app._extract_json(text)
    except (json.JSONDecodeError, KeyError):
        current_app.logger.exception("Failed to parse regional AI response")
        return jsonify({"error": "Failed to parse AI response. Try again."}), 500

    other_factors = data.get("other_factors", [])
    if isinstance(other_factors, list):
        other_factors = json.dumps(other_factors)

    now = datetime.now(timezone.utc).isoformat()
    conn.execute(
        """INSERT INTO budget_builder_regional (id, food_cost_trend, childcare_cost,
           gas_fuel_price, insurance_trend, electricity_cost, other_factors, source, fetched_at)
           VALUES (1, ?, ?, ?, ?, ?, ?, 'ai', ?)
           ON CONFLICT(id) DO UPDATE SET
               food_cost_trend = excluded.food_cost_trend,
               childcare_cost = excluded.childcare_cost,
               gas_fuel_price = excluded.gas_fuel_price,
               insurance_trend = excluded.insurance_trend,
               electricity_cost = excluded.electricity_cost,
               other_factors = excluded.other_factors,
               source = 'ai',
               fetched_at = excluded.fetched_at,
               updated_at = datetime('now')""",
        (
            data.get("food_cost_trend"),
            data.get("childcare_cost"),
            data.get("gas_fuel_price"),
            data.get("insurance_trend"),
            data.get("electricity_cost"),
            other_factors,
            now,
        ),
    )
    conn.commit()

    # Return the saved data
    row = conn.execute("SELECT * FROM budget_builder_regional WHERE id = 1").fetchone()
    result = dict(row)
    result["exists"] = True
    result["other_factors"] = json.loads(result["other_factors"]) if result["other_factors"] else []
    return jsonify(result)


@bp.route("/api/budget-builder/generate", methods=["POST"])
def generate_budget_plan():
    blocked = _app._check_ai_rate_limit("generate_budget_plan")
    if blocked:
        return blocked
    body = request.get_json() or {}
    months_ahead = body.get("months_ahead", 3)
    profile_overrides = body.get("profile_overrides", {})

    conn = _app.get_db()

    api_key = _app._get_ai_key(conn)
    if not api_key:
        return jsonify({"error": "AI not configured"}), 400

    # Load and merge profile
    profile_row = conn.execute("SELECT * FROM budget_builder_profile WHERE id = 1").fetchone()
    profile = dict(profile_row) if profile_row else {}
    profile.update(profile_overrides)

    prompt, categories, category_ids, max_tokens = _build_budget_prompt(conn, profile, months_ahead)

    try:
        text, stop_reason, provider = _app._call_ai(prompt, conn, max_tokens=max_tokens)
        if text is None:
            return jsonify({"error": "AI not configured"}), 400
    except Exception:
        current_app.logger.exception("Budget generation AI call failed")
        return jsonify({"error": "Budget generation failed. Check server logs."}), 500

    if stop_reason in ("max_tokens", "length"):
        return jsonify({
            "error": "Response was truncated — try reducing months_ahead or the number of categories."
        }), 400

    try:
        data = _app._extract_json(text, valid_category_ids=category_ids)
    except (json.JSONDecodeError, KeyError):
        current_app.logger.exception("Failed to parse budget generation AI response")
        return jsonify({"error": "Failed to parse AI response. Try again."}), 500

    plan = _save_budget_plan(conn, data, months_ahead)
    return jsonify({"plan": plan})


@bp.route("/api/budget-builder/plans")
def list_builder_plans():
    conn = _app.get_db()
    rows = conn.execute(
        "SELECT id, name, created_at, months_ahead, applied_at FROM budget_builder_plans ORDER BY created_at DESC"
    ).fetchall()
    return jsonify({"plans": [dict(r) for r in rows]})


@bp.route("/api/budget-builder/plans/<int:plan_id>")
def get_builder_plan(plan_id):
    conn = _app.get_db()
    row = conn.execute("SELECT * FROM budget_builder_plans WHERE id = ?", (plan_id,)).fetchone()
    if not row:
        return jsonify({"error": "Plan not found"}), 404
    data = dict(row)
    data["line_items"] = json.loads(data["line_items"])
    return jsonify(data)


@bp.route("/api/budget-builder/plans/<int:plan_id>", methods=["PUT"])
def update_builder_plan(plan_id):
    body = request.get_json() or {}
    conn = _app.get_db()
    row = conn.execute("SELECT id FROM budget_builder_plans WHERE id = ?", (plan_id,)).fetchone()
    if not row:
        return jsonify({"error": "Plan not found"}), 404

    updates = []
    params = []
    if "name" in body:
        updates.append("name = ?")
        params.append(body["name"])
    if "line_items" in body:
        updates.append("line_items = ?")
        params.append(json.dumps(body["line_items"]))
    if updates:
        updates.append("user_edited_at = datetime('now')")
        params.append(plan_id)
        conn.execute(
            f"UPDATE budget_builder_plans SET {', '.join(updates)} WHERE id = ?",
            params,
        )
        conn.commit()
    return jsonify({"ok": True})


@bp.route("/api/budget-builder/plans/<int:plan_id>", methods=["DELETE"])
def delete_builder_plan(plan_id):
    conn = _app.get_db()
    conn.execute("DELETE FROM budget_builder_plans WHERE id = ?", (plan_id,))
    conn.commit()
    return jsonify({"ok": True})


@bp.route("/api/budget-builder/plans/<int:plan_id>/apply", methods=["POST"])
def apply_builder_plan(plan_id):
    conn = _app.get_db()
    row = conn.execute("SELECT * FROM budget_builder_plans WHERE id = ?", (plan_id,)).fetchone()
    if not row:
        return jsonify({"error": "Plan not found"}), 404

    line_items = json.loads(row["line_items"])

    # Collect all (category_id, month, amount) pairs sorted chronologically
    calls = []
    for item in line_items:
        cat_id = item["category_id"]
        for month, amount in item.get("months", {}).items():
            calls.append((cat_id, month, amount))
    calls.sort(key=lambda x: x[1])  # chronological order

    applied = 0
    failed = 0
    errors = []

    async def _apply():
        nonlocal applied, failed
        mm = await auth.get_client(SESSION_PATH, TOKEN_PATH)

        if not hasattr(mm, "set_budget_amount"):
            raise AttributeError(
                "set_budget_amount not available — update monarchmoney package"
            )

        for cat_id, month, amount in calls:
            try:
                await mm.set_budget_amount(
                    category_id=cat_id,
                    start_date=month,
                    amount=amount,
                    apply_to_future=False,
                )
                applied += 1
            except Exception:
                current_app.logger.exception("Failed to apply budget for %s/%s", cat_id, month)
                failed += 1
                errors.append({
                    "category_id": cat_id,
                    "month": month,
                    "error": "Failed to apply budget amount",
                })

    try:
        asyncio.run(_apply())
    except AttributeError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception:
        current_app.logger.exception("Budget apply failed")
        return jsonify({"error": "Budget apply failed. Check server logs."}), 500

    # Set applied_at only if all succeeded
    if failed == 0:
        conn.execute(
            "UPDATE budget_builder_plans SET applied_at = datetime('now') WHERE id = ?",
            (plan_id,),
        )
        conn.commit()

    return jsonify({"applied": applied, "failed": failed, "errors": errors})

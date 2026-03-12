from flask import Blueprint, jsonify, request, current_app
import app as _app

bp = Blueprint("budgets", __name__)


@bp.route("/api/budgets/history")
def budget_history():
    """Return budget vs actual per category per month for the last N months.

    Query param: months (int, default 12) — how many completed prior months to return.
    Excludes the current (incomplete) month.
    Categories sorted by worst average variance first (most over-budget at top).
    """
    months_param = request.args.get("months", 12, type=int)
    conn = _app.get_db()

    rows = conn.execute(
        """
        SELECT
            b.category_id,
            b.month,
            b.budgeted_amount,
            b.actual_amount,
            b.variance,
            c.name      AS category_name,
            c.group_name,
            c.group_type
        FROM budgets b
        LEFT JOIN categories c ON c.id = b.category_id
        WHERE b.budgeted_amount IS NOT NULL
          AND (c.group_type IS NULL OR c.group_type <> 'transfer')
          AND b.month <  date('now', 'start of month')
          AND b.month >= date('now', 'start of month', '-' || ? || ' months')
        ORDER BY b.month ASC
        """,
        (months_param,),
    ).fetchall()

    months_set = sorted({r["month"] for r in rows})

    # Expense-only totals — used by the bar chart
    totals_by_month: dict = {}
    for m in months_set:
        expense_rows = [r for r in rows if r["month"] == m and r["group_type"] != "income"]
        totals_by_month[m] = {
            "budgeted": sum(r["budgeted_amount"] or 0 for r in expense_rows),
            "actual":   sum(r["actual_amount"]   or 0 for r in expense_rows),
        }

    # Build per-category dict with running variance totals for sorting
    cats_map: dict = {}
    for row in rows:
        cid = row["category_id"]
        if cid not in cats_map:
            cats_map[cid] = {
                "category_id":   cid,
                "category_name": row["category_name"],
                "group_name":    row["group_name"],
                "group_type":    row["group_type"],
                "months":        {},
                "_var_sum":      0.0,
                "_var_count":    0,
            }
        cats_map[cid]["months"][row["month"]] = {
            "budgeted": row["budgeted_amount"],
            "actual":   row["actual_amount"],
            "variance": row["variance"],
        }
        if row["variance"] is not None:
            cats_map[cid]["_var_sum"]   += row["variance"]
            cats_map[cid]["_var_count"] += 1

    # Sort: most negative avg variance first (worst over-spender)
    categories = sorted(
        cats_map.values(),
        key=lambda c: (c["_var_sum"] / c["_var_count"]) if c["_var_count"] else 0,
    )
    # Strip internal sort fields before returning
    for cat in categories:
        del cat["_var_sum"]
        del cat["_var_count"]

    return jsonify({
        "months":          months_set,
        "totals_by_month": totals_by_month,
        "categories":      categories,
    })


@bp.route("/api/budgets/custom-groups")
def get_budget_custom_groups():
    """Return custom group assignments for budget categories.

    Response shape:
      {"groups": {"Group Name": [{"category_id": "...", "sort_order": N}, ...], ...}}

    Transfer categories are excluded from the response (defensive filter so
    orphaned transfer entries saved before this filter existed do not surface
    in the UI).
    """
    try:
        with _app.get_db_connection() as conn:
            rows = conn.execute(
                """
                SELECT bcg.category_id, bcg.custom_group, bcg.sort_order
                FROM budget_custom_groups bcg
                LEFT JOIN categories c ON c.id = bcg.category_id
                WHERE c.group_type IS NULL OR c.group_type != 'transfer'
                ORDER BY bcg.custom_group, bcg.sort_order
                """
            ).fetchall()

        groups: dict = {}
        for row in rows:
            group_name = row["custom_group"]
            if group_name not in groups:
                groups[group_name] = []
            groups[group_name].append({
                "category_id": row["category_id"],
                "sort_order":  row["sort_order"],
            })

        return jsonify({"groups": groups})
    except Exception:
        current_app.logger.exception("Failed to fetch budget custom groups")
        return jsonify({"error": "Internal server error"}), 500


@bp.route("/api/budgets/custom-groups", methods=["POST"])
def set_budget_custom_groups():
    """Replace all custom group assignments with the posted state.

    Expected body:
      {"groups": {"Group Name": [{"category_id": "...", "sort_order": N}, ...], ...}}

    Validation (400 on failure):
      - Body must be a dict with a "groups" key.
      - Each group name must be a non-empty string (after stripping whitespace).
      - Each category_id must be a non-empty string.
      - Each sort_order must be a non-negative integer.
      - Total row count must not exceed 500.

    Returns:
      {"status": "ok", "count": N}  where N is total rows inserted.
    """
    body = request.get_json(silent=True)
    if not isinstance(body, dict) or "groups" not in body:
        return jsonify({"error": "Request body must be a JSON object with a 'groups' key"}), 400

    groups_input = body["groups"]
    if not isinstance(groups_input, dict):
        return jsonify({"error": "The 'groups' value must be an object"}), 400

    # Collect and validate all rows before touching the DB
    rows_to_insert = []
    for group_name, items in groups_input.items():
        if not isinstance(group_name, str) or not group_name.strip():
            return jsonify({"error": "Each group name must be a non-empty string"}), 400
        clean_group_name = group_name.strip()

        if not isinstance(items, list):
            return jsonify({"error": "Each group's value must be a list of category entries"}), 400

        for item in items:
            if not isinstance(item, dict):
                return jsonify({"error": "Each category entry must be an object"}), 400

            category_id = item.get("category_id")
            if not isinstance(category_id, str) or not category_id:
                return jsonify({"error": "Each category_id must be a non-empty string"}), 400

            sort_order = item.get("sort_order")
            if not isinstance(sort_order, int) or isinstance(sort_order, bool) or sort_order < 0:
                return jsonify({"error": "Each sort_order must be a non-negative integer"}), 400

            rows_to_insert.append((category_id, clean_group_name, sort_order))

    if len(rows_to_insert) > 500:
        return jsonify({"error": "Too many entries; maximum is 500"}), 400

    seen_ids = set()
    for cat_id, _, _ in rows_to_insert:
        if cat_id in seen_ids:
            return jsonify({"error": "Duplicate category_id found: a category can only belong to one group"}), 400
        seen_ids.add(cat_id)

    try:
        with _app.get_db_connection() as conn:
            conn.execute("DELETE FROM budget_custom_groups")
            conn.executemany(
                "INSERT INTO budget_custom_groups (category_id, custom_group, sort_order) VALUES (?, ?, ?)",
                rows_to_insert,
            )
            conn.commit()

        return jsonify({"status": "ok", "count": len(rows_to_insert)})
    except Exception:
        current_app.logger.exception("Failed to save budget custom groups")
        return jsonify({"error": "Internal server error"}), 500

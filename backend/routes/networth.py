import logging
from collections import defaultdict
from datetime import datetime

from flask import Blueprint, jsonify, current_app
import app as _app

logger = logging.getLogger(__name__)

bp = Blueprint("networth", __name__)

# Maps Monarch account `type` values to a display bucket.
# Keep include_in_net_worth = 1 filter consistent with networth_history endpoint.
# NOTE: is_hidden is intentionally NOT filtered here — networth_history only uses
# include_in_net_worth=1, so totals across bucket series match the main NW chart.
BUCKET_MAP = {
    # Retirement
    "401k":               "Retirement",
    "403b":               "Retirement",
    "ira":                "Retirement",
    "roth_ira":           "Retirement",
    "roth_401k":          "Retirement",
    "sep_ira":            "Retirement",
    "simple_ira":         "Retirement",
    "pension":            "Retirement",
    "401a":               "Retirement",
    # Brokerage / taxable investments
    "brokerage":          "Brokerage",
    "investment":         "Brokerage",
    "crypto":             "Brokerage",
    "hsa":                "Brokerage",
    "529":                "Brokerage",
    "education":          "Brokerage",
    "stock":              "Brokerage",
    # Cash / liquid
    "checking":           "Cash",
    "savings":            "Cash",
    "depository":         "Cash",
    "money_market":       "Cash",
    "cash":               "Cash",
    "prepaid":            "Cash",
    "cash_management":    "Cash",
    # Real estate
    "real_estate":        "Real Estate",
    "property":           "Real Estate",
    # Other assets
    "vehicle":            "Other",
    "other_asset":        "Other",
    "collectible":        "Other",
    "valuable":           "Other",
    # Debt / liabilities
    "mortgage":           "Debt",
    "student_loan":       "Debt",
    "auto_loan":          "Debt",
    "personal_loan":      "Debt",
    "credit":             "Debt",
    "credit_card":        "Debt",
    "line_of_credit":     "Debt",
    "home_equity":        "Debt",
    "medical":            "Debt",
    "other_liability":    "Debt",
    "loan":               "Debt",
}

# Subtypes that override the parent type bucket (checked first if subtype is set).
# Includes both standard Plaid subtypes and Monarch-specific prefixed subtypes
# (e.g., st_401k, st_529). Check backend logs for "Unknown account type" warnings
# to catch new subtypes as Monarch adds them.
TYPE_MAP = {
    # Retirement subtypes — standard
    "traditional_ira":    "Retirement",
    "roth_ira":           "Retirement",
    "rollover_ira":       "Retirement",
    "sep_ira":            "Retirement",
    "simple_ira":         "Retirement",
    "inherited_ira":      "Retirement",
    # Retirement subtypes — Monarch-specific
    "ira":                "Retirement",
    "roth":               "Retirement",
    "st_401k":            "Retirement",
    "st_403b":            "Retirement",
    "thrift_savings_plan":"Retirement",
    # Brokerage subtypes
    "individual":         "Brokerage",
    "joint":              "Brokerage",
    "trust":              "Brokerage",
    "ugma_utma":          "Brokerage",
    "brokerage":          "Brokerage",
    "st_529":             "Brokerage",
    "health_savings_account": "Brokerage",
    # Cash subtypes
    "high_yield_savings": "Cash",
    "cash_management":    "Cash",
    "checking":           "Cash",
    "savings":            "Cash",
    "cd":                 "Cash",
}

BUCKET_ORDER = ["Retirement", "Brokerage", "Cash", "Real Estate", "Debt", "Other"]

BUCKET_COLORS = {
    "Retirement":   "#4D9FFF",
    "Brokerage":    "#2ECC8A",
    "Cash":         "#7DBFFF",
    "Real Estate":  "#F5A623",
    "Debt":         "#FF5A7A",
    "Other":        "#8BA8CC",
}


def _get_bucket(account_type, account_subtype):
    """
    Map an account's type + subtype to a display bucket.
    Subtype is checked first (TYPE_MAP), then type (BUCKET_MAP).
    Logs a WARNING for unknown types so new Monarch types are caught early.
    """
    if account_subtype and account_subtype in TYPE_MAP:
        return TYPE_MAP[account_subtype]
    if account_type and account_type in BUCKET_MAP:
        return BUCKET_MAP[account_type]
    if account_type:
        logger.warning("Unknown account type for bucket mapping: %r (subtype=%r)", account_type, account_subtype)
    return "Other"


def _compute_bucket_cagr(bal_by_date):
    """
    Compute 1Y/3Y/5Y CAGR for a bucket using aggregate balance CAGR.

    Edge cases:
    - <30 days of non-zero history → return null for all periods.
    - First non-zero balance is the start point (not a return event).
    - Zero-balance days are skipped.

    Returns: {"1y": float|None, "3y": float|None, "5y": float|None}
    """
    if not bal_by_date:
        return {"1y": None, "3y": None, "5y": None}

    sorted_dates = sorted(bal_by_date.keys())
    # Strip leading zero-balance entries — first non-zero is the start
    nonzero_dates = [d for d in sorted_dates if bal_by_date[d] > 0]

    if len(nonzero_dates) < 30:
        return {"1y": None, "3y": None, "5y": None}

    pairs = [(d, bal_by_date[d]) for d in nonzero_dates]
    today_str = nonzero_dates[-1]

    def _cagr_for_years(years):
        cutoff_dt = datetime.strptime(today_str, "%Y-%m-%d")
        target_year = cutoff_dt.year - years
        # Handle leap day: Feb 29 doesn't exist in non-leap years
        try:
            cutoff_dt = cutoff_dt.replace(year=target_year)
        except ValueError:
            cutoff_dt = cutoff_dt.replace(year=target_year, day=28)
        cutoff = cutoff_dt.strftime("%Y-%m-%d")
        start_pairs = [(d, b) for d, b in pairs if d >= cutoff]
        if len(start_pairs) < 2:
            return None
        start_date, start_bal = start_pairs[0]
        end_date, end_bal = pairs[-1]
        if start_bal <= 0 or end_bal <= 0:
            return None
        dt_start = datetime.strptime(start_date, "%Y-%m-%d")
        dt_end = datetime.strptime(end_date, "%Y-%m-%d")
        elapsed_years = (dt_end - dt_start).days / 365.25
        if elapsed_years < 0.1:
            return None
        # Simple CAGR: (end/start)^(1/years) - 1
        # At bucket level we use aggregate balance CAGR as an approximation.
        cagr_val = (end_bal / start_bal) ** (1.0 / elapsed_years) - 1
        return round(cagr_val * 100, 2)

    return {
        "1y": _cagr_for_years(1),
        "3y": _cagr_for_years(3),
        "5y": _cagr_for_years(5),
    }


@bp.route("/api/networth/history")
def networth_history():
    conn = _app.get_db()
    rows = conn.execute("""
        SELECT
            ah.date,
            SUM(CASE WHEN a.is_asset = 1 THEN ah.balance ELSE 0 END)          AS assets,
            SUM(CASE WHEN a.is_asset = 0 THEN ABS(ah.balance) ELSE 0 END)     AS liabilities,
            SUM(CASE WHEN a.is_asset = 1 THEN ah.balance ELSE -ABS(ah.balance) END) AS net_worth
        FROM account_history ah
        JOIN accounts a ON ah.account_id = a.id
        WHERE a.include_in_net_worth = 1
        GROUP BY ah.date
        ORDER BY ah.date ASC
    """).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@bp.route("/api/networth/stats")
def networth_stats():
    conn = _app.get_db()

    def net_worth_on_date(target_date_expr):
        row = conn.execute(f"""
            SELECT
                ah.date,
                SUM(CASE WHEN a.is_asset = 1 THEN ah.balance ELSE -ABS(ah.balance) END) AS net_worth
            FROM account_history ah
            JOIN accounts a ON ah.account_id = a.id
            WHERE a.include_in_net_worth = 1
              AND ah.date <= {target_date_expr}
            GROUP BY ah.date
            ORDER BY ah.date DESC
            LIMIT 1
        """).fetchone()
        return (row["net_worth"], row["date"]) if row else (None, None)

    current_nw, current_date = net_worth_on_date("date('now')")
    mom_nw, mom_date         = net_worth_on_date("date('now', '-1 month')")
    yoy_nw, yoy_date         = net_worth_on_date("date('now', '-1 year')")

    def pct_change(current, prior):
        if prior is None or prior == 0:
            return None
        return round((current - prior) / abs(prior) * 100, 2)

    conn.close()
    return jsonify({
        "current": {"net_worth": current_nw, "date": current_date},
        "mom": {
            "net_worth": mom_nw,
            "date": mom_date,
            "change":     round(current_nw - mom_nw, 2) if mom_nw is not None else None,
            "pct_change": pct_change(current_nw, mom_nw),
        },
        "yoy": {
            "net_worth": yoy_nw,
            "date": yoy_date,
            "change":     round(current_nw - yoy_nw, 2) if yoy_nw is not None else None,
            "pct_change": pct_change(current_nw, yoy_nw),
        },
    })


@bp.route("/api/accounts/summary")
def accounts_summary():
    conn = _app.get_db()
    try:
        rows = conn.execute("""
            SELECT
                id,
                type,
                subtype,
                is_asset,
                institution,
                name,
                current_balance,
                display_balance
            FROM accounts
            WHERE include_in_net_worth = 1
              AND is_hidden = 0
            ORDER BY is_asset DESC, type, current_balance DESC
        """).fetchall()
        result = []
        for r in rows:
            d = dict(r)
            d["bucket"] = _get_bucket(d.get("type"), d.get("subtype"))
            result.append(d)
        return jsonify(result)
    finally:
        conn.close()


@bp.route("/api/networth/by-type")
def networth_by_type():
    """
    Returns per-bucket NW history (stacked area) and CAGR estimates.

    Filter: include_in_net_worth = 1 only — matches networth_history so bucket
    series totals add up to the main NW chart total. is_hidden is NOT filtered.

    CAGR approximation: aggregate balance CAGR.
    Tooltip in the UI reads: "Estimated CAGR — actual returns may differ."
    """
    conn = _app.get_db()
    try:
        # Step 1: Fetch all accounts in scope
        acct_rows = conn.execute("""
            SELECT id, type, subtype, is_asset
            FROM accounts
            WHERE include_in_net_worth = 1
        """).fetchall()

        acct_bucket = {}
        for row in acct_rows:
            bucket = _get_bucket(row["type"], row["subtype"])
            acct_bucket[row["id"]] = (bucket, bool(row["is_asset"]))

        if not acct_bucket:
            return jsonify({"series": [], "cagr": {}, "bucket_colors": BUCKET_COLORS,
                            "bucket_order": BUCKET_ORDER})

        # Step 2: Fetch full account_history for all in-scope accounts
        placeholders = ",".join("?" * len(acct_bucket))
        history_rows = conn.execute(f"""
            SELECT account_id, date, balance
            FROM account_history
            WHERE account_id IN ({placeholders})
            ORDER BY date ASC
        """, list(acct_bucket.keys())).fetchall()

        # Step 3: Build date-keyed series grouped by bucket
        date_bucket_totals = defaultdict(lambda: defaultdict(float))
        acct_history = defaultdict(list)

        for row in history_rows:
            acct_id = row["account_id"]
            bucket, is_asset = acct_bucket[acct_id]
            balance = row["balance"] or 0
            nw_contribution = balance if is_asset else -abs(balance)
            date_bucket_totals[row["date"]][bucket] += nw_contribution
            acct_history[acct_id].append((row["date"], balance))

        all_dates = sorted(date_bucket_totals.keys())
        series = []
        for date in all_dates:
            point = {"date": date}
            for bucket in BUCKET_ORDER:
                point[bucket] = round(date_bucket_totals[date].get(bucket, 0), 2)
            series.append(point)

        # Step 4: Compute per-bucket CAGR
        bucket_balances = defaultdict(lambda: defaultdict(float))
        for acct_id, history in acct_history.items():
            bucket, is_asset = acct_bucket[acct_id]
            for date, balance in history:
                val = (balance or 0) if is_asset else abs(balance or 0)
                bucket_balances[bucket][date] += val

        cagr = {}
        for bucket in BUCKET_ORDER:
            bal_by_date = bucket_balances.get(bucket, {})
            cagr[bucket] = _compute_bucket_cagr(bal_by_date)

        return jsonify({
            "series": series,
            "cagr": cagr,
            "bucket_colors": BUCKET_COLORS,
            "bucket_order": BUCKET_ORDER,
        })
    finally:
        conn.close()

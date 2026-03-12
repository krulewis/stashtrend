import logging
from collections import defaultdict
from datetime import date, datetime, timezone
from dateutil.relativedelta import relativedelta
from flask import Blueprint, jsonify, request
import app as _app

logger = logging.getLogger(__name__)
bp = Blueprint("investments", __name__)

INVESTMENT_TYPES = {
    "brokerage", "investment", "retirement", "401k", "403b", "ira",
    "roth_ira", "roth_401k", "sep_ira", "simple_ira", "pension",
    "401a", "crypto", "hsa", "529", "education", "stock",
}


def _get_investment_accounts(conn):
    """Return all investment accounts that are included in net worth."""
    rows = conn.execute(
        "SELECT id, name, institution, type, subtype, current_balance "
        "FROM accounts WHERE include_in_net_worth = 1"
    ).fetchall()
    return [dict(r) for r in rows if r["type"] in INVESTMENT_TYPES]


def _compute_all_cagrs(account_ids, conn):
    """
    Compute a simple CAGR from the earliest to latest non-zero balance
    for each account.

    Returns {account_id: cagr_pct_or_None}
    """
    if not account_ids:
        return {}

    placeholders = ",".join("?" * len(account_ids))
    rows = conn.execute(
        f"SELECT account_id, date, balance FROM account_history "
        f"WHERE account_id IN ({placeholders}) ORDER BY account_id, date",
        list(account_ids),
    ).fetchall()

    by_account = defaultdict(list)
    for r in rows:
        by_account[r["account_id"]].append((r["date"], r["balance"]))

    result = {}
    for acct_id in account_ids:
        history = by_account.get(acct_id, [])
        # Strip leading None / <= 0 balance rows
        nonzero = [(d, b) for d, b in history if b is not None and b > 0]
        if len(nonzero) < 30:
            result[acct_id] = None
            continue
        earliest_date, earliest_bal = nonzero[0]
        latest_date, latest_bal = nonzero[-1]
        dt_earliest = datetime.strptime(earliest_date, "%Y-%m-%d")
        dt_latest = datetime.strptime(latest_date, "%Y-%m-%d")
        elapsed_years = (dt_latest - dt_earliest).days / 365.25
        if elapsed_years < 0.1:
            result[acct_id] = None
            continue
        cagr_raw = (latest_bal / earliest_bal) ** (1.0 / elapsed_years) - 1
        result[acct_id] = round(cagr_raw * 100, 2)
    return result


def _normalize_security_type(raw_type):
    """Map raw security type string to a display category."""
    if not raw_type:
        return "Other"
    t = raw_type.lower()
    if t in ("equity", "common stock"):
        return "Stock"
    if t == "etf":
        return "ETF"
    if t == "mutual fund":
        return "Mutual Fund"
    if t in ("fixed income", "bond"):
        return "Bond"
    if t in ("cash", "money market"):
        return "Cash"
    return "Other"


@bp.route("/api/investments/summary")
def get_investments_summary():
    try:
        conn = _app.get_db()
        accounts = _get_investment_accounts(conn)
        account_ids = [a["id"] for a in accounts]
        cagr_map = _compute_all_cagrs(account_ids, conn)

        result_accounts = []
        total_value = 0.0

        for acct in accounts:
            acct_id = acct["id"]
            bucket = _app._get_bucket(acct["type"], acct["subtype"])

            # Latest holdings aggregate
            holdings_row = conn.execute(
                "SELECT SUM(total_value) as current_value, SUM(basis) as total_cost_basis "
                "FROM holdings WHERE account_id = ?",
                (acct_id,),
            ).fetchone()

            if holdings_row and holdings_row["current_value"] is not None:
                current_value = holdings_row["current_value"]
                total_cost_basis = holdings_row["total_cost_basis"]
            else:
                current_value = acct["current_balance"] or 0.0
                total_cost_basis = None

            # Return calculations
            total_return_dollars = None
            total_return_pct = None
            if total_cost_basis is not None and current_value is not None:
                total_return_dollars = current_value - total_cost_basis
                if total_cost_basis > 0:
                    total_return_pct = round(total_return_dollars / total_cost_basis * 100, 2)

            # Staleness check
            sync_row = conn.execute(
                "SELECT MAX(last_synced_at) as last_synced_at FROM holdings WHERE account_id = ?",
                (acct_id,),
            ).fetchone()
            last_synced_at = sync_row["last_synced_at"] if sync_row else None

            is_stale = False
            stale_days = None
            if last_synced_at:
                try:
                    # Handle ISO format with or without timezone
                    synced_str = last_synced_at.replace("Z", "+00:00")
                    synced_dt = datetime.fromisoformat(synced_str)
                    # Make now offset-aware if synced_dt is
                    if synced_dt.tzinfo is not None:
                        now_dt = datetime.now(timezone.utc)
                    else:
                        now_dt = datetime.now(timezone.utc).replace(tzinfo=None)
                    delta = now_dt - synced_dt
                    stale_days = delta.days
                    is_stale = delta.total_seconds() > 86400
                except (ValueError, TypeError):
                    pass

            total_value += current_value or 0.0

            result_accounts.append({
                "id": acct_id,
                "name": acct["name"],
                "institution": acct["institution"],
                "type": acct["type"],
                "subtype": acct["subtype"],
                "bucket": bucket,
                "current_value": round(current_value, 2) if current_value is not None else None,
                "total_cost_basis": round(total_cost_basis, 2) if total_cost_basis is not None else None,
                "total_return_dollars": round(total_return_dollars, 2) if total_return_dollars is not None else None,
                "total_return_pct": total_return_pct,
                "cagr_pct": cagr_map.get(acct_id),
                "is_stale": is_stale,
                "stale_days": stale_days,
                "last_synced_at": last_synced_at,
            })

        # Compute allocation weights
        for acct in result_accounts:
            val = acct["current_value"] or 0.0
            acct["allocation_weight_pct"] = round(val / total_value * 100, 2) if total_value > 0 else 0.0

        totals = {
            "current_value": round(total_value, 2),
            "total_cost_basis": round(
                sum(a["total_cost_basis"] for a in result_accounts if a["total_cost_basis"] is not None), 2
            ) if any(a["total_cost_basis"] is not None for a in result_accounts) else None,
        }
        total_cb = totals["total_cost_basis"]
        total_tv = totals["current_value"]
        if total_cb is not None:
            totals["total_return_dollars"] = round(total_tv - total_cb, 2)
            totals["total_return_pct"] = round((total_tv - total_cb) / total_cb * 100, 2) if total_cb > 0 else None
        else:
            totals["total_return_dollars"] = None
            totals["total_return_pct"] = None

        cagr_values = [a["cagr_pct"] for a in result_accounts if a["cagr_pct"] is not None]
        totals["cagr_pct"] = round(sum(cagr_values) / len(cagr_values), 2) if cagr_values else None

        return jsonify({"accounts": result_accounts, "totals": totals})
    except Exception:
        logger.exception("Failed to fetch investments summary")
        return jsonify({"error": "Failed to fetch investments summary"}), 500


@bp.route("/api/investments/accounts/<account_id>/holdings")
def get_account_holdings(account_id):
    try:
        conn = _app.get_db()

        # Verify account exists and is an investment type
        acct_row = conn.execute(
            "SELECT id, name, institution, type, subtype FROM accounts WHERE id = ?",
            (account_id,),
        ).fetchone()

        if not acct_row or acct_row["type"] not in INVESTMENT_TYPES:
            return jsonify({"error": "Account not found or not an investment account"}), 404

        acct = dict(acct_row)
        bucket = _app._get_bucket(acct["type"], acct["subtype"])

        # Fetch holdings
        holding_rows = conn.execute(
            "SELECT ticker, security_name, security_type, quantity, basis, total_value, is_manual "
            "FROM holdings WHERE account_id = ?",
            (account_id,),
        ).fetchall()

        holdings = []
        type_totals = defaultdict(float)
        total_value = 0.0
        total_cost_basis = 0.0
        has_cost_basis = False

        for h in holding_rows:
            norm_type = _normalize_security_type(h["security_type"])
            current_value = h["total_value"]
            cost_basis = h["basis"]

            unrealized_gain_loss_dollars = None
            unrealized_gain_loss_pct = None
            if current_value is not None and cost_basis is not None:
                unrealized_gain_loss_dollars = round(current_value - cost_basis, 2)
                if cost_basis > 0:
                    unrealized_gain_loss_pct = round((current_value - cost_basis) / cost_basis * 100, 2)

            if current_value is not None:
                type_totals[norm_type] += current_value
                total_value += current_value
            if cost_basis is not None:
                total_cost_basis += cost_basis
                has_cost_basis = True

            holdings.append({
                "ticker": h["ticker"],
                "security_name": h["security_name"],
                "security_type": norm_type,
                "quantity": h["quantity"],
                "cost_basis": round(cost_basis, 2) if cost_basis is not None else None,
                "current_value": round(current_value, 2) if current_value is not None else None,
                "is_manual": bool(h["is_manual"]),
                "unrealized_gain_loss_dollars": unrealized_gain_loss_dollars,
                "unrealized_gain_loss_pct": unrealized_gain_loss_pct,
            })

        # Allocation by type
        allocation = []
        for sec_type, type_val in type_totals.items():
            allocation.append({
                "type": sec_type,
                "value": round(type_val, 2),
                "pct": round(type_val / total_value * 100, 2) if total_value > 0 else 0.0,
            })

        # Last synced
        sync_row = conn.execute(
            "SELECT MAX(last_synced_at) as last_synced_at FROM holdings WHERE account_id = ?",
            (account_id,),
        ).fetchone()
        last_synced_at = sync_row["last_synced_at"] if sync_row else None

        totals = {
            "current_value": round(total_value, 2),
            "total_cost_basis": round(total_cost_basis, 2) if has_cost_basis else None,
            "holdings_count": len(holdings),
        }
        if has_cost_basis and total_cost_basis is not None:
            totals["unrealized_gain_loss_dollars"] = round(total_value - total_cost_basis, 2)
            totals["unrealized_gain_loss_pct"] = (
                round((total_value - total_cost_basis) / total_cost_basis * 100, 2)
                if total_cost_basis > 0 else None
            )
        else:
            totals["unrealized_gain_loss_dollars"] = None
            totals["unrealized_gain_loss_pct"] = None

        return jsonify({
            "account": {
                "id": account_id,
                "name": acct["name"],
                "institution": acct["institution"],
                "bucket": bucket,
                "last_synced_at": last_synced_at,
            },
            "holdings": holdings,
            "allocation": allocation,
            "totals": totals,
        })
    except Exception:
        logger.exception("Failed to fetch holdings for account %s", account_id)
        return jsonify({"error": "Failed to fetch holdings"}), 500


@bp.route("/api/investments/performance")
def get_investments_performance():
    try:
        conn = _app.get_db()

        range_param = request.args.get("range", "1y")
        accounts_param = request.args.get("accounts", "")

        # Get all investment account IDs
        all_investment_accounts = _get_investment_accounts(conn)
        all_ids = {a["id"] for a in all_investment_accounts}
        account_names = {a["id"]: a["name"] for a in all_investment_accounts}

        # Filter to requested accounts if param provided
        if accounts_param:
            requested_ids = set(accounts_param.split(","))
            account_ids = list(all_ids & requested_ids)
        else:
            account_ids = list(all_ids)

        if not account_ids:
            return jsonify({"series": [], "contributions": [], "account_names": {}})

        # Compute date cutoff
        today = date.today()
        cutoff = None
        if range_param == "3m":
            cutoff = today - relativedelta(months=3)
        elif range_param == "6m":
            cutoff = today - relativedelta(months=6)
        elif range_param == "1y":
            cutoff = today - relativedelta(years=1)
        elif range_param == "3y":
            cutoff = today - relativedelta(years=3)
        elif range_param == "5y":
            cutoff = today - relativedelta(years=5)
        # 'all' or unknown: no cutoff
        cutoff_str = cutoff.strftime("%Y-%m-%d") if cutoff is not None else None

        placeholders = ",".join("?" * len(account_ids))
        params = list(account_ids)

        if cutoff_str is not None:
            history_rows = conn.execute(
                f"SELECT account_id, date, balance FROM account_history "
                f"WHERE account_id IN ({placeholders}) AND date >= ? ORDER BY date",
                params + [cutoff_str],
            ).fetchall()
        else:
            history_rows = conn.execute(
                f"SELECT account_id, date, balance FROM account_history "
                f"WHERE account_id IN ({placeholders}) ORDER BY date",
                params,
            ).fetchall()

        # Build time series: sum totals per date, include per-account values
        date_totals: defaultdict = defaultdict(float)
        date_accounts: defaultdict = defaultdict(dict)
        for r in history_rows:
            d = r["date"]
            bal = r["balance"] or 0.0
            date_totals[d] += bal
            date_accounts[d][r["account_id"]] = bal

        series = []
        for d in sorted(date_totals.keys()):
            point = {"date": d, "total": round(date_totals[d], 2)}
            point.update(date_accounts[d])
            series.append(point)

        # Query contributions (transfer transactions into investment accounts)
        if cutoff_str is not None:
            contrib_rows = conn.execute(
                f"""
                SELECT strftime('%Y-%m', t.date) as month, SUM(ABS(t.amount)) as total
                FROM transactions t
                JOIN categories c ON t.category_id = c.id
                WHERE t.account_id IN ({placeholders})
                  AND c.group_type = 'transfer'
                  AND t.date >= ?
                GROUP BY month
                ORDER BY month
                """,
                params + [cutoff_str],
            ).fetchall()
        else:
            contrib_rows = conn.execute(
                f"""
                SELECT strftime('%Y-%m', t.date) as month, SUM(ABS(t.amount)) as total
                FROM transactions t
                JOIN categories c ON t.category_id = c.id
                WHERE t.account_id IN ({placeholders})
                  AND c.group_type = 'transfer'
                GROUP BY month
                ORDER BY month
                """,
                params,
            ).fetchall()

        contributions = [{"month": r["month"], "total": round(r["total"], 2)} for r in contrib_rows]

        return jsonify({
            "series": series,
            "contributions": contributions,
            "account_names": {k: v for k, v in account_names.items() if k in set(account_ids)},
        })
    except Exception:
        logger.exception("Failed to fetch investments performance")
        return jsonify({"error": "Failed to fetch investments performance"}), 500

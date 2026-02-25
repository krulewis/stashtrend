"""
Database upsert and query functions for monarch-pipeline.
All writes use INSERT OR REPLACE to safely handle re-syncs.
"""

from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from typing import Any, Optional


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ── Accounts ──────────────────────────────────────────────────────────────────

def upsert_accounts(conn: sqlite3.Connection, accounts: list[dict[str, Any]]) -> int:
    """Upsert a list of account records. Returns number of rows written."""
    rows = [
        (
            a["id"],
            a.get("displayName") or a.get("name", ""),
            a.get("type", {}).get("name"),
            a.get("subtype", {}).get("name"),
            a.get("currentBalance"),
            a.get("displayBalance"),
            a.get("institution", {}).get("name") if a.get("institution") else None,
            int(a.get("isHidden", False)),
            int(a.get("isAsset", True)),
            int(a.get("includeInNetWorth", True)),
            a.get("updatedAt"),
            _now(),
        )
        for a in accounts
    ]

    conn.executemany(
        """
        INSERT OR REPLACE INTO accounts
            (id, name, type, subtype, current_balance, display_balance,
             institution, is_hidden, is_asset, include_in_net_worth,
             last_updated, synced_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        rows,
    )
    conn.commit()
    return len(rows)


# ── Account History ───────────────────────────────────────────────────────────

def upsert_account_history(
    conn: sqlite3.Connection, account_id: str, history: list[dict[str, Any]]
) -> int:
    """Upsert daily balance history for one account. Returns rows written."""
    rows = [(account_id, h["date"], h.get("signedBalance") or h.get("balance")) for h in history]

    conn.executemany(
        """
        INSERT OR REPLACE INTO account_history (account_id, date, balance)
        VALUES (?, ?, ?)
        """,
        rows,
    )
    conn.commit()
    return len(rows)


def get_latest_history_date(conn: sqlite3.Connection, account_id: str) -> Optional[str]:
    """Return the most recent date in account_history for this account, or None."""
    row = conn.execute(
        "SELECT MAX(date) as max_date FROM account_history WHERE account_id = ?",
        (account_id,),
    ).fetchone()
    return row["max_date"] if row else None


# ── Categories ────────────────────────────────────────────────────────────────

def upsert_categories(conn: sqlite3.Connection, categories: list[dict[str, Any]]) -> int:
    """Upsert transaction categories. Returns rows written."""
    rows = [
        (
            c["id"],
            c.get("name", ""),
            c.get("group", {}).get("id"),
            c.get("group", {}).get("name"),
            c.get("group", {}).get("type"),
        )
        for c in categories
    ]

    conn.executemany(
        """
        INSERT OR REPLACE INTO categories (id, name, group_id, group_name, group_type)
        VALUES (?, ?, ?, ?, ?)
        """,
        rows,
    )
    conn.commit()
    return len(rows)


# ── Transactions ──────────────────────────────────────────────────────────────

def upsert_transactions(
    conn: sqlite3.Connection, transactions: list[dict[str, Any]]
) -> int:
    """Upsert transactions. Returns rows written."""
    rows = [
        (
            t["id"],
            t.get("date", ""),
            t.get("amount", 0.0),
            t.get("merchant", {}).get("name") if t.get("merchant") else None,
            t.get("category", {}).get("id") if t.get("category") else None,
            t.get("category", {}).get("name") if t.get("category") else None,
            t.get("category", {}).get("group", {}).get("name")
            if t.get("category")
            else None,
            t.get("account", {}).get("id") if t.get("account") else None,
            t.get("account", {}).get("displayName") if t.get("account") else None,
            int(t.get("pending", False)),
            int(t.get("isRecurring", False)),
            t.get("notes"),
            int(t.get("hideFromReports", False)),
            t.get("createdAt"),
            t.get("updatedAt"),
            _now(),
        )
        for t in transactions
    ]

    conn.executemany(
        """
        INSERT OR REPLACE INTO transactions
            (id, date, amount, merchant_name, category_id, category_name,
             category_group, account_id, account_name, is_pending, is_recurring,
             notes, hide_from_reports, created_at, updated_at, synced_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        rows,
    )
    conn.commit()
    return len(rows)


# ── Budgets ───────────────────────────────────────────────────────────────────

def upsert_budgets(conn: sqlite3.Connection, budgets: list[dict[str, Any]]) -> int:
    """Upsert budget records. Returns rows written."""
    conn.executemany(
        """
        INSERT OR REPLACE INTO budgets
            (category_id, month, budgeted_amount, actual_amount, variance)
        VALUES (?, ?, ?, ?, ?)
        """,
        budgets,
    )
    conn.commit()
    return len(budgets)


# ── Sync Log ──────────────────────────────────────────────────────────────────

def update_sync_log(conn: sqlite3.Connection, entity: str, count: int) -> None:
    """Record a successful sync for the given entity."""
    total = conn.execute(
        "SELECT COUNT(*) as n FROM " + entity  # entity is internal, not user input
    ).fetchone()["n"]

    conn.execute(
        """
        INSERT OR REPLACE INTO sync_log (entity, last_synced_at, last_sync_count, total_records)
        VALUES (?, ?, ?, ?)
        """,
        (entity, _now(), count, total),
    )
    conn.commit()


def get_last_sync_date(conn: sqlite3.Connection, entity: str) -> Optional[str]:
    """Return ISO timestamp of last successful sync for entity, or None."""
    row = conn.execute(
        "SELECT last_synced_at FROM sync_log WHERE entity = ?", (entity,)
    ).fetchone()
    return row["last_synced_at"] if row else None


def get_sync_status(conn: sqlite3.Connection) -> list[dict]:
    """Return sync status for all entities."""
    rows = conn.execute(
        "SELECT entity, last_synced_at, last_sync_count, total_records FROM sync_log ORDER BY entity"
    ).fetchall()
    return [dict(r) for r in rows]

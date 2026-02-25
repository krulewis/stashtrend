"""
Data fetching functions for monarch-pipeline.

Each function wraps a monarchmoney API call and returns normalized
Python dicts ready to be passed to the storage layer.
"""

from __future__ import annotations

import logging
from datetime import date, datetime, timedelta
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from monarchmoney import MonarchMoney

logger = logging.getLogger(__name__)


async def fetch_accounts(mm: MonarchMoney) -> list[dict[str, Any]]:
    """Fetch all linked accounts."""
    logger.info("Fetching accounts...")
    data = await mm.get_accounts()
    accounts = data.get("accounts", [])
    logger.info("  → %d accounts found", len(accounts))
    return accounts


async def fetch_account_history(
    mm: MonarchMoney, account_id: str, start_date: str | None = None
) -> list[dict[str, Any]]:
    """
    Fetch daily balance history for a single account.
    If start_date is provided, only returns records after that date.
    """
    logger.debug("Fetching history for account %s from %s", account_id, start_date or "beginning")
    data = await mm.get_account_history(account_id)

    # monarchmoneycommunity returns a flat list of snapshot dicts
    # with keys: date, signedBalance, __typename, accountId, accountName
    if isinstance(data, list):
        history = data
    else:
        # fallback for other library variants
        history = data.get("account", {}).get("history", [])

    if start_date:
        history = [h for h in history if h["date"] > start_date]

    return history


async def fetch_categories(mm: MonarchMoney) -> list[dict[str, Any]]:
    """Fetch all transaction categories."""
    logger.info("Fetching categories...")
    data = await mm.get_transaction_categories()
    categories = data.get("categories", [])
    logger.info("  → %d categories found", len(categories))
    return categories


async def fetch_transactions(
    mm: MonarchMoney,
    start_date: str | None = None,
    end_date: str | None = None,
) -> list[dict[str, Any]]:
    """
    Fetch transactions between start_date and end_date (YYYY-MM-DD strings).
    Defaults to last 90 days if no start_date provided.
    Paginates automatically until all results are retrieved.
    """
    if not start_date:
        start_date = (date.today() - timedelta(days=90)).isoformat()
    if not end_date:
        end_date = date.today().isoformat()

    logger.info("Fetching transactions from %s to %s...", start_date, end_date)

    all_transactions: list[dict] = []
    limit = 100
    offset = 0

    while True:
        data = await mm.get_transactions(
            start_date=start_date,
            end_date=end_date,
            limit=limit,
            offset=offset,
        )
        batch = data.get("allTransactions", {}).get("results", [])
        all_transactions.extend(batch)

        total = data.get("allTransactions", {}).get("totalCount", 0)
        offset += len(batch)

        if offset >= total or not batch:
            break

    logger.info("  → %d transactions fetched", len(all_transactions))
    return all_transactions


async def fetch_budgets(
    mm: MonarchMoney,
    start_date: str,
    end_date: str,
) -> list[tuple]:
    """
    Fetch budget vs actual data for months between start_date and end_date.
    Returns a flat list of (category_id, month, budgeted, actual, variance) tuples
    ready for storage.upsert_budgets().
    """
    logger.info("Fetching budgets from %s to %s...", start_date, end_date)
    data = await mm.get_budgets(start_date=start_date, end_date=end_date)

    rows: list[tuple] = []

    # monarchmoneycommunity returns:
    # {"budgetData": {"monthlyAmountsByCategory": [
    #     {"category": {"id": "..."}, "monthlyAmounts": [
    #         {"month": "2026-01-01", "plannedCashFlowAmount": ..., "actualAmount": ...},
    #     ]},
    # ]}}
    budget_items = (
        data.get("budgetData", {}).get("monthlyAmountsByCategory", [])
    )

    for item in budget_items:
        cat = item.get("category", {})
        cat_id = cat.get("id")
        if not cat_id:
            continue
        for ma in item.get("monthlyAmounts", []):
            month = ma.get("month", "")[:10]  # already YYYY-MM-DD
            budgeted = ma.get("plannedCashFlowAmount", 0.0) or 0.0
            actual = ma.get("actualAmount", 0.0) or 0.0
            variance = budgeted - actual
            rows.append((cat_id, month, budgeted, actual, variance))

    logger.info("  → %d budget rows fetched", len(rows))
    return rows

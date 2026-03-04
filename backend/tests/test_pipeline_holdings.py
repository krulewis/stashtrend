"""
Tests for holdings sync pipeline (Phase 0).

Covers:
  - holdings table DDL (creation, idempotency, constraints)
  - upsert_holdings: insert, stale cleanup, per-account scoping, null fields
  - fetch_holdings: API response normalization, null security, empty edges, exceptions
  - Entity constants: holdings in ENTITY_TABLE_MAP, ENTITY_RUN_ORDER, ENTITY_LABELS

TDD: these tests are written before the implementation and must fail initially.
"""

import asyncio
import sqlite3
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

sys.path.insert(0, str(Path(__file__).parent.parent))
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "pipeline"))

from tests.test_helpers import make_test_db


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_account(conn, account_id, acct_type="investment"):
    """Insert a minimal accounts row for FK satisfaction."""
    conn.execute(
        "INSERT OR REPLACE INTO accounts (id, name, type, synced_at) VALUES (?, ?, ?, ?)",
        (account_id, f"Account {account_id}", acct_type, "2026-01-01T00:00:00+00:00"),
    )
    conn.commit()


def _make_holding(holding_id, account_id, ticker="AAPL", total_value=1000.0):
    """Build a holding dict matching fetch_holdings output shape."""
    return {
        "id":             holding_id,
        "account_id":     account_id,
        "security_id":    f"sec-{ticker.lower()}",
        "security_name":  f"{ticker} Inc.",
        "ticker":         ticker,
        "security_type":  "stock",
        "quantity":       10.0,
        "basis":          900.0,
        "total_value":    total_value,
        "current_price":  total_value / 10.0,
        "is_manual":      0,
        "last_synced_at": "2026-01-01T00:00:00Z",
    }


def _make_api_node(
    node_id="agg-1",
    ticker="AAPL",
    name="Apple Inc.",
    quantity=10.0,
    basis=900.0,
    total_value=1800.0,
    current_price=180.0,
    security=True,
    is_manual=False,
):
    """Build a mock Monarch API aggregateHoldings edge."""
    security_obj = {
        "id": f"sec-{ticker.lower()}",
        "name": name,
        "type": "stock",
        "ticker": ticker,
        "currentPrice": current_price,
    } if security else None

    return {
        "node": {
            "id": node_id,
            "quantity": quantity,
            "basis": basis,
            "totalValue": total_value,
            "lastSyncedAt": "2026-03-04T10:00:00Z",
            "security": security_obj,
            "holdings": [{
                "id": "h-detail-1",
                "type": "stock",
                "typeDisplay": "Stock",
                "name": name,
                "ticker": ticker,
                "closingPrice": 178.0,
                "isManual": is_manual,
            }],
        }
    }


def _make_api_response(edges):
    """Wrap edges in the full Monarch API response structure."""
    return {
        "portfolio": {
            "aggregateHoldings": {
                "edges": edges,
            }
        }
    }


def _run(coro):
    """Run an async coroutine synchronously."""
    return asyncio.run(coro)


# ---------------------------------------------------------------------------
# Schema tests
# ---------------------------------------------------------------------------

class TestHoldingsDDL(unittest.TestCase):
    """holdings table created correctly via canonical DDL."""

    def setUp(self):
        self.conn = make_test_db(pipeline=True, dashboard=False)

    def tearDown(self):
        self.conn.close()

    def test_holdings_table_created(self):
        tables = {r[0] for r in self.conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).fetchall()}
        self.assertIn("holdings", tables)

    def test_schema_idempotent(self):
        """Re-running DDL should not raise."""
        from monarch_pipeline.schema import DDL
        self.conn.executescript(DDL)  # second time — no error

    def test_synced_at_not_null_constraint(self):
        """INSERT without synced_at must fail."""
        _make_account(self.conn, "acct-1")
        with self.assertRaises(sqlite3.IntegrityError):
            self.conn.execute(
                "INSERT INTO holdings (id, account_id) VALUES ('h1', 'acct-1')"
            )


# ---------------------------------------------------------------------------
# upsert_holdings tests
# ---------------------------------------------------------------------------

class TestUpsertHoldings(unittest.TestCase):
    """upsert_holdings: insert, stale cleanup, per-account scoping."""

    def setUp(self):
        self.conn = make_test_db(pipeline=True, dashboard=False)
        _make_account(self.conn, "acct-1")
        _make_account(self.conn, "acct-2")

    def tearDown(self):
        self.conn.close()

    def _count(self, account_id=None):
        if account_id:
            return self.conn.execute(
                "SELECT COUNT(*) FROM holdings WHERE account_id = ?", (account_id,)
            ).fetchone()[0]
        return self.conn.execute("SELECT COUNT(*) FROM holdings").fetchone()[0]

    def test_upsert_inserts_rows(self):
        from monarch_pipeline.storage import upsert_holdings
        holdings = [_make_holding("h1", "acct-1"), _make_holding("h2", "acct-1", ticker="MSFT")]
        count = upsert_holdings(self.conn, "acct-1", holdings)
        self.assertEqual(count, 2)
        self.assertEqual(self._count("acct-1"), 2)

    def test_upsert_empty_list_returns_zero(self):
        from monarch_pipeline.storage import upsert_holdings
        count = upsert_holdings(self.conn, "acct-1", [])
        self.assertEqual(count, 0)

    def test_upsert_empty_list_deletes_stale_rows(self):
        from monarch_pipeline.storage import upsert_holdings
        upsert_holdings(self.conn, "acct-1", [_make_holding("h1", "acct-1")])
        self.assertEqual(self._count("acct-1"), 1)

        upsert_holdings(self.conn, "acct-1", [])
        self.assertEqual(self._count("acct-1"), 0)

    def test_upsert_replaces_stale_for_same_account(self):
        from monarch_pipeline.storage import upsert_holdings
        # Seed 3 holdings
        upsert_holdings(self.conn, "acct-1", [
            _make_holding("h1", "acct-1"),
            _make_holding("h2", "acct-1", ticker="MSFT"),
            _make_holding("h3", "acct-1", ticker="GOOG"),
        ])
        self.assertEqual(self._count("acct-1"), 3)

        # Re-sync with only h1 — h2 and h3 should be gone
        upsert_holdings(self.conn, "acct-1", [_make_holding("h1", "acct-1")])
        self.assertEqual(self._count("acct-1"), 1)
        row = self.conn.execute("SELECT id FROM holdings WHERE account_id = 'acct-1'").fetchone()
        self.assertEqual(row[0], "h1")

    def test_upsert_is_per_account(self):
        """Cleanup for acct-1 must not touch acct-2."""
        from monarch_pipeline.storage import upsert_holdings
        upsert_holdings(self.conn, "acct-1", [_make_holding("h1", "acct-1")])
        upsert_holdings(self.conn, "acct-2", [_make_holding("h2", "acct-2")])

        # Re-sync acct-1 with empty — acct-2 untouched
        upsert_holdings(self.conn, "acct-1", [])
        self.assertEqual(self._count("acct-1"), 0)
        self.assertEqual(self._count("acct-2"), 1)

    def test_null_security_fields_allowed(self):
        """Manual holdings with NULL security fields should store fine."""
        from monarch_pipeline.storage import upsert_holdings
        holding = {
            "id": "h-manual",
            "account_id": "acct-1",
            "security_id": None,
            "security_name": None,
            "ticker": None,
            "security_type": None,
            "quantity": None,
            "basis": None,
            "total_value": 500.0,
            "current_price": None,
            "is_manual": 1,
            "last_synced_at": None,
        }
        count = upsert_holdings(self.conn, "acct-1", [holding])
        self.assertEqual(count, 1)
        row = self.conn.execute("SELECT ticker, is_manual FROM holdings WHERE id='h-manual'").fetchone()
        self.assertIsNone(row[0])
        self.assertEqual(row[1], 1)


# ---------------------------------------------------------------------------
# fetch_holdings tests
# ---------------------------------------------------------------------------

class TestFetchHoldings(unittest.TestCase):
    """fetch_holdings: API response normalization."""

    def _make_mm(self, response):
        mm = MagicMock()
        mm.get_account_holdings = AsyncMock(return_value=response)
        return mm

    def test_fetch_returns_empty_on_empty_edges(self):
        from monarch_pipeline.fetchers import fetch_holdings
        mm = self._make_mm(_make_api_response([]))
        result = _run(fetch_holdings(mm, "acct-1"))
        self.assertEqual(result, [])

    def test_fetch_injects_account_id(self):
        from monarch_pipeline.fetchers import fetch_holdings
        mm = self._make_mm(_make_api_response([_make_api_node()]))
        result = _run(fetch_holdings(mm, "acct-99"))
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["account_id"], "acct-99")

    def test_fetch_flattens_node_security_holdings(self):
        from monarch_pipeline.fetchers import fetch_holdings
        mm = self._make_mm(_make_api_response([
            _make_api_node(
                node_id="agg-1", ticker="AAPL", name="Apple Inc.",
                quantity=10.0, basis=900.0, total_value=1800.0, current_price=180.0,
            ),
        ]))
        result = _run(fetch_holdings(mm, "acct-1"))
        h = result[0]
        self.assertEqual(h["id"], "agg-1")
        self.assertEqual(h["ticker"], "AAPL")
        self.assertEqual(h["security_name"], "Apple Inc.")
        self.assertEqual(h["security_type"], "stock")
        self.assertEqual(h["quantity"], 10.0)
        self.assertEqual(h["basis"], 900.0)
        self.assertEqual(h["total_value"], 1800.0)
        self.assertEqual(h["current_price"], 180.0)
        self.assertEqual(h["is_manual"], 0)

    def test_fetch_handles_missing_security(self):
        """node with security=None should not raise; security fields should be None."""
        from monarch_pipeline.fetchers import fetch_holdings
        mm = self._make_mm(_make_api_response([
            _make_api_node(security=False, is_manual=True),
        ]))
        result = _run(fetch_holdings(mm, "acct-1"))
        self.assertEqual(len(result), 1)
        h = result[0]
        self.assertIsNone(h["security_id"])
        self.assertIsNone(h["current_price"])
        self.assertEqual(h["is_manual"], 1)

    def test_fetch_handles_empty_holdings_list(self):
        """node with holdings=[] should not raise."""
        from monarch_pipeline.fetchers import fetch_holdings
        response = _make_api_response([_make_api_node()])
        # Patch holdings to empty list
        response["portfolio"]["aggregateHoldings"]["edges"][0]["node"]["holdings"] = []
        mm = self._make_mm(response)
        result = _run(fetch_holdings(mm, "acct-1"))
        self.assertEqual(len(result), 1)
        # is_manual defaults to 0 when holdings list is empty
        self.assertEqual(result[0]["is_manual"], 0)

    def test_fetch_returns_empty_on_api_exception(self):
        """Exception from get_account_holdings → empty list, no raise."""
        from monarch_pipeline.fetchers import fetch_holdings
        mm = MagicMock()
        mm.get_account_holdings = AsyncMock(side_effect=Exception("API error"))
        result = _run(fetch_holdings(mm, "acct-1"))
        self.assertEqual(result, [])

    def test_fetch_skips_nodes_with_no_id(self):
        """Nodes with missing id should be skipped to avoid NULL primary key."""
        from monarch_pipeline.fetchers import fetch_holdings
        response = _make_api_response([_make_api_node(node_id="valid-1")])
        # Add a node with no id
        response["portfolio"]["aggregateHoldings"]["edges"].append(
            {"node": {"id": None, "quantity": 1, "basis": 100, "totalValue": 110,
                      "lastSyncedAt": None, "security": None, "holdings": []}}
        )
        mm = self._make_mm(response)
        result = _run(fetch_holdings(mm, "acct-1"))
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["id"], "valid-1")


# ---------------------------------------------------------------------------
# Entity constant tests
# ---------------------------------------------------------------------------

class TestHoldingsEntityConstants(unittest.TestCase):
    """Holdings must be registered in entity constants with correct ordering."""

    def test_holdings_in_table_map(self):
        from app import ENTITY_TABLE_MAP
        self.assertIn("holdings", ENTITY_TABLE_MAP)
        self.assertEqual(ENTITY_TABLE_MAP["holdings"], "holdings")

    def test_holdings_in_run_order(self):
        from app import ENTITY_RUN_ORDER
        self.assertIn("holdings", ENTITY_RUN_ORDER)

    def test_holdings_after_account_history(self):
        from app import ENTITY_RUN_ORDER
        self.assertLess(
            ENTITY_RUN_ORDER.index("account_history"),
            ENTITY_RUN_ORDER.index("holdings"),
        )

    def test_holdings_before_categories(self):
        from app import ENTITY_RUN_ORDER
        self.assertLess(
            ENTITY_RUN_ORDER.index("holdings"),
            ENTITY_RUN_ORDER.index("categories"),
        )


if __name__ == "__main__":
    unittest.main()

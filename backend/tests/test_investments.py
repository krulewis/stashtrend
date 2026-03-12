"""
Tests for investments endpoints:
  GET /api/investments/summary
  GET /api/investments/accounts/<id>/holdings
  GET /api/investments/performance
"""

import sys
import unittest
from datetime import date, timedelta
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent.parent))

from app import app
from tests.test_helpers import make_test_db


# ---------------------------------------------------------------------------
# Seed helpers
# ---------------------------------------------------------------------------

def _seed_investment_data(db):
    """
    Insert a realistic dataset:
      - 2 investment accounts (401k + brokerage/investment)
      - 1 non-investment account (checking)
      - Holdings for each investment account
      - 35+ days of account_history for CAGR tests
      - A transfer category and contribution transactions
    """
    # Accounts
    db.executemany(
        "INSERT INTO accounts (id, name, institution, type, subtype, current_balance, "
        "include_in_net_worth, is_hidden, is_asset, synced_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
            ("acct-401k", "My 401k", "Fidelity", "401k", None, 50000.0, 1, 0, 1, "2026-01-01T00:00:00+00:00"),
            ("acct-brok", "Brokerage", "Schwab", "investment", "individual", 20000.0, 1, 0, 1, "2026-01-01T00:00:00+00:00"),
            ("acct-chk",  "Checking",  "Chase",   "checking",   None,        5000.0,  1, 0, 1, "2026-01-01T00:00:00+00:00"),
        ],
    )

    # Holdings for 401k account
    db.executemany(
        "INSERT INTO holdings (id, account_id, ticker, security_name, security_type, "
        "quantity, basis, total_value, is_manual, last_synced_at, synced_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
            ("h1", "acct-401k", "VTIAX", "Vanguard Total Intl", "mutual fund", 100.0, 8000.0, 10000.0, 0,
             "2026-03-01T00:00:00+00:00", "2026-03-01T00:00:00+00:00"),
            ("h2", "acct-401k", "VTSAX", "Vanguard Total Stock", "mutual fund", 200.0, 15000.0, 20000.0, 0,
             "2026-03-01T00:00:00+00:00", "2026-03-01T00:00:00+00:00"),
        ],
    )

    # Holdings for brokerage account
    db.executemany(
        "INSERT INTO holdings (id, account_id, ticker, security_name, security_type, "
        "quantity, basis, total_value, is_manual, last_synced_at, synced_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
            ("h3", "acct-brok", "AAPL", "Apple Inc.", "equity", 10.0, 1200.0, 1800.0, 0,
             "2026-03-01T00:00:00+00:00", "2026-03-01T00:00:00+00:00"),
            ("h4", "acct-brok", "SPY", "SPDR S&P 500 ETF", "etf", 5.0, 2000.0, 2500.0, 0,
             "2026-03-01T00:00:00+00:00", "2026-03-01T00:00:00+00:00"),
        ],
    )

    # Account history — 35 rows each over ~3 years to support CAGR calculation
    history_rows = []
    base = date(2023, 1, 1)
    for i in range(36):
        d = (base + timedelta(days=i * 30)).strftime("%Y-%m-%d")
        history_rows.append(("acct-401k", d, 40000.0 + i * 300))
        history_rows.append(("acct-brok", d, 18000.0 + i * 100))

    db.executemany(
        "INSERT OR REPLACE INTO account_history (account_id, date, balance) VALUES (?, ?, ?)",
        history_rows,
    )

    # Category with group_type = 'transfer'
    db.execute(
        "INSERT INTO categories (id, name, group_type) VALUES ('cat-transfer', 'Transfer', 'transfer')"
    )

    # Contribution transactions into investment accounts
    db.executemany(
        "INSERT INTO transactions (id, date, amount, account_id, category_id, synced_at) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        [
            ("txn-1", "2025-01-15", -500.0, "acct-401k", "cat-transfer", "2026-01-01T00:00:00+00:00"),
            ("txn-2", "2025-02-15", -500.0, "acct-401k", "cat-transfer", "2026-01-01T00:00:00+00:00"),
            ("txn-3", "2025-01-20", -200.0, "acct-brok", "cat-transfer", "2026-01-01T00:00:00+00:00"),
        ],
    )

    db.commit()


# ---------------------------------------------------------------------------
# TestInvestmentsSummary
# ---------------------------------------------------------------------------

class TestInvestmentsSummary(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    def test_summary_happy_path(self):
        """Two investment accounts with holdings return correct shape and values."""
        db = make_test_db()
        _seed_investment_data(db)
        with patch("app.get_db", return_value=db):
            resp = self.client.get("/api/investments/summary")
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertIn("accounts", data)
        self.assertIn("totals", data)
        accounts = data["accounts"]
        self.assertEqual(len(accounts), 2)
        ids = {a["id"] for a in accounts}
        self.assertIn("acct-401k", ids)
        self.assertIn("acct-brok", ids)
        # Verify required fields present on each account
        for acct in accounts:
            for field in ("id", "name", "institution", "type", "bucket",
                          "current_value", "allocation_weight_pct"):
                self.assertIn(field, acct, f"Missing field {field!r} on account")
        # totals
        totals = data["totals"]
        self.assertIn("total_value", totals)
        # 401k: 10000+20000=30000; brok: 1800+2500=4300 → total 34300
        self.assertAlmostEqual(totals["total_value"], 34300.0, places=1)

    def test_summary_empty(self):
        """No investment accounts → empty list, totals with zeros."""
        db = make_test_db()
        # Only a non-investment account
        db.execute(
            "INSERT INTO accounts (id, name, type, current_balance, include_in_net_worth, synced_at) "
            "VALUES ('chk-1', 'Checking', 'checking', 1000.0, 1, '2026-01-01')"
        )
        db.commit()
        with patch("app.get_db", return_value=db):
            resp = self.client.get("/api/investments/summary")
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertEqual(data["accounts"], [])
        self.assertIn("total_value", data["totals"])

    def test_summary_mixed_types(self):
        """Only investment-type accounts are returned — checking is excluded."""
        db = make_test_db()
        _seed_investment_data(db)
        with patch("app.get_db", return_value=db):
            resp = self.client.get("/api/investments/summary")
        data = resp.get_json()
        account_types = {a["type"] for a in data["accounts"]}
        self.assertNotIn("checking", account_types)

    def test_summary_null_cost_basis(self):
        """Holdings with NULL basis are handled gracefully (no 500 error)."""
        db = make_test_db()
        db.execute(
            "INSERT INTO accounts (id, name, type, current_balance, include_in_net_worth, synced_at) "
            "VALUES ('acct-inv', 'Inv', 'investment', 5000.0, 1, '2026-01-01')"
        )
        db.execute(
            "INSERT INTO holdings (id, account_id, ticker, total_value, basis, "
            "is_manual, last_synced_at, synced_at) "
            "VALUES ('h-nb', 'acct-inv', 'XYZ', 5000.0, NULL, 0, "
            "'2026-03-01T00:00:00+00:00', '2026-03-01T00:00:00+00:00')"
        )
        db.commit()
        with patch("app.get_db", return_value=db):
            resp = self.client.get("/api/investments/summary")
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        acct = data["accounts"][0]
        self.assertIsNone(acct["total_cost_basis"])
        self.assertIsNone(acct["total_return_dollars"])

    def test_summary_error(self):
        """DB exception returns 500 JSON error."""
        db = make_test_db()

        def _bad_db():
            raise Exception("DB exploded")

        with patch("app.get_db", side_effect=_bad_db):
            resp = self.client.get("/api/investments/summary")
        self.assertEqual(resp.status_code, 500)
        self.assertIn("error", resp.get_json())


# ---------------------------------------------------------------------------
# TestInvestmentsHoldings
# ---------------------------------------------------------------------------

class TestInvestmentsHoldings(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    def test_holdings_happy_path(self):
        """Seeded investment account with holdings returns correct structure."""
        db = make_test_db()
        _seed_investment_data(db)
        with patch("app.get_db", return_value=db):
            resp = self.client.get("/api/investments/accounts/acct-brok/holdings")
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertIn("account", data)
        self.assertIn("holdings", data)
        self.assertIn("allocation_by_type", data)
        self.assertIn("totals", data)
        self.assertEqual(len(data["holdings"]), 2)
        account = data["account"]
        self.assertEqual(account["id"], "acct-brok")
        self.assertEqual(account["name"], "Brokerage")
        # Check holding fields
        tickers = {h["ticker"] for h in data["holdings"]}
        self.assertIn("AAPL", tickers)
        self.assertIn("SPY", tickers)
        for h in data["holdings"]:
            self.assertIn("unrealized_gain_loss_dollars", h)
            self.assertIn("security_type", h)
        # Allocation by type present
        self.assertGreater(len(data["allocation_by_type"]), 0)
        for alloc in data["allocation_by_type"]:
            self.assertIn("security_type", alloc)
            self.assertIn("total_value", alloc)
            self.assertIn("allocation_pct", alloc)

    def test_holdings_empty(self):
        """Valid investment account with no holdings returns empty list."""
        db = make_test_db()
        db.execute(
            "INSERT INTO accounts (id, name, type, current_balance, include_in_net_worth, synced_at) "
            "VALUES ('acct-empty', 'Empty Fund', '401k', 0.0, 1, '2026-01-01')"
        )
        db.commit()
        with patch("app.get_db", return_value=db):
            resp = self.client.get("/api/investments/accounts/acct-empty/holdings")
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertEqual(data["holdings"], [])
        self.assertEqual(data["allocation_by_type"], [])

    def test_holdings_invalid_id(self):
        """Non-existent account ID returns 404."""
        db = make_test_db()
        with patch("app.get_db", return_value=db):
            resp = self.client.get("/api/investments/accounts/does-not-exist/holdings")
        self.assertEqual(resp.status_code, 404)

    def test_holdings_non_investment(self):
        """Checking account returns 404 — not an investment type."""
        db = make_test_db()
        db.execute(
            "INSERT INTO accounts (id, name, type, current_balance, include_in_net_worth, synced_at) "
            "VALUES ('acct-chk2', 'Checking', 'checking', 1000.0, 1, '2026-01-01')"
        )
        db.commit()
        with patch("app.get_db", return_value=db):
            resp = self.client.get("/api/investments/accounts/acct-chk2/holdings")
        self.assertEqual(resp.status_code, 404)

    def test_holdings_error(self):
        """DB exception returns 500 JSON error."""
        def _bad_db():
            raise Exception("DB error")

        with patch("app.get_db", side_effect=_bad_db):
            resp = self.client.get("/api/investments/accounts/any-id/holdings")
        self.assertEqual(resp.status_code, 500)
        self.assertIn("error", resp.get_json())


# ---------------------------------------------------------------------------
# TestInvestmentsPerformance
# ---------------------------------------------------------------------------

class TestInvestmentsPerformance(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    def test_performance_happy_path(self):
        """Seeded account_history returns populated time series."""
        db = make_test_db()
        _seed_investment_data(db)
        with patch("app.get_db", return_value=db):
            resp = self.client.get("/api/investments/performance?range=all")
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertIn("series", data)
        self.assertIn("contributions", data)
        self.assertIn("account_names", data)
        self.assertGreater(len(data["series"]), 0)
        # Each series point has a date and total
        for point in data["series"]:
            self.assertIn("date", point)
            self.assertIn("total", point)
        # Account names present
        self.assertIn("acct-401k", data["account_names"])
        self.assertIn("acct-brok", data["account_names"])

    def test_performance_range_filter(self):
        """3m filter returns fewer data points than 'all'."""
        db = make_test_db()
        _seed_investment_data(db)
        with patch("app.get_db", return_value=db):
            resp_all = self.client.get("/api/investments/performance?range=all")
            resp_3m = self.client.get("/api/investments/performance?range=3m")
        self.assertEqual(resp_all.status_code, 200)
        self.assertEqual(resp_3m.status_code, 200)
        series_all = resp_all.get_json()["series"]
        series_3m = resp_3m.get_json()["series"]
        self.assertLessEqual(len(series_3m), len(series_all))

    def test_performance_empty(self):
        """No history data returns empty series."""
        db = make_test_db()
        db.execute(
            "INSERT INTO accounts (id, name, type, current_balance, include_in_net_worth, synced_at) "
            "VALUES ('acct-inv2', 'Inv2', 'investment', 1000.0, 1, '2026-01-01')"
        )
        db.commit()
        with patch("app.get_db", return_value=db):
            resp = self.client.get("/api/investments/performance")
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertEqual(data["series"], [])

    def test_performance_contributions(self):
        """Transfer-category transactions appear in contributions list."""
        db = make_test_db()
        _seed_investment_data(db)
        with patch("app.get_db", return_value=db):
            resp = self.client.get("/api/investments/performance?range=all")
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        contributions = data["contributions"]
        self.assertGreater(len(contributions), 0)
        for contrib in contributions:
            self.assertIn("month", contrib)
            self.assertIn("total", contrib)
        # Verify months contain the seeded data (2025-01 and 2025-02)
        months = {c["month"] for c in contributions}
        self.assertIn("2025-01", months)
        self.assertIn("2025-02", months)

    def test_performance_error(self):
        """DB exception returns 500 JSON error."""
        def _bad_db():
            raise Exception("DB failed")

        with patch("app.get_db", side_effect=_bad_db):
            resp = self.client.get("/api/investments/performance")
        self.assertEqual(resp.status_code, 500)
        self.assertIn("error", resp.get_json())


if __name__ == "__main__":
    unittest.main()

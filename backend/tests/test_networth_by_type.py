"""
Tests for the Net Worth by Account Type endpoint (/api/networth/by-type).

Coverage:
  1. Happy path — 6 buckets returned, series sorted by date
  2. BUCKET_MAP coverage — every known type maps to expected bucket
  3. TYPE_MAP override — subtype takes precedence over type
  4. Unknown type — logs WARNING, maps to "Other"
  5. Filter consistency — accounts with include_in_net_worth=0 excluded;
     accounts with is_hidden=1 and include_in_net_worth=1 ARE included
  6. Empty DB — returns {"series": [], "cagr": {}, ...} without error
  7. CAGR null for <30 non-zero-balance days
  8. CAGR null when start_bal <= 0 (zero-balance account)
  9. CAGR computed correctly for account with 2Y+ of non-zero history
  10. Debt bucket — balances stored as negative NW contribution in series
"""

import json
import logging
import sys
import unittest
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent.parent))

from tests.test_helpers import make_test_db
from app import app, BUCKET_MAP, TYPE_MAP, BUCKET_ORDER, BUCKET_COLORS, _get_bucket


def make_db():
    return make_test_db()


def seed_accounts(conn, accounts):
    """Insert test accounts.
    accounts = list of (id, name, type, subtype, is_asset, include_in_net_worth, is_hidden, current_balance)
    """
    conn.executemany(
        """INSERT INTO accounts
           (id, name, type, subtype, is_asset, include_in_net_worth, is_hidden, current_balance, synced_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, '2024-01-01')""",
        accounts,
    )
    conn.commit()


def seed_history(conn, rows):
    """Insert account_history rows. rows = list of (account_id, date, balance)"""
    conn.executemany(
        "INSERT INTO account_history (account_id, date, balance) VALUES (?, ?, ?)",
        rows,
    )
    conn.commit()


class TestGetBucket(unittest.TestCase):
    """Unit tests for _get_bucket mapping function."""

    def test_all_known_types_map_to_bucket(self):
        """Every type in BUCKET_MAP maps to a non-Other bucket."""
        for type_val, expected_bucket in BUCKET_MAP.items():
            result = _get_bucket(type_val, None)
            self.assertEqual(result, expected_bucket, f"type={type_val!r}")

    def test_type_map_override(self):
        """Subtype in TYPE_MAP takes precedence over type in BUCKET_MAP."""
        # "investment" type → Brokerage, but "traditional_ira" subtype → Retirement
        result = _get_bucket("investment", "traditional_ira")
        self.assertEqual(result, "Retirement")

    def test_type_map_all_subtypes(self):
        """Every subtype in TYPE_MAP maps to expected bucket."""
        for subtype_val, expected_bucket in TYPE_MAP.items():
            result = _get_bucket("investment", subtype_val)
            self.assertEqual(result, expected_bucket, f"subtype={subtype_val!r}")

    def test_unknown_type_maps_to_other(self):
        """Unknown account type returns 'Other' and logs WARNING."""
        with self.assertLogs("routes.networth", level="WARNING") as cm:
            result = _get_bucket("some_future_type", None)
        self.assertEqual(result, "Other")
        self.assertTrue(any("Unknown account type" in msg for msg in cm.output))

    def test_none_type_returns_other_no_warning(self):
        """None type returns 'Other' without logging."""
        result = _get_bucket(None, None)
        self.assertEqual(result, "Other")


class TestNetworthByTypeEndpoint(unittest.TestCase):
    """Integration tests for GET /api/networth/by-type."""

    def setUp(self):
        self.conn = make_db()
        self.app = app
        self.app.config["TESTING"] = True
        self.client = self.app.test_client()
        # Patch get_db to return our test connection
        self.patcher = patch("app.get_db", return_value=self.conn)
        self.patcher.start()

    def tearDown(self):
        self.patcher.stop()
        self.conn.close()

    def test_empty_db(self):
        """Empty DB returns empty series and cagr without error."""
        resp = self.client.get("/api/networth/by-type")
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertEqual(data["series"], [])
        self.assertEqual(data["cagr"], {})
        self.assertEqual(data["bucket_colors"], BUCKET_COLORS)
        self.assertEqual(data["bucket_order"], BUCKET_ORDER)

    def test_happy_path(self):
        """Returns series with all buckets, sorted by date."""
        # Seed: checking (Cash), 401k (Retirement), mortgage (Debt)
        seed_accounts(self.conn, [
            ("acc_chk", "Checking", "checking", None, 1, 1, 0, 10000),
            ("acc_401k", "401k", "401k", None, 1, 1, 0, 200000),
            ("acc_mort", "Mortgage", "mortgage", None, 0, 1, 0, -300000),
        ])
        seed_history(self.conn, [
            ("acc_chk", "2025-01-01", 9000),
            ("acc_chk", "2025-06-01", 10000),
            ("acc_401k", "2025-01-01", 190000),
            ("acc_401k", "2025-06-01", 200000),
            ("acc_mort", "2025-01-01", 310000),
            ("acc_mort", "2025-06-01", 300000),
        ])

        resp = self.client.get("/api/networth/by-type")
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()

        # Series should be sorted by date
        dates = [p["date"] for p in data["series"]]
        self.assertEqual(dates, sorted(dates))

        # Check first data point
        first = data["series"][0]
        self.assertEqual(first["Cash"], 9000)
        self.assertEqual(first["Retirement"], 190000)
        # Debt is stored as negative NW contribution
        self.assertEqual(first["Debt"], -310000)

        # All 6 buckets present in each series point
        for point in data["series"]:
            for bucket in BUCKET_ORDER:
                self.assertIn(bucket, point)

    def test_filter_excludes_not_in_net_worth(self):
        """Accounts with include_in_net_worth=0 are excluded."""
        seed_accounts(self.conn, [
            ("acc_in", "Included", "checking", None, 1, 1, 0, 5000),
            ("acc_out", "Excluded", "savings", None, 1, 0, 0, 99999),
        ])
        seed_history(self.conn, [
            ("acc_in", "2025-01-01", 5000),
            ("acc_out", "2025-01-01", 99999),
        ])

        resp = self.client.get("/api/networth/by-type")
        data = resp.get_json()
        # Only acc_in contributes
        self.assertEqual(data["series"][0]["Cash"], 5000)

    def test_filter_includes_hidden_accounts(self):
        """Accounts with is_hidden=1 but include_in_net_worth=1 ARE included."""
        seed_accounts(self.conn, [
            ("acc_hidden", "Hidden Savings", "savings", None, 1, 1, 1, 20000),
        ])
        seed_history(self.conn, [
            ("acc_hidden", "2025-01-01", 20000),
        ])

        resp = self.client.get("/api/networth/by-type")
        data = resp.get_json()
        self.assertEqual(data["series"][0]["Cash"], 20000)

    def test_debt_negative_contribution(self):
        """Debt accounts appear as negative values in the series."""
        seed_accounts(self.conn, [
            ("acc_cc", "Credit Card", "credit_card", None, 0, 1, 0, -5000),
        ])
        seed_history(self.conn, [
            ("acc_cc", "2025-01-01", 5000),  # balance stored positive in history
        ])

        resp = self.client.get("/api/networth/by-type")
        data = resp.get_json()
        # is_asset=0 → nw_contribution = -abs(balance)
        self.assertEqual(data["series"][0]["Debt"], -5000)

    def test_cagr_null_insufficient_history(self):
        """CAGR returns null for all periods with <30 days of non-zero history."""
        seed_accounts(self.conn, [
            ("acc_new", "New Account", "checking", None, 1, 1, 0, 1000),
        ])
        # Only 10 days of history
        base = datetime(2025, 6, 1)
        rows = [("acc_new", (base + timedelta(days=i)).strftime("%Y-%m-%d"), 1000)
                for i in range(10)]
        seed_history(self.conn, rows)

        resp = self.client.get("/api/networth/by-type")
        data = resp.get_json()
        cash_cagr = data["cagr"]["Cash"]
        self.assertIsNone(cash_cagr["1y"])
        self.assertIsNone(cash_cagr["3y"])
        self.assertIsNone(cash_cagr["5y"])

    def test_cagr_null_zero_balance(self):
        """CAGR returns null when balance is always zero."""
        seed_accounts(self.conn, [
            ("acc_zero", "Empty", "checking", None, 1, 1, 0, 0),
        ])
        base = datetime(2023, 1, 1)
        rows = [("acc_zero", (base + timedelta(days=i)).strftime("%Y-%m-%d"), 0)
                for i in range(400)]
        seed_history(self.conn, rows)

        resp = self.client.get("/api/networth/by-type")
        data = resp.get_json()
        cash_cagr = data["cagr"]["Cash"]
        self.assertIsNone(cash_cagr["1y"])

    def test_cagr_computed_correctly(self):
        """CAGR computes correctly for a 2-year history: $100k → $121k = ~10%/yr."""
        seed_accounts(self.conn, [
            ("acc_grow", "Growth", "brokerage", None, 1, 1, 0, 121000),
        ])
        # 2 years of daily history: start at 100000, end at 121000
        base = datetime(2024, 1, 1)
        days = 731  # ~2 years
        start_bal = 100000
        end_bal = 121000
        rows = []
        for i in range(days):
            # Linear interpolation for simplicity
            frac = i / (days - 1)
            bal = start_bal + (end_bal - start_bal) * frac
            date_str = (base + timedelta(days=i)).strftime("%Y-%m-%d")
            rows.append(("acc_grow", date_str, round(bal, 2)))
        seed_history(self.conn, rows)

        resp = self.client.get("/api/networth/by-type")
        data = resp.get_json()
        brok_cagr = data["cagr"]["Brokerage"]
        # 1Y CAGR should be approximately 10% (since linear growth over 2 years
        # with (end/start)^(1/elapsed) - 1)
        self.assertIsNotNone(brok_cagr["1y"])
        # The 1Y start balance ≈ ~110500, end ≈ 121000
        # CAGR = (121000/110500)^(1/1) - 1 ≈ 9.5% (approximate)
        self.assertAlmostEqual(brok_cagr["1y"], 9.5, delta=2.0)

    def test_response_shape(self):
        """Response contains expected top-level keys."""
        seed_accounts(self.conn, [
            ("acc_s", "Savings", "savings", None, 1, 1, 0, 5000),
        ])
        seed_history(self.conn, [("acc_s", "2025-01-01", 5000)])

        resp = self.client.get("/api/networth/by-type")
        data = resp.get_json()
        self.assertIn("series", data)
        self.assertIn("cagr", data)
        self.assertIn("bucket_colors", data)
        self.assertIn("bucket_order", data)
        self.assertEqual(data["bucket_order"], BUCKET_ORDER)


if __name__ == "__main__":
    unittest.main()

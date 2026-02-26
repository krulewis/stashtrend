import sys
import sqlite3
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent.parent))
from app import DASHBOARD_DDL, app

# Minimal pipeline DDL needed for budget tests
PIPELINE_DDL = """
CREATE TABLE IF NOT EXISTS categories (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    group_id    TEXT,
    group_name  TEXT,
    group_type  TEXT
);
CREATE TABLE IF NOT EXISTS budgets (
    category_id     TEXT NOT NULL,
    month           TEXT NOT NULL,
    budgeted_amount REAL,
    actual_amount   REAL,
    variance        REAL,
    PRIMARY KEY (category_id, month),
    FOREIGN KEY (category_id) REFERENCES categories(id)
);
"""


def make_db():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(PIPELINE_DDL)
    conn.executescript(DASHBOARD_DDL)
    return conn


def seed_budgets(conn):
    conn.execute(
        "INSERT OR IGNORE INTO categories (id, name, group_name) VALUES (?, ?, ?)",
        ("cat_1", "Groceries", "Food & Drink"),
    )
    conn.execute(
        "INSERT OR IGNORE INTO categories (id, name, group_name) VALUES (?, ?, ?)",
        ("cat_2", "Restaurants", "Food & Drink"),
    )
    # Groceries: avg variance = (-23 + 11) / 2 = -6 (mild over-spender)
    conn.execute(
        "INSERT OR IGNORE INTO budgets VALUES (?, ?, ?, ?, ?)",
        ("cat_1", "2025-11-01", 500.0, 523.0, -23.0),
    )
    conn.execute(
        "INSERT OR IGNORE INTO budgets VALUES (?, ?, ?, ?, ?)",
        ("cat_1", "2025-12-01", 500.0, 489.0, 11.0),
    )
    # Restaurants: avg variance = -15 / 1 = -15 (worse over-spender)
    conn.execute(
        "INSERT OR IGNORE INTO budgets VALUES (?, ?, ?, ?, ?)",
        ("cat_2", "2025-11-01", 200.0, 215.0, -15.0),
    )
    conn.commit()


class TestBudgetHistory(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    def _db_with_data(self):
        conn = make_db()
        seed_budgets(conn)
        return conn

    def test_response_shape(self):
        with patch("app.get_db", return_value=self._db_with_data()):
            resp = self.client.get("/api/budgets/history?months=12")
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertIn("months", data)
        self.assertIn("totals_by_month", data)
        self.assertIn("categories", data)

    def test_months_list_is_sorted(self):
        with patch("app.get_db", return_value=self._db_with_data()):
            resp = self.client.get("/api/budgets/history?months=12")
        months = resp.get_json()["months"]
        self.assertEqual(months, sorted(months))

    def test_totals_by_month_has_budgeted_and_actual(self):
        with patch("app.get_db", return_value=self._db_with_data()):
            resp = self.client.get("/api/budgets/history?months=12")
        totals = resp.get_json()["totals_by_month"]
        for month, vals in totals.items():
            self.assertIn("budgeted", vals)
            self.assertIn("actual", vals)

    def test_categories_sorted_worst_variance_first(self):
        """Restaurants (avg -15) should appear before Groceries (avg -6)."""
        with patch("app.get_db", return_value=self._db_with_data()):
            resp = self.client.get("/api/budgets/history?months=12")
        cats = resp.get_json()["categories"]
        names = [c["category_name"] for c in cats]
        self.assertIn("Restaurants", names)
        self.assertIn("Groceries", names)
        self.assertLess(names.index("Restaurants"), names.index("Groceries"))

    def test_category_month_cell_shape(self):
        with patch("app.get_db", return_value=self._db_with_data()):
            resp = self.client.get("/api/budgets/history?months=12")
        cats = resp.get_json()["categories"]
        cat = next(c for c in cats if c["category_name"] == "Groceries")
        cell = list(cat["months"].values())[0]
        self.assertIn("budgeted", cell)
        self.assertIn("actual", cell)
        self.assertIn("variance", cell)

    def test_variance_negative_when_over_budget(self):
        with patch("app.get_db", return_value=self._db_with_data()):
            resp = self.client.get("/api/budgets/history?months=12")
        cats = resp.get_json()["categories"]
        groceries = next(c for c in cats if c["category_name"] == "Groceries")
        nov = groceries["months"].get("2025-11-01")
        self.assertIsNotNone(nov)
        self.assertLess(nov["variance"], 0)  # -23 < 0

    def test_months_filter_limits_results(self):
        with patch("app.get_db", return_value=self._db_with_data()):
            resp_12 = self.client.get("/api/budgets/history?months=12")
            resp_1 = self.client.get("/api/budgets/history?months=1")
        months_12 = resp_12.get_json()["months"]
        months_1 = resp_1.get_json()["months"]
        self.assertLessEqual(len(months_1), len(months_12))

    def test_empty_db_returns_empty_lists(self):
        with patch("app.get_db", return_value=make_db()):
            resp = self.client.get("/api/budgets/history")
        data = resp.get_json()
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(data["months"], [])
        self.assertEqual(data["categories"], [])


if __name__ == "__main__":
    unittest.main()

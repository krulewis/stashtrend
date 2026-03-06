"""
Tests for GET /api/budgets/custom-groups and POST /api/budgets/custom-groups.

Coverage:
  - DDL:       budget_custom_groups table exists in DASHBOARD_DDL
  - GET:       empty DB returns {"groups": {}}, with data returns grouped/sorted response
  - POST:      valid payload saves and returns count
               full-state replacement (POST overwrites previous data)
               validation failures return 400 for each invalid case
  - Round-trip: POST then GET returns consistent data
"""

import contextlib
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent.parent))

from app import app
from tests.test_helpers import make_test_db


def make_db():
    return make_test_db()


def seed_categories(conn):
    """Insert minimal categories so the LEFT JOIN in GET does not filter rows."""
    conn.executemany(
        "INSERT OR IGNORE INTO categories (id, name, group_name, group_type) VALUES (?, ?, ?, ?)",
        [
            ("cat_1", "Groceries", "Food & Drink", "expense"),
            ("cat_2", "Restaurants", "Food & Drink", "expense"),
            ("cat_3", "Entertainment", "Fun", "expense"),
            ("cat_transfer", "Credit Card Payment", "Transfers", "transfer"),
        ],
    )
    conn.commit()


def make_context_manager(db):
    """
    Wrap an in-memory DB in a context manager suitable for patching
    app.get_db_connection, which the custom-groups endpoints use.
    The DB is *not* closed on exit so tests can inspect state afterwards.
    """
    @contextlib.contextmanager
    def _ctx():
        yield db
    return _ctx


# ===========================================================================
# DDL — budget_custom_groups table
# ===========================================================================

class TestBudgetCustomGroupsDDL(unittest.TestCase):
    """DASHBOARD_DDL creates the budget_custom_groups table with correct schema."""

    def setUp(self):
        self.conn = make_db()

    def tearDown(self):
        self.conn.close()

    def test_table_exists(self):
        tables = [
            r[0] for r in self.conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).fetchall()
        ]
        self.assertIn("budget_custom_groups", tables)

    def test_has_category_id_column(self):
        cols = [r[1] for r in self.conn.execute("PRAGMA table_info(budget_custom_groups)").fetchall()]
        self.assertIn("category_id", cols)

    def test_has_custom_group_column(self):
        cols = [r[1] for r in self.conn.execute("PRAGMA table_info(budget_custom_groups)").fetchall()]
        self.assertIn("custom_group", cols)

    def test_has_sort_order_column(self):
        cols = [r[1] for r in self.conn.execute("PRAGMA table_info(budget_custom_groups)").fetchall()]
        self.assertIn("sort_order", cols)

    def test_category_id_is_primary_key(self):
        pk_cols = [
            r[1] for r in self.conn.execute("PRAGMA table_info(budget_custom_groups)").fetchall()
            if r[5] == 1  # pk flag
        ]
        self.assertIn("category_id", pk_cols)

    def test_can_insert_and_retrieve_row(self):
        self.conn.execute(
            "INSERT INTO budget_custom_groups (category_id, custom_group, sort_order) VALUES (?, ?, ?)",
            ("cat_1", "Food", 0),
        )
        self.conn.commit()
        row = self.conn.execute(
            "SELECT * FROM budget_custom_groups WHERE category_id = 'cat_1'"
        ).fetchone()
        self.assertIsNotNone(row)
        self.assertEqual(row["custom_group"], "Food")
        self.assertEqual(row["sort_order"], 0)


# ===========================================================================
# GET /api/budgets/custom-groups
# ===========================================================================

class TestGetBudgetCustomGroups(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    def test_empty_db_returns_empty_groups_dict(self):
        db = make_db()
        with patch("app.get_db_connection", make_context_manager(db)):
            resp = self.client.get("/api/budgets/custom-groups")
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertIn("groups", data)
        self.assertEqual(data["groups"], {})

    def test_returns_200(self):
        db = make_db()
        with patch("app.get_db_connection", make_context_manager(db)):
            resp = self.client.get("/api/budgets/custom-groups")
        self.assertEqual(resp.status_code, 200)

    def test_response_shape_with_data(self):
        db = make_db()
        seed_categories(db)
        db.execute(
            "INSERT INTO budget_custom_groups (category_id, custom_group, sort_order) VALUES (?, ?, ?)",
            ("cat_1", "Food", 0),
        )
        db.commit()
        with patch("app.get_db_connection", make_context_manager(db)):
            resp = self.client.get("/api/budgets/custom-groups")
        data = resp.get_json()
        self.assertIn("groups", data)
        self.assertIn("Food", data["groups"])
        group_items = data["groups"]["Food"]
        self.assertIsInstance(group_items, list)
        self.assertEqual(len(group_items), 1)
        self.assertEqual(group_items[0]["category_id"], "cat_1")
        self.assertIn("sort_order", group_items[0])

    def test_groups_contain_multiple_items_when_multiple_categories_in_group(self):
        db = make_db()
        seed_categories(db)
        db.executemany(
            "INSERT INTO budget_custom_groups (category_id, custom_group, sort_order) VALUES (?, ?, ?)",
            [("cat_1", "Food", 0), ("cat_2", "Food", 1)],
        )
        db.commit()
        with patch("app.get_db_connection", make_context_manager(db)):
            resp = self.client.get("/api/budgets/custom-groups")
        data = resp.get_json()
        self.assertEqual(len(data["groups"]["Food"]), 2)

    def test_multiple_groups_returned(self):
        db = make_db()
        seed_categories(db)
        db.executemany(
            "INSERT INTO budget_custom_groups (category_id, custom_group, sort_order) VALUES (?, ?, ?)",
            [("cat_1", "Food", 0), ("cat_3", "Entertainment", 0)],
        )
        db.commit()
        with patch("app.get_db_connection", make_context_manager(db)):
            resp = self.client.get("/api/budgets/custom-groups")
        data = resp.get_json()
        self.assertIn("Food", data["groups"])
        self.assertIn("Entertainment", data["groups"])

    def test_items_sorted_by_sort_order_within_group(self):
        db = make_db()
        seed_categories(db)
        # Insert in reverse sort order to verify ordering is applied
        db.executemany(
            "INSERT INTO budget_custom_groups (category_id, custom_group, sort_order) VALUES (?, ?, ?)",
            [("cat_2", "Food", 10), ("cat_1", "Food", 0)],
        )
        db.commit()
        with patch("app.get_db_connection", make_context_manager(db)):
            resp = self.client.get("/api/budgets/custom-groups")
        items = resp.get_json()["groups"]["Food"]
        sort_orders = [item["sort_order"] for item in items]
        self.assertEqual(sort_orders, sorted(sort_orders))

    def test_transfer_categories_excluded_from_response(self):
        """Categories with group_type='transfer' must not appear in the GET response."""
        db = make_db()
        seed_categories(db)
        db.executemany(
            "INSERT INTO budget_custom_groups (category_id, custom_group, sort_order) VALUES (?, ?, ?)",
            [
                ("cat_1", "Food", 0),
                ("cat_transfer", "Transfers", 0),
            ],
        )
        db.commit()
        with patch("app.get_db_connection", make_context_manager(db)):
            resp = self.client.get("/api/budgets/custom-groups")
        data = resp.get_json()
        # cat_transfer should not appear in any group
        all_cat_ids = [
            item["category_id"]
            for items in data["groups"].values()
            for item in items
        ]
        self.assertNotIn("cat_transfer", all_cat_ids)


# ===========================================================================
# POST /api/budgets/custom-groups
# ===========================================================================

class TestPostBudgetCustomGroups(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    def _post(self, body, db=None):
        db = db or make_db()
        with patch("app.get_db_connection", make_context_manager(db)):
            resp = self.client.post("/api/budgets/custom-groups", json=body)
        return resp, db

    # ── Happy path ──────────────────────────────────────────────────────────

    def test_valid_payload_returns_200(self):
        resp, _ = self._post({"groups": {"Food": [{"category_id": "cat_1", "sort_order": 0}]}})
        self.assertEqual(resp.status_code, 200)

    def test_valid_payload_returns_status_ok(self):
        resp, _ = self._post({"groups": {"Food": [{"category_id": "cat_1", "sort_order": 0}]}})
        data = resp.get_json()
        self.assertEqual(data["status"], "ok")

    def test_valid_payload_returns_correct_count(self):
        body = {"groups": {
            "Food": [
                {"category_id": "cat_1", "sort_order": 0},
                {"category_id": "cat_2", "sort_order": 1},
            ]
        }}
        resp, _ = self._post(body)
        self.assertEqual(resp.get_json()["count"], 2)

    def test_empty_groups_dict_is_valid_and_returns_count_zero(self):
        resp, _ = self._post({"groups": {}})
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.get_json()["count"], 0)

    def test_post_saves_rows_to_db(self):
        db = make_db()
        body = {"groups": {"Food": [{"category_id": "cat_1", "sort_order": 0}]}}
        with patch("app.get_db_connection", make_context_manager(db)):
            self.client.post("/api/budgets/custom-groups", json=body)
        row = db.execute(
            "SELECT * FROM budget_custom_groups WHERE category_id='cat_1'"
        ).fetchone()
        self.assertIsNotNone(row)
        self.assertEqual(row["custom_group"], "Food")

    # ── Full-state replacement ───────────────────────────────────────────────

    def test_second_post_overwrites_first(self):
        """POST is a full-state replacement — previous data must be deleted."""
        db = make_db()
        first = {"groups": {"Food": [{"category_id": "cat_1", "sort_order": 0}]}}
        second = {"groups": {"Fun": [{"category_id": "cat_3", "sort_order": 0}]}}
        with patch("app.get_db_connection", make_context_manager(db)):
            self.client.post("/api/budgets/custom-groups", json=first)
        with patch("app.get_db_connection", make_context_manager(db)):
            resp = self.client.post("/api/budgets/custom-groups", json=second)
        self.assertEqual(resp.status_code, 200)
        all_rows = db.execute("SELECT * FROM budget_custom_groups").fetchall()
        cat_ids = [r["category_id"] for r in all_rows]
        self.assertNotIn("cat_1", cat_ids)
        self.assertIn("cat_3", cat_ids)

    def test_second_post_row_count_reflects_new_state_only(self):
        """count in POST response reflects only the newly inserted rows."""
        db = make_db()
        first = {"groups": {"Food": [
            {"category_id": "cat_1", "sort_order": 0},
            {"category_id": "cat_2", "sort_order": 1},
        ]}}
        second = {"groups": {"Fun": [{"category_id": "cat_3", "sort_order": 0}]}}
        with patch("app.get_db_connection", make_context_manager(db)):
            self.client.post("/api/budgets/custom-groups", json=first)
        with patch("app.get_db_connection", make_context_manager(db)):
            resp = self.client.post("/api/budgets/custom-groups", json=second)
        self.assertEqual(resp.get_json()["count"], 1)

    # ── Validation failures ─────────────────────────────────────────────────

    def test_missing_groups_key_returns_400(self):
        resp, _ = self._post({"not_groups": {}})
        self.assertEqual(resp.status_code, 400)

    def test_non_dict_body_returns_400(self):
        resp, _ = self._post([{"category_id": "cat_1"}])
        self.assertEqual(resp.status_code, 400)

    def test_null_body_returns_400(self):
        db = make_db()
        with patch("app.get_db_connection", make_context_manager(db)):
            resp = self.client.post(
                "/api/budgets/custom-groups",
                data="not json",
                content_type="application/json",
            )
        self.assertEqual(resp.status_code, 400)

    def test_empty_category_id_returns_400(self):
        resp, _ = self._post({"groups": {"Food": [{"category_id": "", "sort_order": 0}]}})
        self.assertEqual(resp.status_code, 400)

    def test_null_category_id_returns_400(self):
        resp, _ = self._post({"groups": {"Food": [{"category_id": None, "sort_order": 0}]}})
        self.assertEqual(resp.status_code, 400)

    def test_empty_group_name_returns_400(self):
        resp, _ = self._post({"groups": {"": [{"category_id": "cat_1", "sort_order": 0}]}})
        self.assertEqual(resp.status_code, 400)

    def test_whitespace_only_group_name_returns_400(self):
        resp, _ = self._post({"groups": {"   ": [{"category_id": "cat_1", "sort_order": 0}]}})
        self.assertEqual(resp.status_code, 400)

    def test_negative_sort_order_returns_400(self):
        resp, _ = self._post({"groups": {"Food": [{"category_id": "cat_1", "sort_order": -1}]}})
        self.assertEqual(resp.status_code, 400)

    def test_float_sort_order_returns_400(self):
        resp, _ = self._post({"groups": {"Food": [{"category_id": "cat_1", "sort_order": 1.5}]}})
        self.assertEqual(resp.status_code, 400)

    def test_boolean_sort_order_returns_400(self):
        """Booleans are ints in Python — must be explicitly rejected."""
        resp, _ = self._post({"groups": {"Food": [{"category_id": "cat_1", "sort_order": True}]}})
        self.assertEqual(resp.status_code, 400)

    def test_exceeding_500_row_limit_returns_400(self):
        items = [{"category_id": f"cat_{i}", "sort_order": i} for i in range(501)]
        resp, _ = self._post({"groups": {"Big": items}})
        self.assertEqual(resp.status_code, 400)

    def test_exactly_500_rows_is_accepted(self):
        items = [{"category_id": f"cat_{i}", "sort_order": i} for i in range(500)]
        resp, _ = self._post({"groups": {"Big": items}})
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.get_json()["count"], 500)

    def test_validation_failure_does_not_modify_db(self):
        """When validation fails, the existing DB state must be unchanged."""
        db = make_db()
        db.execute(
            "INSERT INTO budget_custom_groups (category_id, custom_group, sort_order) VALUES (?, ?, ?)",
            ("cat_1", "Food", 0),
        )
        db.commit()
        bad_body = {"groups": {"Food": [{"category_id": "", "sort_order": 0}]}}
        with patch("app.get_db_connection", make_context_manager(db)):
            resp = self.client.post("/api/budgets/custom-groups", json=bad_body)
        self.assertEqual(resp.status_code, 400)
        count = db.execute("SELECT COUNT(*) FROM budget_custom_groups").fetchone()[0]
        self.assertEqual(count, 1)


# ===========================================================================
# Round-trip: POST then GET
# ===========================================================================

class TestRoundTrip(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    def test_get_returns_data_saved_by_post(self):
        db = make_db()
        seed_categories(db)
        body = {"groups": {
            "Food": [
                {"category_id": "cat_1", "sort_order": 0},
                {"category_id": "cat_2", "sort_order": 1},
            ],
            "Fun": [
                {"category_id": "cat_3", "sort_order": 0},
            ],
        }}
        with patch("app.get_db_connection", make_context_manager(db)):
            self.client.post("/api/budgets/custom-groups", json=body)

        with patch("app.get_db_connection", make_context_manager(db)):
            resp = self.client.get("/api/budgets/custom-groups")

        data = resp.get_json()
        self.assertIn("Food", data["groups"])
        self.assertIn("Fun", data["groups"])
        food_ids = {item["category_id"] for item in data["groups"]["Food"]}
        self.assertEqual(food_ids, {"cat_1", "cat_2"})
        fun_ids = {item["category_id"] for item in data["groups"]["Fun"]}
        self.assertEqual(fun_ids, {"cat_3"})

    def test_sort_order_preserved_through_round_trip(self):
        db = make_db()
        seed_categories(db)
        body = {"groups": {
            "Food": [
                {"category_id": "cat_1", "sort_order": 5},
                {"category_id": "cat_2", "sort_order": 10},
            ],
        }}
        with patch("app.get_db_connection", make_context_manager(db)):
            self.client.post("/api/budgets/custom-groups", json=body)
        with patch("app.get_db_connection", make_context_manager(db)):
            resp = self.client.get("/api/budgets/custom-groups")
        items = resp.get_json()["groups"]["Food"]
        sort_orders = [item["sort_order"] for item in items]
        self.assertIn(5, sort_orders)
        self.assertIn(10, sort_orders)

    def test_group_name_whitespace_stripped_on_save(self):
        """Group names with surrounding whitespace must be stored stripped."""
        db = make_db()
        seed_categories(db)
        body = {"groups": {"  Food  ": [{"category_id": "cat_1", "sort_order": 0}]}}
        with patch("app.get_db_connection", make_context_manager(db)):
            self.client.post("/api/budgets/custom-groups", json=body)
        with patch("app.get_db_connection", make_context_manager(db)):
            resp = self.client.get("/api/budgets/custom-groups")
        data = resp.get_json()
        self.assertIn("Food", data["groups"])
        self.assertNotIn("  Food  ", data["groups"])


if __name__ == "__main__":
    unittest.main()

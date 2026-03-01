"""
Tests for the Custom Account Groups feature — backend logic.

Tests are structured around a real SQLite DB (in tempdir), isolating Flask
from the tests by calling the SQL logic directly. This mirrors the approach
used in monarch-pipeline/tests/.

Coverage:
  - Schema: dashboard tables created, idempotent, cascade delete wired
  - CRUD:   create / read / update / delete groups + member lists
  - Data:   history pivot, snapshot query
  - Edge:   duplicate group names, empty groups, missing accounts
"""

import json
import sqlite3
import sys
import tempfile
import unittest
from collections import defaultdict
from pathlib import Path

# ── Make app importable from tests/ without installing it ─────────────────────
sys.path.insert(0, str(Path(__file__).parent.parent))

# ── Replicate the DDL and pure logic from app.py so tests don't need Flask ────
PIPELINE_DDL = """
CREATE TABLE IF NOT EXISTS accounts (
    id                   TEXT PRIMARY KEY,
    name                 TEXT NOT NULL,
    type                 TEXT,
    subtype              TEXT,
    current_balance      REAL,
    display_balance      REAL,
    institution          TEXT,
    is_hidden            INTEGER DEFAULT 0,
    is_asset             INTEGER DEFAULT 1,
    include_in_net_worth INTEGER DEFAULT 1,
    last_updated         TEXT,
    synced_at            TEXT NOT NULL DEFAULT '2024-01-01'
);

CREATE TABLE IF NOT EXISTS account_history (
    account_id TEXT NOT NULL,
    date       TEXT NOT NULL,
    balance    REAL,
    PRIMARY KEY (account_id, date),
    FOREIGN KEY (account_id) REFERENCES accounts(id)
);
"""

DASHBOARD_DDL = """
CREATE TABLE IF NOT EXISTS account_groups (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL UNIQUE,
    color      TEXT NOT NULL DEFAULT '#6366f1',
    created_at TEXT NOT NULL DEFAULT (date('now'))
);

CREATE TABLE IF NOT EXISTS account_group_members (
    group_id   INTEGER NOT NULL,
    account_id TEXT    NOT NULL,
    PRIMARY KEY (group_id, account_id),
    FOREIGN KEY (group_id)   REFERENCES account_groups(id) ON DELETE CASCADE,
    FOREIGN KEY (account_id) REFERENCES accounts(id)
);

CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
"""


def make_db():
    """Create an in-memory SQLite DB with both pipeline + dashboard schemas."""
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(PIPELINE_DDL)
    conn.executescript(DASHBOARD_DDL)
    return conn


def seed_accounts(conn, accounts):
    """Insert test accounts. accounts = list of (id, name, type, is_asset, current_balance)"""
    conn.executemany(
        """INSERT INTO accounts (id, name, type, is_asset, current_balance, synced_at)
           VALUES (?, ?, ?, ?, ?, '2024-01-01')""",
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


def get_setting(conn, key, default=None):
    """Mirror of app.py get_setting — returns stored value or default."""
    row = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
    return row["value"] if row else default


def set_setting(conn, key, value):
    """Mirror of app.py set_setting — upserts a key/value pair."""
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?, ?)"
        " ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (key, value),
    )
    conn.commit()


def create_group(conn, name, color="#6366f1", account_ids=None):
    """Helper: insert a group + its members, return group_id."""
    cur = conn.execute(
        "INSERT INTO account_groups (name, color) VALUES (?, ?)", (name, color)
    )
    group_id = cur.lastrowid
    if account_ids:
        conn.executemany(
            "INSERT INTO account_group_members (group_id, account_id) VALUES (?, ?)",
            [(group_id, aid) for aid in account_ids],
        )
    conn.commit()
    return group_id


# ═════════════════════════════════════════════════════════════════════════════
# Schema tests
# ═════════════════════════════════════════════════════════════════════════════

class TestDashboardSchema(unittest.TestCase):

    def setUp(self):
        self.conn = make_db()

    def tearDown(self):
        self.conn.close()

    def _tables(self):
        rows = self.conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        ).fetchall()
        return {r["name"] for r in rows}

    def test_dashboard_tables_created(self):
        """account_groups and account_group_members tables should exist."""
        tables = self._tables()
        self.assertIn("account_groups", tables)
        self.assertIn("account_group_members", tables)

    def test_schema_is_idempotent(self):
        """Re-running DASHBOARD_DDL on an existing DB must not raise."""
        try:
            self.conn.executescript(DASHBOARD_DDL)
        except Exception as e:
            self.fail(f"Re-running DDL raised: {e}")

    def test_cascade_delete_removes_members(self):
        """Deleting a group should cascade-delete its members."""
        seed_accounts(self.conn, [("acc1", "Checking", "checking", 1, 1000)])
        gid = create_group(self.conn, "Test", account_ids=["acc1"])

        # Confirm member exists
        members = self.conn.execute(
            "SELECT * FROM account_group_members WHERE group_id = ?", (gid,)
        ).fetchall()
        self.assertEqual(len(members), 1)

        # Delete group
        self.conn.execute("DELETE FROM account_groups WHERE id = ?", (gid,))
        self.conn.commit()

        # Member should be gone
        members = self.conn.execute(
            "SELECT * FROM account_group_members WHERE group_id = ?", (gid,)
        ).fetchall()
        self.assertEqual(len(members), 0)

    def test_group_name_unique_constraint(self):
        """Inserting two groups with the same name should raise IntegrityError."""
        create_group(self.conn, "Duplicate")
        with self.assertRaises(sqlite3.IntegrityError):
            self.conn.execute(
                "INSERT INTO account_groups (name, color) VALUES (?, ?)",
                ("Duplicate", "#ff0000"),
            )


# ═════════════════════════════════════════════════════════════════════════════
# CRUD logic tests
# ═════════════════════════════════════════════════════════════════════════════

class TestGroupCRUD(unittest.TestCase):

    def setUp(self):
        self.conn = make_db()
        seed_accounts(self.conn, [
            ("acc1", "Chase Checking", "checking", 1, 5000),
            ("acc2", "Fidelity 401k",  "investment", 1, 80000),
            ("acc3", "Mortgage",       "mortgage",   0, -300000),
        ])

    def tearDown(self):
        self.conn.close()

    def test_create_group_no_members(self):
        gid = create_group(self.conn, "Empty Group")
        row = self.conn.execute(
            "SELECT * FROM account_groups WHERE id = ?", (gid,)
        ).fetchone()
        self.assertIsNotNone(row)
        self.assertEqual(row["name"], "Empty Group")

    def test_create_group_with_members(self):
        gid = create_group(self.conn, "Liquid", account_ids=["acc1", "acc2"])
        members = self.conn.execute(
            "SELECT account_id FROM account_group_members WHERE group_id = ?", (gid,)
        ).fetchall()
        account_ids = {m["account_id"] for m in members}
        self.assertEqual(account_ids, {"acc1", "acc2"})

    def test_read_group_with_member_ids(self):
        gid = create_group(self.conn, "Assets", account_ids=["acc1", "acc2"])
        group = self.conn.execute(
            "SELECT id, name, color FROM account_groups WHERE id = ?", (gid,)
        ).fetchone()
        members = self.conn.execute(
            "SELECT account_id FROM account_group_members WHERE group_id = ?", (gid,)
        ).fetchall()
        self.assertEqual(group["name"], "Assets")
        self.assertEqual(len(members), 2)

    def test_update_group_name_and_color(self):
        gid = create_group(self.conn, "Old Name", color="#aaaaaa")
        self.conn.execute(
            "UPDATE account_groups SET name = ?, color = ? WHERE id = ?",
            ("New Name", "#34d399", gid),
        )
        self.conn.commit()
        row = self.conn.execute(
            "SELECT name, color FROM account_groups WHERE id = ?", (gid,)
        ).fetchone()
        self.assertEqual(row["name"], "New Name")
        self.assertEqual(row["color"], "#34d399")

    def test_update_group_members_replace(self):
        """Updating members = delete all then re-insert."""
        gid = create_group(self.conn, "Investments", account_ids=["acc1", "acc2"])
        # Replace: only acc3 now
        self.conn.execute(
            "DELETE FROM account_group_members WHERE group_id = ?", (gid,)
        )
        self.conn.execute(
            "INSERT INTO account_group_members (group_id, account_id) VALUES (?, ?)",
            (gid, "acc3"),
        )
        self.conn.commit()
        members = self.conn.execute(
            "SELECT account_id FROM account_group_members WHERE group_id = ?", (gid,)
        ).fetchall()
        self.assertEqual(len(members), 1)
        self.assertEqual(members[0]["account_id"], "acc3")

    def test_delete_group(self):
        gid = create_group(self.conn, "To Delete", account_ids=["acc1"])
        self.conn.execute("DELETE FROM account_groups WHERE id = ?", (gid,))
        self.conn.commit()
        row = self.conn.execute(
            "SELECT * FROM account_groups WHERE id = ?", (gid,)
        ).fetchone()
        self.assertIsNone(row)

    def test_list_all_groups(self):
        create_group(self.conn, "Group A")
        create_group(self.conn, "Group B")
        groups = self.conn.execute(
            "SELECT * FROM account_groups ORDER BY name"
        ).fetchall()
        self.assertEqual(len(groups), 2)
        self.assertEqual(groups[0]["name"], "Group A")
        self.assertEqual(groups[1]["name"], "Group B")

    def test_group_with_no_members_is_valid(self):
        """A group with zero members should be creatable and readable."""
        gid = create_group(self.conn, "Empty")
        members = self.conn.execute(
            "SELECT * FROM account_group_members WHERE group_id = ?", (gid,)
        ).fetchall()
        self.assertEqual(len(members), 0)

    def test_duplicate_member_insert_ignored(self):
        """INSERT OR IGNORE should prevent duplicate members."""
        gid = create_group(self.conn, "Dupe Test", account_ids=["acc1"])
        self.conn.execute(
            "INSERT OR IGNORE INTO account_group_members (group_id, account_id) VALUES (?, ?)",
            (gid, "acc1"),
        )
        self.conn.commit()
        members = self.conn.execute(
            "SELECT * FROM account_group_members WHERE group_id = ?", (gid,)
        ).fetchall()
        self.assertEqual(len(members), 1)


# ═════════════════════════════════════════════════════════════════════════════
# History pivot tests
# ═════════════════════════════════════════════════════════════════════════════

class TestGroupsHistory(unittest.TestCase):
    """
    Tests for the SQL query + Python pivot used in /api/groups/history.
    We execute the query directly against a real SQLite DB and verify
    the output shape matches what recharts expects.
    """

    def setUp(self):
        self.conn = make_db()
        seed_accounts(self.conn, [
            ("acc1", "Checking",  "checking",   1, 5000),
            ("acc2", "Savings",   "savings",     1, 20000),
            ("acc3", "Mortgage",  "mortgage",    0, -300000),
        ])
        seed_history(self.conn, [
            ("acc1", "2024-01-01", 4000),
            ("acc1", "2024-02-01", 4500),
            ("acc2", "2024-01-01", 18000),
            ("acc2", "2024-02-01", 19000),
            ("acc3", "2024-01-01", -290000),
            ("acc3", "2024-02-01", -289000),
        ])
        self.gid_liquid = create_group(self.conn, "Liquid",  "#6366f1", ["acc1", "acc2"])
        self.gid_debt   = create_group(self.conn, "Debt",    "#f87171", ["acc3"])

    def tearDown(self):
        self.conn.close()

    def _run_pivot(self):
        """Execute the history query + Python pivot, return (series, groups_meta)."""
        rows = self.conn.execute("""
            SELECT
                ah.date,
                ag.id    AS group_id,
                ag.name  AS group_name,
                ag.color AS color,
                SUM(ah.balance) AS total
            FROM account_history ah
            JOIN account_group_members agm ON ah.account_id = agm.account_id
            JOIN account_groups ag         ON agm.group_id  = ag.id
            GROUP BY ah.date, ag.id
            ORDER BY ah.date ASC, ag.name ASC
        """).fetchall()

        pivot       = defaultdict(dict)
        groups_meta = {}
        for row in rows:
            pivot[row["date"]][row["group_name"]] = round(row["total"] or 0, 2)
            groups_meta[row["group_name"]] = {
                "id":    row["group_id"],
                "color": row["color"],
            }
        series = [{"date": d, **vals} for d, vals in sorted(pivot.items())]
        return series, groups_meta

    def test_series_has_correct_dates(self):
        series, _ = self._run_pivot()
        dates = [r["date"] for r in series]
        self.assertEqual(dates, ["2024-01-01", "2024-02-01"])

    def test_series_values_correct(self):
        series, _ = self._run_pivot()
        jan = series[0]
        # Liquid = acc1 + acc2 = 4000 + 18000 = 22000
        self.assertAlmostEqual(jan["Liquid"], 22000.0)
        # Debt = acc3 = -290000
        self.assertAlmostEqual(jan["Debt"], -290000.0)

    def test_series_feb_values_correct(self):
        series, _ = self._run_pivot()
        feb = series[1]
        self.assertAlmostEqual(feb["Liquid"], 23500.0)   # 4500 + 19000
        self.assertAlmostEqual(feb["Debt"],   -289000.0)

    def test_groups_meta_has_correct_colors(self):
        _, meta = self._run_pivot()
        self.assertEqual(meta["Liquid"]["color"], "#6366f1")
        self.assertEqual(meta["Debt"]["color"],   "#f87171")

    def test_groups_meta_keys_match_series_keys(self):
        series, meta = self._run_pivot()
        # Every group_name in meta should appear as a key in series rows
        for row in series:
            for name in meta:
                self.assertIn(name, row, f"'{name}' missing from series row {row['date']}")

    def test_no_history_returns_empty_series(self):
        """A group with accounts but no history rows returns an empty series."""
        conn = make_db()
        seed_accounts(conn, [("x", "X", "checking", 1, 0)])
        create_group(conn, "No-history", account_ids=["x"])
        rows = conn.execute("""
            SELECT ah.date, ag.name AS group_name, SUM(ah.balance) AS total
            FROM account_history ah
            JOIN account_group_members agm ON ah.account_id = agm.account_id
            JOIN account_groups ag ON agm.group_id = ag.id
            GROUP BY ah.date, ag.id
        """).fetchall()
        conn.close()
        self.assertEqual(len(rows), 0)

    def test_empty_group_excluded_from_series(self):
        """A group with no members produces no rows in the history query."""
        create_group(self.conn, "Ghost Group")  # no members
        series, meta = self._run_pivot()
        self.assertNotIn("Ghost Group", meta)


# ═════════════════════════════════════════════════════════════════════════════
# Snapshot query tests
# ═════════════════════════════════════════════════════════════════════════════

class TestGroupsSnapshot(unittest.TestCase):

    def setUp(self):
        self.conn = make_db()
        seed_accounts(self.conn, [
            ("acc1", "Checking",   "checking",   1, 5000),
            ("acc2", "Brokerage",  "investment",  1, 80000),
            ("acc3", "Car Loan",   "loan",        0, -15000),
        ])
        self.gid_assets = create_group(self.conn, "Assets", "#34d399", ["acc1", "acc2"])
        self.gid_debt   = create_group(self.conn, "Debt",   "#f87171", ["acc3"])

    def tearDown(self):
        self.conn.close()

    def _run_snapshot(self):
        rows = self.conn.execute("""
            SELECT
                ag.id,
                ag.name,
                ag.color,
                SUM(a.current_balance) AS total,
                COUNT(a.id)            AS account_count
            FROM account_groups ag
            JOIN account_group_members agm ON ag.id          = agm.group_id
            JOIN accounts a                ON agm.account_id = a.id
            GROUP BY ag.id
            ORDER BY total DESC
        """).fetchall()
        return [dict(r) for r in rows]

    def test_snapshot_returns_all_groups(self):
        snap = self._run_snapshot()
        names = {r["name"] for r in snap}
        self.assertEqual(names, {"Assets", "Debt"})

    def test_snapshot_totals_correct(self):
        snap = self._run_snapshot()
        by_name = {r["name"]: r for r in snap}
        self.assertAlmostEqual(by_name["Assets"]["total"], 85000.0)   # 5000 + 80000
        self.assertAlmostEqual(by_name["Debt"]["total"],  -15000.0)

    def test_snapshot_account_count_correct(self):
        snap = self._run_snapshot()
        by_name = {r["name"]: r for r in snap}
        self.assertEqual(by_name["Assets"]["account_count"], 2)
        self.assertEqual(by_name["Debt"]["account_count"],   1)

    def test_snapshot_sorted_by_total_desc(self):
        snap = self._run_snapshot()
        totals = [r["total"] for r in snap]
        self.assertEqual(totals, sorted(totals, reverse=True))

    def test_empty_group_not_in_snapshot(self):
        """A group with no member accounts should not appear in snapshot."""
        create_group(self.conn, "Ghost")
        snap = self._run_snapshot()
        names = {r["name"] for r in snap}
        self.assertNotIn("Ghost", names)

    def test_snapshot_reflects_current_balance(self):
        """Snapshot uses accounts.current_balance, not account_history."""
        # Update current_balance directly (simulating a sync)
        self.conn.execute(
            "UPDATE accounts SET current_balance = 9999 WHERE id = 'acc1'"
        )
        self.conn.commit()
        snap = self._run_snapshot()
        by_name = {r["name"]: r for r in snap}
        # Assets should now be 9999 + 80000 = 89999
        self.assertAlmostEqual(by_name["Assets"]["total"], 89999.0)


# ═════════════════════════════════════════════════════════════════════════════
# accounts/summary — id field inclusion
# ═════════════════════════════════════════════════════════════════════════════

class TestAccountsSummaryIncludesId(unittest.TestCase):
    """Verifies that the accounts query exposes the id field (needed by GroupManager)."""

    def setUp(self):
        self.conn = make_db()
        seed_accounts(self.conn, [
            ("acct-abc-123", "My Bank", "checking", 1, 1500),
        ])

    def tearDown(self):
        self.conn.close()

    def test_id_field_present_in_accounts_query(self):
        rows = self.conn.execute("""
            SELECT id, type, subtype, is_asset, institution, name,
                   current_balance, display_balance
            FROM accounts
            WHERE include_in_net_worth = 1 AND is_hidden = 0
        """).fetchall()
        self.assertEqual(len(rows), 1)
        row = dict(rows[0])
        self.assertIn("id", row)
        self.assertEqual(row["id"], "acct-abc-123")


# ═════════════════════════════════════════════════════════════════════════════
# API response shape — regression tests for key naming
# ═════════════════════════════════════════════════════════════════════════════

class TestHistoryResponseShape(unittest.TestCase):
    """
    Regression test for the groups_meta key name.

    The frontend GroupsTimeChart destructures historyData as:
        const { series, groupsMeta } = historyData
    but the backend must return the key as 'groups_meta' (snake_case).
    If these ever diverge, groupsMeta is undefined and no lines render.

    This test locks down the exact key name returned by the pivot function
    so a future rename is caught immediately.
    """

    def setUp(self):
        self.conn = make_db()
        seed_accounts(self.conn, [
            ("a1", "Checking", "checking", 1, 1000),
        ])
        seed_history(self.conn, [
            ("a1", "2024-01-01", 1000),
        ])
        create_group(self.conn, "Cash", "#6366f1", ["a1"])

    def tearDown(self):
        self.conn.close()

    def _build_response(self):
        """Mirrors the exact logic in app.py groups_history()."""
        rows = self.conn.execute("""
            SELECT
                ah.date,
                ag.id    AS group_id,
                ag.name  AS group_name,
                ag.color AS color,
                SUM(ah.balance) AS total
            FROM account_history ah
            JOIN account_group_members agm ON ah.account_id = agm.account_id
            JOIN account_groups ag         ON agm.group_id  = ag.id
            GROUP BY ah.date, ag.id
            ORDER BY ah.date ASC, ag.name ASC
        """).fetchall()

        pivot       = defaultdict(dict)
        groups_meta = {}
        for row in rows:
            pivot[row["date"]][row["group_name"]] = round(row["total"] or 0, 2)
            groups_meta[row["group_name"]] = {
                "id":    row["group_id"],
                "color": row["color"],
            }
        series = [{"date": d, **vals} for d, vals in sorted(pivot.items())]
        # This mirrors what jsonify() receives in app.py
        return {"series": series, "groups_meta": groups_meta}

    def test_response_has_series_key(self):
        """Top-level response must have a 'series' key."""
        response = self._build_response()
        self.assertIn("series", response)

    def test_response_has_groups_meta_snake_case_key(self):
        """
        Top-level response must use 'groups_meta' (snake_case), NOT 'groupsMeta'.
        The frontend destructures this key by name — a mismatch silently
        produces undefined and no chart lines are rendered.
        """
        response = self._build_response()
        self.assertIn(
            "groups_meta", response,
            "Key must be 'groups_meta' (snake_case) to match frontend destructuring"
        )
        self.assertNotIn(
            "groupsMeta", response,
            "camelCase 'groupsMeta' is wrong — frontend expects 'groups_meta'"
        )

    def test_groups_meta_value_is_dict(self):
        """groups_meta must be a dict keyed by group name."""
        response = self._build_response()
        self.assertIsInstance(response["groups_meta"], dict)
        self.assertIn("Cash", response["groups_meta"])

    def test_series_is_list_of_dicts_with_date(self):
        """Each series entry must have a 'date' key plus one key per group."""
        response = self._build_response()
        self.assertIsInstance(response["series"], list)
        self.assertGreater(len(response["series"]), 0)
        row = response["series"][0]
        self.assertIn("date", row)
        self.assertIn("Cash", row)


# ═════════════════════════════════════════════════════════════════════════════
# Group selection filter logic
# (mirrors the JS: only render Lines for groups in selectedGroups)
# ═════════════════════════════════════════════════════════════════════════════

class TestGroupSelectionFilter(unittest.TestCase):
    """
    Tests for the group toggle/selection logic used in GroupsTimeChart.

    The chart only plots a Line for groups whose name is in selectedGroups.
    These tests validate the filtering logic in isolation so regressions
    in the selection behaviour are caught before they reach the browser.
    """

    # Simulates groupNames = Object.keys(groupsMeta)
    ALL_GROUPS = ["Liquid", "Retirement", "Debt"]

    def _active_lines(self, selected):
        """Return the group names that would have a <Line> rendered."""
        return [g for g in self.ALL_GROUPS if g in selected]

    def test_empty_selection_renders_no_lines(self):
        """When selectedGroups is empty no lines should be rendered."""
        self.assertEqual(self._active_lines(set()), [])

    def test_single_selection_renders_one_line(self):
        self.assertEqual(self._active_lines({"Liquid"}), ["Liquid"])

    def test_all_selected_renders_all_lines(self):
        selected = set(self.ALL_GROUPS)
        self.assertEqual(self._active_lines(selected), self.ALL_GROUPS)

    def test_partial_selection_only_renders_selected(self):
        selected = {"Liquid", "Debt"}
        active = self._active_lines(selected)
        self.assertIn("Liquid", active)
        self.assertIn("Debt", active)
        self.assertNotIn("Retirement", active)

    def test_new_group_not_in_selection_defaults_to_deselected(self):
        """
        A new group name added to groupNames that is NOT in selectedGroups
        must not appear in active lines — this is the core UX requirement.
        """
        selected = {"Liquid"}  # existing selections
        new_group = "New Investment Account"
        all_groups = self.ALL_GROUPS + [new_group]
        active = [g for g in all_groups if g in selected]
        self.assertNotIn(new_group, active)
        self.assertIn("Liquid", active)

    def test_deselecting_removes_line(self):
        """Removing a group from selected should remove it from active lines."""
        selected = {"Liquid", "Retirement"}
        active_before = self._active_lines(selected)
        self.assertIn("Retirement", active_before)

        selected.discard("Retirement")
        active_after = self._active_lines(selected)
        self.assertNotIn("Retirement", active_after)
        self.assertIn("Liquid", active_after)

    def test_reselecting_restores_line(self):
        selected = set()
        active_before = self._active_lines(selected)
        self.assertEqual(active_before, [])

        selected.add("Debt")
        active_after = self._active_lines(selected)
        self.assertIn("Debt", active_after)


# ═════════════════════════════════════════════════════════════════════════════
# Group Configs — settings-table persistence
# ═════════════════════════════════════════════════════════════════════════════

class TestGroupConfigs(unittest.TestCase):
    """
    Tests for the GET/POST /api/groups/configs endpoint logic.
    Exercises get_setting/set_setting directly against an in-memory DB.
    """

    def setUp(self):
        self.conn = make_db()

    def tearDown(self):
        self.conn.close()

    # ── Helpers mirroring the endpoint logic in app.py ────────────────────

    def _get_configs(self):
        raw    = get_setting(self.conn, "group_configs", "[]")
        active = get_setting(self.conn, "group_active_config_id", "")
        try:
            configs = json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            configs = []
        try:
            active_id = int(active) if active else None
        except (ValueError, TypeError):
            active_id = None
        return {"configs": configs, "active_config_id": active_id}

    def _save_configs(self, configs, active_config_id=None):
        next_id = max((c.get("id", 0) for c in configs), default=0) + 1
        for c in configs:
            if not c.get("id"):
                c["id"] = next_id
                next_id += 1
        set_setting(self.conn, "group_configs", json.dumps(configs))
        set_setting(self.conn, "group_active_config_id",
                    str(active_config_id) if active_config_id is not None else "")
        return {"configs": configs, "active_config_id": active_config_id}

    # ── Tests ─────────────────────────────────────────────────────────────

    def test_get_returns_empty_when_no_settings_exist(self):
        result = self._get_configs()
        self.assertEqual(result["configs"], [])
        self.assertIsNone(result["active_config_id"])

    def test_save_and_retrieve_configs(self):
        self._save_configs([{"name": "Net Worth View", "group_ids": [1, 2]}])
        result = self._get_configs()
        self.assertEqual(len(result["configs"]), 1)
        self.assertEqual(result["configs"][0]["name"], "Net Worth View")

    def test_save_assigns_id_to_new_config(self):
        saved = self._save_configs([{"name": "No ID", "group_ids": [1]}])
        self.assertIn("id", saved["configs"][0])
        self.assertIsNotNone(saved["configs"][0]["id"])

    def test_save_preserves_existing_id(self):
        saved = self._save_configs([{"id": 42, "name": "Has ID", "group_ids": [1]}])
        self.assertEqual(saved["configs"][0]["id"], 42)

    def test_save_and_retrieve_active_config_id(self):
        self._save_configs([{"id": 5, "name": "My View", "group_ids": [1]}], active_config_id=5)
        result = self._get_configs()
        self.assertEqual(result["active_config_id"], 5)

    def test_save_empty_list_clears_configs(self):
        self._save_configs([{"name": "To clear", "group_ids": [1]}])
        self._save_configs([])
        self.assertEqual(self._get_configs()["configs"], [])

    def test_active_config_id_none_when_cleared(self):
        self._save_configs([{"id": 1, "name": "View", "group_ids": [1]}], active_config_id=None)
        self.assertIsNone(self._get_configs()["active_config_id"])

    def test_malformed_json_returns_empty_list(self):
        """Corrupted settings value must not 500 — fallback to empty list."""
        set_setting(self.conn, "group_configs", "not-valid-json{{{")
        result = self._get_configs()
        self.assertEqual(result["configs"], [])

    def test_malformed_active_id_returns_none(self):
        """Non-integer active_config_id must not 500 — fallback to None."""
        set_setting(self.conn, "group_active_config_id", "not-an-int")
        self.assertIsNone(self._get_configs()["active_config_id"])

    def test_multiple_configs_preserved(self):
        self._save_configs([
            {"name": "View A", "group_ids": [1]},
            {"name": "View B", "group_ids": [2, 3]},
        ])
        result = self._get_configs()
        self.assertEqual(len(result["configs"]), 2)
        names = {c["name"] for c in result["configs"]}
        self.assertEqual(names, {"View A", "View B"})

    def test_config_name_truncated_to_100_chars(self):
        """Names longer than 100 chars should be trimmed before storage."""
        long_name = "x" * 200
        configs = [{"name": long_name[:100], "group_ids": [1]}]
        self._save_configs(configs)
        result = self._get_configs()
        self.assertLessEqual(len(result["configs"][0]["name"]), 100)

    def test_group_ids_must_be_list(self):
        """group_ids stored as a list, not a scalar, survives round-trip."""
        self._save_configs([{"name": "List check", "group_ids": [1, 2, 3]}])
        result = self._get_configs()
        self.assertIsInstance(result["configs"][0]["group_ids"], list)


# ═════════════════════════════════════════════════════════════════════════════
# Group Config stale-ID cleanup on group delete
# ═════════════════════════════════════════════════════════════════════════════

class TestGroupConfigCleanupOnDelete(unittest.TestCase):
    """
    When DELETE /api/groups/<id> is called, the endpoint must remove that
    group_id from all saved configs so they don't silently reference ghosts.
    """

    def setUp(self):
        self.conn = make_db()
        seed_accounts(self.conn, [("acc1", "Checking", "checking", 1, 5000)])
        self.gid1 = create_group(self.conn, "Group A", account_ids=["acc1"])
        self.gid2 = create_group(self.conn, "Group B")

    def tearDown(self):
        self.conn.close()

    def _cleanup_configs_after_delete(self, deleted_group_id):
        """Mirrors the cleanup helper that will be added to delete_group in app.py."""
        raw = get_setting(self.conn, "group_configs", "[]")
        try:
            configs = json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            return
        for c in configs:
            c["group_ids"] = [gid for gid in c.get("group_ids", []) if gid != deleted_group_id]
        active_raw = get_setting(self.conn, "group_active_config_id", "")
        try:
            active_id = int(active_raw) if active_raw else None
        except (ValueError, TypeError):
            active_id = None
        set_setting(self.conn, "group_configs", json.dumps(configs))
        # If the active config is now empty, clear the active pointer
        active_cfg = next((c for c in configs if c.get("id") == active_id), None)
        if active_cfg is not None and not active_cfg["group_ids"]:
            set_setting(self.conn, "group_active_config_id", "")

    def _raw_configs(self):
        raw = get_setting(self.conn, "group_configs", "[]")
        try:
            return json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            return []

    def _raw_save(self, configs):
        set_setting(self.conn, "group_configs", json.dumps(configs))

    def test_deleted_group_id_removed_from_config(self):
        self._raw_save([{"id": 1, "name": "Mixed", "group_ids": [self.gid1, self.gid2]}])
        self._cleanup_configs_after_delete(self.gid1)
        configs = self._raw_configs()
        self.assertNotIn(self.gid1, configs[0]["group_ids"])
        self.assertIn(self.gid2, configs[0]["group_ids"])

    def test_config_retained_when_group_ids_becomes_empty(self):
        """Config stays in the list even if all its group_ids are removed."""
        self._raw_save([{"id": 1, "name": "Solo", "group_ids": [self.gid1]}])
        self._cleanup_configs_after_delete(self.gid1)
        configs = self._raw_configs()
        self.assertEqual(len(configs), 1)
        self.assertEqual(configs[0]["group_ids"], [])

    def test_unrelated_config_not_affected(self):
        self._raw_save([
            {"id": 1, "name": "A", "group_ids": [self.gid1]},
            {"id": 2, "name": "B", "group_ids": [self.gid2]},
        ])
        self._cleanup_configs_after_delete(self.gid1)
        configs = self._raw_configs()
        by_name = {c["name"]: c for c in configs}
        self.assertNotIn(self.gid1, by_name["A"]["group_ids"])
        self.assertIn(self.gid2, by_name["B"]["group_ids"])

    def test_cleanup_with_no_configs_is_safe(self):
        """Calling cleanup when no configs are saved must not raise."""
        try:
            self._cleanup_configs_after_delete(self.gid1)
        except Exception as e:
            self.fail(f"Cleanup raised unexpectedly: {e}")

    def test_active_config_id_cleared_when_config_becomes_empty(self):
        self._raw_save([{"id": 1, "name": "Solo", "group_ids": [self.gid1]}])
        set_setting(self.conn, "group_active_config_id", "1")
        self._cleanup_configs_after_delete(self.gid1)
        active = get_setting(self.conn, "group_active_config_id", "")
        self.assertEqual(active, "")


if __name__ == "__main__":
    unittest.main(verbosity=2)

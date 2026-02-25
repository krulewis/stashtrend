"""
Tests for Phase 4 — auto-sync scheduling (settings table + /api/settings endpoints).

Covers:
  - settings table DDL: CREATE TABLE IF NOT EXISTS settings (key PK, value)
  - get_setting(): returns default when key absent, returns stored value when present
  - set_setting(): inserts new key, upserts existing key (no duplicates)
  - GET /api/settings: returns {"sync_interval_hours": int}, defaults to 0
  - POST /api/settings: persists interval, calls _reschedule, validates input
  - _reschedule(): adds APScheduler job when interval > 0, removes when interval == 0

These tests mock APScheduler's scheduler object and sqlite get_db where needed
so no live scheduler threads or real DB files are required.
"""

import json
import sqlite3
import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


# ---------------------------------------------------------------------------
# Helper — in-memory DB with the full dashboard DDL applied
# ---------------------------------------------------------------------------

def make_db():
    """Create an in-memory SQLite DB with DASHBOARD_DDL applied."""
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    from app import DASHBOARD_DDL
    conn.executescript(DASHBOARD_DDL)
    return conn


# ===========================================================================
# DDL — settings table structure
# ===========================================================================

class TestSettingsTable(unittest.TestCase):
    """DASHBOARD_DDL creates a settings table with correct schema."""

    def setUp(self):
        self.conn = make_db()

    def tearDown(self):
        self.conn.close()

    def test_settings_table_exists(self):
        tables = [
            r[0] for r in self.conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).fetchall()
        ]
        self.assertIn("settings", tables)

    def test_settings_table_has_key_column(self):
        cols = [r[1] for r in self.conn.execute("PRAGMA table_info(settings)").fetchall()]
        self.assertIn("key", cols)

    def test_settings_table_has_value_column(self):
        cols = [r[1] for r in self.conn.execute("PRAGMA table_info(settings)").fetchall()]
        self.assertIn("value", cols)

    def test_key_is_primary_key(self):
        pk_cols = [
            r[1] for r in self.conn.execute("PRAGMA table_info(settings)").fetchall()
            if r[5] == 1  # pk flag
        ]
        self.assertIn("key", pk_cols)

    def test_existing_tables_still_present(self):
        """Adding settings table doesn't break account_groups or sync_jobs tables."""
        tables = [
            r[0] for r in self.conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).fetchall()
        ]
        self.assertIn("account_groups", tables)
        self.assertIn("sync_jobs", tables)


# ===========================================================================
# get_setting() helper
# ===========================================================================

class TestGetSetting(unittest.TestCase):
    """get_setting() retrieves a setting value with optional default."""

    def setUp(self):
        from app import get_setting
        self.get_setting = get_setting
        self.conn = make_db()

    def tearDown(self):
        self.conn.close()

    def test_returns_default_when_key_not_found(self):
        result = self.get_setting(self.conn, "nonexistent_key", "fallback")
        self.assertEqual(result, "fallback")

    def test_returns_none_when_default_not_specified(self):
        result = self.get_setting(self.conn, "nonexistent_key")
        self.assertIsNone(result)

    def test_returns_stored_value(self):
        self.conn.execute("INSERT INTO settings (key, value) VALUES ('x', 'hello')")
        self.conn.commit()
        self.assertEqual(self.get_setting(self.conn, "x"), "hello")

    def test_returns_correct_value_for_specific_key(self):
        self.conn.execute("INSERT INTO settings (key, value) VALUES ('a', '1')")
        self.conn.execute("INSERT INTO settings (key, value) VALUES ('b', '99')")
        self.conn.commit()
        self.assertEqual(self.get_setting(self.conn, "a"), "1")
        self.assertEqual(self.get_setting(self.conn, "b"), "99")

    def test_ignores_default_when_value_stored(self):
        self.conn.execute("INSERT INTO settings (key, value) VALUES ('k', 'real')")
        self.conn.commit()
        self.assertEqual(self.get_setting(self.conn, "k", "ignored"), "real")


# ===========================================================================
# set_setting() helper
# ===========================================================================

class TestSetSetting(unittest.TestCase):
    """set_setting() inserts or upserts a setting key/value pair."""

    def setUp(self):
        from app import get_setting, set_setting
        self.get_setting = get_setting
        self.set_setting = set_setting
        self.conn = make_db()

    def tearDown(self):
        self.conn.close()

    def test_inserts_new_key(self):
        self.set_setting(self.conn, "sync_interval_hours", "6")
        self.assertEqual(self.get_setting(self.conn, "sync_interval_hours"), "6")

    def test_updates_existing_key(self):
        self.set_setting(self.conn, "sync_interval_hours", "6")
        self.set_setting(self.conn, "sync_interval_hours", "12")
        self.assertEqual(self.get_setting(self.conn, "sync_interval_hours"), "12")

    def test_does_not_create_duplicate_rows_on_update(self):
        self.set_setting(self.conn, "sync_interval_hours", "1")
        self.set_setting(self.conn, "sync_interval_hours", "2")
        count = self.conn.execute(
            "SELECT COUNT(*) FROM settings WHERE key='sync_interval_hours'"
        ).fetchone()[0]
        self.assertEqual(count, 1)

    def test_multiple_keys_coexist(self):
        self.set_setting(self.conn, "key_a", "alpha")
        self.set_setting(self.conn, "key_b", "beta")
        self.assertEqual(self.get_setting(self.conn, "key_a"), "alpha")
        self.assertEqual(self.get_setting(self.conn, "key_b"), "beta")


# ===========================================================================
# GET /api/settings
# ===========================================================================

class TestGetSettingsEndpoint(unittest.TestCase):
    """GET /api/settings returns current settings with defaults."""

    def setUp(self):
        from app import app
        self.client = app.test_client()

    def test_returns_200(self):
        with patch("app.get_db") as mock_get_db:
            mock_get_db.return_value = make_db()
            resp = self.client.get("/api/settings")
            self.assertEqual(resp.status_code, 200)

    def test_returns_sync_interval_hours_field(self):
        with patch("app.get_db") as mock_get_db:
            mock_get_db.return_value = make_db()
            resp = self.client.get("/api/settings")
            data = json.loads(resp.data)
            self.assertIn("sync_interval_hours", data)

    def test_default_interval_is_zero(self):
        """When settings table is empty, sync_interval_hours defaults to 0."""
        with patch("app.get_db") as mock_get_db:
            mock_get_db.return_value = make_db()
            resp = self.client.get("/api/settings")
            data = json.loads(resp.data)
            self.assertEqual(data["sync_interval_hours"], 0)

    def test_returns_stored_interval(self):
        with patch("app.get_db") as mock_get_db:
            db = make_db()
            db.execute("INSERT INTO settings (key, value) VALUES ('sync_interval_hours', '8')")
            db.commit()
            mock_get_db.return_value = db
            resp = self.client.get("/api/settings")
            data = json.loads(resp.data)
            self.assertEqual(data["sync_interval_hours"], 8)

    def test_returns_integer_not_string(self):
        with patch("app.get_db") as mock_get_db:
            db = make_db()
            db.execute("INSERT INTO settings (key, value) VALUES ('sync_interval_hours', '24')")
            db.commit()
            mock_get_db.return_value = db
            resp = self.client.get("/api/settings")
            data = json.loads(resp.data)
            self.assertIsInstance(data["sync_interval_hours"], int)


# ===========================================================================
# POST /api/settings
# ===========================================================================

class TestUpdateSettingsEndpoint(unittest.TestCase):
    """POST /api/settings persists interval and triggers _reschedule."""

    def setUp(self):
        from app import app
        self.client = app.test_client()

    def _post(self, body, db=None):
        """Helper: POST /api/settings with a mocked DB and mocked _reschedule."""
        db = db or make_db()
        with patch("app.get_db", return_value=db), patch("app._reschedule") as mock_reschedule:
            resp = self.client.post("/api/settings", json=body)
            return resp, db, mock_reschedule

    def test_returns_200_for_valid_interval(self):
        resp, _, _ = self._post({"sync_interval_hours": 6})
        self.assertEqual(resp.status_code, 200)

    def test_persists_interval_to_db(self):
        # Prevent the endpoint from closing the connection so we can query it after
        db = make_db()
        db.close = lambda: None
        with patch("app.get_db", return_value=db), patch("app._reschedule"):
            self.client.post("/api/settings", json={"sync_interval_hours": 6})
        row = db.execute(
            "SELECT value FROM settings WHERE key='sync_interval_hours'"
        ).fetchone()
        self.assertIsNotNone(row)
        self.assertEqual(row[0], "6")

    def test_calls_reschedule_with_correct_interval(self):
        _, _, mock_reschedule = self._post({"sync_interval_hours": 12})
        mock_reschedule.assert_called_once_with(12)

    def test_zero_interval_is_valid_and_calls_reschedule(self):
        """0 = disabled is a valid value."""
        resp, _, mock_reschedule = self._post({"sync_interval_hours": 0})
        self.assertEqual(resp.status_code, 200)
        mock_reschedule.assert_called_once_with(0)

    def test_returns_sync_interval_hours_in_response(self):
        resp, _, _ = self._post({"sync_interval_hours": 8})
        data = json.loads(resp.data)
        self.assertEqual(data["sync_interval_hours"], 8)

    def test_returns_400_for_negative_interval(self):
        resp, _, _ = self._post({"sync_interval_hours": -1})
        self.assertEqual(resp.status_code, 400)
        data = json.loads(resp.data)
        self.assertIn("error", data)

    def test_returns_400_for_non_integer_string(self):
        resp, _, _ = self._post({"sync_interval_hours": "six"})
        self.assertEqual(resp.status_code, 400)

    def test_returns_400_for_float(self):
        """Floats are rejected — interval must be a whole number of hours."""
        resp, _, _ = self._post({"sync_interval_hours": 1.5})
        self.assertEqual(resp.status_code, 400)

    def test_returns_400_when_key_missing(self):
        resp, _, _ = self._post({})
        self.assertEqual(resp.status_code, 400)

    def test_does_not_call_reschedule_on_invalid_input(self):
        _, _, mock_reschedule = self._post({"sync_interval_hours": -5})
        mock_reschedule.assert_not_called()


# ===========================================================================
# _reschedule() — APScheduler interaction
# ===========================================================================

class TestReschedule(unittest.TestCase):
    """_reschedule() manages a single APScheduler interval job."""

    def setUp(self):
        import app as app_module
        self._app = app_module

    def _mock_scheduler(self, has_existing_job=False):
        mock = MagicMock()
        mock.get_job.return_value = MagicMock() if has_existing_job else None
        return mock

    def test_adds_job_when_interval_positive(self):
        mock_sched = self._mock_scheduler(has_existing_job=False)
        with patch.object(self._app, "scheduler", mock_sched):
            self._app._reschedule(6)
        mock_sched.add_job.assert_called_once()

    def test_adds_job_with_correct_interval_hours(self):
        mock_sched = self._mock_scheduler(has_existing_job=False)
        with patch.object(self._app, "scheduler", mock_sched):
            self._app._reschedule(6)
        call_kwargs = mock_sched.add_job.call_args[1]
        self.assertEqual(call_kwargs["hours"], 6)

    def test_adds_interval_trigger(self):
        mock_sched = self._mock_scheduler(has_existing_job=False)
        with patch.object(self._app, "scheduler", mock_sched):
            self._app._reschedule(4)
        call_args = mock_sched.add_job.call_args
        # Second positional arg is the trigger type
        self.assertEqual(call_args[0][1], "interval")

    def test_removes_existing_job_before_adding_new(self):
        mock_sched = self._mock_scheduler(has_existing_job=True)
        with patch.object(self._app, "scheduler", mock_sched):
            self._app._reschedule(6)
        mock_sched.remove_job.assert_called_once()
        mock_sched.add_job.assert_called_once()

    def test_removes_job_when_interval_is_zero(self):
        mock_sched = self._mock_scheduler(has_existing_job=True)
        with patch.object(self._app, "scheduler", mock_sched):
            self._app._reschedule(0)
        mock_sched.remove_job.assert_called_once()
        mock_sched.add_job.assert_not_called()

    def test_no_remove_when_no_existing_job_and_interval_zero(self):
        mock_sched = self._mock_scheduler(has_existing_job=False)
        with patch.object(self._app, "scheduler", mock_sched):
            self._app._reschedule(0)
        mock_sched.remove_job.assert_not_called()
        mock_sched.add_job.assert_not_called()

    def test_consistent_job_id_used_across_get_remove_add(self):
        """Only one auto-sync job ever exists — identified by a constant ID."""
        mock_sched = self._mock_scheduler(has_existing_job=True)
        with patch.object(self._app, "scheduler", mock_sched):
            self._app._reschedule(3)
        get_id  = mock_sched.get_job.call_args[0][0]
        rem_id  = mock_sched.remove_job.call_args[0][0]
        add_id  = mock_sched.add_job.call_args[1]["id"]
        self.assertEqual(get_id, rem_id)
        self.assertEqual(get_id, add_id)


if __name__ == "__main__":
    unittest.main()

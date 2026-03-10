"""
Tests for SQLite improvements:
  - WAL mode enabled on new connections
  - Connection context manager auto-closes and sets pragmas
  - Shared test DDL via test_helpers fixtures matches canonical sources
"""

import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent.parent))


class TestWALMode(unittest.TestCase):
    """get_db() should enable WAL journal mode."""

    def test_wal_mode_enabled(self):
        """Connections from get_db() use WAL journal mode."""
        with tempfile.NamedTemporaryFile(suffix=".db") as tmp:
            with patch("db.DB_PATH", tmp.name):
                from app import get_db
                conn = get_db()
                mode = conn.execute("PRAGMA journal_mode").fetchone()[0]
                conn.close()
            self.assertEqual(mode, "wal")


class TestConnectionContextManager(unittest.TestCase):
    """get_db_connection() context manager should auto-close and configure pragmas."""

    def test_auto_closes_on_exit(self):
        """Connection is closed after exiting the context manager."""
        with patch("db.DB_PATH", ":memory:"):
            from app import get_db_connection
            with get_db_connection() as conn:
                conn.execute("SELECT 1")
            with self.assertRaises(Exception):
                conn.execute("SELECT 1")

    def test_foreign_keys_enabled(self):
        """Context manager enables foreign keys."""
        with patch("db.DB_PATH", ":memory:"):
            from app import get_db_connection
            with get_db_connection() as conn:
                fk = conn.execute("PRAGMA foreign_keys").fetchone()[0]
        self.assertEqual(fk, 1)

    def test_wal_mode_enabled(self):
        """Context manager enables WAL mode on file-backed DBs."""
        with tempfile.NamedTemporaryFile(suffix=".db") as tmp:
            with patch("db.DB_PATH", tmp.name):
                from app import get_db_connection
                with get_db_connection() as conn:
                    mode = conn.execute("PRAGMA journal_mode").fetchone()[0]
            self.assertEqual(mode, "wal")

    def test_row_factory_set(self):
        """Context manager sets row_factory to sqlite3.Row."""
        with patch("db.DB_PATH", ":memory:"):
            from app import get_db_connection
            with get_db_connection() as conn:
                self.assertEqual(conn.row_factory, sqlite3.Row)

    def test_closes_on_exception(self):
        """Connection is closed even if an exception occurs inside the block."""
        with patch("db.DB_PATH", ":memory:"):
            from app import get_db_connection
            try:
                with get_db_connection() as conn:
                    raise ValueError("deliberate error")
            except ValueError:
                pass
            with self.assertRaises(Exception):
                conn.execute("SELECT 1")


class TestSharedTestDDL(unittest.TestCase):
    """test_helpers.make_test_db() should produce a DB with all canonical tables."""

    def test_all_pipeline_tables_exist(self):
        """Test DB has all pipeline tables from schema.py."""
        from tests.test_helpers import make_test_db
        conn = make_test_db()
        tables = {row[0] for row in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).fetchall()}
        for expected in ["accounts", "account_history", "categories", "transactions", "budgets", "sync_log"]:
            self.assertIn(expected, tables, f"Missing pipeline table: {expected}")
        conn.close()

    def test_all_dashboard_tables_exist(self):
        """Test DB has all dashboard tables from app.py."""
        from tests.test_helpers import make_test_db
        conn = make_test_db()
        tables = {row[0] for row in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).fetchall()}
        for expected in ["account_groups", "account_group_members", "settings", "sync_jobs",
                         "budget_builder_profile", "budget_builder_regional", "budget_builder_plans"]:
            self.assertIn(expected, tables, f"Missing dashboard table: {expected}")
        conn.close()

    def test_foreign_keys_enabled(self):
        """Test DB has foreign keys enabled."""
        from tests.test_helpers import make_test_db
        conn = make_test_db()
        fk = conn.execute("PRAGMA foreign_keys").fetchone()[0]
        self.assertEqual(fk, 1)
        conn.close()

    def test_ddl_matches_canonical_source(self):
        """Pipeline DDL in test_helpers comes from the actual schema.py, not a copy."""
        from tests.test_helpers import PIPELINE_DDL
        from monarch_pipeline.schema import DDL as canonical_ddl
        self.assertEqual(PIPELINE_DDL, canonical_ddl)


if __name__ == "__main__":
    unittest.main()

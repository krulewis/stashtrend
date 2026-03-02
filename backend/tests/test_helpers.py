"""
Shared test fixtures — canonical DDL imported from source-of-truth modules.

All test files should use make_test_db() instead of defining their own DDL.
This eliminates schema drift between tests and the real application.
"""

import sqlite3
import sys
from pathlib import Path

# Make app and pipeline importable from tests/
sys.path.insert(0, str(Path(__file__).parent.parent))

from app import DASHBOARD_DDL
from monarch_pipeline.schema import DDL as PIPELINE_DDL


def make_test_db(pipeline=True, dashboard=True):
    """
    Create an in-memory SQLite DB with canonical DDL applied.

    Args:
        pipeline: Include pipeline tables (accounts, transactions, etc.)
        dashboard: Include dashboard tables (account_groups, settings, etc.)
    """
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    if pipeline:
        conn.executescript(PIPELINE_DDL)
    if dashboard:
        conn.executescript(DASHBOARD_DDL)
    return conn

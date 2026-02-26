import sys
import sqlite3
import unittest
from pathlib import Path
from unittest.mock import patch, MagicMock

sys.path.insert(0, str(Path(__file__).parent.parent))
from app import DASHBOARD_DDL, app

# Pipeline DDL (settings table is in DASHBOARD_DDL, but included for completeness)
PIPELINE_DDL = """
CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY, name TEXT NOT NULL,
    group_id TEXT, group_name TEXT, group_type TEXT
);
CREATE TABLE IF NOT EXISTS budgets (
    category_id TEXT NOT NULL, month TEXT NOT NULL,
    budgeted_amount REAL, actual_amount REAL, variance REAL,
    PRIMARY KEY (category_id, month)
);
"""


def make_db():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.executescript(PIPELINE_DDL)
    conn.executescript(DASHBOARD_DDL)
    return conn


class TestAIConfig(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    def test_get_config_unconfigured(self):
        with patch("app.get_db", return_value=make_db()):
            resp = self.client.get("/api/ai/config")
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertFalse(data["configured"])

    def test_save_config_success(self):
        with patch("app.get_db", return_value=make_db()):
            resp = self.client.post("/api/ai/config", json={
                "api_key":  "test-key-abc",
                "model":    "claude-opus-4-5",
                "provider": "anthropic",
                "base_url": "",
            })
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.get_json()["ok"])

    def test_save_config_then_get_shows_configured(self):
        db = make_db()
        with patch("app.get_db", return_value=db):
            self.client.post("/api/ai/config", json={
                "api_key": "key", "model": "claude-opus-4-5",
                "provider": "anthropic",
            })
        with patch("app.get_db", return_value=db):
            resp = self.client.get("/api/ai/config")
        data = resp.get_json()
        self.assertTrue(data["configured"])
        self.assertEqual(data["model"], "claude-opus-4-5")
        self.assertEqual(data["provider"], "anthropic")

    def test_get_config_never_returns_api_key(self):
        db = make_db()
        with patch("app.get_db", return_value=db):
            self.client.post("/api/ai/config", json={
                "api_key": "super-secret", "model": "gpt-4o",
                "provider": "openai_compatible",
            })
        with patch("app.get_db", return_value=db):
            resp = self.client.get("/api/ai/config")
        data = resp.get_json()
        self.assertNotIn("api_key", data)
        self.assertNotIn("super-secret", str(data))

    def test_save_config_invalid_provider(self):
        with patch("app.get_db", return_value=make_db()):
            resp = self.client.post("/api/ai/config", json={
                "api_key": "key", "model": "gpt-4o",
                "provider": "unknown_llm",
            })
        self.assertEqual(resp.status_code, 400)

    def test_save_config_missing_required_field(self):
        with patch("app.get_db", return_value=make_db()):
            resp = self.client.post("/api/ai/config", json={
                "api_key": "key",
                # missing model and provider
            })
        self.assertEqual(resp.status_code, 400)

    def test_openai_compatible_saves_base_url(self):
        db = make_db()
        with patch("app.get_db", return_value=db):
            self.client.post("/api/ai/config", json={
                "api_key": "key", "model": "llama3",
                "provider": "openai_compatible",
                "base_url": "http://localhost:11434/v1",
            })
        with patch("app.get_db", return_value=db):
            resp = self.client.get("/api/ai/config")
        self.assertEqual(resp.get_json()["base_url"], "http://localhost:11434/v1")


if __name__ == "__main__":
    unittest.main()

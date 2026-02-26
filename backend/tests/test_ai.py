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


class TestAIAnalyze(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    def _configured_db(self, provider="anthropic"):
        db = make_db()
        # Seed categories + budget data
        db.execute(
            "INSERT OR IGNORE INTO categories (id, name, group_name) VALUES (?, ?, ?)",
            ("cat_1", "Groceries", "Food & Drink"),
        )
        db.execute(
            "INSERT OR IGNORE INTO budgets VALUES (?, ?, ?, ?, ?)",
            ("cat_1", "2025-11-01", 500.0, 523.0, -23.0),
        )
        db.execute(
            "INSERT OR IGNORE INTO budgets VALUES (?, ?, ?, ?, ?)",
            ("cat_1", "2025-12-01", 500.0, 489.0, 11.0),
        )
        db.commit()
        # Save AI config
        from app import set_setting
        set_setting(db, "ai_api_key",  "test-key")
        set_setting(db, "ai_model",    "claude-opus-4-5")
        set_setting(db, "ai_provider", provider)
        set_setting(db, "ai_base_url", "")
        return db

    def test_analyze_returns_400_when_not_configured(self):
        with patch("app.get_db", return_value=make_db()):
            resp = self.client.post("/api/ai/analyze")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("configured", resp.get_json()["error"].lower())

    def test_analyze_anthropic_returns_analysis(self):
        mock_msg = MagicMock()
        mock_msg.content = [MagicMock(text="Groceries is consistently over budget.")]

        mock_client = MagicMock()
        mock_client.messages.create.return_value = mock_msg

        with patch("app.get_db", return_value=self._configured_db("anthropic")):
            with patch("anthropic.Anthropic", return_value=mock_client):
                resp = self.client.post("/api/ai/analyze")

        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertIn("analysis", data)
        self.assertEqual(data["analysis"], "Groceries is consistently over budget.")
        self.assertEqual(data["provider"], "anthropic")

    def test_analyze_prompt_contains_budget_data(self):
        captured = {}

        def capture_call(**kwargs):
            captured["messages"] = kwargs.get("messages", [])
            mock_msg = MagicMock()
            mock_msg.content = [MagicMock(text="Analysis result.")]
            return mock_msg

        mock_client = MagicMock()
        mock_client.messages.create.side_effect = capture_call

        with patch("app.get_db", return_value=self._configured_db("anthropic")):
            with patch("anthropic.Anthropic", return_value=mock_client):
                self.client.post("/api/ai/analyze")

        prompt = captured["messages"][0]["content"]
        self.assertIn("budget", prompt.lower())
        self.assertIn("Groceries", prompt)

    def test_analyze_openai_compatible_returns_analysis(self):
        mock_choice = MagicMock()
        mock_choice.message.content = "Spending looks off."
        mock_resp = MagicMock()
        mock_resp.choices = [mock_choice]

        mock_client = MagicMock()
        mock_client.chat.completions.create.return_value = mock_resp

        with patch("app.get_db", return_value=self._configured_db("openai_compatible")):
            with patch("openai.OpenAI", return_value=mock_client):
                resp = self.client.post("/api/ai/analyze")

        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.get_json()["analysis"], "Spending looks off.")

    def test_analyze_returns_400_when_no_budget_data(self):
        db = make_db()
        from app import set_setting
        set_setting(db, "ai_api_key",  "key")
        set_setting(db, "ai_model",    "claude-opus-4-5")
        set_setting(db, "ai_provider", "anthropic")
        set_setting(db, "ai_base_url", "")
        # No budget rows seeded
        with patch("app.get_db", return_value=db):
            resp = self.client.post("/api/ai/analyze")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("budget data", resp.get_json()["error"].lower())

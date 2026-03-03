"""
Security tests — OWASP Top 10 remediation.

All tests should FAIL before implementation and PASS after.
Grouped by finding number.
"""

import re
import sys
import time
import unittest
from pathlib import Path
from unittest.mock import patch, MagicMock

import keyring.errors

sys.path.insert(0, str(Path(__file__).parent.parent))
from app import app
from tests.test_helpers import make_test_db


def make_db():
    return make_test_db()


# ── Finding 1: Debug mode ──────────────────────────────────────────────────


class TestDebugMode(unittest.TestCase):
    def test_debug_mode_off_by_default(self):
        """Debug must be off unless FLASK_DEBUG env is set."""
        # The app module sets debug at run-time via os.environ;
        # with no env var, app.debug should be False.
        self.assertFalse(app.debug)


# ── Finding 2: CORS ────────────────────────────────────────────────────────


class TestCORS(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    def test_cors_rejects_foreign_origin(self):
        """Requests from evil.com must NOT get an Access-Control-Allow-Origin header."""
        with patch("app.get_db", return_value=make_db()):
            resp = self.client.get(
                "/api/setup/status",
                headers={"Origin": "https://evil.com"},
            )
        acao = resp.headers.get("Access-Control-Allow-Origin")
        self.assertIsNone(acao, f"Foreign origin got ACAO header: {acao}")

    def test_cors_allows_localhost(self):
        """Requests from localhost:5173 (React dev) must get ACAO header."""
        with patch("app.get_db", return_value=make_db()):
            resp = self.client.get(
                "/api/setup/status",
                headers={"Origin": "http://localhost:5173"},
            )
        acao = resp.headers.get("Access-Control-Allow-Origin")
        self.assertEqual(acao, "http://localhost:5173")


# ── Finding 3: AI key in keychain ──────────────────────────────────────────


class TestAIKeyKeychain(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    def test_ai_key_saved_to_keychain(self):
        """save_ai_config should attempt keychain storage via auth.save_ai_key."""
        db = make_db()
        with patch("app.get_db", return_value=db), \
             patch("app.auth.save_ai_key") as mock_save:
            resp = self.client.post("/api/ai/config", json={
                "api_key": "test-key-123",
                "model": "claude-opus-4-5",
                "provider": "anthropic",
            })
        self.assertEqual(resp.status_code, 200)
        mock_save.assert_called_once_with("test-key-123")

    def test_ai_key_falls_back_to_settings(self):
        """When keychain raises, key should be saved to settings table."""
        db = make_db()
        with patch("app.get_db", return_value=db), \
             patch("app.auth.save_ai_key", side_effect=keyring.errors.NoKeyringError("no keyring")):
            resp = self.client.post("/api/ai/config", json={
                "api_key": "fallback-key",
                "model": "claude-opus-4-5",
                "provider": "anthropic",
            })
        self.assertEqual(resp.status_code, 200)
        # Verify key landed in settings table
        from app import get_setting
        self.assertEqual(get_setting(db, "ai_api_key"), "fallback-key")

    def test_get_ai_key_prefers_keychain(self):
        """_get_ai_key should return keychain value over settings table value."""
        from app import _get_ai_key, set_setting
        db = make_db()
        set_setting(db, "ai_api_key", "db-key")

        with patch("app.auth.load_ai_key", return_value="keychain-key"):
            result = _get_ai_key(db)
        self.assertEqual(result, "keychain-key")

    def test_get_ai_config_uses_keychain(self):
        """GET /api/ai/config should report configured:True when key is only in keychain."""
        db = make_db()
        from app import set_setting
        # Set model and provider in DB but NOT the api_key
        set_setting(db, "ai_model", "claude-opus-4-5")
        set_setting(db, "ai_provider", "anthropic")

        with patch("app.get_db", return_value=db), \
             patch("app._get_ai_key", return_value="keychain-only-key"):
            resp = self.client.get("/api/ai/config")
        data = resp.get_json()
        self.assertTrue(data["configured"])


# ── Finding 4: Prompt injection sanitization ───────────────────────────────


class TestPromptSanitization(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    def test_sanitize_strips_control_chars(self):
        """Control chars (except \\n, \\t) must be removed."""
        from app import _sanitize_prompt_field
        dirty = "hello\x00\x01\x02world\nkeep\tthis"
        clean = _sanitize_prompt_field(dirty)
        self.assertNotIn("\x00", clean)
        self.assertNotIn("\x01", clean)
        self.assertNotIn("\x02", clean)
        self.assertIn("\n", clean)
        self.assertIn("\t", clean)
        self.assertIn("helloworld", clean)

    def test_sanitize_truncates(self):
        """Input longer than max_length must be truncated."""
        from app import _sanitize_prompt_field
        result = _sanitize_prompt_field("a" * 1000, max_length=50)
        self.assertEqual(len(result), 50)

    def test_profile_rejects_oversized_location(self):
        """save_builder_profile should return 400 for oversized location."""
        with patch("app.get_db", return_value=make_db()):
            resp = self.client.post("/api/budget-builder/profile", json={
                "expected_income": 5000,
                "location": "x" * 500,
                "housing_type": "rent",
            })
        self.assertEqual(resp.status_code, 400)


# ── Finding 5: Rate limiting ──────────────────────────────────────────────


class TestRateLimiting(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    def _configured_db(self):
        db = make_db()
        from app import set_setting
        set_setting(db, "ai_api_key", "test-key")
        set_setting(db, "ai_model", "claude-opus-4-5")
        set_setting(db, "ai_provider", "anthropic")
        set_setting(db, "ai_base_url", "")
        # Seed category + budget data for ai_analyze
        db.execute(
            "INSERT OR IGNORE INTO categories (id, name, group_name) VALUES (?, ?, ?)",
            ("cat_1", "Groceries", "Food & Drink"),
        )
        db.execute(
            "INSERT OR IGNORE INTO budgets VALUES (?, ?, ?, ?, ?)",
            ("cat_1", "2025-11-01", 500.0, 523.0, -23.0),
        )
        db.commit()
        return db

    def _mock_ai_call(self):
        """Return a mock that makes _call_ai succeed."""
        mock_msg = MagicMock()
        mock_msg.content = [MagicMock(text="Analysis result.")]
        mock_client = MagicMock()
        mock_client.messages.create.return_value = mock_msg
        return mock_client

    def test_rate_limit_allows_first_call(self):
        """First call to an AI endpoint should succeed (not 429)."""
        import app as app_module
        # Clear cooldowns before test
        app_module._ai_cooldowns.clear()

        mock_client = self._mock_ai_call()
        db = self._configured_db()
        with patch("app.get_db", return_value=db), \
             patch("app._get_ai_key", return_value="test-key"), \
             patch("anthropic.Anthropic", return_value=mock_client):
            resp = self.client.post("/api/ai/analyze")
        self.assertNotEqual(resp.status_code, 429)

    def test_rate_limit_blocks_rapid_call(self):
        """Immediate second call to the same endpoint should return 429."""
        import app as app_module
        app_module._ai_cooldowns.clear()

        mock_client = self._mock_ai_call()
        db = self._configured_db()
        with patch("app.get_db", return_value=db), \
             patch("app._get_ai_key", return_value="test-key"), \
             patch("anthropic.Anthropic", return_value=mock_client):
            self.client.post("/api/ai/analyze")
            # Immediate second call
            resp2 = self.client.post("/api/ai/analyze")
        self.assertEqual(resp2.status_code, 429)

    def test_rate_limit_per_endpoint(self):
        """Different AI endpoints should not block each other."""
        import app as app_module
        app_module._ai_cooldowns.clear()

        db = self._configured_db()
        # Seed a profile with location for regional fetch
        db.execute(
            """INSERT INTO budget_builder_profile (id, expected_income, location, housing_type)
               VALUES (1, 5000, 'Austin, TX', 'rent')"""
        )
        db.commit()

        mock_client = self._mock_ai_call()
        # Also mock _call_ai for regional endpoint
        with patch("app.get_db", return_value=db), \
             patch("app._get_ai_key", return_value="test-key"), \
             patch("anthropic.Anthropic", return_value=mock_client), \
             patch("app._call_ai", return_value=('{"food_cost_trend":"$300"}', "end_turn", "anthropic")):
            # First call to analyze
            resp1 = self.client.post("/api/ai/analyze")
            # First call to regional — should NOT be blocked by analyze cooldown
            resp2 = self.client.post("/api/budget-builder/regional/fetch")
        self.assertNotEqual(resp1.status_code, 429)
        self.assertNotEqual(resp2.status_code, 429)


# ── Finding 6: Error message sanitization ──────────────────────────────────


class TestErrorSanitization(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    def test_error_messages_no_internals(self):
        """AI errors must not leak exception text to the client."""
        db = make_db()
        from app import set_setting
        set_setting(db, "ai_api_key", "test-key")
        set_setting(db, "ai_model", "claude-opus-4-5")
        set_setting(db, "ai_provider", "anthropic")
        set_setting(db, "ai_base_url", "")
        # Seed budget data
        db.execute(
            "INSERT OR IGNORE INTO categories (id, name, group_name) VALUES (?, ?, ?)",
            ("cat_1", "Groceries", "Food & Drink"),
        )
        db.execute(
            "INSERT OR IGNORE INTO budgets VALUES (?, ?, ?, ?, ?)",
            ("cat_1", "2025-11-01", 500.0, 523.0, -23.0),
        )
        db.commit()

        import app as app_module
        app_module._ai_cooldowns.clear()

        secret_msg = "SecretInternalError: database connection at /var/db/prod"
        with patch("app.get_db", return_value=db), \
             patch("app._get_ai_key", return_value="test-key"), \
             patch("app._call_ai", side_effect=Exception(secret_msg)):
            resp = self.client.post("/api/ai/analyze")
        self.assertNotEqual(resp.status_code, 200)
        body = resp.get_json()
        self.assertNotIn("SecretInternalError", body.get("error", ""))
        self.assertNotIn("/var/db/prod", body.get("error", ""))

    def test_global_error_handler(self):
        """Unhandled exceptions should return a generic 500."""
        with patch("app.has_token", side_effect=RuntimeError("kaboom")):
            resp = self.client.get("/api/setup/status")
        self.assertEqual(resp.status_code, 500)
        body = resp.get_json()
        self.assertNotIn("kaboom", body.get("error", ""))
        self.assertEqual(body["error"], "Internal server error")


if __name__ == "__main__":
    unittest.main()

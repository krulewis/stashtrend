"""
Tests for the token setup / configuration endpoints.

Covers:
  - bootstrap_token_from_env(): reads MONARCH_TOKEN env var, writes to file,
    clears the env var
  - has_token(): returns True/False based on token file presence
  - GET /api/setup/status: returns {"configured": bool}
  - POST /api/setup/token: validates token via Monarch API, saves on success,
    returns 400 on invalid token, 400 on missing token

These tests mock auth.login_with_token and auth.load_token so no live
Monarch API calls are made.
"""

import json
import os
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

# ---------------------------------------------------------------------------
# Import the functions under test from app.py.
# We patch DB_PATH to an in-memory sentinel so app startup side-effects
# (init_dashboard_schema) don't require a real database file.
# ---------------------------------------------------------------------------

# Patch DB_PATH before importing app so sqlite3.connect doesn't fail
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


class TestBootstrapTokenFromEnv(unittest.TestCase):
    """bootstrap_token_from_env() bridges MONARCH_TOKEN env var → token file."""

    def setUp(self):
        # Import here so patching works correctly
        from app import bootstrap_token_from_env
        self.bootstrap = bootstrap_token_from_env

    def test_writes_token_when_env_var_set(self):
        """When MONARCH_TOKEN is set, save_token is called with its value."""
        with patch.dict(os.environ, {"MONARCH_TOKEN": "test-token-abc"}):
            with patch("app.auth.save_token") as mock_save:
                self.bootstrap()
                mock_save.assert_called_once_with("test-token-abc", unittest.mock.ANY)

    def test_clears_env_var_after_write(self):
        """MONARCH_TOKEN is removed from os.environ after being consumed."""
        with patch.dict(os.environ, {"MONARCH_TOKEN": "test-token-abc"}):
            with patch("app.auth.save_token"):
                self.bootstrap()
                self.assertNotIn("MONARCH_TOKEN", os.environ)

    def test_strips_whitespace_from_token(self):
        """Leading/trailing whitespace is stripped before saving."""
        with patch.dict(os.environ, {"MONARCH_TOKEN": "  token-with-spaces  "}):
            with patch("app.auth.save_token") as mock_save:
                self.bootstrap()
                mock_save.assert_called_once_with("token-with-spaces", unittest.mock.ANY)

    def test_does_nothing_when_env_var_absent(self):
        """If MONARCH_TOKEN is not set, save_token is never called."""
        env = {k: v for k, v in os.environ.items() if k != "MONARCH_TOKEN"}
        with patch.dict(os.environ, env, clear=True):
            with patch("app.auth.save_token") as mock_save:
                self.bootstrap()
                mock_save.assert_not_called()

    def test_does_nothing_when_env_var_empty(self):
        """If MONARCH_TOKEN is set but empty, save_token is never called."""
        with patch.dict(os.environ, {"MONARCH_TOKEN": "   "}):
            with patch("app.auth.save_token") as mock_save:
                self.bootstrap()
                mock_save.assert_not_called()


class TestHasToken(unittest.TestCase):
    """has_token() returns True if a token is stored, False otherwise."""

    def setUp(self):
        from app import has_token
        self.has_token = has_token

    def test_returns_true_when_token_exists(self):
        with patch("app.auth.load_token", return_value="some-token"):
            self.assertTrue(self.has_token())

    def test_returns_false_when_no_token(self):
        with patch("app.auth.load_token", return_value=None):
            self.assertFalse(self.has_token())


class TestSetupStatusEndpoint(unittest.TestCase):
    """GET /api/setup/status returns {"configured": bool}."""

    def setUp(self):
        from app import app
        self.client = app.test_client()

    def test_returns_configured_true_when_token_present(self):
        with patch("app.auth.load_token", return_value="valid-token"):
            resp = self.client.get("/api/setup/status")
            self.assertEqual(resp.status_code, 200)
            data = json.loads(resp.data)
            self.assertTrue(data["configured"])

    def test_returns_configured_false_when_no_token(self):
        with patch("app.auth.load_token", return_value=None):
            resp = self.client.get("/api/setup/status")
            self.assertEqual(resp.status_code, 200)
            data = json.loads(resp.data)
            self.assertFalse(data["configured"])


class TestSetupTokenEndpoint(unittest.TestCase):
    """POST /api/setup/token validates and saves the token."""

    def setUp(self):
        from app import app
        self.client = app.test_client()

    def test_returns_200_on_valid_token(self):
        with patch("app.auth.login_with_token", new_callable=AsyncMock) as mock_login:
            resp = self.client.post(
                "/api/setup/token",
                json={"token": "valid-token-123"},
            )
            self.assertEqual(resp.status_code, 200)
            data = json.loads(resp.data)
            self.assertTrue(data["ok"])
            mock_login.assert_called_once()

    def test_passes_token_to_login_with_token(self):
        with patch("app.auth.login_with_token", new_callable=AsyncMock) as mock_login:
            self.client.post("/api/setup/token", json={"token": "my-token"})
            args = mock_login.call_args[0]
            self.assertEqual(args[0], "my-token")

    def test_returns_400_on_invalid_token(self):
        with patch(
            "app.auth.login_with_token",
            new_callable=AsyncMock,
            side_effect=Exception("Unauthorized"),
        ):
            resp = self.client.post(
                "/api/setup/token",
                json={"token": "bad-token"},
            )
            self.assertEqual(resp.status_code, 400)
            data = json.loads(resp.data)
            self.assertIn("error", data)

    def test_returns_400_when_token_missing_from_body(self):
        resp = self.client.post("/api/setup/token", json={})
        self.assertEqual(resp.status_code, 400)
        data = json.loads(resp.data)
        self.assertIn("error", data)

    def test_returns_400_when_body_is_empty(self):
        resp = self.client.post(
            "/api/setup/token",
            data="",
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_returns_400_when_token_is_blank(self):
        resp = self.client.post("/api/setup/token", json={"token": "   "})
        self.assertEqual(resp.status_code, 400)


if __name__ == "__main__":
    unittest.main()

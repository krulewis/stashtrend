"""Tests for GET /api/retirement and POST /api/retirement."""

import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent.parent))

from app import app
from tests.test_helpers import make_test_db


def make_db():
    return make_test_db()


class TestRetirementGet(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    def test_get_empty(self):
        """Returns exists=False when no row exists."""
        with patch("app.get_db", return_value=make_db()):
            resp = self.client.get("/api/retirement")
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(resp.get_json()["exists"])

    def test_get_returns_all_fields(self):
        """GET returns all expected fields including milestones deserialized."""
        db = make_db()
        db.execute(
            """INSERT INTO retirement_settings
               (id, current_age, target_retirement_age, desired_annual_income,
                monthly_contribution, expected_return_pct, inflation_rate_pct,
                social_security_annual, withdrawal_rate_pct, milestones)
               VALUES (1, 35, 65, 80000, 2000, 7.0, 2.5, 12000, 4.0, ?)""",
            (json.dumps([{"label": "Half-Mil", "amount": 500000}]),),
        )
        db.commit()
        with patch("app.get_db", return_value=db):
            resp = self.client.get("/api/retirement")
        data = resp.get_json()
        self.assertTrue(data["exists"])
        self.assertEqual(data["current_age"], 35)
        self.assertEqual(data["target_retirement_age"], 65)
        self.assertEqual(data["desired_annual_income"], 80000)
        self.assertEqual(data["monthly_contribution"], 2000)
        self.assertEqual(data["expected_return_pct"], 7.0)
        self.assertEqual(data["inflation_rate_pct"], 2.5)
        self.assertEqual(data["social_security_annual"], 12000)
        self.assertEqual(data["withdrawal_rate_pct"], 4.0)
        # Finding #6: milestones must be deserialized from JSON TEXT
        self.assertIsInstance(data["milestones"], list)
        self.assertEqual(data["milestones"][0]["amount"], 500000)

    def test_get_null_milestones_returns_empty_list(self):
        """GET returns empty list when milestones column is NULL."""
        db = make_db()
        db.execute(
            """INSERT INTO retirement_settings
               (id, current_age, target_retirement_age)
               VALUES (1, 30, 60)"""
        )
        db.commit()
        with patch("app.get_db", return_value=db):
            resp = self.client.get("/api/retirement")
        data = resp.get_json()
        self.assertTrue(data["exists"])
        self.assertEqual(data["milestones"], [])


class TestRetirementPost(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    # ── Finding #1: null/missing age validation ──────────────────────────────

    def test_post_missing_ages_returns_400(self):
        """Both ages are required."""
        with patch("app.get_db", return_value=make_db()):
            resp = self.client.post("/api/retirement", json={"current_age": 35})
        self.assertEqual(resp.status_code, 400)
        self.assertIn("required", resp.get_json()["error"].lower())

    def test_post_null_age_returns_400(self):
        """Null age values yield 400."""
        with patch("app.get_db", return_value=make_db()):
            resp = self.client.post("/api/retirement", json={
                "current_age": None, "target_retirement_age": 65,
            })
        self.assertEqual(resp.status_code, 400)

    def test_post_non_integer_age_returns_400(self):
        """Ages must be integers."""
        with patch("app.get_db", return_value=make_db()):
            resp = self.client.post("/api/retirement", json={
                "current_age": 35.5, "target_retirement_age": 65,
            })
        self.assertEqual(resp.status_code, 400)

    def test_post_zero_age_returns_400(self):
        """current_age must be positive."""
        with patch("app.get_db", return_value=make_db()):
            resp = self.client.post("/api/retirement", json={
                "current_age": 0, "target_retirement_age": 65,
            })
        self.assertEqual(resp.status_code, 400)

    def test_post_target_must_exceed_current(self):
        """target_retirement_age must be > current_age."""
        with patch("app.get_db", return_value=make_db()):
            resp = self.client.post("/api/retirement", json={
                "current_age": 65, "target_retirement_age": 60,
            })
        self.assertEqual(resp.status_code, 400)

    # ── Finding #11: upper bounds ────────────────────────────────────────────

    def test_post_age_upper_bound(self):
        """Ages capped at 120."""
        with patch("app.get_db", return_value=make_db()):
            resp = self.client.post("/api/retirement", json={
                "current_age": 121, "target_retirement_age": 130,
            })
        self.assertEqual(resp.status_code, 400)

    def test_post_withdrawal_rate_upper_bound(self):
        """withdrawal_rate_pct capped at 100."""
        with patch("app.get_db", return_value=make_db()):
            resp = self.client.post("/api/retirement", json={
                "current_age": 35, "target_retirement_age": 65,
                "withdrawal_rate_pct": 101,
            })
        self.assertEqual(resp.status_code, 400)

    # ── Finding #4: milestone validation ─────────────────────────────────────

    def test_post_milestone_amount_must_be_positive(self):
        """Milestone amount must be a positive number."""
        with patch("app.get_db", return_value=make_db()):
            resp = self.client.post("/api/retirement", json={
                "current_age": 35, "target_retirement_age": 65,
                "milestones": [{"label": "Bad", "amount": -1000}],
            })
        self.assertEqual(resp.status_code, 400)

    def test_post_milestone_label_max_length(self):
        """Milestone label max 100 chars."""
        with patch("app.get_db", return_value=make_db()):
            resp = self.client.post("/api/retirement", json={
                "current_age": 35, "target_retirement_age": 65,
                "milestones": [{"label": "x" * 101, "amount": 500000}],
            })
        self.assertEqual(resp.status_code, 400)

    def test_post_milestones_max_20(self):
        """Milestones capped at 20 items."""
        ms = [{"label": f"M{i}", "amount": i * 100000} for i in range(1, 22)]
        with patch("app.get_db", return_value=make_db()):
            resp = self.client.post("/api/retirement", json={
                "current_age": 35, "target_retirement_age": 65,
                "milestones": ms,
            })
        self.assertEqual(resp.status_code, 400)

    # ── Happy path ───────────────────────────────────────────────────────────

    def test_post_valid_saves_and_returns_ok(self):
        """Valid payload returns ok=True."""
        with patch("app.get_db", return_value=make_db()):
            resp = self.client.post("/api/retirement", json={
                "current_age": 35,
                "target_retirement_age": 65,
                "desired_annual_income": 80000,
                "monthly_contribution": 2000,
                "expected_return_pct": 7.0,
                "milestones": [{"label": "Half-Mil", "amount": 500000}],
            })
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.get_json()["ok"])

    def test_post_then_get_roundtrip(self):
        """POST then GET returns deserialized data with milestones as list."""
        db = make_db()
        payload = {
            "current_age": 35,
            "target_retirement_age": 65,
            "desired_annual_income": 80000,
            "monthly_contribution": 2000,
            "expected_return_pct": 7.0,
            "milestones": [{"label": "First Million", "amount": 1000000}],
        }
        with patch("app.get_db", return_value=db):
            self.client.post("/api/retirement", json=payload)
        with patch("app.get_db", return_value=db):
            resp = self.client.get("/api/retirement")
        data = resp.get_json()
        self.assertTrue(data["exists"])
        self.assertEqual(data["current_age"], 35)
        self.assertIsInstance(data["milestones"], list)
        self.assertEqual(data["milestones"][0]["amount"], 1000000)

    def test_post_upsert_overwrites(self):
        """Second POST overwrites previous values."""
        db = make_db()
        with patch("app.get_db", return_value=db):
            self.client.post("/api/retirement", json={
                "current_age": 35, "target_retirement_age": 65,
            })
        with patch("app.get_db", return_value=db):
            self.client.post("/api/retirement", json={
                "current_age": 40, "target_retirement_age": 67,
            })
        with patch("app.get_db", return_value=db):
            resp = self.client.get("/api/retirement")
        self.assertEqual(resp.get_json()["current_age"], 40)
        self.assertEqual(resp.get_json()["target_retirement_age"], 67)

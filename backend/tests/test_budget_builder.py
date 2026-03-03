import sys
import json
import unittest
from pathlib import Path
from unittest.mock import patch, MagicMock

sys.path.insert(0, str(Path(__file__).parent.parent))
from app import app
from tests.test_helpers import make_test_db


def make_db():
    return make_test_db()


# ── Profile CRUD ────────────────────────────────────────────────────────────

class TestBuilderProfile(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    def test_get_profile_empty(self):
        with patch("app.get_db", return_value=make_db()):
            resp = self.client.get("/api/budget-builder/profile")
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(resp.get_json()["exists"])

    def test_post_then_get_profile(self):
        db = make_db()
        payload = {
            "expected_income": 6000,
            "num_children": 2,
            "children_ages": [4, 7],
            "location": "Austin, TX",
            "housing_type": "rent",
            "upcoming_events": ["Spring soccer"],
            "other_info": "We eat out a lot",
        }
        with patch("app.get_db", return_value=db):
            resp = self.client.post("/api/budget-builder/profile", json=payload)
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.get_json()["ok"])

        with patch("app.get_db", return_value=db):
            resp = self.client.get("/api/budget-builder/profile")
        data = resp.get_json()
        self.assertTrue(data["exists"])
        self.assertEqual(data["expected_income"], 6000)
        self.assertEqual(data["num_children"], 2)
        self.assertEqual(data["children_ages"], [4, 7])
        self.assertEqual(data["location"], "Austin, TX")
        self.assertEqual(data["housing_type"], "rent")
        self.assertEqual(data["upcoming_events"], ["Spring soccer"])

    def test_post_update_profile(self):
        db = make_db()
        with patch("app.get_db", return_value=db):
            self.client.post("/api/budget-builder/profile", json={
                "expected_income": 5000, "location": "Dallas, TX",
                "housing_type": "own",
            })
        with patch("app.get_db", return_value=db):
            self.client.post("/api/budget-builder/profile", json={
                "expected_income": 7000, "location": "Austin, TX",
                "housing_type": "rent",
            })
        with patch("app.get_db", return_value=db):
            resp = self.client.get("/api/budget-builder/profile")
        data = resp.get_json()
        self.assertEqual(data["expected_income"], 7000)
        self.assertEqual(data["location"], "Austin, TX")

    def test_post_profile_invalid_children_ages(self):
        with patch("app.get_db", return_value=make_db()):
            resp = self.client.post("/api/budget-builder/profile", json={
                "expected_income": 5000, "children_ages": "not json array",
                "housing_type": "rent",
            })
        self.assertEqual(resp.status_code, 400)
        self.assertIn("children_ages", resp.get_json()["error"])

    def test_post_profile_invalid_upcoming_events(self):
        with patch("app.get_db", return_value=make_db()):
            resp = self.client.post("/api/budget-builder/profile", json={
                "expected_income": 5000, "upcoming_events": "not an array",
                "housing_type": "rent",
            })
        self.assertEqual(resp.status_code, 400)
        self.assertIn("upcoming_events", resp.get_json()["error"])

    def test_post_profile_invalid_housing_type(self):
        with patch("app.get_db", return_value=make_db()):
            resp = self.client.post("/api/budget-builder/profile", json={
                "expected_income": 5000, "housing_type": "condo",
            })
        self.assertEqual(resp.status_code, 400)
        self.assertIn("housing_type", resp.get_json()["error"])


# ── Regional Data CRUD ──────────────────────────────────────────────────────

class TestBuilderRegional(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    def test_get_regional_empty(self):
        with patch("app.get_db", return_value=make_db()):
            resp = self.client.get("/api/budget-builder/regional")
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(resp.get_json()["exists"])

    def test_post_then_get_regional(self):
        db = make_db()
        payload = {
            "food_cost_trend": "$950/mo, up 3%",
            "childcare_cost": "$1,200-1,800/mo",
            "gas_fuel_price": "$2.89/gal",
            "insurance_trend": "$180/mo auto",
            "electricity_cost": "$150/mo avg",
            "other_factors": [{"label": "Water", "value": "$60/mo"}],
        }
        with patch("app.get_db", return_value=db):
            resp = self.client.post("/api/budget-builder/regional", json=payload)
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.get_json()["ok"])

        with patch("app.get_db", return_value=db):
            resp = self.client.get("/api/budget-builder/regional")
        data = resp.get_json()
        self.assertTrue(data["exists"])
        self.assertEqual(data["food_cost_trend"], "$950/mo, up 3%")
        self.assertEqual(data["source"], "user_edited")
        self.assertEqual(data["other_factors"], [{"label": "Water", "value": "$60/mo"}])

    def test_post_update_regional(self):
        db = make_db()
        with patch("app.get_db", return_value=db):
            self.client.post("/api/budget-builder/regional", json={
                "food_cost_trend": "$900/mo",
            })
        with patch("app.get_db", return_value=db):
            self.client.post("/api/budget-builder/regional", json={
                "food_cost_trend": "$950/mo",
            })
        with patch("app.get_db", return_value=db):
            resp = self.client.get("/api/budget-builder/regional")
        self.assertEqual(resp.get_json()["food_cost_trend"], "$950/mo")


# ── Regional AI Fetch ───────────────────────────────────────────────────────

class TestBuilderRegionalAIFetch(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()
        import app as app_module
        app_module._ai_cooldowns.clear()

    def _configured_db(self, location="Austin, TX"):
        db = make_db()
        db.execute(
            "INSERT INTO budget_builder_profile (id, expected_income, location, housing_type) "
            "VALUES (1, 6000, ?, 'rent')",
            (location,),
        )
        db.commit()
        from app import set_setting
        set_setting(db, "ai_api_key", "test-key")
        set_setting(db, "ai_model", "claude-opus-4-5")
        set_setting(db, "ai_provider", "anthropic")
        set_setting(db, "ai_base_url", "")
        return db

    def test_fetch_regional_requires_profile(self):
        db = make_db()
        from app import set_setting
        set_setting(db, "ai_api_key", "key")
        set_setting(db, "ai_model", "m")
        set_setting(db, "ai_provider", "anthropic")
        set_setting(db, "ai_base_url", "")
        with patch("app.get_db", return_value=db), \
             patch("app.auth.load_ai_key", return_value=None):
            resp = self.client.post("/api/budget-builder/regional/fetch")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("profile", resp.get_json()["error"].lower())

    def test_fetch_regional_requires_ai_config(self):
        db = make_db()
        db.execute(
            "INSERT INTO budget_builder_profile (id, expected_income, location, housing_type) "
            "VALUES (1, 6000, 'Austin, TX', 'rent')"
        )
        db.commit()
        with patch("app.get_db", return_value=db), \
             patch("app.auth.load_ai_key", return_value=None):
            resp = self.client.post("/api/budget-builder/regional/fetch")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("configured", resp.get_json()["error"].lower())

    def test_fetch_regional_anthropic(self):
        ai_response = json.dumps({
            "food_cost_trend": "$950/mo",
            "childcare_cost": "$1,500/mo",
            "gas_fuel_price": "$2.89/gal",
            "insurance_trend": "$180/mo",
            "electricity_cost": "$150/mo",
            "other_factors": [],
        })
        mock_msg = MagicMock()
        mock_msg.content = [MagicMock(text=ai_response)]
        mock_msg.stop_reason = "end_turn"
        mock_client = MagicMock()
        mock_client.messages.create.return_value = mock_msg

        db = self._configured_db("Austin, TX")
        with patch("app.get_db", return_value=db), \
             patch("app.auth.load_ai_key", return_value=None), \
             patch("anthropic.Anthropic", return_value=mock_client):
            resp = self.client.post("/api/budget-builder/regional/fetch")

        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertEqual(data["food_cost_trend"], "$950/mo")
        self.assertEqual(data["source"], "ai")

    def test_fetch_regional_prompt_contains_location(self):
        captured = {}

        def capture_call(**kwargs):
            captured["messages"] = kwargs.get("messages", [])
            mock_msg = MagicMock()
            mock_msg.content = [MagicMock(text='{"food_cost_trend":"x","childcare_cost":"x","gas_fuel_price":"x","insurance_trend":"x","electricity_cost":"x","other_factors":[]}')]
            mock_msg.stop_reason = "end_turn"
            return mock_msg

        mock_client = MagicMock()
        mock_client.messages.create.side_effect = capture_call

        db = self._configured_db("Portland, OR")
        with patch("app.get_db", return_value=db), \
             patch("app.auth.load_ai_key", return_value=None), \
             patch("anthropic.Anthropic", return_value=mock_client):
            self.client.post("/api/budget-builder/regional/fetch")

        prompt = captured["messages"][0]["content"]
        self.assertIn("Portland, OR", prompt)


# ── Budget Generation ───────────────────────────────────────────────────────

class TestBuilderGenerate(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()
        import app as app_module
        app_module._ai_cooldowns.clear()

    def _seeded_db(self):
        db = make_db()
        # Profile
        db.execute(
            "INSERT INTO budget_builder_profile (id, expected_income, location, housing_type) "
            "VALUES (1, 6000, 'Austin, TX', 'rent')"
        )
        # Regional
        db.execute(
            "INSERT INTO budget_builder_regional (id, food_cost_trend, source) "
            "VALUES (1, '$950/mo', 'ai')"
        )
        # Categories (include a transfer to verify exclusion)
        db.execute("INSERT INTO categories (id, name, group_name, group_type) VALUES ('cat_1', 'Groceries', 'Food & Drink', NULL)")
        db.execute("INSERT INTO categories (id, name, group_name, group_type) VALUES ('cat_2', 'Restaurants', 'Food & Drink', NULL)")
        db.execute("INSERT INTO categories (id, name, group_name, group_type) VALUES ('cat_t', 'Transfer', 'Transfers', 'transfer')")
        # Budget history
        db.execute("INSERT INTO budgets VALUES ('cat_1', '2025-11-01', 500, 523, -23)")
        db.execute("INSERT INTO budgets VALUES ('cat_1', '2025-12-01', 500, 489, 11)")
        db.execute("INSERT INTO budgets VALUES ('cat_2', '2025-11-01', 200, 215, -15)")
        db.commit()
        from app import set_setting
        set_setting(db, "ai_api_key", "test-key")
        set_setting(db, "ai_model", "claude-opus-4-5")
        set_setting(db, "ai_provider", "anthropic")
        set_setting(db, "ai_base_url", "")
        return db

    def test_generate_requires_ai_config(self):
        db = make_db()
        with patch("app.get_db", return_value=db), \
             patch("app.auth.load_ai_key", return_value=None):
            resp = self.client.post("/api/budget-builder/generate", json={"months_ahead": 3})
        self.assertEqual(resp.status_code, 400)

    def test_generate_success(self):
        ai_response = json.dumps({
            "recommendations": [
                {"category_id": "cat_1", "category_name": "Groceries", "group_name": "Food & Drink",
                 "rationale": "Based on 6-mo avg", "months": {"2026-03-01": 525, "2026-04-01": 530}},
                {"category_id": "cat_2", "category_name": "Restaurants", "group_name": "Food & Drink",
                 "rationale": "Trending down", "months": {"2026-03-01": 190, "2026-04-01": 190}},
            ],
            "summary": "Budget is on track",
            "total_monthly_budget": {"2026-03-01": 715, "2026-04-01": 720},
        })
        mock_msg = MagicMock()
        mock_msg.content = [MagicMock(text=ai_response)]
        mock_msg.stop_reason = "end_turn"
        mock_client = MagicMock()
        mock_client.messages.create.return_value = mock_msg

        db = self._seeded_db()
        with patch("app.get_db", return_value=db), \
             patch("app.auth.load_ai_key", return_value=None), \
             patch("anthropic.Anthropic", return_value=mock_client):
            resp = self.client.post("/api/budget-builder/generate", json={"months_ahead": 2})

        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertIn("plan", data)
        self.assertEqual(len(data["plan"]["line_items"]), 2)
        self.assertEqual(data["plan"]["summary"], "Budget is on track")

    def test_generate_filters_hallucinated_ids(self):
        ai_response = json.dumps({
            "recommendations": [
                {"category_id": "cat_1", "category_name": "Groceries", "group_name": "Food & Drink",
                 "rationale": "ok", "months": {"2026-03-01": 500}},
                {"category_id": "hallucinated_999", "category_name": "Fake", "group_name": "Fake",
                 "rationale": "made up", "months": {"2026-03-01": 100}},
            ],
            "summary": "Test",
            "total_monthly_budget": {"2026-03-01": 600},
        })
        mock_msg = MagicMock()
        mock_msg.content = [MagicMock(text=ai_response)]
        mock_msg.stop_reason = "end_turn"
        mock_client = MagicMock()
        mock_client.messages.create.return_value = mock_msg

        db = self._seeded_db()
        with patch("app.get_db", return_value=db), \
             patch("app.auth.load_ai_key", return_value=None), \
             patch("anthropic.Anthropic", return_value=mock_client):
            resp = self.client.post("/api/budget-builder/generate", json={"months_ahead": 1})

        data = resp.get_json()
        ids = [item["category_id"] for item in data["plan"]["line_items"]]
        self.assertIn("cat_1", ids)
        self.assertNotIn("hallucinated_999", ids)

    def test_generate_excludes_transfers_from_prompt(self):
        captured = {}

        def capture_call(**kwargs):
            captured["messages"] = kwargs.get("messages", [])
            mock_msg = MagicMock()
            mock_msg.content = [MagicMock(text='{"recommendations":[],"summary":"x","total_monthly_budget":{}}')]
            mock_msg.stop_reason = "end_turn"
            return mock_msg

        mock_client = MagicMock()
        mock_client.messages.create.side_effect = capture_call

        db = self._seeded_db()
        with patch("app.get_db", return_value=db), \
             patch("app.auth.load_ai_key", return_value=None), \
             patch("anthropic.Anthropic", return_value=mock_client):
            self.client.post("/api/budget-builder/generate", json={"months_ahead": 1})

        prompt = captured["messages"][0]["content"]
        self.assertIn("cat_1", prompt)
        self.assertNotIn("cat_t", prompt)

    def test_generate_truncation_detection(self):
        mock_msg = MagicMock()
        mock_msg.content = [MagicMock(text="partial json...")]
        mock_msg.stop_reason = "max_tokens"
        mock_client = MagicMock()
        mock_client.messages.create.return_value = mock_msg

        db = self._seeded_db()
        with patch("app.get_db", return_value=db), \
             patch("app.auth.load_ai_key", return_value=None), \
             patch("anthropic.Anthropic", return_value=mock_client):
            resp = self.client.post("/api/budget-builder/generate", json={"months_ahead": 1})

        self.assertEqual(resp.status_code, 400)
        self.assertIn("truncated", resp.get_json()["error"].lower())

    def test_generate_with_profile_overrides(self):
        captured = {}

        def capture_call(**kwargs):
            captured["messages"] = kwargs.get("messages", [])
            mock_msg = MagicMock()
            mock_msg.content = [MagicMock(text='{"recommendations":[],"summary":"x","total_monthly_budget":{}}')]
            mock_msg.stop_reason = "end_turn"
            return mock_msg

        mock_client = MagicMock()
        mock_client.messages.create.side_effect = capture_call

        db = self._seeded_db()
        with patch("app.get_db", return_value=db), \
             patch("app.auth.load_ai_key", return_value=None), \
             patch("anthropic.Anthropic", return_value=mock_client):
            self.client.post("/api/budget-builder/generate", json={
                    "months_ahead": 1,
                    "profile_overrides": {"expected_income": 8000},
                })

        prompt = captured["messages"][0]["content"]
        self.assertIn("8000", prompt)


# ── Plan CRUD ───────────────────────────────────────────────────────────────

class TestBuilderPlans(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    def test_list_plans_empty(self):
        with patch("app.get_db", return_value=make_db()):
            resp = self.client.get("/api/budget-builder/plans")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.get_json()["plans"], [])

    def test_plan_crud(self):
        db = make_db()
        # Insert a plan manually
        db.execute(
            "INSERT INTO budget_builder_plans (name, months_ahead, line_items, summary) "
            "VALUES (?, ?, ?, ?)",
            ("Test Plan", 3, json.dumps([{"category_id": "cat_1", "months": {}}]), "Summary"),
        )
        db.commit()

        # List
        with patch("app.get_db", return_value=db):
            resp = self.client.get("/api/budget-builder/plans")
        plans = resp.get_json()["plans"]
        self.assertEqual(len(plans), 1)
        plan_id = plans[0]["id"]

        # Get
        with patch("app.get_db", return_value=db):
            resp = self.client.get(f"/api/budget-builder/plans/{plan_id}")
        data = resp.get_json()
        self.assertEqual(data["name"], "Test Plan")
        self.assertEqual(len(data["line_items"]), 1)

        # Update
        with patch("app.get_db", return_value=db):
            resp = self.client.put(f"/api/budget-builder/plans/{plan_id}", json={
                "name": "Updated Plan",
                "line_items": [{"category_id": "cat_1", "months": {"2026-03-01": 500}}],
            })
        self.assertEqual(resp.status_code, 200)

        with patch("app.get_db", return_value=db):
            resp = self.client.get(f"/api/budget-builder/plans/{plan_id}")
        self.assertEqual(resp.get_json()["name"], "Updated Plan")
        self.assertIsNotNone(resp.get_json()["user_edited_at"])

        # Delete
        with patch("app.get_db", return_value=db):
            resp = self.client.delete(f"/api/budget-builder/plans/{plan_id}")
        self.assertEqual(resp.status_code, 200)

        with patch("app.get_db", return_value=db):
            resp = self.client.get(f"/api/budget-builder/plans/{plan_id}")
        self.assertEqual(resp.status_code, 404)

    def test_get_plan_not_found(self):
        with patch("app.get_db", return_value=make_db()):
            resp = self.client.get("/api/budget-builder/plans/999")
        self.assertEqual(resp.status_code, 404)


# ── Apply to Monarch ────────────────────────────────────────────────────────

class TestBuilderApply(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    def _db_with_plan(self):
        db = make_db()
        line_items = [
            {"category_id": "cat_1", "category_name": "Groceries", "group_name": "Food",
             "rationale": "ok", "months": {"2026-03-01": 500, "2026-04-01": 510}},
            {"category_id": "cat_2", "category_name": "Restaurants", "group_name": "Food",
             "rationale": "ok", "months": {"2026-03-01": 200, "2026-04-01": 200}},
        ]
        db.execute(
            "INSERT INTO budget_builder_plans (name, months_ahead, line_items, summary) "
            "VALUES (?, ?, ?, ?)",
            ("Apply Test", 2, json.dumps(line_items), "test"),
        )
        db.commit()
        return db

    def test_apply_success(self):
        db = self._db_with_plan()
        mock_mm = MagicMock()

        async def noop_set_budget(*args, **kwargs):
            pass

        mock_mm.set_budget_amount = noop_set_budget

        async def mock_get_client(*a, **kw):
            return mock_mm

        with patch("app.get_db", return_value=db):
            with patch("app.auth.get_client", side_effect=mock_get_client):
                resp = self.client.post("/api/budget-builder/plans/1/apply")

        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertEqual(data["applied"], 4)
        self.assertEqual(data["failed"], 0)

        # Check applied_at is set
        with patch("app.get_db", return_value=db):
            resp = self.client.get("/api/budget-builder/plans/1")
        self.assertIsNotNone(resp.get_json()["applied_at"])

    def test_apply_partial_failure(self):
        db = self._db_with_plan()
        call_count = {"n": 0}

        mock_mm = MagicMock()

        async def set_budget_side_effect(*args, **kwargs):
            call_count["n"] += 1
            if call_count["n"] == 2:
                raise Exception("Monarch API error")

        mock_mm.set_budget_amount = set_budget_side_effect

        async def mock_get_client(*a, **kw):
            return mock_mm

        with patch("app.get_db", return_value=db):
            with patch("app.auth.get_client", side_effect=mock_get_client):
                resp = self.client.post("/api/budget-builder/plans/1/apply")

        data = resp.get_json()
        self.assertEqual(data["applied"], 3)
        self.assertEqual(data["failed"], 1)
        self.assertEqual(len(data["errors"]), 1)

        # applied_at should NOT be set on partial failure
        with patch("app.get_db", return_value=db):
            resp = self.client.get("/api/budget-builder/plans/1")
        self.assertIsNone(resp.get_json()["applied_at"])

    def test_apply_plan_not_found(self):
        with patch("app.get_db", return_value=make_db()):
            resp = self.client.post("/api/budget-builder/plans/999/apply")
        self.assertEqual(resp.status_code, 404)

    def test_apply_version_guard(self):
        db = self._db_with_plan()
        mock_mm = MagicMock(spec=[])  # empty spec = no attributes

        async def mock_get_client(*a, **kw):
            return mock_mm

        with patch("app.get_db", return_value=db):
            with patch("app.auth.get_client", side_effect=mock_get_client):
                resp = self.client.post("/api/budget-builder/plans/1/apply")

        self.assertEqual(resp.status_code, 400)
        self.assertIn("set_budget_amount", resp.get_json()["error"])

    def test_apply_chronological_order(self):
        """Verify months are processed in chronological order."""
        db = make_db()
        line_items = [
            {"category_id": "cat_1", "category_name": "Groceries", "group_name": "Food",
             "rationale": "ok", "months": {"2026-05-01": 500, "2026-03-01": 480, "2026-04-01": 490}},
        ]
        db.execute(
            "INSERT INTO budget_builder_plans (name, months_ahead, line_items, summary) "
            "VALUES (?, ?, ?, ?)",
            ("Order Test", 3, json.dumps(line_items), "test"),
        )
        db.commit()

        call_order = []
        mock_mm = MagicMock()

        async def track_calls(*args, **kwargs):
            call_order.append(kwargs.get("start_date"))

        mock_mm.set_budget_amount = track_calls

        async def mock_get_client(*a, **kw):
            return mock_mm

        with patch("app.get_db", return_value=db):
            with patch("app.auth.get_client", side_effect=mock_get_client):
                self.client.post("/api/budget-builder/plans/1/apply")

        self.assertEqual(call_order, ["2026-03-01", "2026-04-01", "2026-05-01"])

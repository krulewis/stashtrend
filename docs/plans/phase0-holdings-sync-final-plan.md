# Phase 0: Holdings Sync Pipeline — Final Plan

**Plan type:** M (multi-file, new feature, involves tests)
**Status:** Ready for implementation
**Schema:** Architect's 13-column lean design (no price change / display fields)
**Run order:** Architect's early position (after account_history, before categories)

---

## Architecture Decisions (locked)

1. **13-column schema** — only fields needed for Phase 0 portfolio display. Deferred: closing_price, price change fields, display fields, price timestamps. These belong in Phase 5 (security_prices table).
2. **Run order:** accounts → account_history → **holdings** → categories → transactions → budgets
3. **Investment-only filter:** `type = 'investment'` in DB, `type.name == 'investment'` in API payload
4. **Stale cleanup:** DELETE + INSERT per account per sync (not INSERT OR REPLACE with separate cleanup)
5. **No explicit BEGIN/COMMIT** — follows existing codebase pattern (executemany + single commit)

---

## Summary of Changes

| File | Change |
|------|--------|
| `pipeline/monarch_pipeline/schema.py` | Add `holdings` DDL (13 columns) |
| `pipeline/monarch_pipeline/fetchers.py` | Add `fetch_holdings()` |
| `pipeline/monarch_pipeline/storage.py` | Add `upsert_holdings()` |
| `backend/app.py` | Add holdings to constants + `_run_sync_worker` |
| `backend/tests/test_sync.py` | Update local entity constants + ordering test |
| `frontend/src/constants/syncEntities.js` | Add holdings to all four exports |
| `frontend/src/test/fixtures.js` | Add holdings to `MOCK_SYNC_LAST_STATUS` |
| `frontend/src/components/SyncControl.test.jsx` | Update entity count assertion |
| New: `backend/tests/test_pipeline_holdings.py` | All holdings-specific tests |

---

## Staff Engineer Findings (all addressed)

| # | Severity | Finding | Resolution |
|---|----------|---------|------------|
| 1 | CRITICAL | Wrong API response path | Fixed: `portfolio.aggregateHoldings.edges[].node` |
| 2 | CRITICAL | Missing investment-account filter | Fixed: filter in both `last_accounts` and DB branches |
| 3 | HIGH | account_id TEXT vs int type hint | Documented: library does `str()` internally, matches existing pattern |
| 4 | HIGH | Frontend changes missing | Added: syncEntities.js, fixtures.js, SyncControl.test.jsx |
| 5 | HIGH | Explicit BEGIN/COMMIT mismatch | Fixed: single `conn.commit()` pattern |
| 6 | HIGH | test_sync.py local constants stale | Fixed: updated both ENTITY_TABLE_MAP and ENTITY_RUN_ORDER |
| 7 | MEDIUM | Stale cleanup must be per-account | Fixed: DELETE scoped to account_id |
| 8 | MEDIUM | Aggregate vs individual ID ambiguity | Fixed: one row per `node`, PK is `node.id` |
| 9 | MEDIUM | account_id not in API response | Fixed: injected by `fetch_holdings` |
| 10 | MEDIUM | sync_log entity name must match table | Confirmed: `"holdings"` matches |
| 11 | LOW | FK constraint in DDL | Included |
| 12 | LOW | synced_at NOT NULL | Included |
| 13 | LOW | snapshot_counts connection note | Document-only, no code change |

---

## File 1: `pipeline/monarch_pipeline/schema.py`

### Insert holdings DDL before sync_log (between lines 72 and 74)

**Current (lines 72–74):**
```sql
);

CREATE TABLE IF NOT EXISTS sync_log (
```

**Replace with:**
```sql
);

CREATE TABLE IF NOT EXISTS holdings (
    id                  TEXT PRIMARY KEY,
    account_id          TEXT NOT NULL,
    security_id         TEXT,
    security_name       TEXT,
    ticker              TEXT,
    security_type       TEXT,
    quantity            REAL,
    basis               REAL,
    total_value         REAL,
    current_price       REAL,
    is_manual           INTEGER DEFAULT 0,
    last_synced_at      TEXT,
    synced_at           TEXT NOT NULL,
    FOREIGN KEY (account_id) REFERENCES accounts(id)
);

CREATE TABLE IF NOT EXISTS sync_log (
```

---

## File 2: `pipeline/monarch_pipeline/fetchers.py`

### Append after line 141 (end of `fetch_budgets`)

```python


async def fetch_holdings(
    mm: MonarchMoney, account_id: str
) -> list[dict[str, Any]]:
    """
    Fetch aggregate holdings for a single investment account.

    Response path: data["portfolio"]["aggregateHoldings"]["edges"][].node
    One dict per aggregate node. account_id injected into each dict.
    Returns empty list if account has no holdings or on any error.
    """
    logger.debug("Fetching holdings for account %s", account_id)
    try:
        data = await mm.get_account_holdings(account_id)
    except Exception:
        logger.warning("  → get_account_holdings failed for account %s", account_id)
        return []

    edges = (
        data.get("portfolio", {})
            .get("aggregateHoldings", {})
            .get("edges", [])
    )

    holdings: list[dict[str, Any]] = []
    for edge in edges:
        node = edge.get("node", {})
        if not node:
            continue
        security = node.get("security") or {}
        raw_holdings = node.get("holdings") or []
        h0 = raw_holdings[0] if raw_holdings else {}

        holdings.append({
            "id":             node.get("id"),
            "account_id":    account_id,
            "security_id":   security.get("id"),
            "security_name": security.get("name"),
            "ticker":        security.get("ticker"),
            "security_type": security.get("type"),
            "quantity":      node.get("quantity"),
            "basis":         node.get("basis"),
            "total_value":   node.get("totalValue"),
            "current_price": security.get("currentPrice"),
            "is_manual":     int(h0.get("isManual", False)),
            "last_synced_at": node.get("lastSyncedAt"),
        })

    logger.debug("  → %d holdings found for account %s", len(holdings), account_id)
    return holdings
```

---

## File 3: `pipeline/monarch_pipeline/storage.py`

### Append after line 199 (end of `get_sync_status`)

```python


# ── Holdings ──────────────────────────────────────────────────────────────────

def upsert_holdings(
    conn: sqlite3.Connection, account_id: str, holdings: list[dict[str, Any]]
) -> int:
    """
    Replace all holdings for one account with the current snapshot.
    Deletes stale rows then inserts current — scoped to account_id only.
    Returns number of rows written.
    """
    # Delete existing rows for this account (stale cleanup)
    conn.execute("DELETE FROM holdings WHERE account_id = ?", (account_id,))

    if not holdings:
        conn.commit()
        return 0

    now = _now()
    rows = [
        (
            h["id"],
            account_id,
            h.get("security_id"),
            h.get("security_name"),
            h.get("ticker"),
            h.get("security_type"),
            h.get("quantity"),
            h.get("basis"),
            h.get("total_value"),
            h.get("current_price"),
            h.get("is_manual", 0),
            h.get("last_synced_at"),
            now,
        )
        for h in holdings
    ]

    conn.executemany(
        """
        INSERT INTO holdings
            (id, account_id, security_id, security_name, ticker, security_type,
             quantity, basis, total_value, current_price, is_manual,
             last_synced_at, synced_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        rows,
    )
    conn.commit()
    return len(rows)
```

---

## File 4: `backend/app.py`

### Change 4a — ENTITY_TABLE_MAP (lines 253–259)

Add `"holdings": "holdings"` entry:

```python
ENTITY_TABLE_MAP = {
    "accounts":        "accounts",
    "account_history": "account_history",
    "holdings":        "holdings",
    "categories":      "categories",
    "transactions":    "transactions",
    "budgets":         "budgets",
}
```

### Change 4b — ENTITY_RUN_ORDER (lines 261–267)

Holdings after account_history, before categories:

```python
ENTITY_RUN_ORDER = [
    "accounts",
    "account_history",
    "holdings",
    "categories",
    "transactions",
    "budgets",
]
```

### Change 4c — ENTITY_LABELS (lines 269–275)

```python
ENTITY_LABELS = {
    "accounts":        "Accounts",
    "account_history": "Account History",
    "holdings":        "Holdings",
    "categories":      "Categories",
    "transactions":    "Transactions",
    "budgets":         "Budgets",
}
```

### Change 4d — `_run_sync_worker` holdings block

Insert after the budgets block (line 456), before `except Exception` (line 458):

```python
                    elif entity == "holdings":
                        inv_accounts = getattr(_run_sync_worker, "last_accounts", None)
                        if inv_accounts is not None:
                            investment_ids = [
                                a["id"] for a in inv_accounts
                                if a.get("type", {}).get("name") == "investment"
                            ]
                        else:
                            acct_rows = pipeline_conn.execute(
                                "SELECT id FROM accounts WHERE type = 'investment'"
                            ).fetchall()
                            investment_ids = [r["id"] for r in acct_rows]

                        total = 0
                        for acct_id in investment_ids:
                            h_data = await fetchers.fetch_holdings(mm, acct_id)
                            total += storage.upsert_holdings(pipeline_conn, acct_id, h_data)
                        storage.update_sync_log(pipeline_conn, "holdings", total)
                        entity_count = total
```

---

## File 5: `backend/tests/test_sync.py`

### Change 5a — Local ENTITY_TABLE_MAP (lines 35–41)

Add `"holdings": "holdings"` entry.

### Change 5b — Local ENTITY_RUN_ORDER (lines 44–50)

Add `"holdings"` after `"account_history"`:

```python
ENTITY_RUN_ORDER = [
    "accounts",
    "account_history",
    "holdings",
    "categories",
    "transactions",
    "budgets",
]
```

### Change 5c — test_all_entities_in_order (lines 449–454)

```python
    def test_all_entities_in_order(self):
        selected = ["holdings", "budgets", "transactions", "account_history", "categories", "accounts"]
        result = ordered_entities(selected)
        self.assertEqual(result, [
            "accounts", "account_history", "holdings", "categories", "transactions", "budgets"
        ])
```

---

## File 6: `frontend/src/constants/syncEntities.js`

Add `'holdings'` after `'account_history'` in `SYNC_ENTITY_ORDER`.
Add `holdings: 'Holdings'` to `SYNC_ENTITY_LABELS`.
Add `holdings: 'Investment holdings for brokerage accounts'` to `SYNC_ENTITY_DESCS`.
Add `holdings: 'Holdings'` to `SYNC_ENTITY_SHORT`.

---

## File 7: `frontend/src/test/fixtures.js`

Add to `MOCK_SYNC_LAST_STATUS`:
```javascript
{ entity: 'holdings', last_synced_at: '2026-02-23T10:00:00Z', total_records: 42 },
```

---

## File 8: `frontend/src/components/SyncControl.test.jsx`

Change test name from "renders all five entity checkboxes" to "renders all six entity checkboxes".
Add: `expect(screen.getByText('Holdings')).toBeInTheDocument()`

---

## New File: `backend/tests/test_pipeline_holdings.py`

### TestHoldingsDDL (3 tests)
- `test_holdings_table_created` — verify table exists after `make_test_db`
- `test_schema_idempotent` — re-run DDL does not raise
- `test_synced_at_not_null_constraint` — INSERT without synced_at fails

### TestUpsertHoldings (6 tests)
- `test_upsert_inserts_rows` — basic insert returns correct count
- `test_upsert_empty_list_returns_zero` — returns 0
- `test_upsert_empty_list_deletes_stale_rows` — existing rows cleaned up
- `test_upsert_replaces_stale_for_same_account` — fewer rows on re-sync
- `test_upsert_is_per_account` — cleanup scoped to account_id
- `test_null_security_fields_allowed` — manual holdings with NULLs

### TestFetchHoldings (6 tests)
- `test_fetch_returns_empty_on_empty_edges`
- `test_fetch_injects_account_id`
- `test_fetch_flattens_node_security_holdings` — full response mapping
- `test_fetch_handles_missing_security` — `security: None`
- `test_fetch_handles_empty_holdings_list` — `holdings: []`
- `test_fetch_returns_empty_on_api_exception`

### TestHoldingsEntityConstants (4 tests)
- `test_holdings_in_table_map`
- `test_holdings_in_run_order`
- `test_holdings_after_account_history`
- `test_holdings_before_categories`

**Total: 19 backend tests + frontend test updates**

---

## Implementation Order

1. `schema.py` — DDL (other layers depend on table)
2. `fetchers.py` — fetch function
3. `storage.py` — upsert function
4. Write backend tests — run, confirm failures (TDD)
5. `app.py` — entity constants + worker block
6. `test_sync.py` — update local constants + ordering test
7. Run `make test` — confirm backend passes
8. `syncEntities.js` — frontend constants
9. `fixtures.js` + `SyncControl.test.jsx` — frontend test updates
10. Run `make test` — confirm all pass
11. Playwright QA — verify Holdings appears in sync UI

---

## Rollback

All changes are additive. To revert:
1. Remove holdings DDL from `schema.py`
2. Remove `fetch_holdings` from `fetchers.py`
3. Remove `upsert_holdings` from `storage.py`
4. Remove `"holdings"` from all three dicts + worker block in `app.py`
5. Revert `test_sync.py` constants
6. Revert frontend constants/tests
7. Delete `test_pipeline_holdings.py`

Existing `holdings` table in production DB is harmless if left — `IF NOT EXISTS` prevents DDL errors.

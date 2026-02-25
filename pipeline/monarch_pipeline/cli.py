"""
CLI entry point for monarch-pipeline.

Commands:
  monarch-pipeline login [--token TOKEN]  — authenticate and save session
  monarch-pipeline sync [--full]          — run incremental (or full) data sync
  monarch-pipeline status                 — show last sync times per entity
  monarch-pipeline logout                 — remove all saved credentials
"""

import asyncio
import logging
from datetime import date, datetime, timedelta

import click

from . import auth, config, fetchers, schema, storage


def _setup_logging(verbose: bool) -> None:
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(format="%(asctime)s  %(levelname)-8s %(message)s", level=level)


# ── Root group ────────────────────────────────────────────────────────────────

@click.group()
@click.option("--verbose", "-v", is_flag=True, help="Enable debug logging.")
@click.pass_context
def cli(ctx: click.Context, verbose: bool) -> None:
    """Monarch Money → SQLite data pipeline."""
    ctx.ensure_object(dict)
    ctx.obj["verbose"] = verbose
    _setup_logging(verbose)
    config.ensure_data_dir()


# ── login ─────────────────────────────────────────────────────────────────────

@cli.command()
@click.option(
    "--token",
    default=None,
    metavar="TOKEN",
    help=(
        "Auth token from your browser session. Bypasses Cloudflare bot-protection. "
        "Find it in DevTools → Network → any request to api.monarch.com → "
        "Headers → Authorization (copy the token value after 'Token ')."
    ),
)
@click.pass_context
def login(ctx: click.Context, token: str) -> None:
    """Authenticate with Monarch Money and save session."""
    async def _run() -> None:
        if token:
            click.echo("Authenticating with Bearer token...")
            mm = await auth.login_with_token(token, config.TOKEN_PATH)
        else:
            click.echo("Authenticating with Monarch Money...")
            mm = await auth.get_client(config.SESSION_PATH, config.TOKEN_PATH)

        accounts = await mm.get_accounts()
        count = len(accounts.get("accounts", []))
        click.secho(f"✓ Logged in successfully. Found {count} linked accounts.", fg="green")

    asyncio.run(_run())


# ── sync ──────────────────────────────────────────────────────────────────────

@cli.command()
@click.option(
    "--full",
    is_flag=True,
    default=False,
    help="Force a full refresh instead of incremental sync.",
)
@click.pass_context
def sync(ctx: click.Context, full: bool) -> None:
    """Sync Monarch Money data to the local SQLite database."""
    async def _run() -> None:
        mm = await auth.get_client(config.SESSION_PATH, config.TOKEN_PATH)
        conn = schema.init_db(config.DB_PATH)

        click.echo(f"Database: {config.DB_PATH}")
        click.echo(f"Mode: {'full refresh' if full else 'incremental'}\n")

        # ── 1. Accounts ───────────────────────────────────────────────────────
        click.echo("Syncing accounts...")
        accounts = await fetchers.fetch_accounts(mm)
        count = storage.upsert_accounts(conn, accounts)
        storage.update_sync_log(conn, "accounts", count)
        click.secho(f"  ✓ {count} accounts synced", fg="green")

        # ── 2. Account history (incremental per account) ──────────────────────
        click.echo("Syncing account history...")
        total_history = 0
        for acct in accounts:
            acct_id = acct["id"]
            last_date = None if full else storage.get_latest_history_date(conn, acct_id)
            history = await fetchers.fetch_account_history(mm, acct_id, start_date=last_date)
            if history:
                total_history += storage.upsert_account_history(conn, acct_id, history)
        storage.update_sync_log(conn, "account_history", total_history)
        click.secho(f"  ✓ {total_history} history rows synced", fg="green")

        # ── 3. Categories ─────────────────────────────────────────────────────
        click.echo("Syncing categories...")
        categories = await fetchers.fetch_categories(mm)
        cat_count = storage.upsert_categories(conn, categories)
        storage.update_sync_log(conn, "categories", cat_count)
        click.secho(f"  ✓ {cat_count} categories synced", fg="green")

        # ── 4. Transactions (incremental by default) ──────────────────────────
        click.echo("Syncing transactions...")
        if full:
            tx_start = None
        else:
            last_sync = storage.get_last_sync_date(conn, "transactions")
            if last_sync:
                last_dt = datetime.fromisoformat(last_sync).date()
                tx_start = (last_dt - timedelta(days=3)).isoformat()
            else:
                tx_start = None

        transactions = await fetchers.fetch_transactions(mm, start_date=tx_start)
        tx_count = storage.upsert_transactions(conn, transactions)
        storage.update_sync_log(conn, "transactions", tx_count)
        click.secho(f"  ✓ {tx_count} transactions synced", fg="green")

        # ── 5. Budgets (last 12 months, full refresh) ─────────────────────────
        click.echo("Syncing budgets...")
        today = date.today()
        budget_start = date(today.year - 1, today.month, 1).isoformat()
        budget_end = date(today.year, today.month, 1).isoformat()
        budget_rows = await fetchers.fetch_budgets(mm, budget_start, budget_end)
        budget_count = storage.upsert_budgets(conn, budget_rows)
        storage.update_sync_log(conn, "budgets", budget_count)
        click.secho(f"  ✓ {budget_count} budget rows synced", fg="green")

        conn.close()
        click.echo("\nSync complete.")

    asyncio.run(_run())


# ── status ────────────────────────────────────────────────────────────────────

@cli.command()
def status() -> None:
    """Show last sync time and record counts for each entity."""
    conn = schema.init_db(config.DB_PATH)
    rows = storage.get_sync_status(conn)
    conn.close()

    if not rows:
        click.echo("No syncs recorded yet. Run: monarch-pipeline sync")
        return

    click.echo(f"\n{'Entity':<20} {'Last Synced':<28} {'Last Count':>12} {'Total':>10}")
    click.echo("─" * 74)
    for r in rows:
        click.echo(
            f"{r['entity']:<20} {r['last_synced_at']:<28} "
            f"{r['last_sync_count']:>12} {r['total_records']:>10}"
        )
    click.echo()


# ── logout ────────────────────────────────────────────────────────────────────

@cli.command()
def logout() -> None:
    """Remove all saved Monarch Money credentials."""
    asyncio.run(auth.logout(config.SESSION_PATH, config.TOKEN_PATH))
    click.secho("✓ Credentials removed.", fg="green")

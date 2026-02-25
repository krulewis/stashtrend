"""
Authentication and session management for monarch-pipeline.

Supports two auth modes:
  1. Token-based (recommended): provide a auth token from your browser session.
     This bypasses Cloudflare bot-protection on the login endpoint.
     Use: monarch-pipeline login --token <token>

  2. Interactive login: email + password + MFA prompt.
     May be blocked by Cloudflare depending on your network/IP.
     Use: monarch-pipeline login

Token storage uses the system keychain (macOS Keychain, Windows Credential
Manager, Linux SecretService) via the `keyring` library — encrypted at rest,
never written as plaintext. If no keyring backend is available (e.g. headless
servers), falls back to a chmod-600 file with a printed warning.
"""

from __future__ import annotations

import logging
import stat
from pathlib import Path
from typing import TYPE_CHECKING

import keyring
import keyring.errors

from . import config

if TYPE_CHECKING:
    from monarchmoney import MonarchMoney

logger = logging.getLogger(__name__)


# ── Secure token storage (keyring → file fallback) ────────────────────────────

def save_token(token: str, token_path: Path) -> None:
    """
    Store the auth token in the system keychain.
    Falls back to a chmod-600 file if no keyring backend is available.
    """
    try:
        keyring.set_password(config.KEYRING_SERVICE, config.KEYRING_USERNAME, token.strip())
        # Clean up any old plaintext fallback file
        if token_path.exists():
            token_path.unlink()
        logger.info("Token saved to system keychain.")
    except keyring.errors.NoKeyringError:
        logger.warning(
            "No system keychain available — saving token to %s (chmod 600). "
            "Consider installing a keyring backend for better security.",
            token_path,
        )
        token_path.parent.mkdir(parents=True, exist_ok=True)
        token_path.write_text(token.strip())
        token_path.chmod(stat.S_IRUSR | stat.S_IWUSR)


def load_token(token_path: Path) -> str | None:
    """
    Load the auth token from the system keychain.
    Falls back to the plaintext file if the keyring has no entry.
    Returns None if neither source has a token.
    """
    # 1. Try keychain
    try:
        token = keyring.get_password(config.KEYRING_SERVICE, config.KEYRING_USERNAME)
        if token:
            logger.debug("Token loaded from system keychain.")
            return token
    except keyring.errors.NoKeyringError:
        logger.debug("No keyring backend — checking fallback file.")

    # 2. Fall back to plaintext file (with warning)
    if token_path.exists():
        try:
            token = token_path.read_text().strip()
            if token:
                logger.warning(
                    "Token loaded from plaintext file %s. "
                    "Run 'monarch-pipeline login --token <token>' to migrate it to the keychain.",
                    token_path,
                )
                return token
        except Exception as e:
            logger.warning("Could not read token fallback file (%s).", e)

    return None


def delete_token(token_path: Path) -> None:
    """Remove the token from keychain and/or fallback file."""
    try:
        keyring.delete_password(config.KEYRING_SERVICE, config.KEYRING_USERNAME)
        logger.debug("Token removed from keychain.")
    except (keyring.errors.NoKeyringError, keyring.errors.PasswordDeleteError):
        pass
    if token_path.exists():
        token_path.unlink()
        logger.debug("Token fallback file removed.")


# ── MonarchMoney client construction ──────────────────────────────────────────

def _mm_from_token(token: str) -> "MonarchMoney":
    """
    Create a MonarchMoney client using the auth token.

    MonarchMoney.__init__ accepts `token` directly — no session
    manipulation needed. The library stores it as mm._token and uses
    it for all GraphQL calls.
    """
    from monarchmoney import MonarchMoney
    return MonarchMoney(token=token)


# ── Public API ────────────────────────────────────────────────────────────────

async def get_client(session_path: Path, token_path: Path) -> "MonarchMoney":
    """
    Return an authenticated MonarchMoney client.

    Priority order:
      1. auth token from keychain (or fallback file)
      2. Interactive login (email + password + MFA)
    """
    from monarchmoney import MonarchMoney

    # 1. Try token from keychain / fallback file
    token = load_token(token_path)
    if token:
        logger.info("Loading saved token...")
        mm = _mm_from_token(token)
        try:
            await mm.get_accounts()
            logger.info("Token is valid.")
            return mm
        except Exception:
            logger.warning("Saved token is expired or invalid — falling back to interactive login.")
            delete_token(token_path)

    # 2. Interactive login
    mm = MonarchMoney()
    await mm.interactive_login()
    return mm


async def login_with_token(token: str, token_path: Path) -> "MonarchMoney":
    """
    Authenticate using a auth token and save it securely for future runs.
    """
    mm = _mm_from_token(token)
    await mm.get_accounts()  # validate before saving
    save_token(token, token_path)
    return mm


async def logout(session_path: Path, token_path: Path) -> None:
    """Remove all saved credentials."""
    delete_token(token_path)
    # Remove legacy session file if present
    if session_path.exists():
        session_path.unlink()
    logger.info("All credentials removed.")

"""
Configuration and path management for monarch-pipeline.

All sensitive data lives in DATA_DIR (~/.monarch_pipeline by default),
which is outside any git repo. Override with MONARCH_DATA_DIR env var.

Token storage priority:
  1. System keychain via `keyring` (macOS Keychain, Windows Credential Manager,
     Linux SecretService) — encrypted at rest, never a plain file.
  2. Fallback plain file at TOKEN_PATH (chmod 600) — used only when no keyring
     backend is available (e.g. headless Linux servers). A warning is shown.
"""

import os
from pathlib import Path

# Data directory — outside the git repo, in the user's home
DATA_DIR = Path(os.environ.get("MONARCH_DATA_DIR", Path.home() / ".monarch_pipeline"))

# Paths derived from DATA_DIR
DB_PATH = DATA_DIR / "monarch.db"
SESSION_PATH = DATA_DIR / ".session"
TOKEN_PATH = DATA_DIR / ".token"   # fallback only — used when keyring unavailable

# Keyring identifiers
KEYRING_SERVICE = "monarch-pipeline"
KEYRING_USERNAME = "bearer_token"

# How many months back to sync budgets on a full refresh
BUDGET_LOOKBACK_MONTHS = 12


def ensure_data_dir() -> None:
    """Create the data directory with restricted permissions if it doesn't exist."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    # chmod 700: only the owner can read/write/execute the directory
    DATA_DIR.chmod(0o700)

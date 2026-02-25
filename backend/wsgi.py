"""
Gunicorn entry point for production.

The __main__ block in app.py is skipped when Gunicorn imports the module,
so we call _startup() here to initialise the DB, token, and scheduler.
"""
from app import app, _startup

_startup()

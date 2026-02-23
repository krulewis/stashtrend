VENV     = venv
PYTHON   = $(VENV)/bin/python
PIP      = $(VENV)/bin/pip
PYTEST   = $(VENV)/bin/pytest

.PHONY: venv install test run clean help

## Create the virtual environment
venv:
	python3 -m venv $(VENV)

## Install all dependencies into the venv
install: venv
	$(PIP) install -q -r requirements.txt

## Run the full test suite
test: install
	$(PYTEST) tests/ -v

## Run the Flask development server
run: install
	$(PYTHON) app.py

## Remove the virtual environment
clean:
	rm -rf $(VENV)

## Show available commands
help:
	@grep -E '^##' Makefile | sed 's/## //'

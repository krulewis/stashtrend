## Root-level Makefile — delegates to backend/ and frontend/ Makefiles

.PHONY: install test run build clean help

## Install all dependencies (backend venv + frontend node_modules)
install:
	$(MAKE) -C backend install
	$(MAKE) -C frontend install

## Run all tests (backend pytest + frontend vitest)
test:
	$(MAKE) -C backend test
	$(MAKE) -C frontend test

## Start both servers (backend Flask on :5050, frontend Vite on :5173)
## Each runs in the background; use Ctrl+C to stop
run:
	$(MAKE) -C backend run &
	$(MAKE) -C frontend run

## Build the frontend for production
build:
	$(MAKE) -C frontend build

## Remove backend venv and frontend node_modules
clean:
	$(MAKE) -C backend clean
	$(MAKE) -C frontend clean

## Show available commands
help:
	@echo ""
	@echo "  make install   — install backend + frontend dependencies"
	@echo "  make test      — run all tests (backend + frontend)"
	@echo "  make run       — start Flask (:5050) + Vite (:5173)"
	@echo "  make build     — production build of the frontend"
	@echo "  make clean     — remove backend venv and frontend node_modules"
	@echo ""

## Root-level Makefile

.PHONY: install test run build up down dev clean help

## Install all dependencies (backend venv + frontend node_modules)
install:
	$(MAKE) -C backend install
	$(MAKE) -C frontend install

## Run all tests (backend pytest + frontend vitest)
test:
	$(MAKE) -C backend test
	$(MAKE) -C frontend test

## Start both servers locally without Docker (backend Flask :5050, frontend Vite :5173)
run:
	$(MAKE) -C backend run &
	$(MAKE) -C frontend run

## Build Docker images for production
build:
	docker compose build

## Start the production Docker stack (app available at http://localhost)
up:
	docker compose up

## Stop the production Docker stack
down:
	docker compose down

## Start the dev Docker stack (hot reload: Flask :5050, Vite :5173)
dev:
	docker compose -f docker-compose.yml -f docker-compose.dev.yml up

## Remove backend venv and frontend node_modules
clean:
	$(MAKE) -C backend clean
	$(MAKE) -C frontend clean

## Show available commands
help:
	@echo ""
	@echo "  Docker (production):"
	@echo "    make build   — build Docker images"
	@echo "    make up      — start app at http://localhost"
	@echo "    make down    — stop Docker stack"
	@echo ""
	@echo "  Docker (development, hot reload):"
	@echo "    make dev     — Flask :5050 + Vite :5173 with live code mounts"
	@echo ""
	@echo "  Local (no Docker):"
	@echo "    make install — install backend + frontend dependencies"
	@echo "    make test    — run all tests (backend + frontend)"
	@echo "    make run     — start Flask (:5050) + Vite (:5173)"
	@echo "    make clean   — remove backend venv and frontend node_modules"
	@echo ""

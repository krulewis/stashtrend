## Root-level Makefile

.PHONY: install test run build up down dev clean push deploy help

## Install all dependencies (backend venv + frontend node_modules) + git hooks
install:
	$(MAKE) -C backend install
	$(MAKE) -C frontend install
	@cp .githooks/pre-commit .git/hooks/pre-commit
	@chmod +x .git/hooks/pre-commit
	@echo "  ✓ pre-commit hook installed"

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

## Bump patch version, commit, and push to origin
push:
	@cd frontend && npm version patch --no-git-tag-version --silent
	@VERSION=$$(node -p "require('./frontend/package.json').version"); \
	git add frontend/package.json && \
	git commit -m "chore: bump version to v$$VERSION" && \
	git push && \
	echo "  ✓ Pushed v$$VERSION"

## Bump version, commit, push, and rebuild the Docker stack
deploy: push
	docker compose up --build -d
	@echo "  ✓ Deployed"

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
	@echo "  Release:"
	@echo "    make push    — bump patch version, commit, git push"
	@echo "    make deploy  — push + docker compose up --build -d"
	@echo ""

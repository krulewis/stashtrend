NODE_MODULES = node_modules

.PHONY: install test run build clean help

## Install all dependencies
install:
	npm install

## Run the full test suite
test: install
	npm test

## Start the Vite development server
run: install
	npm run dev

## Build for production
build: install
	npm run build

## Remove node_modules (forces a clean reinstall next time)
clean:
	rm -rf $(NODE_MODULES)

## Show available commands
help:
	@grep -E '^##' Makefile | sed 's/## //'

#!/usr/bin/env bash
# Run the frontend test suite.
# Installs dependencies automatically on first run (or when package.json changes).

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Install dependencies if node_modules is missing or package.json is newer
if [ ! -d "$SCRIPT_DIR/node_modules" ] || [ "$SCRIPT_DIR/package.json" -nt "$SCRIPT_DIR/node_modules" ]; then
  echo "Installing dependencies..."
  cd "$SCRIPT_DIR" && npm install
fi

cd "$SCRIPT_DIR"

# Run tests, passing any extra arguments through to vitest
echo ""
npm test -- "$@"

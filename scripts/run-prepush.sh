#!/bin/sh
set -eu

repository_root=$(git rev-parse --show-toplevel)
cd "$repository_root"

required_node=$(tr -d '[:space:]' < .node-version)

if command -v mise >/dev/null 2>&1; then
  echo "Installing locked dependencies and running the complete local CI gate with Node $required_node..."
  exec mise exec "node@$required_node" -- sh -c 'npm ci && npm run test:ci'
fi

actual_node=$(node --version 2>/dev/null | sed 's/^v//' || true)
if [ "$actual_node" != "$required_node" ]; then
  echo "Pre-push requires Node $required_node; found ${actual_node:-none}." >&2
  echo "Install mise or activate the exact Node version in .node-version." >&2
  exit 1
fi

echo "Installing locked dependencies and running the complete local CI gate with Node $required_node..."
npm ci
exec npm run test:ci

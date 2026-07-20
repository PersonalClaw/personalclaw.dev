#!/bin/sh
set -eu

repository_root=$(git rev-parse --show-toplevel)
cd "$repository_root"

git config --local core.hooksPath .githooks

if [ "$(git config --local --get core.hooksPath)" != ".githooks" ]; then
  echo "Failed to configure the repository-owned Git hooks." >&2
  exit 1
fi

echo "Installed repository Git hooks from .githooks."

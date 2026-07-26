#!/usr/bin/env zsh
set -euo pipefail

SCRIPT_DIR="${0:A:h}"
ARIA_ROOT="${SCRIPT_DIR:h}"

if command -v node >/dev/null 2>&1; then
  NODE_BIN="$(command -v node)"
elif [[ -x "/opt/homebrew/bin/node" ]]; then
  NODE_BIN="/opt/homebrew/bin/node"
else
  echo "aria: Node.js was not found. Install it with 'brew install node'." >&2
  exit 1
fi

cd "${ARIA_ROOT}"
export NODE_ENV="${NODE_ENV:-development}"
export ARIA_ENABLE_DEMO_LOGIN="${ARIA_ENABLE_DEMO_LOGIN:-true}"
exec "${NODE_BIN}" scripts/aria.mjs "$@"

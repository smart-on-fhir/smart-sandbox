#!/usr/bin/env bash
set -euo pipefail

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

LOG="$PROJECT_ROOT/logs/time-shift.log"
mkdir -p "$(dirname "$LOG")"

cd "$PROJECT_ROOT"

node ./scripts/timeShift.js >> "$LOG" 2>&1 && node ./scripts/makeBackup.js timeshift >> "$LOG" 2>&1
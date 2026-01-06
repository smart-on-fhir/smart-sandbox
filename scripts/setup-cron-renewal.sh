#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
set -o allexport
source "$ROOT_DIR/.env"
set +o allexport

CRON_COMMENT="# smart-sandbox letsencrypt renewal"
CRON_CMD="cd '$ROOT_DIR' && ./scripts/renew-letsencrypt-cert.sh"
CRON_SCHEDULE="0 3 * * *"
CRON_ENTRY="${CRON_SCHEDULE} ${CRON_CMD} ${CRON_COMMENT}"

existing=$(crontab -l 2>/dev/null || true)
if echo "$existing" | grep -F "$CRON_COMMENT" >/dev/null; then
  echo "Cron entry already exists."
  exit 0
fi

printf '%s
%s
' "$existing" "$CRON_ENTRY" | crontab -

echo "Installed cron job for Let's Encrypt renewal."

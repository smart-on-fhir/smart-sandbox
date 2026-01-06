#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
set -o allexport
source "$ROOT_DIR/.env"
set +o allexport

RENEW_ARGS=("renew" "--webroot" "-w" "/var/www/certbot")
if [[ "${CERTBOT_STAGING,,}" == "true" ]]; then
  RENEW_ARGS+=("--staging")
fi

docker compose run --rm certbot "${RENEW_ARGS[@]}"

echo "Renewal attempt complete."

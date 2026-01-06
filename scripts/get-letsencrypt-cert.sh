#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
set -o allexport
source "$ROOT_DIR/.env"
set +o allexport

CERT_DOMAINS=("${LETSENCRYPT_DOMAIN}")
CERT_ARGS=(
  "certonly"
  "--noninteractive"
  "--agree-tos"
  "--email"
  "${CERTBOT_EMAIL}"
  "--webroot"
  "-w"
  "/var/www/certbot"
)

for domain in "${CERT_DOMAINS[@]}"; do
  CERT_ARGS+=("-d" "${domain}")
done

# portable lowercase conversion (macOS bash is often 3.x and doesn't support ${VAR,,})
STAGING_LOWER="$(printf '%s' "${CERTBOT_STAGING}" | tr '[:upper:]' '[:lower:]')"
if [ "${STAGING_LOWER}" = "true" ]; then
  CERT_ARGS+=("--staging")
fi

docker compose run --rm certbot "${CERT_ARGS[@]}"

echo "Let's Encrypt certificate request submitted for ${CERT_DOMAINS[*]}"

# smart-sandbox
SMART Sandbox - WORK IN PROGRESS; NOT PRODUCTION READY!

## HAPI FHIR + Postgres stack

This workspace hosts a Docker Compose stack with:

- A [HAPI FHIR](https://hapifhir.io/) JPA server image behind a proxy.
- A Postgres database.
- An Nginx TLS proxy that front-ends HAPI (HTTP traffic on port 80 redirects to HTTPS).
  The proxy starts with a self-signed certificate (in `nginx/certs`) and switches to a
  Let’s Encrypt chain once obtained using a helper script.

### Quick start

```bash
# Clone the repo
git clone <repo-url>

# CD into the project directory
cd smart-sandbox

# Copy the example env file to your working .env
cp .env.example .env

# edit .env as needed (see Configuration details below)
nano .env

# Start the stack
docker compose up -d
```

### Configuration details

The stack loads runtime configuration from the `.env` file which includes
comments on all configurable parameters. The most important ones that must align
with your environment are:

- `POSTGRES_USER` - database username.
- `POSTGRES_PASSWORD` - database password.
- `POSTGRES_DB` - database schema name.
- `HOST` - hostname or IP address where the stack is accessible (e.g., `localhost`
  or a public IP or domain name).
- `PORT` - external port for HTTPS traffic (use `443` on real servers, or something
  else like `8443` for local testing).


 
### Obtaining a Let's Encrypt certificate

- TLS assets live in `nginx/certs` until you request an official Let’s Encrypt
  certificate. The `letsencrypt` directory stores generated keys and must be
  persisted across restarts.
- The `certbot` service is wired into Compose, and the helper scripts run
  `docker compose run --rm certbot ...` so you can obtain/renew certificates
  without remembering CLI flags.

1. Update `.env` so `LETSENCRYPT_DOMAIN` points to your reachable hostname, and
   set `CERTBOT_EMAIL` to a valid address (set `CERTBOT_STAGING=true` while testing).
2. Start the stack so nginx can serve HTTP on port 80 (the Compose service
   already maps this for you), then run:

```bash
./scripts/get-letsencrypt-cert.sh
```

This uses the `certbot` service to create a certificate via the webroot plugin
and stores the artifacts under `letsencrypt/live/${LETSENCRYPT_DOMAIN}`. When
the certificate exists, Nginx automatically evaluates the new paths during
startup and serves the Let’s Encrypt chain.

For renewals, run `./scripts/renew-letsencrypt-cert.sh` (set
`CERTBOT_STAGING=false` for production), then restart the stack to pick up the
renewed material. Add a host-side cron task such as:

```bash
0 3 * * * cd /path/to/smart-sandbox && ./scripts/renew-letsencrypt-cert.sh
```

Ensure the internal scheduler only runs when the proxy is accessible so ACME
challenges can succeed. Run `./scripts/setup-cron-renewal.sh` once on the host
to register that entry automatically, and re-run it if you ever wipe your user
crontab (the script is idempotent).


### Seeding initial data

```bash
node ./scripts/uploadPatients.js
```


This script tries to upload all JSON files in the `seed-data` directory to the
HAPI FHIR server. It tracks already-uploaded files in `.uploaded-files.json` to
avoid duplicates. This means that if it fails midway, you can fix the issue and
rerun it without re-uploading everything. It also means that to re-upload everything,
you need to delete `.uploaded-files.json` first, or you can just pass a `--reset` argument.

### Adding New Data
You can add new data files to the `seed-data` directory at any time. When you
run the upload script again, it will only upload the new files that haven't been
uploaded yet, based on the tracking in `.uploaded-files.json`. This allows you to
incrementally add data without re-uploading existing files.


### Nightly reset workflow
Every time data is uploaded, even if it wasn't the complete set, a snapshot of the
Postgres data directory is created and stored as `postgres-data-backup.tar.gz` in
the project root. This snapshot can be restored later to return the database to
this state. When a nightly reset is performed (automatically or manually), the
following steps occur:

1. The `postgres-data-backup.tar.gz` snapshot is extracted into new directory on the host machine.
2. New containers are created for Postgres and HAPI, ensuring a clean environment.
3. The HAPI container is restarted to connect to the restored database.
4. The upload tracking log `.uploaded-files.json` is cleared, allowing all data files to be re-uploaded.
5. The seeding script is run again to repopulate the database

```bash
./scripts/reset-db.sh
```

This script drops and recreates the Postgres schema, restarts the HAPI container,
and reruns the seeder so the sandbox returns to a predictable state.

### Scheduling resets (suggested)

Use your preferred scheduler (`cron`, `launchd`, CI runners, etc.) to run the
reset script nightly. Example `cron` job:

```cron
0 2 * * * cd /Users/vlad/dev/smart-sandbox && ./scripts/reset-db.sh
```

Adjust the schedule or working directory to align with your host environment.

### System requirements
- 4GB+ RAM
- Docker and Docker Compose installed
- Node.js (for running management scripts)

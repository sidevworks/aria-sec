# ARIA Controlled Pilot Operations Runbook

## Supported pilot deployment

Use the Docker Compose stack on a dedicated host. The published API and database ports are loopback-bound. Do not expose the Node service directly to the internet and do not connect this pilot stack to the YC demo deployment.

Required preparation:

1. Install Docker with Compose support.
2. Generate a unique 64-character credential-encryption key with `node scripts/generate-encryption-key.mjs`.
3. Set a strong `ARIA_POSTGRES_PASSWORD` and a session secret of at least 32 characters.
4. Keep connector and model keys outside the repository.
5. Review [connector permissions](CONNECTOR-LEAST-PRIVILEGE.md).

Start:

```sh
docker compose up --build -d
docker compose ps
curl http://127.0.0.1:5000/api/aria/health
```

The server must fail to start if credential encryption or durable persistence is not configured in production mode.

## Health and latency checks

- `/api/aria/health` reports service, persistence and connector health.
- `/api/voice/status` reports Whisper readiness and the most recent STT, narrative and TTS timing measurements.
- `/api/aria/compliance/status` reports current security configuration and quota state.
- Monitor container restarts, disk usage, Postgres health and failed health checks outside ARIA.

Set an external monitor against the loopback health endpoint from the host or through the customer's private monitoring agent. Alert after three consecutive failures.

## Evidence export

An admin or owner can request `/api/aria/audit-export`. Add `decision_id` to produce a correlated decision pack. Every pack includes a canonical SHA-256 digest. Set `ARIA_AUDIT_EXPORT_SIGNING_KEY` to a separate secret of at least 32 characters to add an HMAC signature.

Store signed exports in a customer-owned archive or SIEM. The signing key must not be stored beside the export.

## File-state backup and restore

The commands below cover `ARIA_PERSISTENCE_DIR`. They do not replace a Postgres backup.

```sh
ARIA_PERSISTENCE_DIR=/data/aria-memory npm run state:backup -- /secure/backups/aria-2026-08-02
npm run state:restore -- /secure/backups/aria-2026-08-02 /empty/restore-check
```

The backup includes a SHA-256 manifest. Restore refuses a modified backup and refuses a non-empty target. Perform a restore drill before onboarding pilot data and at least monthly during a longer pilot.

For Postgres, use the customer's approved `pg_dump` and `pg_restore` process, encrypt the dump, and test restoration into an isolated database.

## Incident handling

1. Contain access to the ARIA host at the network layer.
2. Preserve container logs, the persistence directory, Postgres and signed audit exports.
3. Revoke affected connector tokens at the provider before removing local records.
4. Rotate session, encryption, audit-signing and provider secrets as appropriate.
5. Treat staged actions as proposals. Confirm target-system state independently before declaring containment.
6. Report product vulnerabilities through the private process in [SECURITY.md](../../SECURITY.md).

## Shutdown and removal

```sh
docker compose down
```

Do not use `docker compose down -v` until the customer has approved permanent deletion and verified the final backup. Revoke provider credentials even if the local container volumes are removed.

## Pilot acceptance evidence

Retain:

- CI result for lint, all isolated tests, production build and container build
- Connector least-privilege validation notes
- One independently verified real action
- One operator override showing audit, evidence and Trust Ladder effects
- A signed audit evidence pack
- A successful file-state restore drill and customer database restore evidence
- Cold-start and warm-turn voice timings from the target pilot host

# Security Policy

ARIA Guardian is source-available software under the Business Source License 1.1 and is not yet production-ready.

## Reporting a vulnerability

Do not disclose an unpatched vulnerability in a public issue. Use the repository's private GitHub Security Advisory reporting flow. Include the affected version or commit, reproduction steps, impact and any suggested mitigation.

The maintainer will acknowledge a complete report as soon as practical, assess severity, coordinate a fix and publish remediation information after affected users have had a reasonable opportunity to update.

## Supported security boundary

- The local server is intended to bind to loopback or a private, access-controlled network.
- Production startup is fail-closed for credential encryption and durable persistence.
- Connector credentials must be supplied through the encrypted vault, a supported secrets manager or process environment.
- Demo and sample modes are not security evidence.
- Staged plans and generated artifacts are not external enforcement.

Before a pilot, review [the operations runbook](docs/pilot/OPERATIONS-RUNBOOK.md) and [connector permissions](docs/pilot/CONNECTOR-LEAST-PRIVILEGE.md).

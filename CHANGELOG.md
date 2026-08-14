# Changelog

## 2026-08-15 - Controlled pilot hardening

This release brings the public repository up to the verified private development
baseline used for continued YC review.

### Added

- Operator override flow for incorrect ARIA recommendations, including written
  rationale and correlated decision, evidence, audit, memory and Trust Ladder state.
- Tenant and decision-scoped evidence exports with SHA-256 integrity and optional
  HMAC-SHA256 signing.
- Bounded autonomous-response replay across restarts.
- Verified backup and safe restore tooling for file-backed state.
- Connector least-privilege guidance, an operations runbook and a security policy.
- GitHub Actions quality and Docker gates with no deployment step.

### Changed

- Live, staged and externally enforced outcomes are represented separately.
- Action verification uses post-action observations.
- Realtime narration uses an eight-second reasoning ceiling and ElevenLabs Flash
  streaming for lower time to first audio.
- Connector metadata consistently honors the configured persistence directory.
- Server startup no longer duplicates schedulers when a preferred port is unavailable.

### Verified

- 48 isolated test files pass, including the YC access contract.
- ESLint reports no errors.
- The production Vite build succeeds.
- The Docker image builds in GitHub Actions.

### Still external to this release

- Customer-owned connector credential validation.
- A customer-approved, independently observed live response action.
- Pilot-host restore drills, monitoring and cold or warm voice measurements.

ARIA remains pilot-candidate software rather than a finished commercial security
platform.

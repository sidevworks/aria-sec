-- Governance ledger tables for ARIA Guardian's multi-tenant enterprise deployment.
-- Replaces the flat-JSON store in ariaTrust.mjs / ariaOrchestrator.mjs / auditLog.mjs
-- / ariaMemory.mjs (approvals). findings.md / ARIA_NOTES.md remain append-only files —
-- they are human-readable narrative logs, not governance state requiring transactions.

CREATE TABLE IF NOT EXISTS tenants (
  tenant_id   TEXT PRIMARY KEY,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trust ladder: one row per (tenant, capability). Promotions/demotions/outcome
-- recording must be atomic with their audit entry — see db.mjs withTransaction.
CREATE TABLE IF NOT EXISTS trust_scores (
  tenant_id     TEXT NOT NULL,
  capability    TEXT NOT NULL,
  successes     INTEGER NOT NULL DEFAULT 0,
  failures      INTEGER NOT NULL DEFAULT 0,
  overrides     INTEGER NOT NULL DEFAULT 0,
  mode          TEXT NOT NULL DEFAULT 'approval',
  recent        JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, capability)
);

CREATE TABLE IF NOT EXISTS decisions (
  decision_id   TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL,
  payload       JSONB NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS decisions_tenant_created_idx ON decisions (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS evidence (
  evidence_id   TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL,
  decision_id   TEXT,
  status        TEXT NOT NULL DEFAULT 'proposed',
  outcome       JSONB,
  payload       JSONB NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS evidence_tenant_created_idx ON evidence (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS audit_events (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT,
  event_type    TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'success',
  actor         TEXT NOT NULL DEFAULT 'system',
  context       JSONB NOT NULL DEFAULT '{}'::jsonb,
  retain_until  TIMESTAMPTZ,
  redacted_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_events_tenant_created_idx ON audit_events (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_type_idx ON audit_events (event_type);

CREATE TABLE IF NOT EXISTS approvals (
  approval_id   TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending',
  payload       JSONB NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS approvals_tenant_status_idx ON approvals (tenant_id, status);

CREATE TABLE IF NOT EXISTS scan_records (
  scan_id       TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL,
  payload       JSONB NOT NULL,
  started_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS scan_records_tenant_started_idx ON scan_records (tenant_id, started_at DESC);

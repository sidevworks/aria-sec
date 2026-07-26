// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

/**
 * ARIA Trust & Autonomy Engine — §5 of the ARIA architecture spec
 *
 * Platform-owned trust scores. The model reads these values but never writes them.
 * Per-capability tracking: successes, failures, overrides → trust score → mode promotion.
 * Mode ladder: approval → assisted → auto → full_auto
 *
 * Production rules:
 *   - Promotions are NEVER automatic. recordOutcome only updates counters/trust;
 *     elevation to the next mode requires an explicit operator action via
 *     promoteCapability() with a written reason that is auditable.
 *   - Auto-demote remains on: a single failure or an override-count breach drops
 *     one stage immediately. This is a safety property, not an autonomy choice.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { persistencePath } from "./persistenceConfig.mjs";
import { logAuditEvent } from "./auditLog.mjs";
import { isDbConfigured, query, withTransaction } from "./db.mjs";

// Trust ladder state is tenant-scoped: one customer's capability promotions,
// override history, and gate progress must never bleed into another's.
function sanitizeTenantSegment(tenantId) {
  const value = String(tenantId || "tenant-local").trim();
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(value) ? value : "tenant-local";
}

function trustPath(tenantId) {
  return persistencePath(["tenants", sanitizeTenantSegment(tenantId), "trust-scores.json"], { purpose: "ARIA trust scores" });
}

export const CAPABILITIES = ["threat_analysis", "remediation", "containment", "identity_actions"];
export const MODES = ["approval", "assisted", "auto", "full_auto"];

const MODE_ORDER = MODES;
const RECENT_CAP = 20;

const PROMOTION_THRESHOLDS = {
  approval:  { to: "assisted",  min_trust: 0.80, min_samples: 10, max_overrides: 3 },
  assisted:  { to: "auto",      min_trust: 0.90, min_samples: 30, max_overrides: 2 },
  auto:      { to: "full_auto", min_trust: 0.97, min_samples: 80, max_overrides: 1 },
  full_auto: null,
};

const DEFAULT_ENTRY = { successes: 0, failures: 0, overrides: 0, mode: "approval", trust: 0, recent: [] };

function nowIso() {
  return new Date().toISOString();
}

function computeTrust({ successes, failures, overrides }) {
  const total = successes + failures;
  if (total === 0) return 0;
  return Math.round((successes / (total + overrides * 0.5)) * 1000) / 1000;
}

function normalizeRecent(recent) {
  if (!Array.isArray(recent)) return [];
  return recent.slice(-RECENT_CAP).filter(r => r && typeof r === "object" && ["success", "failure", "override"].includes(r.outcome));
}

function readScores(tenantId) {
  try {
    const parsed = JSON.parse(readFileSync(trustPath(tenantId), "utf8"));
    if (!parsed || typeof parsed !== "object") return {};
    return parsed;
  } catch {
    return {};
  }
}

function writeScores(scores, tenantId) {
  try {
    const path = trustPath(tenantId);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(scores, null, 2));
  } catch {
    // Non-fatal: persistence not configured in this environment
  }
}

function readEntry(stored, capability) {
  const raw = { ...DEFAULT_ENTRY, ...(stored[capability] || {}) };
  raw.recent = normalizeRecent(raw.recent);
  if (!MODE_ORDER.includes(raw.mode)) raw.mode = "approval";
  raw.trust = computeTrust(raw);
  return raw;
}

// ── Postgres backend helpers ──────────────────────────────────────────────────
// Active only when isDbConfigured() (ARIA_DATABASE_URL set). Each row is the
// per-(tenant, capability) trust state; the same DEFAULT_ENTRY/readEntry shape is
// reconstructed from a row so the backend-agnostic gate logic is fed identically.

function entryFromRow(row) {
  if (!row) return readEntry({}, null);
  return readEntry(
    {
      __row: {
        successes: row.successes,
        failures: row.failures,
        overrides: row.overrides,
        mode: row.mode,
        recent: row.recent,
      },
    },
    "__row",
  );
}

// Reads a full stored-map (capability -> raw entry) for a tenant from Postgres,
// shaped like the flat-file `readScores` result so callers can reuse readEntry().
async function dbReadScores(tenantId) {
  const tenant = sanitizeTenantSegment(tenantId);
  const { rows } = await query(
    "SELECT capability, successes, failures, overrides, mode, recent FROM trust_scores WHERE tenant_id = $1",
    [tenant],
  );
  const stored = {};
  for (const row of rows) {
    stored[row.capability] = {
      successes: row.successes,
      failures: row.failures,
      overrides: row.overrides,
      mode: row.mode,
      recent: row.recent,
    };
  }
  return stored;
}

// Reads a single capability row for a tenant. `client` (a tx client) is used when
// the read must participate in an in-flight transaction; otherwise the pool.
async function dbReadEntry(tenantId, capability, client) {
  const tenant = sanitizeTenantSegment(tenantId);
  const runner = client ? (text, params) => client.query(text, params) : query;
  const { rows } = await runner(
    "SELECT successes, failures, overrides, mode, recent FROM trust_scores WHERE tenant_id = $1 AND capability = $2",
    [tenant, capability],
  );
  return entryFromRow(rows[0]);
}

// Upserts a capability's persisted columns (counters + mode + recent) for a tenant.
async function dbUpsertEntry(client, tenantId, capability, entry) {
  const tenant = sanitizeTenantSegment(tenantId);
  await client.query(
    `INSERT INTO trust_scores (tenant_id, capability, successes, failures, overrides, mode, recent, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, now())
     ON CONFLICT (tenant_id, capability) DO UPDATE
       SET successes = EXCLUDED.successes,
           failures  = EXCLUDED.failures,
           overrides = EXCLUDED.overrides,
           mode      = EXCLUDED.mode,
           recent    = EXCLUDED.recent,
           updated_at = now()`,
    [
      tenant,
      capability,
      entry.successes,
      entry.failures,
      entry.overrides,
      entry.mode,
      JSON.stringify(normalizeRecent(entry.recent)),
    ],
  );
}

function evaluateGates(entry) {
  const threshold = PROMOTION_THRESHOLDS[entry.mode];
  if (!threshold) {
    return {
      next_mode: null,
      thresholds: null,
      gates: { trust_ok: true, samples_ok: true, overrides_ok: true },
      blocking_reason: null,
      ready_to_promote: false,
    };
  }
  const samples = entry.successes + entry.failures;
  const trust_ok = entry.trust >= threshold.min_trust;
  const samples_ok = samples >= threshold.min_samples;
  const overrides_ok = entry.overrides <= threshold.max_overrides;

  let blocking_reason = null;
  if (!samples_ok) {
    const need = threshold.min_samples - samples;
    blocking_reason = `Needs ${need} more sample${need === 1 ? "" : "s"} (have ${samples}/${threshold.min_samples}).`;
  } else if (!trust_ok) {
    blocking_reason = `Trust ${Math.round(entry.trust * 100)}% is below ${Math.round(threshold.min_trust * 100)}% threshold.`;
  } else if (!overrides_ok) {
    blocking_reason = `Override count ${entry.overrides} exceeds limit of ${threshold.max_overrides} — review recent overrides before promoting.`;
  }

  return {
    next_mode: threshold.to,
    thresholds: { min_trust: threshold.min_trust, min_samples: threshold.min_samples, max_overrides: threshold.max_overrides },
    gates: { trust_ok, samples_ok, overrides_ok },
    blocking_reason,
    ready_to_promote: trust_ok && samples_ok && overrides_ok,
  };
}

function maybeAutoDemote(entry, threshold) {
  // Safety property: failures or excess overrides at the current stage pull the
  // capability back one rung. Never auto-promotes.
  if (!threshold) return { entry, demoted: false };
  const modeIdx = MODE_ORDER.indexOf(entry.mode);
  if (modeIdx <= 0) return { entry, demoted: false };
  if (entry.failures > 0 || entry.overrides > threshold.max_overrides) {
    return { entry: { ...entry, mode: MODE_ORDER[modeIdx - 1] }, demoted: true, from: entry.mode };
  }
  return { entry, demoted: false };
}

export async function getTrustScores(tenantId) {
  const stored = isDbConfigured() ? await dbReadScores(tenantId) : readScores(tenantId);
  return Object.fromEntries(CAPABILITIES.map(cap => [cap, readEntry(stored, cap)]));
}

export async function getCapabilityMode(capability, tenantId) {
  return (await getTrustScores(tenantId))[capability]?.mode || "approval";
}

// Computes the post-outcome entry (counters bumped, recent appended, auto-demote
// applied) from a `before` entry. Backend-agnostic — both paths use it.
function applyOutcome(before, outcome) {
  const raw = { ...before };
  if (outcome === "success") raw.successes++;
  else if (outcome === "failure") raw.failures++;
  else if (outcome === "override") raw.overrides++;

  raw.recent = [...raw.recent, { outcome, at: nowIso() }].slice(-RECENT_CAP);
  raw.trust = computeTrust(raw);

  const threshold = PROMOTION_THRESHOLDS[raw.mode];
  return maybeAutoDemote(raw, threshold);
}

export async function recordOutcome(capability, outcome, actor = "system", tenantId) {
  if (!CAPABILITIES.includes(capability)) return null;
  if (!["success", "failure", "override"].includes(outcome)) return null;

  if (isDbConfigured()) {
    const { afterDemote, demoted, from } = await withTransaction(async (client) => {
      const before = await dbReadEntry(tenantId, capability, client);
      const { entry: afterDemote, demoted, from } = applyOutcome(before, outcome);
      await dbUpsertEntry(client, tenantId, capability, afterDemote);
      // Best-effort audit: a logging failure must not abort the trust-score commit.
      try {
        logAuditEvent({
          event_type: "aria.trust.updated",
          actor,
          context: {
            tenant_id: sanitizeTenantSegment(tenantId),
            capability,
            outcome,
            new_trust: afterDemote.trust,
            new_mode: afterDemote.mode,
          },
        });
        if (demoted) {
          logAuditEvent({
            event_type: "aria.trust.demoted",
            actor: "system",
            context: { tenant_id: sanitizeTenantSegment(tenantId), capability, from, to: afterDemote.mode, manual: false, reason: outcome === "failure" ? "auto-demote: failure recorded" : "auto-demote: override limit exceeded" },
          });
        }
      } catch {
        // Non-fatal
      }
      return { afterDemote, demoted, from };
    });
    return entryFromRow({
      successes: afterDemote.successes,
      failures: afterDemote.failures,
      overrides: afterDemote.overrides,
      mode: afterDemote.mode,
      recent: afterDemote.recent,
    });
  }

  const stored = readScores(tenantId);
  const before = readEntry(stored, capability);
  const { entry: afterDemote, demoted, from } = applyOutcome(before, outcome);

  stored[capability] = afterDemote;
  writeScores(stored, tenantId);

  try {
    logAuditEvent({
      event_type: "aria.trust.updated",
      actor,
      context: {
        tenant_id: sanitizeTenantSegment(tenantId),
        capability,
        outcome,
        new_trust: afterDemote.trust,
        new_mode: afterDemote.mode,
      },
    });
    if (demoted) {
      logAuditEvent({
        event_type: "aria.trust.demoted",
        actor: "system",
        context: { tenant_id: sanitizeTenantSegment(tenantId), capability, from, to: afterDemote.mode, manual: false, reason: outcome === "failure" ? "auto-demote: failure recorded" : "auto-demote: override limit exceeded" },
      });
    }
  } catch {
    // Non-fatal
  }

  return readEntry(stored, capability);
}

// Manual mode override — legacy. Kept for back-compat. Prefer promoteCapability
// or demoteCapability with a reason for new callers.
export async function setCapabilityMode(capability, mode, actor = "analyst", tenantId) {
  if (!CAPABILITIES.includes(capability) || !MODE_ORDER.includes(mode)) return null;

  if (isDbConfigured()) {
    const updated = await withTransaction(async (client) => {
      const before = await dbReadEntry(tenantId, capability, client);
      const next = { ...before, mode };
      await dbUpsertEntry(client, tenantId, capability, next);
      try {
        logAuditEvent({
          event_type: "aria.trust.mode_set",
          actor,
          context: { tenant_id: sanitizeTenantSegment(tenantId), capability, from: before.mode, to: mode },
        });
      } catch {
        // Non-fatal
      }
      return next;
    });
    return entryFromRow({
      successes: updated.successes,
      failures: updated.failures,
      overrides: updated.overrides,
      mode: updated.mode,
      recent: updated.recent,
    });
  }

  const stored = readScores(tenantId);
  const before = readEntry(stored, capability);
  stored[capability] = { ...before, mode };
  writeScores(stored, tenantId);

  try {
    logAuditEvent({
      event_type: "aria.trust.mode_set",
      actor,
      context: { tenant_id: sanitizeTenantSegment(tenantId), capability, from: before.mode, to: mode },
    });
  } catch {
    // Non-fatal
  }

  return readEntry(stored, capability);
}

export async function promoteCapability(capability, actor, reason, tenantId) {
  if (!CAPABILITIES.includes(capability)) {
    return { ok: false, error: `Unknown capability. Valid: ${CAPABILITIES.join(", ")}` };
  }
  const trimmedReason = typeof reason === "string" ? reason.trim() : "";
  if (trimmedReason.length < 4) {
    return { ok: false, error: "A reason of at least 4 characters is required to promote a capability." };
  }

  if (isDbConfigured()) {
    return withTransaction(async (client) => {
      const entry = await dbReadEntry(tenantId, capability, client);
      const evald = evaluateGates(entry);
      if (!evald.next_mode) {
        return { ok: false, error: `${capability} is already at the highest stage (${entry.mode}).` };
      }
      if (!evald.ready_to_promote) {
        return { ok: false, error: evald.blocking_reason || "Promotion gates not satisfied.", blocking_reason: evald.blocking_reason };
      }
      const from = entry.mode;
      const to = evald.next_mode;
      const next = { ...entry, mode: to };
      await dbUpsertEntry(client, tenantId, capability, next);
      try {
        logAuditEvent({
          event_type: "aria.trust.promoted",
          actor: actor || "analyst",
          context: { tenant_id: sanitizeTenantSegment(tenantId), capability, from, to, reason: trimmedReason, by_threshold: true },
        });
      } catch {
        // Non-fatal
      }
      return { ok: true, capability, from, to, updated: entryFromRow({ successes: next.successes, failures: next.failures, overrides: next.overrides, mode: next.mode, recent: next.recent }) };
    });
  }

  const stored = readScores(tenantId);
  const entry = readEntry(stored, capability);
  const evald = evaluateGates(entry);
  if (!evald.next_mode) {
    return { ok: false, error: `${capability} is already at the highest stage (${entry.mode}).` };
  }
  if (!evald.ready_to_promote) {
    return { ok: false, error: evald.blocking_reason || "Promotion gates not satisfied.", blocking_reason: evald.blocking_reason };
  }

  const from = entry.mode;
  const to = evald.next_mode;
  stored[capability] = { ...entry, mode: to };
  writeScores(stored, tenantId);

  try {
    logAuditEvent({
      event_type: "aria.trust.promoted",
      actor: actor || "analyst",
      context: { tenant_id: sanitizeTenantSegment(tenantId), capability, from, to, reason: trimmedReason, by_threshold: true },
    });
  } catch {
    // Non-fatal
  }

  return { ok: true, capability, from, to, updated: readEntry(stored, capability) };
}

export async function demoteCapability(capability, actor, reason, tenantId) {
  if (!CAPABILITIES.includes(capability)) {
    return { ok: false, error: `Unknown capability. Valid: ${CAPABILITIES.join(", ")}` };
  }
  const trimmedReason = typeof reason === "string" ? reason.trim() : "";
  if (trimmedReason.length < 4) {
    return { ok: false, error: "A reason of at least 4 characters is required to roll back a capability." };
  }

  if (isDbConfigured()) {
    return withTransaction(async (client) => {
      const entry = await dbReadEntry(tenantId, capability, client);
      const modeIdx = MODE_ORDER.indexOf(entry.mode);
      if (modeIdx <= 0) {
        return { ok: false, error: `${capability} is already at the most restrictive stage (approval).` };
      }
      const from = entry.mode;
      const to = MODE_ORDER[modeIdx - 1];
      const next = { ...entry, mode: to };
      await dbUpsertEntry(client, tenantId, capability, next);
      try {
        logAuditEvent({
          event_type: "aria.trust.demoted",
          actor: actor || "analyst",
          context: { tenant_id: sanitizeTenantSegment(tenantId), capability, from, to, reason: trimmedReason, manual: true },
        });
      } catch {
        // Non-fatal
      }
      return { ok: true, capability, from, to, updated: entryFromRow({ successes: next.successes, failures: next.failures, overrides: next.overrides, mode: next.mode, recent: next.recent }) };
    });
  }

  const stored = readScores(tenantId);
  const entry = readEntry(stored, capability);
  const modeIdx = MODE_ORDER.indexOf(entry.mode);
  if (modeIdx <= 0) {
    return { ok: false, error: `${capability} is already at the most restrictive stage (approval).` };
  }
  const from = entry.mode;
  const to = MODE_ORDER[modeIdx - 1];
  stored[capability] = { ...entry, mode: to };
  writeScores(stored, tenantId);

  try {
    logAuditEvent({
      event_type: "aria.trust.demoted",
      actor: actor || "analyst",
      context: { tenant_id: sanitizeTenantSegment(tenantId), capability, from, to, reason: trimmedReason, manual: true },
    });
  } catch {
    // Non-fatal
  }

  return { ok: true, capability, from, to, updated: readEntry(stored, capability) };
}

export async function getTrustSummary(tenantId) {
  const scores = await getTrustScores(tenantId);
  return CAPABILITIES.map(cap => {
    const entry = scores[cap];
    const evald = evaluateGates(entry);
    const samples = entry.successes + entry.failures;
    return {
      capability: cap,
      mode: entry.mode,
      trust: entry.trust,
      trust_pct: Math.round((entry.trust || 0) * 100),
      successes: entry.successes,
      failures: entry.failures,
      overrides: entry.overrides,
      samples,
      recent: entry.recent,
      next_mode: evald.next_mode,
      thresholds: evald.thresholds,
      gates: evald.gates,
      blocking_reason: evald.blocking_reason,
      ready_to_promote: evald.ready_to_promote,
    };
  });
}

// Returns the most restrictive mode across all capabilities — used as the
// effective autonomy ceiling when capability is not specified.
export async function getGlobalAutonomyMode(tenantId) {
  const scores = await getTrustScores(tenantId);
  const modes = CAPABILITIES.map(cap => MODE_ORDER.indexOf(scores[cap].mode));
  const minIdx = Math.min(...modes);
  return MODE_ORDER[minIdx] || "approval";
}

// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { logAuditEvent } from "./auditLog.mjs";
import {
  isDurable,
  durableGet,
  durableSet,
  durableDel,
  durableLpush,
  durableLrange,
  durableScan,
} from "./durableStore.mjs";
import { resolveLegacyMemoryDir } from "./persistenceConfig.mjs";

// ── Canonical capability and role lists (sourced from authz.mjs and policy domain) ──

// Roles from authz.mjs SUPPORTED_ROLES + contractor (used in templates)
export const CANONICAL_ROLES = new Set([
  "owner",
  "admin",
  "analyst",
  "viewer",
  "contractor",
]);

// Canonical policy capabilities — covers both legacy simple caps and scoped cap format
export const CANONICAL_CAPABILITIES = new Set([
  // Legacy simple capabilities (used in seed policies)
  "read",
  "write",
  "delete",
  "manage_users",
  "manage_policies",
  // Scoped capabilities (used in templates and new policies)
  "read:incidents",
  "write:incidents",
  "read:blocked-ips",
  "write:blocked-ips",
  "read:quarantine",
  "write:quarantine",
  "read:policies",
  "write:policies",
  "read:sessions",
  "write:sessions",
  "read:audit",
  "write:audit",
  "read:users",
  "write:users",
  "owner:policies",
  "owner:users",
  "owner:tenants",
]);

// ── Policy templates ──────────────────────────────────────────────────────────

export const POLICY_TEMPLATES = {
  "least-privilege": {
    name: "Least Privilege",
    description: "Minimum permissions for day-to-day operations",
    capabilities: ["read:incidents", "read:policies", "read:sessions"],
    roles: ["analyst"],
  },
  "deny-all": {
    name: "Deny All",
    description: "Block all capabilities — use as a lockdown base",
    capabilities: [],
    roles: [],
  },
  "read-only-analyst": {
    name: "Read-Only Analyst",
    description: "Read access to all panels, no write or admin",
    capabilities: [
      "read:incidents",
      "read:blocked-ips",
      "read:quarantine",
      "read:policies",
      "read:sessions",
      "read:audit",
    ],
    roles: ["analyst"],
  },
  "contractor-scoped": {
    name: "Contractor Scoped",
    description: "Temporary write access scoped to specific resources only",
    capabilities: ["read:incidents", "write:incidents", "read:policies"],
    roles: ["contractor"],
    expires_in_days: 30,
  },
};

export function getPolicyTemplates() {
  return POLICY_TEMPLATES;
}

// ── File-based persistence (legacy fallback paths) ────────────────────────────

const MEMORY_DIR = resolveLegacyMemoryDir();

const POLICIES_PATH       = join(MEMORY_DIR, "policies.json");
const POLICY_HISTORY_PATH = join(MEMORY_DIR, "policy-history.json");

const HIGH_RISK_CAPS = new Set(["manage_policies", "manage_users", "delete"]);

const SEED_POLICIES = [
  {
    id: "pol-rbac-admin",
    tenant_id: "tenant-alpha",
    name: "Admin Full Access",
    type: "rbac",
    role: "admin",
    capabilities: ["read", "write", "delete", "manage_users", "manage_policies"],
    scope: "global",
    enabled: true,
    created_at: "2024-01-01T00:00:00.000Z",
    updated_at: "2024-01-01T00:00:00.000Z",
  },
  {
    id: "pol-rbac-operator",
    tenant_id: "tenant-alpha",
    name: "Operator Write Access",
    type: "rbac",
    role: "operator",
    capabilities: ["read", "write"],
    scope: "global",
    enabled: true,
    created_at: "2024-01-01T00:00:00.000Z",
    updated_at: "2024-01-01T00:00:00.000Z",
  },
  {
    id: "pol-rbac-viewer",
    tenant_id: "tenant-alpha",
    name: "Viewer Read Only",
    type: "rbac",
    role: "viewer",
    capabilities: ["read"],
    scope: "global",
    enabled: true,
    created_at: "2024-01-01T00:00:00.000Z",
    updated_at: "2024-01-01T00:00:00.000Z",
  },
];

// ── In-memory fallback Map (when isDurable() is false) ───────────────────────

const _memPolicies = new Map();
const _memPolicyHistory = new Map();
let _memWarnEmitted = false;

function warnMemory() {
  if (!_memWarnEmitted) {
    _memWarnEmitted = true;
    console.warn(
      "[policyStore] KV not configured — using in-memory policy store. State will be lost on restart."
    );
  }
}

// ── File helpers (kept for legacy fallback) ───────────────────────────────────

function ensureDir() {
  if (!existsSync(MEMORY_DIR)) mkdirSync(MEMORY_DIR, { recursive: true });
}

function readJson(path, fallback) {
  try {
    if (!existsSync(path)) return fallback;
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(path, data) {
  ensureDir();
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function loadPoliciesFromFile() {
  const data = readJson(POLICIES_PATH, null);
  if (!Array.isArray(data)) {
    writeJson(POLICIES_PATH, SEED_POLICIES);
    return SEED_POLICIES;
  }
  return data;
}

function loadHistoryFromFile() {
  const data = readJson(POLICY_HISTORY_PATH, []);
  return Array.isArray(data) ? data : [];
}

// ── KV key builders ───────────────────────────────────────────────────────────

function policyKey(tenantId, policyId) {
  return `policy:${tenantId}:${policyId}`;
}

function historyKey(tenantId, policyId) {
  return `policy-history:${tenantId}:${policyId}`;
}

// ── KV read/write helpers ─────────────────────────────────────────────────────

async function kvGetPolicy(tenantId, policyId) {
  if (isDurable()) {
    const raw = await durableGet(policyKey(tenantId, policyId));
    if (raw == null) return null;
    try { return typeof raw === "object" ? raw : JSON.parse(raw); } catch { return null; }
  }
  warnMemory();
  return _memPolicies.get(policyKey(tenantId, policyId)) ?? null;
}

async function kvSetPolicy(tenantId, policyId, policy) {
  if (isDurable()) {
    await durableSet(policyKey(tenantId, policyId), policy);
    return;
  }
  warnMemory();
  _memPolicies.set(policyKey(tenantId, policyId), policy);
}

async function kvGetHistory(tenantId, policyId) {
  if (isDurable()) {
    return durableLrange(historyKey(tenantId, policyId), 0, -1);
  }
  warnMemory();
  return _memPolicyHistory.get(historyKey(tenantId, policyId)) || [];
}

async function kvPushHistory(tenantId, policyId, snapshot) {
  if (isDurable()) {
    await durableLpush(historyKey(tenantId, policyId), snapshot, 20);
    return;
  }
  warnMemory();
  const k = historyKey(tenantId, policyId);
  const list = _memPolicyHistory.get(k) || [];
  list.unshift(snapshot);
  if (list.length > 20) list.length = 20;
  _memPolicyHistory.set(k, list);
}

async function kvSaveTrimmedHistory(tenantId, policyId, list) {
  // After a pop we need to save the trimmed list back.
  // In KV (Redis list) we achieved this via LPUSH+LTRIM; for in-memory we just overwrite.
  if (isDurable()) {
    // There's no clean "replace whole list" in the current durableStore API without
    // DEL + multiple LPUSHes. We rebuild it: delete key then push in reverse order
    // so the final state matches (newest = index 0).
    await durableDel(historyKey(tenantId, policyId));
    // Push from oldest to newest so newest ends up at index 0
    for (let i = list.length - 1; i >= 0; i--) {
      await durableLpush(historyKey(tenantId, policyId), list[i], 20);
    }
    return;
  }
  warnMemory();
  const k = historyKey(tenantId, policyId);
  _memPolicyHistory.set(k, list.slice(0, 20));
}

// ── Risk classification ───────────────────────────────────────────────────────

function ownerScopeCaps(caps) {
  return caps.filter((c) => c.startsWith("owner:") || c === "manage_users" || c === "manage_policies");
}

function writeScopeCaps(caps) {
  return caps.filter((c) => c.startsWith("write:") || c === "write" || c === "delete");
}

function readScopeCaps(caps) {
  return caps.filter((c) => c.startsWith("read:") || c === "read");
}

function classifyRiskNew(currentPolicy, proposedData) {
  const prevCaps = currentPolicy?.capabilities || [];
  const nextCaps = proposedData?.capabilities || [];
  const added    = nextCaps.filter((c) => !prevCaps.includes(c));
  const removed  = prevCaps.filter((c) => !nextCaps.includes(c));

  if (ownerScopeCaps(added).length > 0) {
    return { risk_level: "critical", risk_reason: "Owner-scope permissions are being added" };
  }
  if (writeScopeCaps(added).length > 0) {
    return { risk_level: "high", risk_reason: "Write-scope permissions are being added" };
  }
  if (readScopeCaps(removed).length > 0) {
    return { risk_level: "medium", risk_reason: "Read-scope permissions are being removed" };
  }
  return { risk_level: "low", risk_reason: "No significant permission changes detected" };
}

function classifyRisk(before, proposed) {
  const prevCaps = before?.capabilities  || [];
  const nextCaps = proposed?.capabilities || [];
  const added    = nextCaps.filter((c) => !prevCaps.includes(c));
  const removed  = prevCaps.filter((c) => !nextCaps.includes(c));

  if (added.some((c) => HIGH_RISK_CAPS.has(c))) return "high";
  if (added.length > 0)                          return "medium";
  if (removed.length > 0)                        return "low";
  if (before?.enabled !== proposed?.enabled)     return "medium";
  return "low";
}

function buildDiff(before, after) {
  const keys = new Set([
    ...Object.keys(before || {}),
    ...Object.keys(after  || {}),
  ]);
  keys.delete("updated_at");
  const diff = [];
  for (const key of keys) {
    const bVal = JSON.stringify((before || {})[key]);
    const aVal = JSON.stringify((after  || {})[key]);
    if (bVal !== aVal) diff.push({ field: key, before: (before || {})[key], after: (after || {})[key] });
  }
  return diff;
}

// ── Validation ────────────────────────────────────────────────────────────────

export function validatePolicy(tenantId, policyData) {
  const errors = [];
  const caps  = policyData?.capabilities || [];
  const roles = policyData?.roles        || policyData?.role ? [policyData.role] : [];

  for (const cap of caps) {
    if (!CANONICAL_CAPABILITIES.has(cap)) {
      errors.push({ field: "capabilities", message: `Unknown capability: "${cap}"` });
    }
  }

  const roleList = Array.isArray(policyData?.roles)
    ? policyData.roles
    : policyData?.role
    ? [policyData.role]
    : [];

  for (const role of roleList) {
    if (!CANONICAL_ROLES.has(role)) {
      errors.push({ field: "roles", message: `Unknown role: "${role}"` });
    }
  }

  return { valid: errors.length === 0, errors };
}

// ── New positional-arg API (KV-backed) ────────────────────────────────────────

export async function applyPolicy(tenantId, policyId, policyData, actor, changeReason) {
  // SA-011 / PC-008: changeReason is mandatory
  if (!changeReason || typeof changeReason !== "string" || !changeReason.trim()) {
    throw new Error("changeReason is required and must be a non-empty string (SA-011/PC-008)");
  }

  const current = await kvGetPolicy(tenantId, policyId);

  // Snapshot current state into history before overwriting
  if (current != null) {
    const snapshot = {
      ...current,
      changed_at: Date.now(),
    };
    await kvPushHistory(tenantId, policyId, snapshot);
  }

  const now = Date.now();
  const updated = {
    ...policyData,
    id:            policyId,
    tenant_id:     tenantId,
    updated_at:    now,
    updated_by:    actor,
    change_reason: changeReason,
    created_at:    current?.created_at ?? new Date(now).toISOString(),
  };

  await kvSetPolicy(tenantId, policyId, updated);

  logAuditEvent({
    event_type: "policy.applied",
    status:     "success",
    actor:      actor || "system",
    context: {
      tenant_id:    tenantId,
      policyId,
      actor,
      changeReason,
    },
  });

  return updated;
}

export async function rollbackPolicy(tenantId, policyId, actor) {
  const history = await kvGetHistory(tenantId, policyId);
  if (!history || history.length === 0) {
    throw new Error("No history available to roll back to");
  }

  const [restored, ...remaining] = history;

  const now = Date.now();
  const restoredPolicy = {
    ...restored,
    updated_at:    now,
    updated_by:    actor,
    change_reason: "rollback",
  };

  await kvSetPolicy(tenantId, policyId, restoredPolicy);
  await kvSaveTrimmedHistory(tenantId, policyId, remaining);

  logAuditEvent({
    event_type: "policy.rollback",
    status:     "success",
    actor:      actor || "system",
    context: {
      tenant_id: tenantId,
      policyId,
      actor,
    },
  });

  return restoredPolicy;
}

export async function getPolicyHistory(tenantId, policyId) {
  return kvGetHistory(tenantId, policyId);
}

export async function previewPolicy(tenantId, policyId, proposedData) {
  const currentPolicy = await kvGetPolicy(tenantId, policyId);

  const prevCaps = currentPolicy?.capabilities || [];
  const nextCaps = proposedData?.capabilities  || [];
  const added    = nextCaps.filter((c) => !prevCaps.includes(c));
  const removed  = prevCaps.filter((c) => !nextCaps.includes(c));

  const { risk_level, risk_reason } = classifyRiskNew(currentPolicy, proposedData);

  return {
    risk_level,
    risk_reason,
    current:  currentPolicy,
    proposed: proposedData,
    diff: { added, removed },
  };
}

export async function listPolicies(tenantId, { status, changed_by } = {}) {
  let results = [];

  if (isDurable()) {
    const prefix = `policy:${tenantId}:`;
    const entries = await durableScan(prefix);
    for (const { value } of entries) {
      if (!value) continue;
      try {
        const parsed = typeof value === "object" ? value : JSON.parse(value);
        if (parsed) results.push(parsed);
      } catch { /* skip unparseable */ }
    }
  } else {
    warnMemory();
    const prefix = `policy:${tenantId}:`;
    for (const [k, v] of _memPolicies) {
      if (k.startsWith(prefix) && v) results.push(v);
    }
  }

  if (status !== undefined && status !== null && status !== "") {
    results = results.filter((p) => p.status === status || p.enabled === (status === "enabled"));
  }
  if (changed_by) {
    results = results.filter((p) => p.updated_by === changed_by);
  }

  results.sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0));
  return results;
}

// ── Legacy object-based API (backwards compatible) ────────────────────────────

export function previewPolicyLegacy({ policy_id, proposed, tenant_id }) {
  const policies = loadPoliciesFromFile();
  const before   = policies.find(
    (p) => p.id === policy_id && (!tenant_id || p.tenant_id === tenant_id)
  ) || null;

  const merged = before
    ? { ...before, ...proposed, id: before.id, tenant_id: before.tenant_id }
    : { ...proposed };

  const diff  = buildDiff(before, merged);
  const risk  = classifyRisk(before, merged);
  const prevCaps = before?.capabilities || [];
  const nextCaps = merged?.capabilities || [];

  return {
    policy_id,
    exists: !!before,
    before,
    after: merged,
    diff,
    risk,
    scope:  before?.tenant_id || merged?.tenant_id || "unknown",
    role:   before?.role       || merged?.role       || null,
    capabilities_touched: {
      added:   nextCaps.filter((c) => !prevCaps.includes(c)),
      removed: prevCaps.filter((c) => !nextCaps.includes(c)),
    },
  };
}

export function applyPolicyLegacy({ policy_id, proposed, actor, tenant_id, reason }) {
  const policies = loadPoliciesFromFile();
  const idx = policies.findIndex(
    (p) => p.id === policy_id && (!tenant_id || p.tenant_id === tenant_id)
  );

  const before = idx !== -1 ? policies[idx] : null;
  const now    = new Date().toISOString();
  const merged = before
    ? { ...before, ...proposed, id: before.id, tenant_id: before.tenant_id, updated_at: now }
    : { ...proposed, id: policy_id, tenant_id: tenant_id || "default", created_at: now, updated_at: now };

  const diff = buildDiff(before, merged);
  const risk = classifyRisk(before, merged);

  if (idx !== -1) policies[idx] = merged;
  else            policies.push(merged);
  writeJson(POLICIES_PATH, policies);

  const entry = {
    id:        `phist-${Date.now()}-${randomUUID().slice(0, 6)}`,
    policy_id,
    timestamp: now,
    actor:     actor || "system",
    tenant_id: merged.tenant_id,
    reason,
    risk,
    diff,
    before,
    after:     merged,
  };

  const history = loadHistoryFromFile();
  history.push(entry);
  writeJson(POLICY_HISTORY_PATH, history.slice(-500));

  logAuditEvent({
    event_type: "policy.apply",
    status:     "success",
    actor:      actor || "system",
    context: {
      tenant_id:   merged.tenant_id,
      api_path:    "/api/aria/policy/apply",
      reason,
      policy_id,
      risk,
      diff_fields: diff.map((d) => d.field),
    },
  });

  return { ok: true, policy: merged, history_entry: entry };
}

export function listPoliciesLegacy({ tenant_id = null } = {}) {
  const policies = loadPoliciesFromFile();
  return tenant_id ? policies.filter((p) => p.tenant_id === tenant_id) : policies;
}

export function getPolicyHistoryLegacy({ tenant_id, policy_id, limit = 20 } = {}) {
  let history = loadHistoryFromFile();
  if (tenant_id) history = history.filter((h) => h.tenant_id === tenant_id);
  if (policy_id) history = history.filter((h) => h.policy_id === policy_id);
  const max = Number.isFinite(Number(limit)) && Number(limit) > 0 ? Math.floor(Number(limit)) : 20;
  return history.slice(-max).reverse();
}

// SA-002: Roll back a policy to its previous state using history (legacy)
export function rollbackPolicyLegacy({ policy_id, history_entry_id, actor, tenant_id, reason }) {
  const history = loadHistoryFromFile();
  const entry = history.find(
    (h) => h.policy_id === policy_id && (!history_entry_id || h.id === history_entry_id)
  );
  if (!entry?.before) throw new Error("No previous state found in history to roll back to.");

  return applyPolicyLegacy({
    policy_id,
    proposed: entry.before,
    actor: actor || "system",
    tenant_id,
    reason: reason || `Rollback to state before ${entry.id}`,
  });
}

// SA-003: Dry-run a policy change (alias for previewPolicy with impact simulation)
export function dryRunPolicy({ policy_id, proposed, tenant_id }) {
  const preview = previewPolicyLegacy({ policy_id, proposed, tenant_id });
  const policies = loadPoliciesFromFile();
  const affectedRoles = policies
    .filter((p) => p.role === preview.after?.role && p.tenant_id === (preview.after?.tenant_id || tenant_id))
    .length;

  return {
    ...preview,
    simulation: {
      affected_policies: 1,
      affected_roles: affectedRoles,
      estimated_impact: preview.risk === "high"
        ? "High-risk change: may break existing access for affected roles. Review carefully before applying."
        : preview.risk === "medium"
        ? "Medium-risk change: some capabilities will change for the affected role."
        : "Low-risk change: minimal impact expected.",
      requires_approval: preview.risk === "high",
    },
    dry_run: true,
  };
}

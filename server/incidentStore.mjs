// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import { durableGet, durableSet, durableDel, durableScan, isDurable } from "./durableStore.mjs";
import { logAuditEvent } from "./auditLog.mjs";
import { requestApproval, buildMemoryRecord } from "./ariaMemory.mjs";
import { randomUUID } from "node:crypto";

// SLA thresholds in minutes
const SLA_MINUTES = { critical: 15, high: 60, medium: 240, low: 1440 };

// Key pattern: "incident:{tenantId}:{id}"
// Status values: open | acknowledged | escalated | suppressed | closed | archived

function incidentKey(tenantId, id) {
  return `incident:${tenantId}:${id}`;
}

function computeResponseBy(severity, created_at) {
  const sla = SLA_MINUTES[severity] ?? 1440;
  return created_at + sla * 60 * 1000;
}

// In-memory fallback
const _fallback = new Map();

async function kGet(key) {
  if (isDurable()) {
    const raw = await durableGet(key);
    if (raw === null || raw === undefined) return null;
    if (typeof raw === "object") return raw;
    try { return JSON.parse(raw); } catch { return raw; }
  }
  return _fallback.get(key) ?? null;
}

async function kSet(key, value) {
  if (isDurable()) return durableSet(key, value, null);
  _fallback.set(key, value);
}

async function kDel(key) {
  if (isDurable()) return durableDel(key);
  _fallback.delete(key);
}

async function kScan(prefix) {
  if (isDurable()) {
    const entries = await durableScan(prefix);
    return entries.map(({ value }) => {
      if (value === null || value === undefined) return null;
      if (typeof value === "object") return value;
      try { return JSON.parse(value); } catch { return value; }
    }).filter(Boolean);
  }
  return [..._fallback.entries()]
    .filter(([k]) => k.startsWith(prefix))
    .map(([, v]) => v);
}

export async function createIncident(tenantId, data) {
  const id = randomUUID();
  const now = Date.now();
  const entry = {
    id,
    tenantId,
    severity: data.severity ?? "medium",
    title: data.title,
    source: data.source ?? "manual",
    status: "open",
    created_at: now,
    response_by: computeResponseBy(data.severity ?? "medium", now),
    resolve_by: null,
    closed_at: null,
    closure_reason: null,
    actor: data.actor ?? "system",
    history: [],
  };
  await kSet(incidentKey(tenantId, id), entry);
  logAuditEvent({
    event_type: "incident.created",
    actor: entry.actor,
    context: { tenantId, id, severity: entry.severity, title: entry.title },
  });
  return entry;
}

export async function getIncident(tenantId, id) {
  return kGet(incidentKey(tenantId, id));
}

async function updateIncident(tenantId, id, patch, actor, eventType) {
  const entry = await kGet(incidentKey(tenantId, id));
  if (!entry) return null;
  const history = [...(entry.history ?? []), { ...entry, history: undefined, changed_at: Date.now() }];
  const updated = { ...entry, ...patch, history };
  await kSet(incidentKey(tenantId, id), updated);
  logAuditEvent({
    event_type: eventType,
    actor: actor ?? "system",
    context: { tenantId, id, ...patch },
  });
  return updated;
}

export async function getIncidents(tenantId, { status, severity, sort } = {}) {
  let list = await kScan(`incident:${tenantId}:`);
  // Auto-escalate SLA breaches
  const now = Date.now();
  list = await Promise.all(list.map(async (inc) => {
    if (inc.status === "open" && inc.response_by && now > inc.response_by) {
      const escalated = await updateIncident(
        tenantId, inc.id,
        { status: "escalated", auto_escalated: true },
        "system",
        "incident.auto_escalated"
      );
      return escalated ?? inc;
    }
    return inc;
  }));
  if (status) list = list.filter(i => i.status === status);
  if (severity) list = list.filter(i => i.severity === severity);
  if (sort === "severity") {
    const order = { critical: 0, high: 1, medium: 2, low: 3 };
    list.sort((a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9));
  } else if (sort === "created_at") {
    list.sort((a, b) => b.created_at - a.created_at);
  }
  return list;
}

export async function acknowledgeIncident(tenantId, id, actor) {
  return updateIncident(
    tenantId, id,
    { status: "acknowledged", acknowledged_at: Date.now(), acknowledged_by: actor },
    actor,
    "incident.acknowledged"
  );
}

export async function escalateIncident(tenantId, id, actor) {
  const entry = await getIncident(tenantId, id);
  if (!entry) return null;
  // Create approval queue entry for escalation
  try {
    requestApproval({
      action: "escalate_incident",
      args: { tenantId, id },
      reason: `Escalate incident: ${entry.title}`,
      risk: "high",
      source: actor ?? "system",
    });
  } catch (_) { /* approval system optional */ }
  return updateIncident(
    tenantId, id,
    { status: "escalated", escalated_at: Date.now(), escalated_by: actor },
    actor,
    "incident.escalated"
  );
}

export async function suppressIncident(tenantId, id, actor, reason) {
  if (!reason) throw new Error("reason is required to suppress an incident");
  return updateIncident(
    tenantId, id,
    { status: "suppressed", suppressed_at: Date.now(), suppressed_by: actor, suppression_reason: reason },
    actor,
    "incident.suppressed"
  );
}

// Closure language ARIA can recognize as a genuine fix vs. a dead end — keeps
// recallSimilar() honest about what actually worked, instead of every closed
// incident defaulting to "pending" forever.
function inferClosureOutcome(closureReason) {
  const text = String(closureReason || "").toLowerCase();
  if (/false posit|benign|expected|no action|non.?issue/.test(text)) return "false_positive";
  if (/fail|unresolved|reopen|escalat|could not|unable to/.test(text)) return "failure";
  return "success";
}

export async function closeIncident(tenantId, id, actor, closureReason) {
  if (!closureReason) throw new Error("closure_reason is required");
  const closed = await updateIncident(
    tenantId, id,
    { status: "closed", closed_at: Date.now(), closed_by: actor, closure_reason: closureReason },
    actor,
    "incident.closed"
  );

  // Persist what happened and how it was resolved so ARIA still has it
  // tomorrow — this is the link that was missing: a neutralized threat used
  // to vanish from memory the moment the incident list moved on.
  if (closed) {
    try {
      buildMemoryRecord({
        findings: [{ code: closed.title, asset_type: closed.source, severity: closed.severity }],
        decision: {
          reasoning: closureReason,
          narration: `Incident "${closed.title}" (${closed.severity}) closed: ${closureReason}`,
        },
        outcome: inferClosureOutcome(closureReason),
        actor,
      });
    } catch (err) {
      // Non-fatal — the incident itself is already closed and persisted.
      logAuditEvent({
        event_type: "incident.memory_record_failed",
        actor: "system",
        context: { tenantId, id, error: String(err?.message || err) },
      });
    }
  }

  return closed;
}

export async function archiveIncidents(tenantId) {
  const closed = await getIncidents(tenantId, { status: "closed" });
  let count = 0;
  for (const inc of closed) {
    const archiveKey = `archived-incident:${tenantId}:${inc.id}`;
    await kSet(archiveKey, { ...inc, status: "archived", archived_at: Date.now() });
    await kDel(incidentKey(tenantId, inc.id));
    count++;
  }
  logAuditEvent({
    event_type: "incident.archive_run",
    actor: "system",
    context: { tenantId, count },
  });
  return { archived: count };
}

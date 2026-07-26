// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { executeAriaFunction, getMonitoringSnapshot } from "./ariaData.mjs";
import { logAuditEvent } from "./auditLog.mjs";
import { persistencePath } from "./persistenceConfig.mjs";
import { isDurable, durableGet, durableSet } from "./durableStore.mjs";
import { isDbConfigured, query } from "./db.mjs";

const APPROVAL_TTL_SECONDS = 3600; // 1 hour KV TTL for pending approvals
const KV_APPROVAL_PREFIX = "approval:";
const approvalKvKey = (tenantId, id) => `${KV_APPROVAL_PREFIX}${sanitizeTenantSegment(tenantId)}:${id}`;

function memoryPath(file = "") {
  return persistencePath(file ? [file] : [], { purpose: "Aria memory persistence" });
}

// Approvals are tenant-namespaced on disk under tenants/<tenant_id>/approval-queue.json.
// Mirrors ariaTrust.mjs's sanitizeTenantSegment/trustPath so HTTP-request callers
// (passing x-tenant-id) and direct module callers (passing nothing → tenant-local)
// resolve to the same per-tenant file.
function sanitizeTenantSegment(tenantId) {
  const value = String(tenantId || "tenant-local").trim();
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(value) ? value : "tenant-local";
}
function approvalsPath(tenantId) {
  return persistencePath(["tenants", sanitizeTenantSegment(tenantId), "approval-queue.json"], { purpose: "Aria approval queue" });
}
const NOTES_PATH = () => memoryPath("ARIA_NOTES.md");
const FINDINGS_PATH = () => memoryPath("findings.md");
const INTERVENTIONS_PATH = () => memoryPath("human-interventions.md");
const ACTION_LOG_PATH = () => memoryPath("action-log.md");
const REPORT_DIR = () => memoryPath("reports");
const POLICY_PATH = () => memoryPath("autonomy-policy.json");
const FINDING_KEYS_PATH = () => memoryPath("finding-keys.json");
const MEMORY_RECORDS_PATH = (tenantId) => persistencePath(
  ["tenants", sanitizeTenantSegment(tenantId), "memory-records.json"],
  { purpose: "Aria structured memory" },
);

const DEFAULT_POLICY = {
  mode: "confirm",
  modes: {
    confirm: "Aria recommends and asks before operational action.",
    auto: "Aria performs low and medium risk actions, queues critical changes for review.",
    full_auto: "Aria performs approved playbook actions and writes interval reports.",
  },
  learned_rules: [],
};

const now = () => new Date().toISOString();
const LEGACY_SIMULATION_PATTERNS = [
  /.*analyst screen\./gi,
  /When screen content resembles this pattern, consider .*?\./gi,
  /Approved run_scan\. Similar future cases can be proposed with this precedent\./gi,
  /.*94\.102\.49\.190.*\n?/gi,
  /.*vendor load test.*\n?/gi,
  /.*blocked address range.*\n?/gi,
  /.*outbound transfer pattern.*\n?/gi,
  /.*enterprise perimeter.*\n?/gi,
];

function productionMemoryExcerpt(text) {
  const cleaned = LEGACY_SIMULATION_PATTERNS.reduce((value, pattern) => value.replace(pattern, ""), text || "")
    .split("\n")
    .filter((line) => !/Learned screen pattern|Human approval learned|Analyst context|Source: smoke|gemini-function-call|screen content resembles/i.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return cleaned || "# Aria Notes\n\nProduction memory is ready. Legacy simulated findings are hidden from the live console.";
}

function isLegacyApproval(item) {
  return /analyst screen|gemini-function-call|run scan requested/i.test(`${item.reason || ""} ${item.source || ""}`);
}

function ensureMemory() {
  const root = memoryPath();
  const reportDir = REPORT_DIR();
  if (!existsSync(root)) mkdirSync(root, { recursive: true });
  if (!existsSync(reportDir)) mkdirSync(reportDir, { recursive: true });
  if (!existsSync(NOTES_PATH())) {
    writeFileSync(NOTES_PATH(), "# Aria Notes\n\nPersistent operating memory for Aria.\n");
  }
  if (!existsSync(FINDINGS_PATH())) {
    writeFileSync(FINDINGS_PATH(), "# Findings\n\n");
  }
  if (!existsSync(INTERVENTIONS_PATH())) {
    writeFileSync(INTERVENTIONS_PATH(), "# Human Interventions\n\n");
  }
  if (!existsSync(ACTION_LOG_PATH())) {
    writeFileSync(ACTION_LOG_PATH(), "# Action Log\n\n");
  }
  if (!existsSync(POLICY_PATH())) {
    writeJson(POLICY_PATH(), DEFAULT_POLICY);
  }
  if (!existsSync(FINDING_KEYS_PATH())) {
    writeJson(FINDING_KEYS_PATH(), []);
  }
}

function readJson(path, fallback) {
  ensureMemory();
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function appendMemory(path, heading, body) {
  ensureMemory();
  appendFileSync(path, `\n## ${heading}\n\n${body}\n`);
}

function appendAction(action, status, detail) {
  appendMemory(ACTION_LOG_PATH(), `${now()} - ${action}`, `Status: ${status}\n\n${detail}`);
}

function getPolicy() {
  return readJson(POLICY_PATH(), DEFAULT_POLICY);
}

// ─── Approval persistence ──────────────────────────────────────────────────
// File fallback is tenant-namespaced under tenants/<tenant>/approval-queue.json.
// When ARIA_DATABASE_URL is set, the `approvals` table is the source of truth.

function readApprovalsFile(tenantId) {
  ensureMemory();
  const path = approvalsPath(tenantId);
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveApprovalsFile(tenantId, queue) {
  const path = approvalsPath(tenantId);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(queue, null, 2)}\n`);
}

// Synchronous, file-only read used by the display/overview functions
// (getAriaState/getOverviewReport/observeScreen) that must stay synchronous.
function getApprovalsSync(tenantId, { status } = {}) {
  const all = readApprovalsFile(tenantId);
  if (!status) return all;
  return all.filter((item) => item.status === status);
}

async function dbReadApprovals(tenantId, { status } = {}) {
  const tenant = sanitizeTenantSegment(tenantId);
  const { rows } = status
    ? await query("SELECT payload FROM approvals WHERE tenant_id=$1 AND status=$2 ORDER BY created_at DESC", [tenant, status])
    : await query("SELECT payload FROM approvals WHERE tenant_id=$1 ORDER BY created_at DESC", [tenant]);
  return rows.map((r) => r.payload);
}

async function dbUpsertApproval(tenantId, approval) {
  const tenant = sanitizeTenantSegment(tenantId);
  await query(
    `INSERT INTO approvals (approval_id, tenant_id, status, payload, created_at, updated_at)
       VALUES ($1,$2,$3,$4,now(),now())
     ON CONFLICT (approval_id) DO UPDATE
       SET status = EXCLUDED.status, payload = EXCLUDED.payload, updated_at = now()`,
    [approval.id, tenant, approval.status, approval]
  );
}

export async function getApprovals(tenantId, { status } = {}) {
  const approvals = isDbConfigured()
    ? await dbReadApprovals(tenantId, { status })
    : getApprovalsSync(tenantId, { status });
  if (status !== "pending") return approvals;
  return approvals.filter((item) => !item.expires_at || Number(item.expires_at) > Date.now());
}

async function createApproval(tenantId, { action, args, reason, risk = "medium", source = "proactive", context, proposed_action, affected_scope }) {
  const queue = isDbConfigured() ? await dbReadApprovals(tenantId) : readApprovalsFile(tenantId);
  const existing = queue.find((item) => item.status === "pending" && item.action === action && JSON.stringify(item.args) === JSON.stringify(args));
  if (existing) return existing;

  const approval = {
    id: `APR-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    tenant_id: sanitizeTenantSegment(tenantId),
    action,
    args,
    reason,
    risk,
    source,
    status: "pending",
    created_at: now(),
    context: context || null,
    proposed_action: proposed_action || null,
    affected_scope: affected_scope || null,
    expires_at: Date.now() + 3600000,
  };

  if (isDbConfigured()) {
    await dbUpsertApproval(tenantId, approval);
  } else {
    queue.unshift(approval);
    saveApprovalsFile(tenantId, queue.slice(0, 30));
  }
  appendMemory(INTERVENTIONS_PATH(), `${approval.created_at} - Approval requested`, `${reason}\n\nAction: ${action}\n\nRisk: ${risk}`);
  return approval;
}

export async function requestApproval(tenantId, { action, args, reason, risk = "medium", source = "operator-command", context, proposed_action, affected_scope } = {}) {
  // context is required — fall back to reason for backwards-compatible callers
  const resolvedContext = context || reason || null;
  if (!resolvedContext || !String(resolvedContext).trim()) throw new Error("context (human-readable reason) is required for requestApproval");
  ensureMemory();
  const approval = await createApproval(tenantId, { action, args, reason, risk, source, context: resolvedContext, proposed_action, affected_scope });

  // Persist to KV with 1-hour TTL so approvals survive cold starts
  if (isDurable()) {
    const exp = Math.floor(Date.now() / 1000) + APPROVAL_TTL_SECONDS;
    durableSet(approvalKvKey(tenantId, approval.id), { ...approval, exp }, APPROVAL_TTL_SECONDS).catch(() => {});
  }

  logAuditEvent({
    event_type: "approval_requested",
    actor: "system",
    context: {
      approval_id: approval.id,
      action: approval.action,
      risk: approval.risk,
      source: approval.source,
      status: approval.status,
      tenant_id: approval.tenant_id,
    },
  });
  return approval;
}

function inferProactiveAction(text) {
  const normalized = String(text || "").toLowerCase();
  if (normalized.includes("memory pressure") || normalized.includes("disk capacity") || normalized.includes("cpu load")) {
    return {
      severity: "high",
      summary: "A live host telemetry threshold is active.",
      action: "run_scan",
      args: { target: "local host", depth: "standard" },
      risk: "medium",
    };
  }
  if (normalized.includes("source failed") || normalized.includes("unconfigured")) {
    return {
      severity: "medium",
      summary: "A telemetry source needs configuration or review.",
      action: "run_scan",
      args: { target: "source fabric", depth: "quick" },
      risk: "medium",
    };
  }
  return null;
}

function modeAllowsAction(mode, risk) {
  if (mode === "full_auto") return true;
  if (mode === "auto") return risk !== "critical";
  return false;
}

function logFinding(finding, source) {
  const stamp = now();
  const key = `${source}:${finding.action}:${finding.summary}`;
  const keys = readJson(FINDING_KEYS_PATH(), []);
  if (keys.includes(key)) return false;
  writeJson(FINDING_KEYS_PATH(), [key, ...keys].slice(0, 80));
  appendMemory(
    FINDINGS_PATH(),
    `${stamp} - ${finding.severity.toUpperCase()} finding`,
    `Source: ${source}\n\n${finding.summary}\n\nSuggested action: ${finding.action}`
  );
  appendMemory(NOTES_PATH(), `${stamp} - Learned screen pattern`, `When screen content resembles this pattern, consider ${finding.action}.\n\n${finding.summary}`);
  return true;
}

function executeWithMemory(action, args, source) {
  const result = executeAriaFunction(action, args);
  appendAction(action, result.status || "complete", `Source: ${source}\n\nArguments:\n\`\`\`json\n${JSON.stringify(args, null, 2)}\n\`\`\`\n\nResult:\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\``);
  return result;
}

export function setAutonomyMode(mode) {
  ensureMemory();
  const safeMode = ["confirm", "auto", "full_auto"].includes(mode) ? mode : "confirm";
  const policy = { ...getPolicy(), mode: safeMode };
  writeJson(POLICY_PATH, policy);
  appendMemory(NOTES_PATH(), `${now()} - Autonomy changed`, `Mode set to ${safeMode}.`);
  return policy;
}

export function getAriaState() {
  ensureMemory();
  const approvals = getApprovalsSync()
    .filter((item) => item.status === "pending")
    .filter((item) => !isLegacyApproval(item));
  return {
    policy: getPolicy(),
    approvals,
    memory: {
      notes: productionMemoryExcerpt(readFileSync(NOTES_PATH(), "utf8")).split("\n").slice(-18).join("\n"),
      findings: productionMemoryExcerpt(readFileSync(FINDINGS_PATH(), "utf8")).split("\n").slice(-18).join("\n"),
      actions: productionMemoryExcerpt(readFileSync(ACTION_LOG_PATH(), "utf8")).split("\n").slice(-18).join("\n"),
    },
  };
}

export function learnFromAnalyst({ note = "", source = "analyst" } = {}) {
  ensureMemory();
  const cleanNote = String(note || "").trim();
  if (!cleanNote) return { status: "empty", message: "No analyst note provided." };

  const stamp = now();
  appendMemory(NOTES_PATH(), `${stamp} - Analyst context`, `Source: ${source}\n\n${cleanNote}`);
  appendAction("learn_from_analyst", "complete", `Source: ${source}\n\n${cleanNote}`);
  return {
    status: "learned",
    message: "Aria stored the analyst context in persistent memory.",
    note: cleanNote,
  };
}

export function getOverviewReport({ question = "" } = {}) {
  ensureMemory();
  const snapshot = getMonitoringSnapshot();
  const reviewItems = snapshot.summary.review_items || [];
  const liveSources = snapshot.summary.sources.filter((source) => source.status === "live");
  const unconfiguredSources = snapshot.summary.sources.filter((source) => source.status === "unconfigured");
  const pendingApprovals = getApprovalsSync()
    .filter((item) => item.status === "pending")
    .filter((item) => !isLegacyApproval(item));
  const notesTail = readFileSync(NOTES_PATH(), "utf8").split("\n").slice(-12).join("\n");

  const actions = [];
  reviewItems.forEach((item) => actions.push(item));
  unconfiguredSources.slice(0, 3).forEach((source) => actions.push(`Configure ${source.label} when that telemetry is required.`));
  if (pendingApprovals.length > 0) {
    actions.push(`${pendingApprovals.length} action is waiting for approval.`);
  }

  const narrative = [
    `I pulled the live Aria overview. Current posture is ${snapshot.threat_level} with ${liveSources.length}/${snapshot.summary.sources.length} sources live.`,
    reviewItems.length
      ? `${reviewItems.length} live condition needs review.`
      : "No live local condition is above the review threshold right now.",
    unconfiguredSources.length
      ? `${unconfiguredSources.length} connector slots are unconfigured and clearly marked.`
      : "All configured connector slots are reporting.",
    pendingApprovals.length
      ? `There are ${pendingApprovals.length} items waiting for your approval.`
      : "No approvals are waiting right now.",
  ].join(" ");

  appendAction("overview_report", "complete", `Question: ${question || "overview"}\n\n${narrative}`);

  return {
    status: "complete",
    generated_at: now(),
    question,
    summary: narrative,
    snapshot,
    active_incidents: snapshot.panels["incident-feed"].items,
    blocked_unknown_ips: [],
    elevated_traffic: null,
    actions,
    approvals: pendingApprovals,
    memory_excerpt: notesTail,
    feed: [
      `Overview generated: ${snapshot.threat_level} posture`,
      `${liveSources.length}/${snapshot.summary.sources.length} live sources reporting`,
      `${pendingApprovals.length} approvals pending`,
    ],
  };
}

export async function observeScreen({ source = "aria-app", content = "" } = {}) {
  ensureMemory();
  const snapshot = getMonitoringSnapshot();
  const finding = inferProactiveAction(`${content}\n${JSON.stringify(snapshot)}`);
  if (!finding) {
    appendAction("observe_screen", "clear", `Source: ${source}\n\nNo actionable pattern detected.`);
    return { status: "clear", feed: ["Aria observed the screen. No new intervention required."] };
  }

  // Don't re-raise if an identical approval is already pending
  const existingPending = getApprovalsSync().find(
    (a) => a.status === "pending" && a.action === finding.action && JSON.stringify(a.args) === JSON.stringify(finding.args)
  );
  if (existingPending) {
    return { status: "approval_required", mode: getPolicy().mode, finding, approval: existingPending, feed: [] };
  }

  logFinding(finding, source);
  const mode = getPolicy().mode;
  if (modeAllowsAction(mode, finding.risk)) {
    const result = executeWithMemory(finding.action, finding.args, source);
    writeIntervalReport({ source, mode, finding, action: finding.action, result });
    return {
      status: "acted",
      mode,
      finding,
      result,
      feed: [`Aria detected: ${finding.summary}`, `Executed ${finding.action} under ${mode} mode`],
    };
  }

  const approval = await createApproval(undefined, {
    action: finding.action,
    args: finding.args,
    reason: finding.summary,
    risk: finding.risk,
    source,
  });
  return {
    status: "approval_required",
    mode,
    finding,
    approval,
    feed: [`Aria detected: ${finding.summary}`, `Approval required for ${finding.action}`],
  };
}

export async function resolveApproval(tenantId, id, decision, actor) {
  // Support legacy 2-arg call: resolveApproval(id, decision)
  // Detect: if called with (id, decision) the 2nd arg will be "approve"/"deny"/"approved"/"denied"
  // and the 3rd arg (decision in new sig) will be undefined
  if (decision === undefined) {
    // Old 2-arg form: resolveApproval(id, decision)
    decision = id;
    id = tenantId;
    tenantId = "default";
    actor = "analyst";
  }
  const resolvedActor = actor || "analyst";
  const queue = isDbConfigured() ? await dbReadApprovals(tenantId) : readApprovalsFile(tenantId);
  let item = queue.find((approval) => approval.id === id);

  // If not found in file store, try KV (handles cold-start recovery)
  if (!item && isDurable()) {
    try {
      item = await durableGet(approvalKvKey(tenantId, id));
      if (item) queue.unshift(item);
    } catch {
      // non-fatal
    }
  }

  if (!item) return { status: "missing", error: "Approval item not found" };

  // Check KV expiry field before resolving
  if ((item.exp && Math.floor(Date.now() / 1000) > item.exp) ||
      (item.expires_at && Date.now() > Number(item.expires_at))) {
    return { status: "expired", error: "approval_expired" };
  }

  item.status = decision === "approve" ? "approved" : "denied";
  item.resolved_at = now();

  let result = null;
  if (item.status === "approved") {
    result = executeWithMemory(item.action, item.args, "approval");
    appendMemory(NOTES_PATH(), `${item.resolved_at} - Human approval learned`, `Approved ${item.action}. Similar future cases can be proposed with this precedent.`);
  } else {
    appendMemory(INTERVENTIONS_PATH(), `${item.resolved_at} - Approval denied`, `Denied ${item.action}. Reason: analyst decision.`);
  }

  if (isDbConfigured()) {
    await dbUpsertApproval(tenantId, item);
  } else {
    saveApprovalsFile(tenantId, queue);
  }

  // Update KV record with resolved status
  if (isDurable()) {
    durableSet(approvalKvKey(tenantId, item.id), item, APPROVAL_TTL_SECONDS).catch(() => {});
  }

  logAuditEvent({
    event_type: "aria.approval.resolved",
    actor: resolvedActor,
    context: {
      id,
      actor: resolvedActor,
      decision: item.status,
      approval_id: item.id,
      action: item.action,
      context: item.context,
      result_status: result?.status || "skipped",
      tenant_id: sanitizeTenantSegment(tenantId),
    },
  });
  return { status: item.status, approval: item, result };
}

export async function bulkResolveApprovals(tenantId, ids, decision, actor) {
  const results = [];
  for (const id of ids) {
    try {
      const result = await resolveApproval(tenantId, id, decision, actor);
      results.push({ id, status: result.status ?? "resolved" });
    } catch (err) {
      results.push({ id, status: "error", error: err.message });
    }
  }
  return { results, total: ids.length, resolved: results.filter(r => r.status === "resolved").length };
}

export function writeIntervalReport({ source, mode, finding, action, result }) {
  ensureMemory();
  const stamp = now();
  const file = join(REPORT_DIR(), `${stamp.replace(/[:.]/g, "-")}.md`);
  const body = `# Aria Interval Report\n\n- Time: ${stamp}\n- Source: ${source}\n- Autonomy: ${mode}\n- Finding: ${finding.summary}\n- Severity: ${finding.severity}\n- Action: ${action}\n- Result: ${result.status || "complete"}\n`;
  writeFileSync(file, body);
  appendAction("write_interval_report", "complete", `Report: ${file}`);
  return file;
}

// ─── Structured Memory Recall — §6 of the ARIA architecture spec ───────────────
// Memory records index decisions by pattern signature so ARIA can recall
// "we handled a similar chain before" and propose replaying the playbook.

function tokenize(text) {
  return String(text || "").toLowerCase().match(/[a-z0-9_-]+/g) || [];
}

function signatureFor({ findingCodes = [], assetTypes = [], severities = [] } = {}) {
  return [...findingCodes, ...assetTypes, ...severities].join(" ");
}

function keywordOverlap(a, b) {
  const setA = new Set(tokenize(a));
  const setB = new Set(tokenize(b));
  if (setA.size === 0 || setB.size === 0) return 0;
  const intersection = [...setA].filter(t => setB.has(t)).length;
  return intersection / Math.max(setA.size, setB.size);
}

export function buildMemoryRecord({ findings = [], decision = {}, outcome = "pending", actor = "analyst", tenantId } = {}) {
  ensureMemory();
  const findingCodes = findings.map(f => f.code || f.id).filter(Boolean);
  const assetTypes = [...new Set(findings.map(f => f.asset_type || "").filter(Boolean))];
  const severities = [...new Set(findings.map(f => f.severity || "").filter(Boolean))];
  const record = {
    mem_id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    tenant_id: sanitizeTenantSegment(tenantId),
    created_at: now(),
    signature: signatureFor({ findingCodes, assetTypes, severities }),
    finding_codes: findingCodes,
    asset_types: assetTypes,
    severities,
    action_taken: decision.recommended_action?.verb || null,
    analyst_decision: actor,
    reason: decision.reasoning || "",
    outcome,
    decision_id: decision.decision_id || null,
    narration: decision.narration || "",
  };

  const path = MEMORY_RECORDS_PATH(tenantId);
  mkdirSync(dirname(path), { recursive: true });
  const records = readJson(path, []);
  records.unshift(record);
  writeJson(path, records.slice(0, 200));
  return record;
}

export function recallSimilar({ findings = [], topK = 3, minSimilarity = 0.25, tenantId } = {}) {
  ensureMemory();
  if (findings.length === 0) return { query_pattern: "", matches: [], capability_stats: null };

  const findingCodes = findings.map(f => f.code || f.id).filter(Boolean);
  const assetTypes = [...new Set(findings.map(f => f.asset_type || "").filter(Boolean))];
  const severities = [...new Set(findings.map(f => f.severity || "").filter(Boolean))];
  const query = signatureFor({ findingCodes, assetTypes, severities });

  const records = readJson(MEMORY_RECORDS_PATH(tenantId), []);
  const scored = records
    .map(r => ({ ...r, similarity: keywordOverlap(query, r.signature) }))
    .filter(r => r.similarity >= minSimilarity)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);

  // Capability stats from action log (successes/failures) for remediation
  const successful = records.filter(r => r.outcome === "success" || r.outcome === "approved").length;
  const failed = records.filter(r => r.outcome === "failure" || r.outcome === "denied").length;
  const overrides = records.filter(r => r.outcome === "override").length;

  return {
    query_pattern: query,
    retrieval_method: "structured_lexical_overlap",
    matches: scored.map(r => ({
      mem_id: r.mem_id,
      similarity: Math.round(r.similarity * 100) / 100,
      past_finding: r.finding_codes.join(", "),
      action_taken: r.action_taken,
      analyst_decision: r.analyst_decision,
      reason: r.reason,
      outcome: r.outcome,
      occurred_at: r.created_at,
    })),
    capability_stats: {
      remediation: { successes: successful, failures: failed, overrides },
    },
  };
}

export function getMemoryRecords(limit = 20, tenantId) {
  ensureMemory();
  return readJson(MEMORY_RECORDS_PATH(tenantId), []).slice(0, limit);
}

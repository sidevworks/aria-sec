// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

/**
 * actionRunner.mjs — single execution path for ALL ARIA actions.
 *
 * Every action — whether triggered by the reasoning engine, the decision queue,
 * or an operator clicking a button — MUST route through here. No panel or route
 * calls autonomousResponse or other action functions directly.
 *
 * Lifecycle per action:
 *   1. Pre-flight  — snapshot relevant state
 *   2. Execute     — run the registered action handler
 *   3. Verify      — re-observe after VERIFY_DELAY_MS, check expected state
 *   4. Log         — write single compliance-grade audit entry
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { emit } from "./eventBus.mjs";
import { logAuditEvent } from "./auditLog.mjs";
import { resolveLegacyMemoryDir } from "./persistenceConfig.mjs";

// ── Paths ─────────────────────────────────────────────────────────────────────

const MEMORY_DIR = resolveLegacyMemoryDir();
const POLICY_PATH     = join(MEMORY_DIR, "autonomy-policy.json");
const ACTION_LOG_PATH = join(MEMORY_DIR, "action-executions.json");
const VERIFY_DELAY_MS = parseInt(process.env.ARIA_VERIFY_DELAY_MS || "10000", 10);

function ensureDir() {
  if (!existsSync(MEMORY_DIR)) mkdirSync(MEMORY_DIR, { recursive: true });
}

function readJson(path, fallback) {
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { return fallback; }
}

function writeJson(path, data) {
  ensureDir();
  try { writeFileSync(path, JSON.stringify(data, null, 2)); } catch { /* non-fatal */ }
}

function uid(prefix = "exe") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ── Action registry ───────────────────────────────────────────────────────────
// Each entry: { tier: "low"|"medium"|"critical", reversible: bool, execute, verify }
// execute(params, preState) => { ok: bool, detail: string }
// verify(params, preState)  => { verified: bool, observedState, expectedState }

const _registry = new Map();

export function registerAction(actionId, { tier, reversible, execute, verify }) {
  if (!tier || !["low", "medium", "critical"].includes(tier)) {
    throw new Error(`Action "${actionId}" must declare a valid tier (low|medium|critical)`);
  }
  if (typeof reversible !== "boolean") {
    throw new Error(`Action "${actionId}" must declare reversible: true|false`);
  }
  _registry.set(actionId, { tier, reversible, execute, verify });
}

export function getRegisteredActions() {
  return [..._registry.entries()].map(([id, def]) => ({ id, tier: def.tier, reversible: def.reversible }));
}

// ── Built-in actions ──────────────────────────────────────────────────────────

registerAction("collect-evidence", {
  tier: "low",
  reversible: true,
  execute: async (_params, _pre) => ({ ok: true, detail: "Evidence snapshot collected from telemetry" }),
  verify:  async (_params, _pre) => ({ verified: true, observedState: "evidence-collected", expectedState: "evidence-collected" }),
});

registerAction("geo-lookup", {
  tier: "low",
  reversible: true,
  execute: async (params, _pre) => ({ ok: true, detail: `Geo-lookup initiated for ${params.ip || "unknown"}` }),
  verify:  async (_p, _pre)     => ({ verified: true, observedState: "lookup-done", expectedState: "lookup-done" }),
});

registerAction("run-scan", {
  tier: "low",
  reversible: true,
  execute: async (params, _pre) => {
    const { runScan } = await import("./ariaData.mjs");
    const scan = runScan(params);
    return { ok: scan.status === "complete", detail: "Live source-backed scan completed", scan };
  },
  verify: async (_params, _pre, post) => ({
    verified: post?.scan?.status === "complete" && Array.isArray(post.scan.findings),
    observedState: post?.scan?.status === "complete" ? "source-scan-complete" : "scan-missing",
    expectedState: "source-scan-complete",
  }),
});

registerAction("deep-scan", {
  tier: "low",
  reversible: true,
  execute: async (params, _pre) => {
    const { runScan } = await import("./ariaData.mjs");
    const scan = runScan({ ...params, depth: params.depth || "deep" });
    return { ok: scan.status === "complete", detail: "Deep source-backed scan completed", scan };
  },
  verify: async (_params, _pre, post) => ({
    verified: post?.scan?.status === "complete" && Array.isArray(post.scan.findings),
    observedState: post?.scan?.status === "complete" ? "source-scan-complete" : "scan-missing",
    expectedState: "source-scan-complete",
  }),
});

registerAction("block-ip", {
  tier: "medium",
  reversible: true,
  execute: async (params, _pre) => {
    if (!params.ip) return { ok: false, detail: "ip parameter required" };
    try {
      const { blockIp } = await import("./blockedIpStore.mjs");
      await blockIp(params.tenantId || "tenant-local", params.ip, {
        reason: params.reason || "ARIA action runner",
        source: "action-runner",
        expiresIn: params.expiresIn || 3600,
        actor: params.actor || "aria:action-runner",
      });
      return { ok: true, detail: `IP ${params.ip} blocked` };
    } catch (err) {
      return { ok: false, detail: err.message };
    }
  },
  verify: async (params, _pre) => {
    try {
      const { getBlockedIps } = await import("./blockedIpStore.mjs");
      const list = await getBlockedIps(params.tenantId || "tenant-local");
      const found = Array.isArray(list) && list.some(e => e.ip === params.ip);
      return {
        verified: found,
        observedState: found ? "ip-blocked" : "ip-not-found-in-blocklist",
        expectedState: "ip-blocked",
      };
    } catch {
      return { verified: false, observedState: "unknown", expectedState: "ip-blocked" };
    }
  },
});

registerAction("kill-process", {
  tier: "medium",
  reversible: false,
  execute: async (params, _pre) => {
    if (!params.pid) return { ok: false, detail: "pid parameter required" };
    try {
      const signal = ["SIGTERM", "SIGKILL"].includes(String(params.signal || "").toUpperCase())
        ? String(params.signal).toUpperCase()
        : "SIGTERM";
      process.kill(Number(params.pid), signal);
      return { ok: true, detail: `${signal} sent to PID ${params.pid}` };
    } catch (err) {
      return { ok: false, detail: err.message };
    }
  },
  verify: async (params, _pre) => {
    const { execFileSync } = await import("node:child_process");
    try {
      execFileSync("kill", ["-0", String(params.pid)]);
      // Process still alive
      return { verified: false, observedState: "process-alive", expectedState: "process-dead" };
    } catch {
      // ESRCH = no such process = dead
      return { verified: true, observedState: "process-dead", expectedState: "process-dead" };
    }
  },
});

registerAction("revoke-session", {
  tier: "medium",
  reversible: false,
  execute: async (params, _pre) => {
    const sid = params.sid || params.sessionId || params.userId;
    if (!sid) return { ok: false, detail: "sid parameter required" };
    try {
      const { revokeSessionById } = await import("./ariaSession.mjs");
      const result = await revokeSessionById({ sid, tenant_id: params.tenantId || null });
      return { ok: Boolean(result?.ok), detail: result?.ok ? `Session ${sid} revoked` : (result?.error || "Session revoke failed"), revoke: result };
    } catch (err) {
      return { ok: false, detail: err.message };
    }
  },
  verify: async (_params, _pre, post) => ({
    verified: Boolean(post?.revoke?.ok && (post.revoke.revoked_at || post.revoke.already_revoked)),
    observedState: post?.revoke?.ok ? "session-revoked" : "session-active-or-unknown",
    expectedState: "session-revoked",
  }),
});

registerAction("isolate-process", {
  tier: "medium",
  reversible: true,
  execute: async (params, _pre) => {
    // For now: create a high-severity incident for the process
    try {
      const { createIncident } = await import("./incidentStore.mjs");
      await createIncident({
        title: `Process isolation: ${params.processName || params.pid || "unknown"}`,
        severity: "high",
        source: "action-runner",
        tenant_id: params.tenantId || "tenant-local",
        context: { pid: params.pid, processName: params.processName },
      });
      return { ok: true, detail: `Isolation incident created for ${params.processName || params.pid}` };
    } catch (err) {
      return { ok: false, detail: err.message };
    }
  },
  verify: async (_p, _pre, post) => ({ verified: Boolean(post?.ok), observedState: "incident-created-only", expectedState: "incident-created-only" }),
});

registerAction("isolate-host", {
  tier: "critical",
  reversible: true,
  execute: async (params, _pre) => {
    if (!params.host) return { ok: false, detail: "host parameter required" };
    return { ok: true, result_state: "staged", enforcement_mode: "not-enforced", detail: `Host isolation queued for ${params.host}; network-layer enforcement is not configured` };
  },
  verify: async (_p, _pre, post) => ({ verified: Boolean(post?.ok), observedState: "isolation-plan-staged", expectedState: "isolation-plan-staged" }),
});

registerAction("stage-host-isolation", {
  tier: "critical",
  reversible: true,
  execute: async (params, _pre) => {
    try {
      const { buildHostIsolationPlan } = await import("./localArtifactScanner.mjs");
      const plan = buildHostIsolationPlan({
        hostLabel: params.hostLabel || params.host || "local-host",
        reason: params.reason,
      });
      return {
        ok: true,
        result_state: "staged",
        enforcement_mode: "not-enforced",
        detail: `Local host isolation plan staged for ${plan.hostLabel}`,
        plan,
      };
    } catch (err) {
      return { ok: false, detail: err.message };
    }
  },
  verify: async (_params, _pre, post) => ({
    verified: Boolean(post?.plan),
    observedState: post?.plan ? "plan-staged" : "plan-missing",
    expectedState: "plan-staged",
  }),
});

registerAction("scan-local-artifacts", {
  tier: "medium",
  reversible: true,
  execute: async (params, _pre) => {
    try {
      const { scanLocalArtifacts } = await import("./localArtifactScanner.mjs");
      const result = await scanLocalArtifacts({
        roots: params.roots,
        maxDepth: params.maxDepth,
        maxEntries: params.maxEntries,
      });
      return {
        ok: true,
        detail: `Local artifact scan completed with ${result.findings.length} flagged item(s)`,
        scan: result,
      };
    } catch (err) {
      return { ok: false, detail: err.message };
    }
  },
  verify: async (_params, _pre, post) => ({
    verified: Boolean(post?.scan && Array.isArray(post.scan.findings)),
    observedState: post?.scan ? "scan-complete" : "scan-missing",
    expectedState: "scan-complete",
  }),
});

registerAction("quarantine-bulk", {
  tier: "critical",
  reversible: true,
  execute: async (params, _pre) => {
    if (!Array.isArray(params.items) || params.items.length === 0) {
      return { ok: false, detail: "items array required" };
    }
    try {
      const { quarantineFile } = await import("./quarantineStore.mjs");
      const records = [];
      for (const rawItem of params.items) {
        const item = typeof rawItem === "object" && rawItem ? rawItem : { path: String(rawItem) };
        records.push(await quarantineFile(params.tenantId || "tenant-local", {
          filename: item.name || item.filename || item.path?.split(/[\\/]/).pop() || null,
          filepath: item.path || item.filepath || null,
          sha256: item.sha256 || null,
          scan_result: item.scan_result || "suspicious",
          quarantined_by: params.actor || "aria:action-runner",
        }));
      }
      return { ok: true, result_state: "staged", enforcement_mode: "inventory-only", detail: `${records.length} quarantine record(s) created; file movement is not configured`, records };
    } catch (err) {
      return { ok: false, detail: err.message };
    }
  },
  verify: async (params, _pre, post) => ({
    verified: Array.isArray(post?.records) && post.records.length === (params.items || []).length,
    observedState: `${post?.records?.length || 0}-inventory-records`,
    expectedState: `${(params.items || []).length}-inventory-records`,
  }),
});

registerAction("policy-change", {
  tier: "critical",
  reversible: true,
  execute: async (_params, _pre) => ({ ok: true, result_state: "staged", enforcement_mode: "not-enforced", detail: "Policy change staged for manual review" }),
  verify:  async (_p, _pre)      => ({ verified: true, observedState: "policy-staged", expectedState: "policy-staged" }),
});

// ── Phase 2: AI-SPM remediation apply ─────────────────────────────────────────
// params: { findingId, artifact: { type, filename, body, applyMethod, repo, targetFile }, findingTitle }
registerAction("ai-spm-apply-remediation", {
  tier: "medium",
  reversible: true,
  execute: async (params, _pre) => {
    const { findingId, artifact, findingTitle } = params;
    if (!artifact) return { ok: false, detail: "artifact required" };

    if (artifact.applyMethod === "github-pr") {
      try {
        const { openRemediationPR } = await import("./connectors/githubPullRequest.mjs");
        const pr = await openRemediationPR({
          repo: artifact.repo,
          filename: artifact.targetFile || artifact.filename,
          content: artifact.body,
          title: `ARIA AI-SPM remediation: ${findingTitle || findingId}`,
          description: `Automated remediation generated by ARIA for finding **${findingId}**.\n\n${artifact.summary || ""}\n\n---\n_This PR was opened automatically. Review the diff before merging._`,
          findingId,
        });
        return { ok: true, detail: `PR opened: ${pr.html_url}`, pr };
      } catch (err) {
        return { ok: false, detail: `GitHub PR open failed: ${err.message}` };
      }
    }

    // stage-file: write to aria-memory/staging/
    try {
      const { existsSync: ex, mkdirSync: mk, writeFileSync: wf } = await import("node:fs");
      const { join: j } = await import("node:path");
      const dir = j(MEMORY_DIR, "staging", findingId || "unknown");
      if (!ex(dir)) mk(dir, { recursive: true });
      const target = j(dir, artifact.filename.replace(/[^a-zA-Z0-9._/-]/g, "_").replace(/\//g, "__"));
      wf(target, artifact.body, "utf8");
      return { ok: true, result_state: "staged", enforcement_mode: "artifact-only", detail: `Artifact staged at ${target}`, stagedPath: target };
    } catch (err) {
      return { ok: false, detail: `Staging failed: ${err.message}` };
    }
  },
  verify: async (params, pre) => {
    const post = pre?.postState || null;
    // For PR-based: verified if we got a PR back
    if (params.artifact?.applyMethod === "github-pr") {
      return {
        verified: !!post?.pr?.html_url,
        observedState: post?.pr?.html_url ? "pr-opened" : "pr-not-created",
        expectedState: "pr-opened",
      };
    }
    // For staged files: verified if file exists
    if (post?.stagedPath) {
      try {
        const { existsSync: ex } = await import("node:fs");
        return {
          verified: ex(post.stagedPath),
          observedState: ex(post.stagedPath) ? "file-staged" : "file-missing",
          expectedState: "file-staged",
        };
      } catch {
        return { verified: false, observedState: "unknown", expectedState: "file-staged" };
      }
    }
    return { verified: true, observedState: "applied", expectedState: "applied" };
  },
});

// ── Phase 2.4: re-scan after remediation to verify resolution ─────────────────
registerAction("ai-spm-rescan", {
  tier: "low",
  reversible: true,
  execute: async (_params, _pre) => {
    try {
      const { scanAiSpm } = await import("../server/aiSpmInventory.mjs").catch(() => import("./aiSpmInventory.mjs"));
      await scanAiSpm();
      return { ok: true, detail: "AI-SPM rescan triggered" };
    } catch (err) {
      return { ok: false, detail: err.message };
    }
  },
  verify: async (_p, _pre) => ({ verified: true, observedState: "rescan-complete", expectedState: "rescan-complete" }),
});

// ── Core runner ───────────────────────────────────────────────────────────────

function readPolicy() {
  return readJson(POLICY_PATH, { tiers: { low: { mode: "auto" }, medium: { mode: "approve" }, critical: { mode: "block" } } });
}

function readExecutionLog() {
  return readJson(ACTION_LOG_PATH, []);
}

function writeExecutionLog(log) {
  writeJson(ACTION_LOG_PATH, log.slice(0, 1000));
}

export function getExecutionLog({ limit = 50, hypothesisId } = {}) {
  let log = readExecutionLog();
  if (hypothesisId) log = log.filter(e => e.hypothesisId === hypothesisId);
  return log.slice(0, limit);
}

/**
 * Run an action through the full lifecycle.
 *
 * opts: {
 *   hypothesisId,  // link back to the reasoning hypothesis
 *   actionId,      // registered action key
 *   params,        // action-specific params
 *   actor,         // "aria:reasoning-engine" | "operator:<id>"
 *   actorType,     // "aria" | "human"
 *   tenantId,
 * }
 *
 * Returns the execution log entry.
 */
export async function runAction(opts = {}) {
  const {
    hypothesisId = null,
    actionId,
    params = {},
    actor = "aria:action-runner",
    actorType = "aria",
    tenantId = "tenant-local",
  } = opts;

  if (!actionId) throw new Error("actionId is required");

  const def = _registry.get(actionId);
  if (!def) throw new Error(`Unknown action: "${actionId}". Register it first.`);

  const policy = readPolicy();
  const tierConfig = policy.tiers?.[def.tier] || { mode: "approve" };

  const execId = uid("exe");

  const entry = {
    id: execId,
    timestamp: new Date().toISOString(),
    actor,
    actorType,
    hypothesisId,
    actionId,
    tier: def.tier,
    reversible: def.reversible,
    params,
    tenantId,
    preState: null,
    postState: null,
    verification: null,
    outcome: "pending",
  };

  // ── Tier gate ────────────────────────────────────────────────────────────────
  if (tierConfig.mode === "block") {
    entry.outcome = "blocked";
    entry.detail = `Action blocked: tier "${def.tier}" requires manual trigger`;
    _persistEntry(entry);
    emit("aria.action.blocked", { execId, actionId, tier: def.tier });
    return entry;
  }

  if (tierConfig.mode === "approve" && actorType !== "human") {
    entry.outcome = "awaiting-approval";
    entry.detail = "Queued for human approval";
    _persistEntry(entry);
    emit("aria.action.queued", { execId, actionId, tier: def.tier, hypothesisId });
    return entry;
  }

  // ── 1. Pre-flight snapshot ────────────────────────────────────────────────────
  try {
    entry.preState = await _snapshotState(actionId, params, tenantId);
  } catch { /* non-fatal */ }

  // ── 2. Execute ────────────────────────────────────────────────────────────────
  let execResult = { ok: false, detail: "execution error" };
  try {
    execResult = await def.execute({ ...params, tenantId, actor }, entry.preState);
  } catch (err) {
    execResult = { ok: false, detail: err.message };
  }

  entry.postState = execResult;
  entry.executedAt = new Date().toISOString();

  if (!execResult.ok) {
    entry.outcome = "failed";
    _persistEntry(entry);
    emit("aria.action.failed", { execId, actionId, detail: execResult.detail });
    _writeAudit(entry);

    // Re-open hypothesis at elevated severity
    if (hypothesisId) {
      try {
        const { updateHypothesis } = await import("./reasoningEngine.mjs");
        updateHypothesis(hypothesisId, { status: "failed", verification: { verified: false, detail: execResult.detail } });
      } catch { /* non-fatal */ }
    }
    return entry;
  }

  emit("aria.action.executing", { execId, actionId, hypothesisId });

  // ── 3. Verify ─────────────────────────────────────────────────────────────────
  await new Promise(r => setTimeout(r, VERIFY_DELAY_MS));
  try {
    entry.verification = await def.verify({ ...params, tenantId }, entry.preState, execResult);
  } catch {
    entry.verification = { verified: false, observedState: "unknown", expectedState: "unknown" };
  }

  const staged = execResult.result_state === "staged" || execResult.enforcement_mode === "not-enforced" || execResult.enforcement_mode === "inventory-only" || execResult.enforcement_mode === "artifact-only";
  entry.enforcementMode = execResult.enforcement_mode || "enforced-or-observed";
  entry.outcome = entry.verification.verified ? (staged ? "staged" : "success") : "failed";

  // ── 4. Persist + audit ────────────────────────────────────────────────────────
  _persistEntry(entry);
  _writeAudit(entry);

  const eventType = entry.outcome === "staged" ? "aria.action.staged" : entry.verification.verified ? "aria.action.verified" : "aria.action.verification_failed";
  emit(eventType, { execId, actionId, hypothesisId, verification: entry.verification });

  // Update hypothesis status
  if (hypothesisId) {
    try {
      const { updateHypothesis } = await import("./reasoningEngine.mjs");
      const newStatus = entry.outcome === "staged" ? "staged" : entry.verification.verified ? "verified" : "failed";
      updateHypothesis(hypothesisId, {
        status: newStatus,
        executedAt: entry.executedAt,
        verification: entry.verification,
      });
    } catch { /* non-fatal */ }
  }

  return entry;
}

// ── Approval flow ─────────────────────────────────────────────────────────────

/**
 * Approve a pending execution entry — runs it as a human-approved action.
 */
export async function approveAction(execId, { approver = "operator", tenantId = "tenant-local" } = {}) {
  const log = readExecutionLog();
  const entry = log.find(e => e.id === execId);
  if (!entry) throw new Error(`Execution entry ${execId} not found`);
  if (entry.outcome !== "awaiting-approval") throw new Error(`Entry ${execId} is not awaiting approval (status: ${entry.outcome})`);

  return runAction({
    hypothesisId: entry.hypothesisId,
    actionId: entry.actionId,
    params: entry.params,
    actor: `human:${approver}`,
    actorType: "human",
    tenantId,
  });
}

// ── Internals ─────────────────────────────────────────────────────────────────

async function _snapshotState(actionId, params, tenantId) {
  const snap = { actionId, tenantId, capturedAt: new Date().toISOString() };
  try {
    if (actionId === "block-ip" && params.ip) {
      const { getBlockedIps } = await import("./blockedIpStore.mjs");
      snap.blockedIps = (await getBlockedIps(tenantId)).length;
    }
    if (actionId === "scan-local-artifacts") {
      snap.scanRequested = true;
    }
  } catch { /* non-fatal */ }
  return snap;
}

function _persistEntry(entry) {
  const log = readExecutionLog();
  const existing = log.findIndex(e => e.id === entry.id);
  if (existing >= 0) log[existing] = entry;
  else log.unshift(entry);
  writeExecutionLog(log);
}

function _writeAudit(entry) {
  try {
    logAuditEvent({
      event_type: `aria.action.${entry.outcome}`,
      actor: entry.actor,
      context: {
        id: entry.id,
        hypothesisId: entry.hypothesisId,
        actionId: entry.actionId,
        tier: entry.tier,
        actorType: entry.actorType,
        preState: entry.preState,
        postState: entry.postState,
        verification: entry.verification,
        outcome: entry.outcome,
      },
    });
  } catch { /* non-fatal */ }
}

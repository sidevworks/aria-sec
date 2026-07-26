// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

/**
 * reasoningEngine.mjs — ARIA's continuous autonomous reasoning loop.
 *
 * Runs on a configurable interval (default 30 s). Each cycle:
 *   1. Samples world state: telemetry, sockets, audit events, incidents, findings.
 *   2. Maintains a rolling 15-minute signal buffer (checkpointed to disk).
 *   3. Evaluates correlation rules; fires hypotheses when rules match.
 *   4. Calls ariaIntelligence to produce a structured hypothesis object.
 *   5. Persists hypotheses and broadcasts them to the UI via WebSocket eventBus.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { cpus, freemem, totalmem } from "node:os";
import { CORRELATION_RULES } from "./rules/correlation-rules.mjs";
import { emit } from "./eventBus.mjs";
import { logAuditEvent } from "./auditLog.mjs";
import { resolveLegacyMemoryDir } from "./persistenceConfig.mjs";

// ── Paths ─────────────────────────────────────────────────────────────────────

const MEMORY_DIR = resolveLegacyMemoryDir();
const SIGNAL_BUFFER_PATH = join(MEMORY_DIR, "signal-buffer.json");
const HYPOTHESES_PATH     = join(MEMORY_DIR, "hypotheses.json");
const POLICY_PATH         = join(MEMORY_DIR, "autonomy-policy.json");

function ensureDir() {
  if (!existsSync(MEMORY_DIR)) mkdirSync(MEMORY_DIR, { recursive: true });
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function uid(prefix = "hyp") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function readJson(path, fallback) {
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { return fallback; }
}

function writeJson(path, data) {
  ensureDir();
  try { writeFileSync(path, JSON.stringify(data, null, 2)); } catch { /* non-fatal */ }
}

// ── Signal buffer ─────────────────────────────────────────────────────────────
// Rolling 15-minute window of observations. In-memory + checkpointed.

const SIGNAL_WINDOW_MS = 15 * 60 * 1000;
let _signalBuffer = []; // [{ ts, metrics: {key: value}, meta }]

function loadSignalBuffer() {
  const saved = readJson(SIGNAL_BUFFER_PATH, []);
  const cutoff = Date.now() - SIGNAL_WINDOW_MS;
  _signalBuffer = Array.isArray(saved) ? saved.filter(s => s.ts >= cutoff) : [];
}

function appendSignal(metrics, meta = {}) {
  const ts = Date.now();
  _signalBuffer.push({ ts, metrics, meta });
  const cutoff = ts - SIGNAL_WINDOW_MS;
  _signalBuffer = _signalBuffer.filter(s => s.ts >= cutoff);
}

function saveSignalBuffer() {
  writeJson(SIGNAL_BUFFER_PATH, _signalBuffer);
}

// ── Hypotheses store ──────────────────────────────────────────────────────────

let _hypotheses = [];

function loadHypotheses() {
  _hypotheses = readJson(HYPOTHESES_PATH, []);
}

function saveHypotheses() {
  writeJson(HYPOTHESES_PATH, _hypotheses.slice(0, 500));
}

export function getHypotheses({ status, limit = 50 } = {}) {
  const list = status ? _hypotheses.filter(h => h.status === status) : _hypotheses;
  return list.slice(0, limit);
}

export function getHypothesisById(id) {
  return _hypotheses.find(h => h.id === id) || null;
}

export function updateHypothesis(id, patch) {
  const idx = _hypotheses.findIndex(h => h.id === id);
  if (idx === -1) return null;
  _hypotheses[idx] = { ..._hypotheses[idx], ...patch };
  saveHypotheses();
  emit("hypothesis.updated", _hypotheses[idx]);
  return _hypotheses[idx];
}

function addHypothesis(hyp) {
  _hypotheses.unshift(hyp);
  saveHypotheses();
  emit("hypothesis.created", hyp);
}

// ── World state sampling ──────────────────────────────────────────────────────

function sampleTelemetry() {
  const free  = freemem();
  const total = totalmem();
  const memPressure = 1 - free / total;

  // CPU: average load of all cores over ~100ms using cpus()
  const cpuList = cpus();
  let userMs = 0, idleMs = 0;
  for (const c of cpuList) {
    userMs += c.times.user + c.times.sys + c.times.nice + c.times.irq;
    idleMs += c.times.idle;
  }
  const cpuUtil = userMs / Math.max(1, userMs + idleMs); // 0..1

  return { memPressure, cpuUtil };
}

// Dynamic imports avoid circular-dep issues at startup
async function sampleWorldState() {
  const { memPressure, cpuUtil } = sampleTelemetry();

  let openIncidents = 0;
  let recentAuditCount = 0;
  let recentFindings = [];
  let openSockets = [];

  try {
    const { getIncidents } = await import("./incidentStore.mjs");
    const incidents = await getIncidents({ tenantId: "tenant-local", status: "open" });
    openIncidents = Array.isArray(incidents) ? incidents.length : 0;
  } catch { /* non-fatal */ }

  try {
    const { readAuditEvents } = await import("./auditLog.mjs");
    const events = await readAuditEvents({ limit: 20 });
    recentAuditCount = Array.isArray(events) ? events.length : 0;
  } catch { /* non-fatal */ }

  // Check if signal buffer already has recent findings — avoid slow AI-SPM import in hot path
  const recentBufFindings = _signalBuffer.filter(s => s.meta?.newFinding && Date.now() - s.ts < 5 * 60 * 1000);
  if (recentBufFindings.length > 0) recentFindings = [{ title: "signal-buffer finding" }];

  return {
    timestamp: Date.now(),
    memory: { pressure: memPressure, free: freemem(), total: totalmem() },
    cpu: { utilization: cpuUtil },
    incidents: { open: openIncidents },
    audit: { recentCount: recentAuditCount },
    findings: recentFindings,
    openSockets,
  };
}

// ── Rule evaluation ───────────────────────────────────────────────────────────

const WINDOW_MS = { "2m": 2*60*1000, "3m": 3*60*1000, "5m": 5*60*1000, "10m": 10*60*1000 };

function getWindowMs(w) {
  return WINDOW_MS[w] || 5 * 60 * 1000;
}

function signalsInWindow(windowKey) {
  const cutoff = Date.now() - getWindowMs(windowKey);
  return _signalBuffer.filter(s => s.ts >= cutoff);
}

function evalSignal(signal, worldState) {
  const { metric, op, value: threshold, window: win } = signal;
  const recent = signalsInWindow(win);

  switch (metric) {
    case "memory.pressure": {
      // True if ANY sample in window (or current world state) exceeds threshold
      const vals = recent.map(s => s.metrics?.memPressure ?? null).filter(v => v !== null);
      vals.push(worldState.memory.pressure);
      const max = Math.max(...vals);
      if (op === ">") return max > threshold;
      if (op === "<") return Math.min(...vals) < threshold;
      return false;
    }
    case "process.cpu": {
      const vals = recent.map(s => s.metrics?.cpuUtil ?? null).filter(v => v !== null);
      vals.push(worldState.cpu.utilization);
      const max = Math.max(...vals);
      if (op === ">") return max > threshold;
      return false;
    }
    case "network.newOutbound": {
      if (op === "exists") {
        return recent.some(s => s.meta?.newOutbound);
      }
      return false;
    }
    case "auth.failures": {
      const count = recent.reduce((n, s) => n + (s.meta?.authFailures || 0), 0);
      if (op === ">") return count > threshold;
      return false;
    }
    case "process.newHigh": {
      if (op === "exists") return recent.some(s => s.meta?.newHighCpuProcess);
      return false;
    }
    case "scan.finding": {
      if (op === "exists") return recent.some(s => s.meta?.newFinding);
      return false;
    }
    case "incident.open": {
      const count = worldState.incidents?.open ?? 0;
      if (op === ">") return count > threshold;
      return false;
    }
    default:
      return false;
  }
}

function evaluateRule(rule, worldState) {
  const results = rule.signals.map(s => evalSignal(s, worldState));
  if (rule.combine === "ALL") return results.every(Boolean);
  if (rule.combine === "ANY") return results.some(Boolean);
  return results.every(Boolean);
}

// ── Dedup: one open hypothesis per rule at a time ─────────────────────────────

function hasOpenHypothesisForRule(ruleId) {
  return _hypotheses.some(h => h.ruleId === ruleId && ["proposed", "approved", "executing"].includes(h.status));
}

// ── Hypothesis generation ─────────────────────────────────────────────────────

function buildEvidence(rule, worldState) {
  const evidence = [];
  const recent = signalsInWindow("5m");

  if (recent.length > 0) {
    evidence.push({
      source: "signal-buffer",
      observation: `${recent.length} signals in the 15-minute buffer`,
      timestamp: new Date().toISOString(),
      raw: { sampleCount: recent.length },
    });
  }

  evidence.push({
    source: "telemetry",
    observation: `Memory pressure: ${(worldState.memory.pressure * 100).toFixed(1)}%, CPU utilization: ${(worldState.cpu.utilization * 100).toFixed(1)}%`,
    timestamp: new Date().toISOString(),
    raw: worldState.memory,
  });

  if (worldState.incidents.open > 0) {
    evidence.push({
      source: "incident-store",
      observation: `${worldState.incidents.open} open incident(s) currently active`,
      timestamp: new Date().toISOString(),
      raw: { openIncidents: worldState.incidents.open },
    });
  }

  return evidence;
}

function interpolateHypothesis(template, worldState) {
  const recent = signalsInWindow("5m");
  const lastSig = recent[recent.length - 1] || {};
  const process = lastSig.meta?.topProcess || "unknown-process";
  const remoteIp = lastSig.meta?.remoteIp || "unknown-host";
  const authFailures = recent.reduce((n, s) => n + (s.meta?.authFailures || 0), 0);

  return template
    .replace("{process}", process)
    .replace("{remoteIp}", remoteIp)
    .replace("{authFailures}", String(authFailures));
}

function confidenceFromEvidence(evidence, worldState) {
  let score = 0.5;
  if (evidence.length >= 3) score += 0.15;
  if (worldState.memory.pressure > 0.9) score += 0.1;
  if (worldState.cpu.utilization > 0.8) score += 0.1;
  if (worldState.incidents.open > 2) score += 0.1;
  return Math.min(0.95, score);
}

function makeHypothesis(rule, worldState) {
  const evidence = buildEvidence(rule, worldState);
  const hypothesis = interpolateHypothesis(rule.hypothesis, worldState);
  const confidence = confidenceFromEvidence(evidence, worldState);

  return {
    id: uid("hyp"),
    createdAt: new Date().toISOString(),
    ruleId: rule.id,
    ruleName: rule.name,
    hypothesis,
    confidence,
    severity: rule.severity,
    evidence,
    blastRadius: { processes: [], hosts: [], identities: [], dataAssets: [] },
    proposedActions: rule.proposedActions.map((actionId, i) => ({
      actionId,
      riskTier: i === 0 ? "medium" : i === 1 ? "medium" : "low",
      reversible: actionId !== "isolate-host",
      params: {},
    })),
    mappedControls: rule.mappedControls || [],
    status: "proposed",
    approvedBy: null,
    approvedAt: null,
    denyReason: null,
    verification: null,
    executedAt: null,
  };
}

// ── Main reasoning cycle ──────────────────────────────────────────────────────

let _engineRunning = false;
let _cycleInterval = null;

async function runCycle() {
  try {
    const worldState = await sampleWorldState();
    appendSignal(
      { memPressure: worldState.memory.pressure, cpuUtil: worldState.cpu.utilization },
      {
        topProcess: null,
        remoteIp: null,
        newOutbound: false,
        authFailures: 0,
        newHighCpuProcess: false,
        newFinding: worldState.findings.length > 0,
      }
    );
    saveSignalBuffer();

    for (const rule of CORRELATION_RULES) {
      if (!evaluateRule(rule, worldState)) continue;
      if (hasOpenHypothesisForRule(rule.id)) continue;

      const hyp = makeHypothesis(rule, worldState);
      addHypothesis(hyp);

      logAuditEvent({
        event_type: "aria.hypothesis.created",
        actor: "aria:reasoning-engine",
        context: {
          hypothesisId: hyp.id,
          ruleId: rule.id,
          severity: rule.severity,
          confidence: hyp.confidence,
        },
      });

      // Determine tier from policy to decide auto-execute vs. queue
      const policy = readJson(POLICY_PATH, {});
      const tiers = policy.tiers || {};
      const firstAction = hyp.proposedActions[0];
      const actionTier = firstAction?.riskTier || "medium";
      const tierConfig = tiers[actionTier] || {};

      if (tierConfig.mode === "auto") {
        // Low-tier: queue actionRunner (imported lazily to avoid circular deps)
        try {
          const { runAction } = await import("./actionRunner.mjs");
          await runAction({
            hypothesisId: hyp.id,
            actionId: firstAction.actionId,
            params: firstAction.params || {},
            actorType: "aria",
            actor: "aria:reasoning-engine",
          });
        } catch (err) {
          // Non-fatal: action runner failure doesn't stop reasoning
          emit("aria.action.error", { hypothesisId: hyp.id, error: err.message });
        }
      }
    }
  } catch (err) {
    // Cycle errors are non-fatal — log and continue
    console.error("[reasoningEngine] cycle error:", err.message);
  }
}

/**
 * Start the continuous reasoning engine.
 * Safe to call multiple times — only one interval runs.
 */
export function startReasoningEngine() {
  if (_engineRunning) return;
  _engineRunning = true;

  loadSignalBuffer();
  loadHypotheses();

  const policy = readJson(POLICY_PATH, {});
  const intervalMs = (policy.cycleIntervalSeconds || 30) * 1000;

  _cycleInterval = setInterval(runCycle, intervalMs);
  // Run one cycle immediately so the first hypothesis can appear within seconds of startup
  setImmediate(runCycle);

  console.log(`[reasoningEngine] started — cycle interval ${intervalMs / 1000}s`);
}

export function stopReasoningEngine() {
  if (_cycleInterval) { clearInterval(_cycleInterval); _cycleInterval = null; }
  _engineRunning = false;
}

/**
 * Inject a signal from external sources (e.g. auth failures detected in autonomousResponse).
 * meta: { newOutbound?, authFailures?, newHighCpuProcess?, topProcess?, remoteIp?, newFinding? }
 */
export function injectSignal(metrics = {}, meta = {}) {
  appendSignal(metrics, meta);
}

// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

/**
 * autonomousResponse.mjs — server-side autonomous threat response pipeline.
 *
 * Operates entirely in-process, sub-millisecond decision latency.
 * Three layers:
 *   1. Velocity detector  — sliding-window per-source rate tracking
 *   2. Cross-signal correlator — multi-source pattern matching
 *   3. Auto-countermeasures — block IP, create incident, escalate severity
 *
 * Call feed(signal) from any server handler whenever a security-relevant event
 * occurs. The pipeline decides autonomously whether to act.
 */

import { emit } from "./eventBus.mjs";
import { blockIp } from "./blockedIpStore.mjs";
import { createIncident } from "./incidentStore.mjs";
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { resolveLegacyMemoryDir } from "./persistenceConfig.mjs";

const REPLAY_PATH = join(resolveLegacyMemoryDir(), "autonomous-response-replay.jsonl");
const REPLAY_ARCHIVE_PATH = `${REPLAY_PATH}.1`;
const REPLAY_MAX_BYTES = Math.max(1_000_000, Number(process.env.ARIA_AUTONOMOUS_REPLAY_MAX_BYTES || 10_000_000));

// ── Velocity windows ──────────────────────────────────────────────────────────
// Map<sourceKey, number[]> — timestamps of recent signals in ms
const velocityWindows = new Map();

// Track coordinated attack candidates: Map<endpoint, Map<ip, timestamp[]>>
const coordinatedWindows = new Map();

// Debounce actions: Map<actionKey, lastFiredAt> — prevent duplicate countermeasures
const actionDebounce = new Map();
const DEBOUNCE_MS = 30_000;

// ── Thresholds ────────────────────────────────────────────────────────────────
const THRESHOLDS = {
  // >10 signals/s sustained for 3+ consecutive seconds from same source → swarm
  swarmRatePerSec: 10,
  swarmSustainSec: 3,
  // >5 auth failures in 10s from same source → auto-block
  authFailureCount: 5,
  authFailureWindowMs: 10_000,
  // >3 distinct IPs hitting restricted endpoints within 500ms → coordinated attack
  coordinatedIpCount: 3,
  coordinatedWindowMs: 500,
  // Velocity window kept for this long before pruning
  velocityRetentionMs: 60_000,
};

function replayRecord(signal) {
  return {
    timestamp: new Date().toISOString(),
    type: String(signal?.type || "unknown"),
    sourceIp: String(signal?.sourceIp || ""),
    endpoint: String(signal?.endpoint || "unknown").slice(0, 300),
    tenantId: String(signal?.tenantId || "tenant-local").slice(0, 64),
    meta_keys: signal?.meta && typeof signal.meta === "object" ? Object.keys(signal.meta).slice(0, 30) : [],
  };
}

function appendReplay(signal) {
  try {
    mkdirSync(dirname(REPLAY_PATH), { recursive: true });
    if (existsSync(REPLAY_PATH) && statSync(REPLAY_PATH).size >= REPLAY_MAX_BYTES) {
      if (existsSync(REPLAY_ARCHIVE_PATH)) renameSync(REPLAY_ARCHIVE_PATH, `${REPLAY_ARCHIVE_PATH}.${Date.now()}`);
      renameSync(REPLAY_PATH, REPLAY_ARCHIVE_PATH);
    }
    appendFileSync(REPLAY_PATH, `${JSON.stringify(replayRecord(signal))}\n`, "utf8");
  } catch {
    // Replay persistence must never block request handling.
  }
}

export function getAutonomousReplayEvents({ limit = 1000, tenantId = null } = {}) {
  const max = Math.min(5000, Math.max(1, Number(limit) || 1000));
  try {
    return readFileSync(REPLAY_PATH, "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => { try { return JSON.parse(line); } catch { return null; } })
      .filter(Boolean)
      .filter((item) => !tenantId || item.tenantId === tenantId)
      .slice(-max)
      .reverse();
  } catch {
    return [];
  }
}

function restoreRecentWindows() {
  const cutoff = Date.now() - THRESHOLDS.velocityRetentionMs;
  for (const item of getAutonomousReplayEvents({ limit: 5000 }).reverse()) {
    const timestamp = Date.parse(item.timestamp);
    if (!Number.isFinite(timestamp) || timestamp < cutoff || !item.sourceIp) continue;
    const sourceKey = `${item.tenantId || "?"}:${item.sourceIp}`;
    velocityWindows.set(sourceKey, [...(velocityWindows.get(sourceKey) || []), timestamp]);
    if (item.type === "auth_failure") {
      const authKey = `authfail:${sourceKey}`;
      velocityWindows.set(authKey, [...(velocityWindows.get(authKey) || []), timestamp]);
    }
    if (item.endpoint && item.endpoint !== "unknown") {
      if (!coordinatedWindows.has(item.endpoint)) coordinatedWindows.set(item.endpoint, new Map());
      const endpointMap = coordinatedWindows.get(item.endpoint);
      endpointMap.set(item.sourceIp, [...(endpointMap.get(item.sourceIp) || []), timestamp]);
    }
  }
}

restoreRecentWindows();

function now() { return Date.now(); }

function canAct(key) {
  const last = actionDebounce.get(key);
  if (last && now() - last < DEBOUNCE_MS) return false;
  actionDebounce.set(key, now());
  return true;
}

function pruneOlderThan(arr, cutoffMs) {
  const cutoff = now() - cutoffMs;
  let i = 0;
  while (i < arr.length && arr[i] < cutoff) i++;
  return arr.slice(i);
}

// ── Velocity tracker ──────────────────────────────────────────────────────────

function trackVelocity(sourceKey) {
  const t = now();
  let window = velocityWindows.get(sourceKey) || [];
  window.push(t);
  window = pruneOlderThan(window, THRESHOLDS.velocityRetentionMs);
  velocityWindows.set(sourceKey, window);

  // Rate in last second
  const oneSecAgo = t - 1000;
  const lastSecCount = window.filter(ts => ts >= oneSecAgo).length;

  // Sustained check: count seconds where rate exceeded threshold
  let sustainedSeconds = 0;
  for (let s = 0; s < THRESHOLDS.swarmSustainSec; s++) {
    const from = t - (s + 1) * 1000;
    const to   = t - s * 1000;
    const cnt  = window.filter(ts => ts >= from && ts < to).length;
    if (cnt >= THRESHOLDS.swarmRatePerSec) sustainedSeconds++;
  }

  return { lastSecCount, sustainedSeconds };
}

// ── Coordinated attack tracker ─────────────────────────────────────────────────

function trackCoordinated(endpoint, ip) {
  if (!coordinatedWindows.has(endpoint)) coordinatedWindows.set(endpoint, new Map());
  const endpointMap = coordinatedWindows.get(endpoint);

  const t = now();
  let times = endpointMap.get(ip) || [];
  times.push(t);
  times = pruneOlderThan(times, THRESHOLDS.coordinatedWindowMs);
  endpointMap.set(ip, times);

  // Count distinct IPs active in the window
  const cutoff = t - THRESHOLDS.coordinatedWindowMs;
  let activeIps = 0;
  for (const [, ts] of endpointMap) {
    if (ts.some(x => x >= cutoff)) activeIps++;
  }

  // Prune stale IPs
  for (const [k, ts] of endpointMap) {
    if (!ts.some(x => x >= cutoff)) endpointMap.delete(k);
  }

  return activeIps;
}

// ── Countermeasures ────────────────────────────────────────────────────────────

async function autoBlockIp(ip, reason, tenantId) {
  const key = `block:${ip}`;
  if (!canAct(key)) return;
  try {
    await blockIp(tenantId || "tenant-local", ip, {
      reason,
      source: "autonomous_response",
      expiresIn: 3600, // 1-hour auto-block; human can extend
      actor: "aria:autonomous",
    });
    emit("response.ip_blocked", { ip, reason, auto: true });
  } catch { /* IP may already be blocked */ }
}

async function raiseIncident(title, severity, context, tenantId) {
  const key = `incident:${title.slice(0, 40)}`;
  if (!canAct(key)) return;
  try {
    const incident = await createIncident({
      title,
      severity,
      source: "autonomous_response",
      tenant_id: tenantId || "tenant-local",
      context,
    });
    emit("incident.auto_created", { incident, severity, context });
  } catch { /* ignore */ }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Feed a security signal into the pipeline.
 *
 * signal: {
 *   type: "request" | "auth_failure" | "threat" | "anomaly" | "network_event",
 *   sourceIp: string,
 *   endpoint?: string,
 *   tenantId?: string,
 *   meta?: object,
 * }
 */
export async function feed(signal) {
  const { type, sourceIp, endpoint = "unknown", tenantId, meta = {} } = signal;
  if (!sourceIp) return;
  appendReplay(signal);

  const sourceKey = `${tenantId || "?"}:${sourceIp}`;

  // ── Layer 1: velocity ──────────────────────────────────────────────────────
  const { lastSecCount, sustainedSeconds } = trackVelocity(sourceKey);

  if (sustainedSeconds >= THRESHOLDS.swarmSustainSec) {
    emit("threat.swarm_detected", {
      sourceIp,
      rate: lastSecCount,
      sustainedSeconds,
      endpoint,
    });
    // Auto-block
    await autoBlockIp(sourceIp, `AI swarm velocity: ${lastSecCount} req/s sustained ${sustainedSeconds}s`, tenantId);
    await raiseIncident(
      `AI swarm attack from ${sourceIp}`,
      "critical",
      { sourceIp, rate: lastSecCount, sustainedSeconds, endpoint },
      tenantId,
    );
    return; // Higher-priority rule fired; skip lower layers
  }

  // ── Layer 2: auth failure flood ────────────────────────────────────────────
  if (type === "auth_failure") {
    emit("threat.auth_failure", { sourceIp, endpoint, meta });

    // Reuse velocity window scoped to auth failures
    const authKey = `authfail:${sourceKey}`;
    let authWindow = velocityWindows.get(authKey) || [];
    authWindow.push(now());
    authWindow = pruneOlderThan(authWindow, THRESHOLDS.authFailureWindowMs);
    velocityWindows.set(authKey, authWindow);

    if (authWindow.length >= THRESHOLDS.authFailureCount) {
      await autoBlockIp(
        sourceIp,
        `Auth failure flood: ${authWindow.length} failures in ${THRESHOLDS.authFailureWindowMs}ms`,
        tenantId,
      );
      await raiseIncident(
        `Credential stuffing from ${sourceIp}`,
        "high",
        { sourceIp, failureCount: authWindow.length, endpoint },
        tenantId,
      );
    }
    return;
  }

  // ── Layer 3: coordinated multi-IP attack ───────────────────────────────────
  if (endpoint && endpoint !== "unknown") {
    const activeIps = trackCoordinated(endpoint, sourceIp);
    if (activeIps >= THRESHOLDS.coordinatedIpCount) {
      const key = `coordinated:${endpoint}`;
      if (canAct(key)) {
        emit("threat.coordinated_attack", { endpoint, distinctIps: activeIps });
        await raiseIncident(
          `Coordinated attack on ${endpoint}`,
          "critical",
          { endpoint, distinctIps: activeIps, windowMs: THRESHOLDS.coordinatedWindowMs },
          tenantId,
        );
      }
    }
  }

  // Emit raw signal for UI telemetry (low-severity, no action needed)
  if (type === "threat" || type === "anomaly" || type === "network_event") {
    emit(`signal.${type}`, { sourceIp, endpoint, meta });
  }
}

/** Emit a plain event to all SSE clients (convenience wrapper). */
export function broadcast(type, payload) {
  emit(type, payload);
}

// ── Periodic cleanup ──────────────────────────────────────────────────────────
const _cleanupTimer = setInterval(() => {
  const cutoff = now() - THRESHOLDS.velocityRetentionMs;
  for (const [k, window] of velocityWindows) {
    const pruned = window.filter(ts => ts >= cutoff);
    if (pruned.length === 0) velocityWindows.delete(k);
    else velocityWindows.set(k, pruned);
  }
  // Prune debounce entries older than 2× window
  for (const [k, ts] of actionDebounce) {
    if (now() - ts > DEBOUNCE_MS * 2) actionDebounce.delete(k);
  }
}, 30_000);
// Don't let this background cleanup timer keep the process (or a test runner) alive.
if (typeof _cleanupTimer.unref === "function") _cleanupTimer.unref();

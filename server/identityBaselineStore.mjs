// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

// ════════════════════════════════════════════════════════════════════════════
// IDENTITY BASELINE STORE — per-entity UEBA observation tracking
//
// Key schema (durable KV):
//   "identity:baseline:v1:{entityId}"   → JSON metadata blob
//   "identity:baseline:obs:{entityId}"  → list of recent observation summaries
//
// Baseline states:
//   insufficient_data — < LEARNING_MIN_OBS or first seen < LEARNING_MIN_AGE_MS
//   learning          — observations and age below ESTABLISHED thresholds
//   established       — seenCount >= ESTABLISHED_OBS and age >= ESTABLISHED_AGE_MS
//   degraded          — established conditions but recent anomaly rate elevated
// ════════════════════════════════════════════════════════════════════════════

import { durableGet, durableSet, durableLpush, durableLrange, durableScan } from "./durableStore.mjs";
import { assessDeviceIdentityClaims } from "./NetworkIntelligence/deviceIdentityClaims.mjs";

const LEARNING_MIN_OBS       = 3;
const LEARNING_MIN_AGE_MS    = 60 * 60 * 1000;          // 1 hour
const ESTABLISHED_OBS        = 20;
const ESTABLISHED_AGE_MS     = 7 * 24 * 60 * 60 * 1000; // 7 days
const OBS_LIST_MAX           = 100;
const RISKY_PORTS            = new Set([21, 22, 23, 25, 53, 80, 110, 143, 161, 389, 443, 445, 512, 513, 514, 1433, 1521, 3306, 3389, 4444, 5432, 5900, 6379, 8080, 8443, 9200, 27017]);
const HIGH_RISK_PORTS        = new Set([21, 23, 512, 513, 514, 4444, 3389, 5900]);
const ABSENCE_THRESHOLD_MS   = 14 * 24 * 60 * 60 * 1000; // 14 days
const DEGRADED_ANOMALY_COUNT = 3;

function metaKey(entityId)  { return `identity:baseline:v1:${entityId}`; }
function obsList(entityId)  { return `identity:baseline:obs:${entityId}`; }

function nowIso() { return new Date().toISOString(); }

// ─── Baseline state derivation ────────────────────────────────────────────────

function deriveBaselineState({ seenCount, firstSeenMs, recentAnomalies = [] }) {
  const ageMs = Date.now() - firstSeenMs;
  if (seenCount < LEARNING_MIN_OBS || ageMs < LEARNING_MIN_AGE_MS) {
    return "insufficient_data";
  }
  const isEstablished = seenCount >= ESTABLISHED_OBS && ageMs >= ESTABLISHED_AGE_MS;
  if (isEstablished) {
    const recentHighSeverity = recentAnomalies.filter(a => a.severity === "high").length;
    if (recentHighSeverity >= DEGRADED_ANOMALY_COUNT) return "degraded";
    return "established";
  }
  return "learning";
}

function deriveLearningProgress({ seenCount, firstSeenMs }) {
  const ageMs = Date.now() - firstSeenMs;
  const countPct = Math.min(seenCount / ESTABLISHED_OBS, 1);
  const agePct   = Math.min(ageMs / ESTABLISHED_AGE_MS, 1);
  return Math.round((countPct * 0.6 + agePct * 0.4) * 100) / 100;
}

// ─── Anomaly detection ────────────────────────────────────────────────────────

function detectAnomalies(meta, observation) {
  const anomalies = [];

  // New risky port appeared
  if (Array.isArray(observation.openPorts)) {
    for (const p of observation.openPorts) {
      const port = Number(p);
      if (!meta.typicalPorts.includes(port) && RISKY_PORTS.has(port)) {
        anomalies.push({
          type: HIGH_RISK_PORTS.has(port) ? "new_high_risk_port" : "new_risky_port",
          severity: HIGH_RISK_PORTS.has(port) ? "high" : "medium",
          detail: `Port ${port} is newly open`,
          port,
          timestamp: nowIso(),
        });
      }
    }
  }

  // Device reappeared after long absence
  if (meta.lastSeen) {
    const gapMs = Date.now() - new Date(meta.lastSeen).getTime();
    if (gapMs > ABSENCE_THRESHOLD_MS) {
      anomalies.push({
        type: "device_reappeared",
        severity: "medium",
        detail: `Device absent for ${Math.round(gapMs / 86_400_000)}d`,
        timestamp: nowIso(),
      });
    }
  }

  // Hostname changed
  if (
    observation.hostname &&
    meta.hostnameHistory.length > 0 &&
    !meta.hostnameHistory.includes(observation.hostname)
  ) {
    anomalies.push({
      type: "hostname_changed",
      severity: "medium",
      detail: `Hostname changed to ${observation.hostname}`,
      timestamp: nowIso(),
    });
  }

  // Vendor changed
  if (
    observation.vendor &&
    meta.vendorHistory.length > 0 &&
    !meta.vendorHistory.includes(observation.vendor)
  ) {
    anomalies.push({
      type: "vendor_changed",
      severity: "high",
      detail: `Vendor changed to ${observation.vendor}`,
      timestamp: nowIso(),
    });
  }

  // Identity claims and learned segment history. These findings carry their
  // own evidence and calibrated confidence for the inspection/audit trail.
  anomalies.push(...assessDeviceIdentityClaims(observation, meta));

  // Risk spike (>= 20-point jump from median)
  if (typeof observation.riskScore === "number" && meta.riskScoreTrend.length >= 3) {
    const median = [...meta.riskScoreTrend].sort((a, b) => a - b)[Math.floor(meta.riskScoreTrend.length / 2)];
    if (observation.riskScore - median >= 20) {
      anomalies.push({
        type: "risk_spike",
        severity: "high",
        detail: `Risk score jumped from ${median} (median) to ${observation.riskScore}`,
        timestamp: nowIso(),
      });
    }
  }

  // Unknown device with exposed admin service
  if (meta.seenCount === 0 && Array.isArray(observation.openPorts)) {
    const exposedAdmin = observation.openPorts.some(p => HIGH_RISK_PORTS.has(Number(p)));
    if (exposedAdmin) {
      anomalies.push({
        type: "unknown_device_admin_exposed",
        severity: "high",
        detail: "First-seen device has admin/remote-access service exposed",
        timestamp: nowIso(),
      });
    }
  }

  return anomalies;
}

function normaliseMeta(meta, entityId) {
  const blank = blankMeta(entityId);
  return {
    ...blank,
    ...meta,
    typicalPorts: Array.isArray(meta?.typicalPorts) ? meta.typicalPorts : [],
    subnetHistory: Array.isArray(meta?.subnetHistory) ? meta.subnetHistory : [],
    subnetObservationCounts:
      meta?.subnetObservationCounts && typeof meta.subnetObservationCounts === "object"
        ? meta.subnetObservationCounts
        : {},
    hostnameHistory: Array.isArray(meta?.hostnameHistory) ? meta.hostnameHistory : [],
    vendorHistory: Array.isArray(meta?.vendorHistory) ? meta.vendorHistory : [],
    deviceTypeHistory: Array.isArray(meta?.deviceTypeHistory) ? meta.deviceTypeHistory : [],
    riskScoreTrend: Array.isArray(meta?.riskScoreTrend) ? meta.riskScoreTrend : [],
    anomalyHistory: Array.isArray(meta?.anomalyHistory) ? meta.anomalyHistory : [],
    currentIdentityFindings: Array.isArray(meta?.currentIdentityFindings) ? meta.currentIdentityFindings : [],
  };
}

function dedupeFreshAnomalies(existing, detected) {
  return detected.filter((candidate) => !existing.some((previous) =>
    previous.type === candidate.type &&
    previous.detail === candidate.detail &&
    Date.now() - new Date(previous.timestamp || 0).getTime() < 24 * 60 * 60 * 1000
  ));
}

// ─── Blank meta ───────────────────────────────────────────────────────────────

function blankMeta(entityId) {
  const t = nowIso();
  return {
    entityId,
    firstSeen:      t,
    lastSeen:       null,
    seenCount:      0,
    typicalPorts:   [],
    subnetHistory:  [],
    subnetObservationCounts: {},
    hostnameHistory:[],
    vendorHistory:  [],
    deviceTypeHistory: [],
    riskScoreTrend: [],
    anomalyHistory: [],
    currentIdentityFindings: [],
    lastUpdated:    t,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Record one observation for an entity. Safe to call on every network scan
 * or Azure AD sync pass. Idempotent if observation is unchanged.
 *
 * observation shape (all optional):
 *   { openPorts, subnet, hostname, vendor, deviceType, riskScore }
 */
export async function recordEntityObservation(entityId, observation = {}) {
  const raw = await durableGet(metaKey(entityId));
  const meta = normaliseMeta(
    (raw && typeof raw === "object") ? raw : blankMeta(entityId),
    entityId
  );

  const detectedAnomalies = detectAnomalies(meta, observation);
  const newAnomalies = dedupeFreshAnomalies(meta.anomalyHistory, detectedAnomalies);
  const allAnomalies = [...newAnomalies, ...meta.anomalyHistory].slice(0, 50);
  meta.currentIdentityFindings = detectedAnomalies.filter((finding) =>
    finding.type === "identity_claim_mismatch" ||
    finding.type === "segment_history_anomaly"
  );

  // Update running histories (cap at 10 entries each)
  if (observation.hostname && !meta.hostnameHistory.includes(observation.hostname)) {
    meta.hostnameHistory = [observation.hostname, ...meta.hostnameHistory].slice(0, 10);
  }
  if (observation.vendor && !meta.vendorHistory.includes(observation.vendor)) {
    meta.vendorHistory = [observation.vendor, ...meta.vendorHistory].slice(0, 10);
  }
  if (observation.deviceType && !meta.deviceTypeHistory.includes(observation.deviceType)) {
    meta.deviceTypeHistory = [observation.deviceType, ...meta.deviceTypeHistory].slice(0, 10);
  }
  if (observation.subnet && !meta.subnetHistory.includes(observation.subnet)) {
    meta.subnetHistory = [observation.subnet, ...meta.subnetHistory].slice(0, 20);
  }
  if (observation.subnet) {
    meta.subnetObservationCounts[observation.subnet] =
      Number(meta.subnetObservationCounts[observation.subnet] || 0) + 1;
  }
  if (Array.isArray(observation.openPorts)) {
    const merged = [...new Set([...meta.typicalPorts, ...observation.openPorts.map(Number)])];
    meta.typicalPorts = merged.slice(0, 50);
  }
  if (typeof observation.riskScore === "number") {
    meta.riskScoreTrend = [observation.riskScore, ...meta.riskScoreTrend].slice(0, 30);
  }

  meta.seenCount   += 1;
  meta.lastSeen     = nowIso();
  meta.anomalyHistory = allAnomalies;
  meta.lastUpdated  = nowIso();

  await durableSet(metaKey(entityId), meta);

  if (newAnomalies.length) {
    for (const a of newAnomalies) {
      await durableLpush(obsList(entityId), a, OBS_LIST_MAX);
    }
  }

  return meta;
}

/**
 * Assess an observation against the current baseline without advancing the
 * learning counters. Used by read-only network refreshes.
 */
export async function assessEntityObservation(entityId, observation = {}) {
  const raw = await durableGet(metaKey(entityId));
  const meta = normaliseMeta(
    (raw && typeof raw === "object") ? raw : blankMeta(entityId),
    entityId
  );
  return assessDeviceIdentityClaims(observation, meta);
}

/**
 * Get the current baseline for an entity.
 * Returns a normalised baseline record. Does NOT record a new observation.
 */
export async function getEntityBaseline(entityId) {
  const raw = await durableGet(metaKey(entityId));
  const meta = normaliseMeta(
    (raw && typeof raw === "object") ? raw : blankMeta(entityId),
    entityId
  );

  const firstSeenMs = new Date(meta.firstSeen).getTime() || Date.now();
  const state = deriveBaselineState({
    seenCount: meta.seenCount,
    firstSeenMs,
    recentAnomalies: meta.anomalyHistory.slice(0, 10),
  });
  const progress = deriveLearningProgress({ seenCount: meta.seenCount, firstSeenMs });

  const recentAnomalies = meta.anomalyHistory.slice(0, 10).map(a => ({
    type:      a.type,
    severity:  a.severity,
    detail:    a.detail,
    confidence: a.confidence ?? null,
    confidenceLabel: a.confidenceLabel ?? null,
    evidence: Array.isArray(a.evidence) ? a.evidence : [],
    timestamp: a.timestamp,
  }));

  return {
    entityId,
    status:           state,
    learningProgress: state === "established" || state === "degraded" ? 1.0 : progress,
    seenCount:        meta.seenCount,
    firstSeen:        meta.firstSeen,
    lastSeen:         meta.lastSeen,
    typicalPorts:     meta.typicalPorts,
    subnetHistory:    meta.subnetHistory,
    subnetObservationCounts: meta.subnetObservationCounts,
    hostnameHistory:  meta.hostnameHistory,
    vendorHistory:    meta.vendorHistory,
    deviceTypeHistory: meta.deviceTypeHistory,
    riskScoreTrend:   meta.riskScoreTrend,
    currentIdentityFindings: meta.currentIdentityFindings,
    recentAnomalies,
    lastUpdated:      meta.lastUpdated,
  };
}

/**
 * Seed a baseline from existing entity data (called when importing a galaxy
 * or on server startup to bootstrap observations from known entity fields).
 * Only records one seed observation; does not overwrite existing data.
 */
export async function seedEntityBaseline(entityId, entityData = {}) {
  const raw = await durableGet(metaKey(entityId));
  if (raw && raw.seenCount > 0) return; // already has real data
  await recordEntityObservation(entityId, {
    openPorts:  entityData.openPorts  || [],
    subnet:     entityData.subnet     || null,
    hostname:   entityData.hostname   || null,
    vendor:     entityData.vendor     || null,
    deviceType: entityData.deviceType || null,
    riskScore:  typeof entityData.riskScore === "number" ? entityData.riskScore : null,
  });
}

/**
 * Org-wide "what's been unusual lately" view — flattens anomaly history across
 * every entity with a baseline, most recent first. Used to give ARIA's
 * conversational context a sense of what's currently deviating from normal,
 * not just the state of whichever single entity is selected on screen.
 */
export async function getRecentAnomaliesAcrossEntities(limit = 8) {
  const entries = await durableScan("identity:baseline:v1:");
  const flattened = [];
  for (const { value } of entries) {
    const meta = (value && typeof value === "object") ? value : null;
    if (!meta || !Array.isArray(meta.anomalyHistory)) continue;
    for (const anomaly of meta.anomalyHistory.slice(0, 5)) {
      flattened.push({ entityId: meta.entityId, ...anomaly });
    }
  }
  flattened.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
  return flattened.slice(0, limit);
}

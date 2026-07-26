// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

// ════════════════════════════════════════════════════════════════════════
// COSMOS-UI · data → posture derivation
// Panels are driven by the live data App.jsx already fetches (single source of
// truth — no duplicate polling). Each helper turns a real data slice into a
// posture { state: clean|elevated|breach, intensity: 0..1 } that feeds the
// visuals, plus the raw metrics the HUD overlays display.
// ════════════════════════════════════════════════════════════════════════
export const clamp01 = (v) => Math.max(0, Math.min(1, v));

const mk = (state, intensity) => ({ state, intensity: clamp01(intensity) });

// Generic severity-weighted posture (findings / vectors with severity or score).
export function postureFromCounts({ critical = 0, high = 0, medium = 0, low = 0 } = {}) {
  const weighted = critical * 1 + high * 0.5 + medium * 0.2 + low * 0.05;
  const intensity = weighted / 8;
  const state = critical > 0 ? "breach" : high > 0 || medium > 3 ? "elevated" : "clean";
  return mk(state, intensity);
}

// network connections → blocked sockets escalate posture
export function postureFromConnections(connections = []) {
  const total = connections.length;
  const blocked = connections.filter((c) => c.state === "BLOCKED").length;
  const established = connections.filter((c) => c.state === "ESTABLISHED").length;
  const state = blocked > 2 ? "breach" : blocked > 0 || total > 40 ? "elevated" : "clean";
  const intensity = clamp01(blocked / 4 + total / 120);
  return { ...mk(state, intensity), total, blocked, established };
}

// log lines → ERROR lines escalate
export function postureFromLogs(logs = []) {
  const total = logs.length;
  const errors = logs.filter((l) => l.level === "ERROR").length;
  const warns = logs.filter((l) => l.level === "WARN").length;
  const state = errors > 3 ? "breach" : errors > 0 || warns > 5 ? "elevated" : "clean";
  const intensity = clamp01(errors / 6 + warns / 20 + total / 200);
  return { ...mk(state, intensity), total, errors, warns };
}

// threat vectors → average score
export function postureFromVectors(vectors = []) {
  if (!vectors.length) return { ...mk("clean", 0), avg: 0, top: null };
  const scores = vectors.map((v) => Number(v.score) || 0);
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  const max = Math.max(...scores);
  const top = vectors[scores.indexOf(max)] || null;
  const state = max >= 70 ? "breach" : max >= 40 ? "elevated" : "clean";
  return { ...mk(state, avg / 100), avg: Math.round(avg), max: Math.round(max), top };
}

// incidents → severity histogram
export function postureFromIncidents(incidents = []) {
  const sev = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const i of incidents) {
    const s = String(i.severity || "").toLowerCase();
    if (s in sev) sev[s] += 1;
  }
  return { ...postureFromCounts(sev), counts: sev, total: incidents.length };
}

// timeline events → severity / level histogram
export function postureFromEvents(events = []) {
  const sev = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const e of events) {
    const s = String(e.severity || e.level || "").toLowerCase();
    if (s in sev) sev[s] += 1;
    else if (s === "error") sev.critical += 1;
    else if (s === "warn") sev.high += 1;
  }
  return { ...postureFromCounts(sev), total: events.length };
}

// ai-spm summary → exposure + secret/critical posture
export function postureFromAiSpm(summary = {}) {
  const critical = summary.critical_count ?? 0;
  const high = summary.high_count ?? 0;
  const secrets = summary.secret_count ?? 0;
  const assets = summary.asset_count ?? 0;
  const agents = summary.agent_count ?? 0;
  const exposure =
    typeof summary.posture === "number"
      ? summary.posture
      : clamp01(critical / 5 + high / 12 + secrets / 8) * 100;
  const state = critical > 0 || exposure >= 70 ? "breach" : high > 0 || exposure >= 40 ? "elevated" : "clean";
  return { ...mk(state, exposure / 100), critical, high, secrets, assets, agents, exposure: Math.round(exposure) };
}

// memory / load → system health
export function postureFromHealth(memoryPercent = 0, liveLoad = 0) {
  const m = Number(memoryPercent) || 0;
  const state = m >= 88 ? "breach" : m >= 70 ? "elevated" : "clean";
  return { ...mk(state, m / 100), memoryPercent: Math.round(m), liveLoad: Math.round(liveLoad) };
}

// risk score (0..100) → threat overview lens
export function postureFromRisk(riskScore = 0) {
  const r = Number(riskScore) || 0;
  const state = r >= 70 ? "breach" : r >= 40 ? "elevated" : "clean";
  return { ...mk(state, r / 100), riskScore: Math.round(r) };
}

// quarantined files
export function postureFromFiles(files = []) {
  const total = files.length;
  const state = total > 6 ? "breach" : total > 0 ? "elevated" : "clean";
  return { ...mk(state, clamp01(total / 10)), total };
}

// blocked IPs from source fabric / connections
export function postureFromBlocked(sources = [], connections = []) {
  const blocked =
    connections.filter((c) => c.state === "BLOCKED").length ||
    sources.filter((s) => s.status === "blocked").length;
  const state = blocked > 4 ? "breach" : blocked > 0 ? "elevated" : "clean";
  return { ...mk(state, clamp01(blocked / 8)), blocked };
}

// sources fabric → command center health
export function postureFromSources(sources = [], approvals = []) {
  const total = sources.length;
  const live = sources.filter((s) => s.status === "live").length;
  const pending = approvals.length;
  const state = pending > 3 ? "breach" : pending > 0 || (total && live < total) ? "elevated" : "clean";
  return { ...mk(state, clamp01(pending / 5 + (total - live) / 10)), total, live, pending };
}

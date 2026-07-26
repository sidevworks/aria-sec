// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

const DEFAULT_COOLDOWN_MS = 5 * 60 * 1000;
const RISK_JUMP_THRESHOLD = 20;
const STALE_SOURCE_MS = 2 * 60 * 1000;
const SOURCE_PROBLEM_STATUSES = new Set(["error", "disconnected", "stale", "unavailable", "offline"]);

const nowIso = (now) => new Date(now || Date.now()).toISOString();

const asNumber = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const normalizeSeverity = (value) => String(value || "info").toLowerCase();

const alertTypeForSeverity = (severity) => {
  if (severity === "critical") return "critical";
  if (severity === "high") return "warning";
  return "info";
};

const entityId = (item, fallback) =>
  String(item?.id || item?.key || item?.name || item?.title || item?.summary || fallback || "unknown");

const sourceLabel = (source) => source?.label || source?.id || "Unknown source";

function makeAlert({ key, severity = "info", spokenLine, detail, sourcePanel, entity, timestamp, recommendedAction }) {
  return {
    id: `${key}:${timestamp}`,
    key,
    severity,
    spokenLine,
    detail,
    sourcePanel,
    entity,
    timestamp,
    recommendedAction,
  };
}

function incidentsFrom(snapshot) {
  return snapshot?.panels?.["incident-feed"]?.items || [];
}

function sourcesFrom(snapshot) {
  return snapshot?.summary?.sources || snapshot?.panels?.overview?.source_fabric || [];
}

function riskScoreFrom(snapshot) {
  return asNumber(snapshot?.panels?.["threat-overview"]?.risk_score, null);
}

function byStableId(items) {
  const map = new Map();
  (items || []).forEach((item, index) => {
    map.set(entityId(item, index), item);
  });
  return map;
}

function sourceProblem(source, now) {
  const status = String(source?.status || "").toLowerCase();
  if (SOURCE_PROBLEM_STATUSES.has(status)) return status || "unavailable";
  if (source?.last_seen) {
    const seenAt = new Date(source.last_seen).getTime();
    if (Number.isFinite(seenAt) && now - seenAt > STALE_SOURCE_MS) return "stale";
  }
  return null;
}

function detectIncidentAlerts({ previous, current, timestamp }) {
  const previousIncidents = byStableId(incidentsFrom(previous));
  return incidentsFrom(current)
    .filter((incident) => ["critical", "high"].includes(normalizeSeverity(incident?.severity)))
    .filter((incident, index) => !previousIncidents.has(entityId(incident, index)))
    .map((incident, index) => {
      const severity = normalizeSeverity(incident.severity);
      const id = entityId(incident, index);
      const title = incident.title || incident.message || incident.summary || "Security incident";
      return makeAlert({
        key: `incident:${severity}:${id}`,
        severity,
        spokenLine: `${severity === "critical" ? "Critical" : "High"} incident detected: ${title}.`,
        detail: `${title} was added to the incident feed with ${severity} severity.`,
        sourcePanel: "incident-feed",
        entity: id,
        timestamp,
        recommendedAction: "Open the incident feed and triage the new item.",
      });
    });
}

function detectRiskJump({ previous, current, timestamp }) {
  const prevScore = riskScoreFrom(previous);
  const currentScore = riskScoreFrom(current);
  if (prevScore === null || currentScore === null) return [];
  if (currentScore - prevScore < RISK_JUMP_THRESHOLD) return [];

  const severity = currentScore >= 76 ? "critical" : "high";
  return [
    makeAlert({
      key: "threat-risk:jump",
      severity,
      spokenLine: `Platform risk jumped from ${prevScore} to ${currentScore}.`,
      detail: `Threat overview risk score increased from ${prevScore} to ${currentScore}.`,
      sourcePanel: "threat-overview",
      entity: "risk_score",
      timestamp,
      recommendedAction: "Review the threat overview and current incident feed.",
    }),
  ];
}

function detectSourceAlerts({ previous, current, now, timestamp }) {
  const previousSources = byStableId(sourcesFrom(previous));
  return sourcesFrom(current).flatMap((source, index) => {
    const id = entityId(source, index);
    const problem = sourceProblem(source, now);
    if (!problem) return [];

    const previousProblem = sourceProblem(previousSources.get(id), now);
    if (previousProblem === problem) return [];

    return makeAlert({
      key: `source:${id}:${problem}`,
      severity: problem === "stale" ? "medium" : "high",
      spokenLine: `${sourceLabel(source)} is ${problem}.`,
      detail: `${sourceLabel(source)} is unavailable or stale${source?.detail ? `: ${source.detail}` : "."}`,
      sourcePanel: "overview",
      entity: id,
      timestamp,
      recommendedAction: "Check connector health before relying on this source.",
    });
  });
}

function galaxiesFrom(context) {
  return context?.identity?.galaxies || [];
}

function detectIdentityAlerts({ previousContext, currentContext, timestamp }) {
  const previousGalaxies = byStableId(galaxiesFrom(previousContext));
  const alerts = [];

  for (const galaxy of galaxiesFrom(currentContext)) {
    const id = entityId(galaxy, galaxy?.name);
    const previous = previousGalaxies.get(id) || {};
    const signals = galaxy?.signals || {};
    const previousSignals = previous?.signals || {};
    const name = galaxy?.name || id;

    const anomalyJump = asNumber(signals.anomalyCount) - asNumber(previousSignals.anomalyCount);
    if (anomalyJump >= 3 || (asNumber(signals.anomalyCount) >= 5 && asNumber(previousSignals.anomalyCount) < 5)) {
      alerts.push(makeAlert({
        key: `identity:anomaly-spike:${id}`,
        severity: "high",
        spokenLine: `Identity anomaly spike detected in ${name}.`,
        detail: `${name} identity anomalies increased from ${asNumber(previousSignals.anomalyCount)} to ${asNumber(signals.anomalyCount)}.`,
        sourcePanel: "identity-galaxy",
        entity: id,
        timestamp,
        recommendedAction: "Open Identity Galaxy and inspect the affected department.",
      }));
    }

    const policyJump = asNumber(signals.policyViolations24h) - asNumber(previousSignals.policyViolations24h);
    if (policyJump >= 3 || (asNumber(signals.policyViolations24h) >= 5 && asNumber(previousSignals.policyViolations24h) < 5)) {
      alerts.push(makeAlert({
        key: `identity:policy-denial-spike:${id}`,
        severity: "high",
        spokenLine: `Policy denial spike detected in ${name}.`,
        detail: `${name} policy denials increased from ${asNumber(previousSignals.policyViolations24h)} to ${asNumber(signals.policyViolations24h)}.`,
        sourcePanel: "identity-galaxy",
        entity: id,
        timestamp,
        recommendedAction: "Review policy gate events for denied access patterns.",
      }));
    }

    for (const user of galaxy?.users || []) {
      const anomalies = (user?.anomalies || []).map((item) => String(item).toLowerCase());
      if (anomalies.some((item) => item.includes("impossible travel"))) {
        const userId = entityId(user, `${id}:user`);
        alerts.push(makeAlert({
          key: `identity:impossible-travel:${userId}`,
          severity: "critical",
          spokenLine: `Impossible travel detected for ${user?.name || userId}.`,
          detail: `${user?.name || userId} has an impossible travel anomaly in ${name}.`,
          sourcePanel: "identity-galaxy",
          entity: userId,
          timestamp,
          recommendedAction: "Inspect the identity session and consider step-up or isolation.",
        }));
      }
      const wasAdmin = Boolean((previous?.users || []).find((candidate) => entityId(candidate) === entityId(user))?.isAdmin);
      if (!wasAdmin && user?.isAdmin) {
        const userId = entityId(user, `${id}:admin`);
        alerts.push(makeAlert({
          key: `identity:admin-change:${userId}`,
          severity: "high",
          spokenLine: `New admin privilege observed for ${user?.name || userId}.`,
          detail: `${user?.name || userId} is now marked as an administrator in ${name}.`,
          sourcePanel: "identity-galaxy",
          entity: userId,
          timestamp,
          recommendedAction: "Review the privilege timeline and confirm the change was approved.",
        }));
      }
    }
  }

  return alerts;
}

function detectAuditAlerts({ previousContext, currentContext, timestamp }) {
  const previousCount = previousContext?.audit?.deniedEvents?.length || 0;
  const currentCount = currentContext?.audit?.deniedEvents?.length || 0;
  if (currentCount - previousCount < 3) return [];
  return [
    makeAlert({
      key: "audit:policy-denial-spike",
      severity: "high",
      spokenLine: "Authorization denial spike detected.",
      detail: `Denied audit events increased from ${previousCount} to ${currentCount}.`,
      sourcePanel: "security-admin",
      entity: "authz-denials",
      timestamp,
      recommendedAction: "Open Security Admin and review denied authorization events.",
    }),
  ];
}

function detectNetworkAlerts({ previousContext, currentContext, timestamp }) {
  const previousScan = previousContext?.network?.activeScan || null;
  const currentScan = currentContext?.network?.activeScan || null;
  const status = String(currentScan?.status || "").toLowerCase();
  const previousStatus = String(previousScan?.status || "").toLowerCase();

  if (!["error", "timeout", "failed"].includes(status) || previousStatus === status) return [];
  return [
    makeAlert({
      key: `network:scan:${currentScan?.id || "active"}:${status}`,
      severity: "high",
      spokenLine: "Network scan failed or timed out.",
      detail: currentScan?.message || currentScan?.error || "The active network scan stopped without a successful result.",
      sourcePanel: "identity-galaxy",
      entity: currentScan?.id || "activeScan",
      timestamp,
      recommendedAction: "Check network authorization and retry the scan when safe.",
    }),
  ];
}

function detectAiSpmAlerts({ previousContext, currentContext, timestamp }) {
  const previousFindings = byStableId(previousContext?.aiSpm?.findings || []);
  const alerts = [];
  for (const finding of currentContext?.aiSpm?.findings || []) {
    const severity = normalizeSeverity(finding?.severity);
    if (!["critical", "high"].includes(severity)) continue;
    const id = entityId(finding);
    if (previousFindings.has(id)) continue;
    const title = finding.title || finding.summary || finding.code || "AI-SPM finding";
    alerts.push(makeAlert({
      key: `ai-spm:${severity}:${id}`,
      severity,
      spokenLine: `${severity === "critical" ? "Critical" : "High"} AI-SPM finding detected: ${title}.`,
      detail: `${title} was added to AI-SPM findings.`,
      sourcePanel: "ai-spm",
      entity: id,
      timestamp,
      recommendedAction: "Open AI-SPM and review the affected AI asset.",
    }));
  }

  const prevAssets = asNumber(previousContext?.aiSpm?.summary?.asset_count, null);
  const currentAssets = asNumber(currentContext?.aiSpm?.summary?.asset_count, null);
  if (prevAssets !== null && currentAssets !== null && currentAssets > prevAssets) {
    alerts.push(makeAlert({
      key: "ai-spm:asset-count-increase",
      severity: "medium",
      spokenLine: `New AI asset exposure observed. Asset count is now ${currentAssets}.`,
      detail: `AI-SPM asset count increased from ${prevAssets} to ${currentAssets}.`,
      sourcePanel: "ai-spm",
      entity: "asset_count",
      timestamp,
      recommendedAction: "Review AI-SPM inventory for newly exposed assets.",
    }));
  }

  return alerts;
}

export function detectMonitoringAlerts({ previous = null, current = null, previousContext = {}, currentContext = {}, now = Date.now() } = {}) {
  if (!current) return [];
  const timestamp = current?.generated_at || nowIso(now);

  return [
    ...detectIncidentAlerts({ previous, current, timestamp }),
    ...detectRiskJump({ previous, current, timestamp }),
    ...detectSourceAlerts({ previous, current, now, timestamp }),
    ...detectIdentityAlerts({ previousContext, currentContext, timestamp }),
    ...detectAuditAlerts({ previousContext, currentContext, timestamp }),
    ...detectNetworkAlerts({ previousContext, currentContext, timestamp }),
    ...detectAiSpmAlerts({ previousContext, currentContext, timestamp }),
  ];
}

export function createMonitoringAlertBuffer({ cooldownMs = DEFAULT_COOLDOWN_MS } = {}) {
  const lastSeen = new Map();

  return {
    accept(alerts = [], now = Date.now()) {
      const accepted = [];
      for (const alert of alerts) {
        if (!alert?.key) continue;
        const last = lastSeen.get(alert.key);
        if (last !== undefined && now - last < cooldownMs) continue;
        lastSeen.set(alert.key, now);
        accepted.push(alert);
      }
      return accepted;
    },
    reset() {
      lastSeen.clear();
    },
  };
}

export function alertToastType(alert) {
  return alertTypeForSeverity(alert?.severity);
}

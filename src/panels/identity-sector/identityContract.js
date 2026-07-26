// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

// ════════════════════════════════════════════════════════════════════════════
// IDENTITY SECTOR · Frozen Data Contract
// Single source of truth for all data shapes, risk scoring, and colour mapping.
// Both live (Azure AD / Okta / local) and dev-sample data must satisfy this
// contract — visual components are source-agnostic.
// ════════════════════════════════════════════════════════════════════════════

// ─── Risk band thresholds ─────────────────────────────────────────────────────
export const RISK_BANDS = {
  nominal:  { min: 0,  max: 25,  label: "Nominal",  cssToken: "var(--id-risk-nominal)"  },
  elevated: { min: 26, max: 50,  label: "Elevated", cssToken: "var(--id-risk-elevated)" },
  warning:  { min: 51, max: 75,  label: "Warning",  cssToken: "var(--id-risk-warning)"  },
  critical: { min: 76, max: 100, label: "Critical", cssToken: "var(--id-risk-critical)" },
};

export const GLOW_TOKENS = {
  nominal:  "var(--id-glow-nominal)",
  elevated: "var(--id-glow-elevated)",
  warning:  "var(--id-glow-warning)",
  critical: "var(--id-glow-critical)",
};

export const GRAD_TOKENS = {
  nominal:  "var(--id-grad-nominal)",
  elevated: "var(--id-grad-elevated)",
  warning:  "var(--id-grad-warning)",
  critical: "var(--id-grad-critical)",
};

export function riskBand(score) {
  const s = Math.max(0, Math.min(100, Number(score) || 0));
  if (s >= 76) return "critical";
  if (s >= 51) return "warning";
  if (s >= 26) return "elevated";
  return "nominal";
}

export function riskColor(score) {
  return RISK_BANDS[riskBand(score)].cssToken;
}

export function riskGlow(score) {
  return GLOW_TOKENS[riskBand(score)];
}

// ─── Composite department risk scorer ────────────────────────────────────────
// Accepts the raw signals present in DepartmentGalaxy.signals and returns 0..100.
// Weights: admin presence (high), anomalies, failed auths, policy violations,
//          privilege drift, disabled active users. Admin/privileged weight 1.5×.
export function computeDepartmentRisk({
  userCount = 0,
  adminCount = 0,
  anomalyCount = 0,
  policyViolations24h = 0,
  failedAuths24h = 0,
  privilegeDriftCount = 0,
  disabledWithAccessCount = 0,
} = {}) {
  if (userCount === 0) return 0;
  const adminRatio   = adminCount / userCount;
  const anomalyRatio = Math.min(anomalyCount / Math.max(userCount, 1), 1);
  const score =
    anomalyRatio          * 35 +
    (policyViolations24h > 0 ? Math.min(policyViolations24h / 5, 1) * 20 : 0) +
    (failedAuths24h      > 0 ? Math.min(failedAuths24h      / 10, 1) * 15 : 0) +
    (privilegeDriftCount > 0 ? Math.min(privilegeDriftCount  / 3, 1) * 15 : 0) +
    (disabledWithAccessCount > 0 ? 10 : 0) +
    (adminRatio > 0.2 ? 5 : 0);
  return Math.round(Math.min(100, Math.max(0, score)));
}

// ─── Individual user risk scorer ──────────────────────────────────────────────
export function computeUserRisk({
  isAdmin = false,
  isPrivileged = false,
  anomalyCount = 0,
  failedAuths = 0,
  privilegeDrift = false,
  accountEnabled = true,
  mfaRegistered = true,
} = {}) {
  let score = 0;
  if (!accountEnabled) score += 15;
  if (!mfaRegistered)  score += 20;
  if (isAdmin)         score += 10;
  if (isPrivileged)    score += 8;
  if (privilegeDrift)  score += 18;
  score += Math.min(anomalyCount * 12, 36);
  score += Math.min(failedAuths  * 4,  20);
  return Math.round(Math.min(100, Math.max(0, score)));
}

// ─── Shape type docs (JSDoc — consumed by all component agents) ───────────────

/**
 * @typedef {"nominal"|"elevated"|"warning"|"critical"} RiskBand
 */

/**
 * @typedef {"azuread"|"okta"|"local"|"sample"} IdentitySource
 */

/**
 * @typedef {Object} IdentityNode
 * @property {string}        id
 * @property {string}        name
 * @property {string}        upn            - userPrincipalName / email
 * @property {string}        departmentId
 * @property {string}        department
 * @property {number}        riskScore      - 0..100
 * @property {RiskBand}      riskBand
 * @property {boolean}       isAdmin
 * @property {boolean}       isPrivileged
 * @property {boolean}       accountEnabled
 * @property {string|null}   lastSeen       - ISO string
 * @property {string[]}      anomalies      - short human-readable strings
 * @property {IdentitySource} source
 */

/**
 * @typedef {Object} DepartmentSignals
 * @property {number} userCount
 * @property {number} adminCount
 * @property {number} anomalyCount
 * @property {number} policyViolations24h
 * @property {number} failedAuths24h
 * @property {number} privilegeDriftCount
 * @property {number} disabledWithAccessCount
 */

/**
 * @typedef {Object} DepartmentGalaxy
 * @property {string}          id
 * @property {string}          name
 * @property {number}          riskScore     - 0..100 composite
 * @property {RiskBand}        riskBand
 * @property {DepartmentSignals} signals
 * @property {IdentitySource}  source
 * @property {string}          scannedAt     - ISO string
 * @property {IdentityNode[]}  users         - populated on expand, [] on list
 */

/**
 * @typedef {Object} AccessEvent
 * @property {string}                   id
 * @property {string}                   userId
 * @property {string}                   userName
 * @property {string}                   resourceId
 * @property {string}                   resourceName
 * @property {string}                   action
 * @property {"allow"|"block"|"step_up"} result
 * @property {string}                   timestamp  - ISO string
 * @property {string|null}              location
 * @property {string|null}              ipAddress
 * @property {number}                   riskScore
 */

/**
 * @typedef {Object} BehaviourDeviation
 * @property {string} type       - e.g. "unusual_hour","geo_anomaly","mass_download"
 * @property {string} severity   - "low"|"medium"|"high"
 * @property {string} timestamp  - ISO string
 */

/**
 * @typedef {Object} BehaviourBaseline
 * @property {string}               userId
 * @property {"learning"|"established"} status
 * @property {number}               learningProgress  - 0..1
 * @property {number}               anomalyScore      - 0..100
 * @property {BehaviourDeviation[]} recentDeviations
 */

/**
 * @typedef {Object} PrivilegeEvent
 * @property {string}                         timestamp
 * @property {"standard"|"elevated"|"admin"}  level
 * @property {"grant"|"revoke"}               action
 * @property {string}                         role
 * @property {string}                         grantedBy
 * @property {boolean}                        active
 */

/**
 * @typedef {Object} PrivilegeTimeline
 * @property {string}          userId
 * @property {PrivilegeEvent[]} events
 */

/**
 * @typedef {Object} GeoPoint
 * @property {string} location
 * @property {number} lat
 * @property {number} lng
 * @property {string} ipAddress
 * @property {string} timestamp
 */

/**
 * @typedef {Object} ImpossibleTravelEvent
 * @property {string}                        userId
 * @property {string}                        userName
 * @property {GeoPoint}                      eventA
 * @property {GeoPoint}                      eventB
 * @property {number}                        distanceKm
 * @property {number}                        timeDeltaMinutes
 * @property {"impossible"|"suspicious"|"possible"} verdict
 * @property {number}                        riskScore
 */

/**
 * @typedef {Object} GalaxyMapResponse
 * @property {"live"|"sample"}  dataMode
 * @property {string[]}         connectedSources
 * @property {DepartmentGalaxy[]} galaxies
 * @property {string}           scannedAt
 */

// ─── Intent interface stubs (wired by founder to command handler later) ────────
export const IDENTITY_INTENTS = {
  OPEN_GALAXY:         "identity:open_galaxy",
  EXPAND_DEPARTMENT:   "identity:expand_department",
  ISOLATE_IDENTITY:    "identity:isolate_identity",
  RUN_SCAN:            "identity:run_scan",
  GENERATE_REPORT:     "identity:generate_report",
};

// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

const EMPTY_TEXT = "Unavailable";

const FIELD_ALIASES = {
  source: ["source", "sources", "origin", "provider"],
  timestamp: ["timestamp", "time", "detectedAt", "detected_at", "createdAt", "created_at"],
  affectedEntities: ["affectedEntities", "affected_entities", "entities", "assets", "subjects"],
  relatedFindings: ["relatedFindings", "related_findings", "findings", "correlatedFindings"],
  timeline: ["timeline", "events", "sequence"],
  blastRadius: ["blastRadius", "blast_radius", "impact", "scope"],
  confidence: ["confidence", "confidenceScore", "confidence_score", "score"],
  policyControls: ["policyControls", "policy_controls", "controls", "policies"],
  recommendedAction: ["recommendedAction", "recommended_action", "action", "remediation"],
  approvalState: ["approvalState", "approval_state", "approval", "status"],
  auditTrail: ["auditTrail", "audit_trail", "audit", "auditEvents"],
};

function firstPresent(source, aliases) {
  if (!source || typeof source !== "object") return undefined;
  return aliases.map((key) => source[key]).find((value) => value !== undefined && value !== null && value !== "");
}

function stringifyValue(value) {
  if (value === undefined || value === null || value === "") return EMPTY_TEXT;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.length ? value.map(stringifyValue).join(", ") : EMPTY_TEXT;
  if (typeof value === "object") {
    return value.label || value.name || value.title || value.id || value.value || JSON.stringify(value);
  }
  return String(value);
}

function toList(value) {
  if (value === undefined || value === null || value === "") return [];
  const list = Array.isArray(value) ? value : [value];
  return list
    .map((item) => {
      if (item === undefined || item === null || item === "") return null;
      if (typeof item === "object" && !Array.isArray(item)) {
        return {
          title: item.title || item.name || item.label || item.id || stringifyValue(item),
          detail: item.detail || item.description || item.reason || item.summary || item.value || "",
          meta: item.meta || item.timestamp || item.time || item.state || item.severity || "",
        };
      }
      return { title: stringifyValue(item), detail: "", meta: "" };
    })
    .filter(Boolean);
}

function toTimeline(value) {
  return toList(value).map((item) => ({
    ...item,
    time: item.meta || item.time || "",
  }));
}

function normalizeConfidence(value) {
  if (value === undefined || value === null || value === "") {
    return { label: EMPTY_TEXT, level: "unknown", percent: null };
  }

  const raw = typeof value === "object" ? (value.score ?? value.value ?? value.percent ?? value.label) : value;
  const numeric = Number(raw);

  if (Number.isFinite(numeric)) {
    const percent = numeric <= 1 ? Math.round(numeric * 100) : Math.round(numeric);
    const bounded = Math.max(0, Math.min(100, percent));
    return {
      label: `${bounded}%`,
      level: bounded >= 80 ? "high" : bounded >= 50 ? "medium" : "low",
      percent: bounded,
    };
  }

  return {
    label: stringifyValue(raw),
    level: String(raw).toLowerCase(),
    percent: null,
  };
}

function normalizeField(source, key, fallback = EMPTY_TEXT) {
  return stringifyValue(firstPresent(source, FIELD_ALIASES[key]) ?? fallback);
}

export function normalizeEvidenceDrawerData(evidence = {}) {
  const safeEvidence = evidence && typeof evidence === "object" ? evidence : {};

  return {
    source: normalizeField(safeEvidence, "source"),
    timestamp: normalizeField(safeEvidence, "timestamp"),
    affectedEntities: toList(firstPresent(safeEvidence, FIELD_ALIASES.affectedEntities)),
    relatedFindings: toList(firstPresent(safeEvidence, FIELD_ALIASES.relatedFindings)),
    timeline: toTimeline(firstPresent(safeEvidence, FIELD_ALIASES.timeline)),
    blastRadius: normalizeField(safeEvidence, "blastRadius"),
    confidence: normalizeConfidence(firstPresent(safeEvidence, FIELD_ALIASES.confidence)),
    policyControls: toList(firstPresent(safeEvidence, FIELD_ALIASES.policyControls)),
    recommendedAction: normalizeField(safeEvidence, "recommendedAction"),
    approvalState: normalizeField(safeEvidence, "approvalState"),
    auditTrail: toList(firstPresent(safeEvidence, FIELD_ALIASES.auditTrail)),
  };
}

export { EMPTY_TEXT };

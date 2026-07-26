// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

const STAGE_ORDER = [
  "signal_detected",
  "explained",
  "evidence_shown",
  "blast_radius",
  "recommended_action",
  "approval_pending",
  "audit_recorded",
  "trust_updated",
];

const RISK_RANK = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };

const normalizeRisk = (value) => {
  const risk = String(value || "medium").toLowerCase();
  return RISK_RANK[risk] == null ? "medium" : risk;
};

const asArray = (value) => Array.isArray(value) ? value : [];

const latestByTime = (items, fieldCandidates) => [...asArray(items)].sort((a, b) => {
  const at = fieldCandidates.map((field) => a?.[field]).find(Boolean) || "";
  const bt = fieldCandidates.map((field) => b?.[field]).find(Boolean) || "";
  return String(bt).localeCompare(String(at));
});

const textOf = (...values) => values.find((value) => typeof value === "string" && value.trim())?.trim() || "";

function relatedEvidence(decision, evidence) {
  if (!decision) return asArray(evidence).slice(0, 5);
  const refs = new Set([
    decision.decision_id,
    ...asArray(decision.evidence),
    ...asArray(decision.trigger?.ref_ids),
  ].filter(Boolean).map(String));
  const matched = asArray(evidence).filter((record) =>
    refs.has(String(record.decision_id)) ||
    refs.has(String(record.evidence_id)) ||
    asArray(record.evidence_collected).some((item) => refs.has(String(item?.id || item)))
  );
  return (matched.length ? matched : asArray(evidence)).slice(0, 5);
}

function relatedAudit(decision, approval, evidence, auditEvents) {
  const ids = new Set([
    decision?.decision_id,
    approval?.id,
    ...asArray(evidence).flatMap((record) => [record?.evidence_id, record?.action_id, record?.decision_id]),
  ].filter(Boolean).map(String));
  const matched = asArray(auditEvents).filter((event) => {
    const ctx = event?.context || {};
    return [ctx.decision_id, ctx.approval_id, ctx.evidence_id, ctx.action_id].some((id) => ids.has(String(id)));
  });
  return (matched.length ? matched : asArray(auditEvents)).slice(0, 8);
}

function trustForDecision(decision, trustSummary) {
  const verb = String(decision?.recommended_action?.verb || "").toLowerCase();
  const system = String(decision?.recommended_action?.target?.system || "").toLowerCase();
  let capability = "threat_analysis";
  if (/quarantine|contain|block|isolate/.test(verb)) capability = "containment";
  else if (/revoke|disable|identity|okta|azure/.test(`${verb} ${system}`)) capability = "identity_actions";
  else if (/rotate|remediate|patch|policy|notify/.test(verb)) capability = "remediation";
  return asArray(trustSummary).find((row) => row.capability === capability) ||
    asArray(trustSummary).find((row) => row.capability === "threat_analysis") ||
    null;
}

function buildTimeline({ decision, evidence, approval, audit, trust }) {
  const timeline = [];
  if (decision) {
    timeline.push({
      stage: "signal_detected",
      label: "Signal detected",
      at: decision.created_at,
      status: "complete",
      detail: textOf(decision.observation, decision.narration, "Decision created"),
    });
    timeline.push({
      stage: "explained",
      label: "ARIA explains",
      at: decision.created_at,
      status: decision.reasoning ? "complete" : "partial",
      detail: textOf(decision.reasoning, decision.narration, "Reasoning unavailable"),
    });
    timeline.push({
      stage: "blast_radius",
      label: "Blast radius",
      at: decision.created_at,
      status: decision.blast_radius ? "complete" : "partial",
      detail: normalizeRisk(decision.blast_radius),
    });
    timeline.push({
      stage: "recommended_action",
      label: "Recommended action",
      at: decision.created_at,
      status: decision.recommended_action ? "complete" : "blocked",
      detail: decision.recommended_action?.verb || "No action recommended",
    });
  }
  timeline.push({
    stage: "evidence_shown",
    label: "Evidence shown",
    at: evidence[0]?.timestamp_utc || decision?.created_at || null,
    status: evidence.length ? "complete" : "blocked",
    detail: evidence.length ? `${evidence.length} evidence record${evidence.length === 1 ? "" : "s"}` : "No evidence ledger entries yet",
  });
  timeline.push({
    stage: "approval_pending",
    label: "Approve or deny",
    at: approval?.created_at || decision?.created_at || null,
    status: approval ? "pending" : decision?.requires_human_approval ? "blocked" : "not_required",
    detail: approval ? textOf(approval.reason, approval.action) : decision?.requires_human_approval ? "Approval required but no queue item is linked yet" : "No human approval required",
  });
  timeline.push({
    stage: "audit_recorded",
    label: "Audit record",
    at: audit[0]?.timestamp || null,
    status: audit.length ? "complete" : "blocked",
    detail: audit[0]?.event_type || "No audit record linked yet",
  });
  timeline.push({
    stage: "trust_updated",
    label: "Trust update",
    at: trust?.recent?.at || null,
    status: trust ? "ready" : "blocked",
    detail: trust ? `${trust.capability} ${trust.mode} · ${trust.trust_pct}% trust` : "Trust ladder unavailable",
  });
  return timeline;
}

export function buildOperationalLoopSnapshot({
  approvals = [],
  decisions = [],
  evidence = [],
  trust = [],
  auditEvents = [],
} = {}) {
  const sortedDecisions = latestByTime(decisions, ["created_at"]);
  const sortedEvidence = latestByTime(evidence, ["timestamp_utc"]);
  const pendingApprovals = asArray(approvals).filter((item) => String(item?.status || "pending") === "pending");
  const activeApproval = pendingApprovals[0] || null;
  const activeDecision = sortedDecisions.find((decision) => {
    if (!activeApproval) return true;
    const refs = asArray(decision?.trigger?.ref_ids).map(String);
    return refs.includes(String(activeApproval.id)) ||
      String(decision?.recommended_action?.verb || "") === String(activeApproval.action || "") ||
      String(decision?.decision_id || "") === String(activeApproval.decision_id || "");
  }) || sortedDecisions[0] || null;
  const loopEvidence = relatedEvidence(activeDecision, sortedEvidence);
  const loopTrust = trustForDecision(activeDecision, trust);
  const loopAudit = relatedAudit(activeDecision, activeApproval, loopEvidence, auditEvents);
  const timeline = buildTimeline({
    decision: activeDecision,
    evidence: loopEvidence,
    approval: activeApproval,
    audit: loopAudit,
    trust: loopTrust,
  });
  const completed = timeline.filter((item) => ["complete", "ready", "not_required"].includes(item.status)).length;
  const current = timeline.find((item) => ["pending", "blocked", "partial"].includes(item.status)) || timeline.at(-1) || null;
  const recommendedAction = activeDecision?.recommended_action || activeApproval?.proposed_action || null;

  return {
    generated_at: new Date().toISOString(),
    status: activeDecision || activeApproval || loopEvidence.length ? "active" : "empty",
    stage_order: STAGE_ORDER,
    current_stage: current?.stage || "signal_detected",
    completion_pct: Math.round((completed / Math.max(timeline.length, 1)) * 100),
    signal: activeDecision ? {
      id: activeDecision.decision_id,
      trigger: activeDecision.trigger || null,
      observation: activeDecision.observation || activeDecision.narration || "",
      confidence: activeDecision.confidence ?? null,
      data_state: activeDecision.local_synthesis ? "local" : "ledger",
      created_at: activeDecision.created_at || null,
    } : null,
    explanation: activeDecision ? {
      reasoning: activeDecision.reasoning || "",
      narration: activeDecision.narration || "",
      memory_references: asArray(activeDecision.memory_references),
    } : null,
    evidence: loopEvidence.map((record) => ({
      id: record.evidence_id,
      decision_id: record.decision_id || null,
      source: record.system || record.source || "unknown",
      timestamp: record.timestamp_utc || null,
      status: record.status || "unknown",
      affected_entities: asArray(record.affected_entities || record.affected_scope || record.evidence_collected).slice(0, 6),
      policy_controls: asArray(record.policy_controls || record.controls).slice(0, 6),
      audit_trail: record.action_id ? [record.action_id] : [],
      raw: record,
    })),
    blast_radius: {
      level: normalizeRisk(activeDecision?.blast_radius || activeApproval?.risk),
      affected_scope: activeApproval?.affected_scope || recommendedAction?.target || null,
    },
    recommended_action: recommendedAction ? {
      ...recommendedAction,
      requires_approval: Boolean(activeDecision?.requires_human_approval || activeApproval),
      approval_state: activeApproval?.status || (activeDecision?.requires_human_approval ? "approval_required" : "not_required"),
      approval_id: activeApproval?.id || null,
      fallback_action: activeDecision?.fallback_action || null,
      expected_outcome: activeDecision?.expected_outcome || "",
    } : null,
    approval: activeApproval,
    audit_trail: loopAudit.map((event) => ({
      id: event.id,
      timestamp: event.timestamp,
      event_type: event.event_type,
      status: event.status,
      actor: event.actor,
      context: event.context || {},
    })),
    trust: loopTrust,
    timeline,
    counts: {
      pending_approvals: pendingApprovals.length,
      decisions: sortedDecisions.length,
      evidence: sortedEvidence.length,
      audit_events: asArray(auditEvents).length,
      trust_capabilities: asArray(trust).length,
    },
    honesty: {
      live: Boolean(activeDecision || activeApproval || loopEvidence.length || loopAudit.length),
      demo: false,
      stale: false,
      unavailable: false,
      message: activeDecision || activeApproval || loopEvidence.length
        ? "Operational loop is built from ARIA ledgers and approval state."
        : "No ARIA decision or evidence ledger entries are available yet. Run the orchestrator or connect a source to create the first loop.",
    },
  };
}

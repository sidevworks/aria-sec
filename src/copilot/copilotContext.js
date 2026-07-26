// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

const asArray = (value) => Array.isArray(value) ? value : [];
const lower = (value) => String(value || "").toLowerCase();

const pickText = (...values) => {
  for (const value of values) {
    if (typeof value !== "string" && typeof value !== "number") continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return "";
};

export const COPILOT_QUICK_PROMPTS = [
  "Why is this risky?",
  "Show blast radius.",
  "What would you do?",
  "Stage the safest action.",
  "Explain this to a CISO.",
  "What changed in the last 10 minutes?",
];

export function summarizeDataCaveat(context = {}) {
  const flags = context.flags || {};
  const parts = [];
  if (flags.demoData || flags.mockData) parts.push("demo data");
  if (flags.staleData) parts.push("stale telemetry");
  if (flags.unavailableData) parts.push("unavailable sources");
  return parts.length
    ? `Caveat: this answer is based on ${parts.join(", ")}. Treat it as operator guidance, not verified production certainty.`
    : "Grounding: live context is available from the current ARIA workspace.";
}

export function getCopilotContextCards(context = {}) {
  const route = context.route || {};
  const metrics = context.metrics || {};
  const identity = context.identity || {};
  const aiSpm = context.aiSpm || {};
  const governance = context.governance || {};
  const evidence = context.evidence || {};
  const latestEvidence = evidence.latest?.[0] || context.incidents?.[0] || null;
  const selectedIdentity = identity.selected;

  return [
    {
      label: "Panel",
      value: route.activePanel?.label || route.activePanel?.id || "No panel selected",
      detail: route.activeSector?.label ? `Sector: ${route.activeSector.label}` : "Sector unavailable",
    },
    {
      label: "Risk",
      value: `${metrics.threatLevel || "UNKNOWN"}${metrics.riskScore != null ? ` - ${metrics.riskScore}` : ""}`,
      detail: `${metrics.activeIncidents || 0} active incidents - ${metrics.reviewItems?.length || 0} review signals`,
    },
    {
      label: "Selected",
      value: pickText(selectedIdentity?.email, selectedIdentity?.name, selectedIdentity?.user_id, aiSpm.latestFinding?.title, "No selected entity"),
      detail: aiSpm.latestFinding?.severity ? `Latest finding: ${aiSpm.latestFinding.severity}` : `${identity.sessionCount || 0} identity sessions`,
    },
    {
      label: "Governance",
      value: `${governance.availableActions?.length || 0} actions - ${governance.approvalRequiredCount || 0} approvals`,
      detail: governance.autonomyMode ? `Mode: ${governance.autonomyMode}` : "Autonomy mode unknown",
    },
    {
      label: "Evidence",
      value: pickText(latestEvidence?.summary, latestEvidence?.id, "No recent evidence"),
      detail: latestEvidence?.source ? `Source: ${latestEvidence.source}` : "Evidence stream quiet",
    },
  ];
}

function topRiskSignal(context = {}) {
  const incident = asArray(context.incidents)[0];
  const finding = context.aiSpm?.latestFinding;
  const denial = asArray(context.audit?.deniedEvents)[0];
  return incident || finding || denial || context.panelSummary?.payload || {};
}

function describeSignal(signal = {}) {
  if (typeof signal === "string") return signal;
  return pickText(signal.title, signal.summary, signal.message, signal.reason, signal.finding, signal.id, "No specific signal is selected.");
}

function describeBlastRadius(context = {}) {
  const signal = topRiskSignal(context);
  const identities = context.identity?.selected ? [context.identity.selected] : [];
  const affected = [
    ...asArray(signal.affectedEntities),
    ...asArray(signal.affected_entities),
    ...asArray(signal.entities),
    ...asArray(signal.assets),
  ].filter(Boolean);
  const incidents = asArray(context.incidents);
  const sources = asArray(context.sourceHealth?.sources);
  const pieces = [];

  if (affected.length) pieces.push(`Affected entities: ${affected.map((item) => typeof item === "string" ? item : item.name || item.id || item.email || "entity").slice(0, 5).join(", ")}.`);
  if (identities.length) pieces.push(`Selected identity: ${pickText(identities[0].email, identities[0].user_id, identities[0].name)}.`);
  if (context.aiSpm?.assetCount != null) pieces.push(`AI-SPM scope includes ${context.aiSpm.assetCount} assets and ${context.aiSpm.findingCount || 0} findings.`);
  if (incidents.length) pieces.push(`${incidents.length} active incident${incidents.length === 1 ? "" : "s"} are in the current feed.`);
  if (sources.length) pieces.push(`${sources.filter((source) => source.status === "live").length}/${sources.length} telemetry sources are live.`);

  return pieces.length
    ? pieces.join(" ")
    : "Blast radius is not explicit in the current context. I can only infer from the active panel, latest evidence, and source health.";
}

function actionLine(action = {}) {
  const label = action.label || action.action || action.id || "Review action";
  const suffix = action.approvalRequired ? " Requires governed approval before execution." : " Can be staged as an operator-reviewed action.";
  return `${label}.${suffix}`;
}

function safestAction(context = {}) {
  const actions = asArray(context.governance?.availableActions);
  const approvalSafe = actions.find((action) => action.approvalRequired);
  const anyAction = approvalSafe || actions[0];
  if (anyAction) return actionLine(anyAction);
  if (context.metrics?.criticalIncidents || context.aiSpm?.criticalFindings) {
    return "Stage a read-only evidence review first, then request approval before containment. No direct action contract is exposed in the current context.";
  }
  return "Stage a refresh plus evidence review. Current context does not expose a concrete remediation action.";
}

function changedRecently(context = {}) {
  const events = [
    ...asArray(context.events?.recentFeed),
    ...asArray(context.events?.recentToasts).map((toast) => `${toast.title || "Toast"}: ${toast.message || ""}`),
    ...asArray(context.policy?.recentChanges).map((entry) => entry.summary || entry.action || entry.id || "Policy change"),
    ...asArray(context.governance?.decisionHistory).map((entry) => entry.summary || entry.outcome || entry.id || "Decision"),
  ].filter(Boolean).slice(0, 6);
  return events.length
    ? events.map((event) => `- ${typeof event === "string" ? event : JSON.stringify(event)}`).join("\n")
    : "No recent feed, toast, policy, or decision deltas are available in the current snapshot.";
}

export function answerCopilotPrompt(prompt, context = {}) {
  const normalized = lower(prompt);
  const caveat = summarizeDataCaveat(context);
  const signal = topRiskSignal(context);
  const signalText = describeSignal(signal);
  const riskScore = context.metrics?.riskScore;
  const threat = context.metrics?.threatLevel || "UNKNOWN";
  const reviewItems = asArray(context.metrics?.reviewItems);
  const approvals = asArray(context.governance?.pendingApprovals);

  if (normalized.includes("blast")) {
    return `${caveat}\n\nBlast radius: ${describeBlastRadius(context)}`;
  }

  if (normalized.includes("what would") || normalized.includes("recommend")) {
    return `${caveat}\n\nRecommendation: ${safestAction(context)} Prioritize evidence preservation, keep containment governed, and brief the operator on uncertainty before acting.`;
  }

  if (normalized.includes("stage")) {
    return `${caveat}\n\nStaged action: ${safestAction(context)} ${approvals.length ? `${approvals.length} approval item${approvals.length === 1 ? " is" : "s are"} already pending.` : "No approval queue item is currently exposed."}`;
  }

  if (normalized.includes("ciso") || normalized.includes("executive")) {
    return `${caveat}\n\nCISO brief: ARIA is tracking ${threat} risk${riskScore != null ? ` with score ${riskScore}` : ""}. The main signal is: ${signalText}. The recommended posture is controlled investigation first, with any disruptive response held behind approval.`;
  }

  if (normalized.includes("changed") || normalized.includes("last 10")) {
    return `${caveat}\n\nRecent changes:\n${changedRecently(context)}`;
  }

  if (normalized.includes("why") || normalized.includes("risky") || normalized.includes("risk")) {
    const reasons = [
      `Threat level is ${threat}${riskScore != null ? ` with score ${riskScore}` : ""}.`,
      signalText ? `Primary signal: ${signalText}.` : "",
      reviewItems.length ? `Review signals: ${reviewItems.slice(0, 3).join("; ")}.` : "",
      context.sourceHealth?.counts?.unavailable ? `${context.sourceHealth.counts.unavailable} source${context.sourceHealth.counts.unavailable === 1 ? " is" : "s are"} unavailable, so confidence is reduced.` : "",
    ].filter(Boolean);
    return `${caveat}\n\nWhy risky: ${reasons.join(" ") || "There is not enough current evidence to make a confident risk call."}`;
  }

  return `${caveat}\n\nCurrent read: ${signalText}. ${safestAction(context)}`;
}

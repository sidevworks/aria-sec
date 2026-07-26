// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

const DEFAULT_LIMIT = 8;

const SEVERITY_WEIGHT = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  info: 0,
  unknown: 0,
};

const ACTION_COMMANDS = {
  briefing: "Generate a live intelligence briefing covering all active threats, incidents, and system status",
  report: "Generate executive incident report",
  scan: "Run a quick scan",
  contain: "Contain suspicious threats",
  aiSpm: "AI-SPM",
};

const asArray = (value) => (Array.isArray(value) ? value : []);

const asObject = (value) => (value && typeof value === "object" && !Array.isArray(value) ? value : {});

const text = (...values) => {
  for (const value of values) {
    if (value === 0) return "0";
    if (value === false) return "false";
    if (typeof value === "string" && value.trim()) return value.trim();
    if (value !== undefined && value !== null && typeof value !== "object") return String(value);
  }
  return "";
};

const number = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, number(value, min)));

const lower = (value) => text(value).toLowerCase();

const titleCase = (value) => {
  const raw = text(value, "unknown");
  return raw.charAt(0).toUpperCase() + raw.slice(1);
};

const severityRank = (value) => SEVERITY_WEIGHT[lower(value)] ?? SEVERITY_WEIGHT.unknown;

const severityFromScore = (score) => {
  const n = number(score);
  if (n >= 85) return "critical";
  if (n >= 70) return "high";
  if (n >= 40) return "medium";
  if (n > 0) return "low";
  return "info";
};

const severityFromRisk = (riskScore, threatLevel) => {
  const threat = lower(threatLevel);
  const score = number(riskScore);
  const scoreSeverity = score >= 70 ? "critical" : score >= 40 ? "medium" : score > 0 ? "low" : "info";
  return severityRank(threat) > severityRank(scoreSeverity) ? threat : scoreSeverity;
};

const stateFromSeverity = (severity) => {
  const rank = severityRank(severity);
  if (rank >= SEVERITY_WEIGHT.critical) return "breach";
  if (rank >= SEVERITY_WEIGHT.medium) return "elevated";
  return "clean";
};

const itemTitle = (item, fallback) => {
  if (typeof item === "string") return item;
  const obj = asObject(item);
  return text(obj.title, obj.label, obj.summary, obj.message, obj.reason, obj.action, obj.id, fallback);
};

const itemDescription = (item, fallback = "") => {
  if (typeof item === "string") return item;
  const obj = asObject(item);
  return text(obj.description, obj.summary, obj.message, obj.reason, obj.details, fallback);
};

const stableId = (prefix, item, index) => {
  if (typeof item === "string") return `${prefix}-${index}`;
  const obj = asObject(item);
  return text(obj.id, obj.key, obj.slug, obj.finding_id, obj.findingId, `${prefix}-${index}`);
};

const sortBySeverityThenIndex = (a, b) => {
  const bySeverity = severityRank(b.severity) - severityRank(a.severity);
  return bySeverity || a.index - b.index;
};

const actionMeta = (id, label, command, available) => ({
  id,
  label,
  command,
  available: Boolean(available),
});

const callbackLabels = (props = {}) => ({
  executeAriaCommand: typeof props.executeAriaCommand === "function" ? "executeAriaCommand" : null,
  onConfirmTask: typeof props.onConfirmTask === "function" ? "onConfirmTask" : null,
  onResolveApproval: typeof props.onResolveApproval === "function" ? "onResolveApproval" : null,
});

const firstNonEmptyArray = (...values) => values.find((value) => asArray(value).length) || [];

const effectiveApprovals = (props = {}) => firstNonEmptyArray(props.approvalQueue, props.approvals);

const aiSpmSummaryFrom = (props = {}) => {
  const summary = asObject(props.aiSpmSummary);
  const state = asObject(props.aiSpmState);
  return Object.keys(summary).length ? summary : asObject(state.summary);
};

const aiSpmFindingsFrom = (props = {}) => {
  const state = asObject(props.aiSpmState);
  const summary = aiSpmSummaryFrom(props);
  return firstNonEmptyArray(state.findings, summary.findings_list, summary.findings);
};

const aiSpmCount = (summary, singular, plural, listName) => {
  const list = asArray(summary[listName]);
  return number(summary[`${singular}_count`] ?? summary[singular] ?? summary[plural], list.length);
};

const sourceStatus = (source) => lower(asObject(source).status || "unknown");

const sourceLabel = (source, index) => {
  const obj = asObject(source);
  return text(obj.name, obj.label, obj.id, `source-${index}`);
};

const summarizeSources = (sources) => {
  const rows = asArray(sources).map((source, index) => ({
    id: stableId("source", source, index),
    label: sourceLabel(source, index),
    status: sourceStatus(source),
    message: text(asObject(source).message, asObject(source).detail),
  }));
  const total = rows.length;
  const live = rows.filter((source) => source.status === "live").length;
  const impaired = rows.filter((source) => !["live", "ok", "healthy"].includes(source.status));
  return {
    total,
    live,
    impaired: impaired.length,
    health: total ? Math.round((live / total) * 100) : 0,
    status: total === 0 ? "unknown" : impaired.length ? "degraded" : "live",
    items: rows,
  };
};

const severityCounts = (items) =>
  asArray(items).reduce(
    (counts, item) => {
      const severity = lower(asObject(item).severity || asObject(item).level || "unknown");
      counts[severity] = (counts[severity] || 0) + 1;
      return counts;
    },
    { critical: 0, high: 0, medium: 0, low: 0, info: 0, unknown: 0 }
  );

export function buildDecisionQueue(props = {}) {
  const approvals = effectiveApprovals(props).map((item, index) => {
    const obj = asObject(item);
    const severity = lower(obj.severity || obj.risk || obj.priority || "high");
    return {
      id: stableId("approval", item, index),
      index,
      type: "approval",
      title: itemTitle(item, "Approval required"),
      description: itemDescription(item, text(obj.action, "Operator approval required")),
      severity,
      state: lower(obj.status || obj.state || "pending"),
      requestedBy: text(obj.requestedBy, obj.requested_by, obj.actor, "ARIA"),
      command: text(obj.command, obj.action),
      createdAt: text(obj.createdAt, obj.created_at, obj.timestamp, obj.time),
      decisions: [
        { id: "approve", label: "Approve", handler: "onResolveApproval" },
        { id: "deny", label: "Deny", handler: "onResolveApproval" },
      ],
      handler: "onResolveApproval",
    };
  });

  const reviews = asArray(props.reviewItems).map((item, index) => {
    const obj = asObject(item);
    const severity = lower(obj.severity || obj.level || obj.priority || "medium");
    return {
      id: stableId("review", item, index),
      index,
      type: "review",
      title: itemTitle(item, "Review item"),
      description: itemDescription(item),
      severity,
      state: lower(obj.status || obj.state || "open"),
      source: text(obj.source, obj.connector, "telemetry"),
      handler: props.executeAriaCommand ? "executeAriaCommand" : null,
    };
  });

  const pendingTask = text(props.pendingTask);
  const confirmation = pendingTask
    ? [
        {
          id: "pending-task",
          index: -1,
          type: "confirmation",
          title: pendingTask,
          description: "Command awaiting operator confirmation",
          severity: "medium",
          state: lower(props.panelPhase || "confirm"),
          command: pendingTask,
          decisions: [
            { id: "confirm", label: "Confirm", handler: "onConfirmTask" },
            { id: "cancel", label: "Cancel", handler: "onCancelConfirm" },
          ],
          handler: "onConfirmTask",
        },
      ]
    : [];

  const items = [...confirmation, ...approvals, ...reviews]
    .sort(sortBySeverityThenIndex)
    .map((item, order) => ({ ...item, order }));

  return {
    kind: "decisionQueue",
    total: items.length,
    pendingApprovals: approvals.length,
    reviewItems: reviews.length,
    requiresConfirmation: Boolean(pendingTask),
    callbacks: callbackLabels(props),
    items,
  };
}

export function buildIncidentWorkbenches(props = {}) {
  const incidents = firstNonEmptyArray(props.incidents, props.liveIncidents).map((item, index) => {
    const obj = asObject(item);
    const severity = lower(obj.severity || obj.level || "medium");
    const status = lower(obj.status || obj.state || "open");
    return {
      id: stableId("incident", item, index),
      index,
      title: itemTitle(item, "Incident"),
      description: itemDescription(item),
      severity,
      status,
      source: text(obj.source, obj.connector, obj.panel, "incident-feed"),
      owner: text(obj.owner, obj.assignee),
      updatedAt: text(obj.updatedAt, obj.updated_at, obj.timestamp, obj.time),
      actionLabels: ["Brief", "Report", severityRank(severity) >= SEVERITY_WEIGHT.high ? "Contain" : "Monitor"],
    };
  });

  const counts = severityCounts(incidents);
  const workbenches = incidents.sort(sortBySeverityThenIndex).map((incident) => ({
    ...incident,
    posture: stateFromSeverity(incident.severity),
    actions: [
      actionMeta("brief", "Brief", ACTION_COMMANDS.briefing, props.executeAriaCommand),
      actionMeta("report", "Report", ACTION_COMMANDS.report, props.executeAriaCommand),
      actionMeta("contain", "Contain", ACTION_COMMANDS.contain, props.executeAriaCommand && severityRank(incident.severity) >= SEVERITY_WEIGHT.high),
    ],
  }));

  return {
    kind: "incidentWorkbenches",
    total: workbenches.length,
    critical: counts.critical,
    high: counts.high,
    open: workbenches.filter((incident) => !["closed", "resolved"].includes(incident.status)).length,
    incidentCount24h: number(props.incidentCount24h, workbenches.length),
    items: workbenches,
  };
}

export function buildAttackPaths(props = {}) {
  const vectors = asArray(props.vectors).map((item, index) => {
    const obj = asObject(item);
    const score = clamp(obj.score ?? obj.value ?? obj.riskScore);
    const severity = lower(obj.severity || severityFromScore(score));
    return {
      id: stableId("vector", item, index),
      index,
      label: itemTitle(item, "Threat vector"),
      description: itemDescription(item),
      score,
      severity,
      source: text(obj.source, obj.connector, "threat-vectors"),
    };
  });

  const connections = asArray(props.connections);
  const blockedConnections = connections.filter((connection) => lower(asObject(connection).state) === "blocked");
  const findings = aiSpmFindingsFrom(props).map((finding, index) => {
    const obj = asObject(finding);
    const severity = lower(obj.severity || obj.level || "medium");
    return {
      id: stableId("finding", finding, index),
      index,
      label: itemTitle(finding, "AI-SPM finding"),
      description: itemDescription(finding),
      score: clamp(obj.score ?? obj.risk_score ?? severityRank(severity) * 25),
      severity,
      source: text(obj.source, obj.repository, obj.asset, "ai-spm"),
    };
  });

  const connectionPaths = blockedConnections.map((connection, index) => {
    const obj = asObject(connection);
    return {
      id: stableId("connection", connection, index),
      index,
      label: text(obj.remoteAddress, obj.remote, obj.host, obj.dst, "Blocked connection"),
      description: text(obj.process, obj.command, obj.reason, "Network connection blocked"),
      score: 75,
      severity: "high",
      source: "network",
    };
  });

  const paths = [...vectors, ...findings, ...connectionPaths]
    .sort(sortBySeverityThenIndex)
    .map((path, order) => ({
      ...path,
      order,
      posture: stateFromSeverity(path.severity),
      route: [path.source, path.label].filter(Boolean),
    }));

  return {
    kind: "attackPaths",
    total: paths.length,
    topScore: paths.reduce((max, path) => Math.max(max, path.score), 0),
    critical: paths.filter((path) => path.severity === "critical").length,
    blockedConnections: blockedConnections.length,
    items: paths,
  };
}

export function buildExecutiveRisk(props = {}) {
  const summary = aiSpmSummaryFrom(props);
  const sources = summarizeSources(props.sources);
  const approvals = effectiveApprovals(props);
  const incidents = firstNonEmptyArray(props.incidents, props.liveIncidents);
  const findings = aiSpmFindingsFrom(props);
  const memoryPercent = clamp(props.memoryPercent);
  const riskScore = clamp(props.riskScore);
  const threatLevel = text(props.threatLevel, "UNKNOWN").toUpperCase();
  const severity = severityFromRisk(riskScore, threatLevel);
  const criticalIncidents = incidents.filter((incident) => lower(asObject(incident).severity) === "critical").length;
  const criticalFindings = number(summary.critical_count, findings.filter((finding) => lower(asObject(finding).severity) === "critical").length);
  const secretCount = aiSpmCount(summary, "secret", "secrets", "secrets_list");
  const assetCount = aiSpmCount(summary, "asset", "assets", "asset_list");
  const findingCount = number(summary.finding_count ?? summary.findings, findings.length);
  const readiness = Math.round(
    clamp(100 - riskScore * 0.35 - approvals.length * 5 - criticalIncidents * 8 - criticalFindings * 6 - Math.max(0, memoryPercent - 75) * 0.6)
  );

  const cards = [
    { id: "threat", label: "Threat", value: threatLevel, severity, detail: `${riskScore} risk score` },
    { id: "sources", label: "Live sources", value: `${sources.live}/${sources.total}`, severity: sources.impaired ? "medium" : "info", detail: `${sources.health}% source health` },
    { id: "incidents", label: "Incidents", value: incidents.length, severity: criticalIncidents ? "critical" : incidents.length ? "medium" : "info", detail: `${criticalIncidents} critical` },
    { id: "approvals", label: "Approvals", value: approvals.length, severity: approvals.length ? "high" : "info", detail: approvals.length ? "Operator decisions pending" : "Queue clear" },
    { id: "ai-spm", label: "AI-SPM", value: findingCount, severity: criticalFindings || secretCount ? "high" : findingCount ? "medium" : "info", detail: `${assetCount} assets · ${secretCount} secrets` },
    { id: "system", label: "Memory", value: `${memoryPercent}%`, severity: memoryPercent >= 82 ? "high" : memoryPercent >= 70 ? "medium" : "info", detail: `Load ${number(props.load, 0).toFixed(2)}` },
  ];

  return {
    kind: "executiveRisk",
    generatedAt: text(props.generatedAt),
    posture: stateFromSeverity(severity),
    threatLevel,
    riskScore,
    readiness,
    memoryPercent,
    sourceHealth: sources,
    aiSpm: {
      mode: text(summary.mode, asObject(props.aiSpmState).demoMode ? "demo" : ""),
      assets: assetCount,
      findings: findingCount,
      critical: criticalFindings,
      secrets: secretCount,
      loading: Boolean(asObject(props.aiSpmState).loading),
    },
    totals: {
      incidents: incidents.length,
      approvals: approvals.length,
      reviews: asArray(props.reviewItems).length,
      processes: asArray(props.processes).length,
      connections: asArray(props.connections).length,
    },
    cards,
  };
}

export function buildAutonomyActions(props = {}) {
  const approvals = effectiveApprovals(props);
  const pendingTask = text(props.pendingTask);
  const aiSpmState = asObject(props.aiSpmState);
  const callbacks = callbackLabels(props);
  const actions = [
    {
      id: "briefing",
      label: "Brief",
      command: ACTION_COMMANDS.briefing,
      handler: "executeAriaCommand",
      available: Boolean(props.executeAriaCommand),
      priority: props.riskScore >= 70 || firstNonEmptyArray(props.incidents, props.liveIncidents).length ? "high" : "normal",
    },
    {
      id: "scan",
      label: aiSpmState.loading ? "Scanning" : "Scan",
      command: ACTION_COMMANDS.scan,
      handler: "executeAriaCommand",
      available: Boolean(props.executeAriaCommand) && !aiSpmState.loading,
      priority: "normal",
    },
    {
      id: "report",
      label: "Report",
      command: ACTION_COMMANDS.report,
      handler: "executeAriaCommand",
      available: Boolean(props.executeAriaCommand),
      priority: approvals.length ? "high" : "normal",
    },
    {
      id: "contain",
      label: "Contain",
      command: ACTION_COMMANDS.contain,
      handler: "executeAriaCommand",
      available: Boolean(props.executeAriaCommand) && (props.riskScore >= 70 || buildIncidentWorkbenches(props).critical > 0),
      priority: "high",
    },
    {
      id: "confirm-task",
      label: "Confirm",
      command: pendingTask,
      handler: "onConfirmTask",
      available: Boolean(pendingTask && props.onConfirmTask),
      priority: "high",
    },
    {
      id: "resolve-approval",
      label: "Resolve approvals",
      command: "",
      handler: "onResolveApproval",
      available: Boolean(approvals.length && props.onResolveApproval),
      priority: approvals.length ? "high" : "normal",
    },
  ];

  return {
    kind: "autonomyActions",
    mode: text(props.autonomyMode, asObject(props.ariaCenterPanel).autonomyMode, "confirm"),
    panelPhase: text(props.panelPhase, "monitoring"),
    currentTask: text(props.currentTask),
    pendingTask,
    callbacks,
    available: actions.filter((action) => action.available),
    items: actions,
  };
}

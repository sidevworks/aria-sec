// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

const MAX_ITEMS = 5;

const isObject = (value) => value && typeof value === "object" && !Array.isArray(value);
const asArray = (value) => Array.isArray(value) ? value : [];
const lower = (value) => String(value || "").toLowerCase();

const compactObject = (value, depth = 0) => {
  if (value == null) return null;
  if (typeof value !== "object") return value;
  if (depth > 2) return Array.isArray(value) ? `[${value.length} items]` : "[object]";
  if (Array.isArray(value)) return value.slice(0, MAX_ITEMS).map((item) => compactObject(item, depth + 1));

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entryValue]) => entryValue !== undefined && typeof entryValue !== "function")
      .slice(0, 16)
      .map(([key, entryValue]) => [key, compactObject(entryValue, depth + 1)]),
  );
};

const findPanel = (catalog = [], id) => asArray(catalog).find((panel) => panel.id === id) || null;
const findSector = (catalog = [], activeSector, activePanelId) => {
  if (isObject(activeSector)) return activeSector;
  const byId = asArray(catalog).find((sector) => sector.id === activeSector);
  if (byId) return byId;
  return asArray(catalog).find((sector) => asArray(sector.panels).includes(activePanelId)) || null;
};

const normalizeStatus = (value) => {
  const status = lower(value?.status || value?.state || value?.health || value);
  if (["live", "connected", "online", "healthy", "available", "ok", "ready"].includes(status)) return "live";
  if (["stale", "degraded", "warning", "reconnecting", "waiting"].includes(status)) return "stale";
  if (["unavailable", "offline", "missing", "disabled", "error", "failed", "disconnected"].includes(status)) return "unavailable";
  return status || "unknown";
};

const sourceRow = (source) => {
  if (!source) return null;
  if (typeof source === "string") return { id: source, label: source, status: "unknown" };
  return {
    id: source.id || source.key || source.name || source.label || "source",
    label: source.label || source.name || source.id || source.key || "Source",
    status: normalizeStatus(source),
    lastSeen: source.last_seen || source.lastSeen || source.updated_at || source.updatedAt || null,
    message: source.message || source.reason || null,
  };
};

const connectorRow = (id, label, connector, message) => {
  if (!connector && !message) return null;
  return sourceRow({
    id,
    label,
    status: connector?.connected === true ? "live" : connector?.status || connector?.state || (connector ? "available" : "unknown"),
    message: message || connector?.message || null,
    updated_at: connector?.updated_at || connector?.lastSeen || null,
  });
};

const buildSources = ({ livePanelData, aiSpmState, securityAdminState, identitySessionsState }) => {
  const summary = livePanelData?.summary || {};
  const fabric = [
    ...asArray(summary.source_fabric),
    ...asArray(summary.sources),
    ...asArray(livePanelData?.sources),
    ...asArray(livePanelData?.panels?.overview?.source_fabric),
  ].map(sourceRow).filter(Boolean);

  const connectors = [
    connectorRow("github", "GitHub", aiSpmState?.githubConnector, aiSpmState?.githubMessage),
    connectorRow("aws", "AWS", aiSpmState?.awsConnector, aiSpmState?.awsMessage),
    connectorRow("okta", "Okta", aiSpmState?.oktaConnector, aiSpmState?.oktaMessage),
    connectorRow("snyk", "Snyk", aiSpmState?.snykConnector, aiSpmState?.snykMessage),
    connectorRow("azuread", "Azure AD", aiSpmState?.azureadConnector, aiSpmState?.azureadMessage),
    connectorRow("virustotal", "VirusTotal", aiSpmState?.virustotalConnector, aiSpmState?.virustotalMessage),
    connectorRow("elastic", "Elastic", aiSpmState?.elasticConnector, aiSpmState?.elasticMessage),
    securityAdminState?.dataUnavailable ? sourceRow({ id: "security-admin", label: "Security Admin", status: "unavailable" }) : null,
    identitySessionsState?.error ? sourceRow({ id: "identity-sessions", label: "Identity Sessions", status: "unavailable", message: identitySessionsState.error }) : null,
  ].filter(Boolean);

  const deduped = new Map();
  [...fabric, ...connectors].forEach((source) => deduped.set(source.id, source));
  return [...deduped.values()].slice(0, 16);
};

const countByStatus = (sources) => sources.reduce((counts, source) => {
  const status = normalizeStatus(source.status);
  if (status === "live") counts.live += 1;
  else if (status === "stale") counts.stale += 1;
  else if (status === "unavailable") counts.unavailable += 1;
  else counts.unknown += 1;
  return counts;
}, { live: 0, stale: 0, unavailable: 0, unknown: 0 });

const latestScan = (aiSpmState = {}) => {
  const scans = [
    ["okta", aiSpmState.oktaScanResult, aiSpmState.oktaMessage],
    ["snyk", aiSpmState.snykScanResult, aiSpmState.snykMessage],
    ["azuread", aiSpmState.azureadScanResult, aiSpmState.azureadMessage],
    ["virustotal", aiSpmState.virustotalScanResult, aiSpmState.virustotalMessage],
    ["elastic", aiSpmState.elasticScanResult, aiSpmState.elasticMessage],
  ].filter(([, result, message]) => result || lower(message).includes("scan"));
  const [source, result, message] = scans.at(-1) || [];
  if (!source) return null;
  return {
    source,
    message: message || result?.message || null,
    findingCount: asArray(result?.findings).length,
    status: result ? "complete" : "unknown",
    summary: compactObject(result?.summary || result, 1),
  };
};

const summarizePanel = (panelId, panelData) => {
  if (!panelId || panelId === "none") return null;
  const data = panelData || {};
  return {
    id: panelId,
    summary: data.summary || data.headline || data.title || null,
    itemCount: asArray(data.items).length || asArray(data.findings).length || asArray(data.connections).length || null,
    payload: compactObject(data),
  };
};

const actionRow = (action) => {
  if (!action) return null;
  if (typeof action === "string") return { id: action, label: action, approvalRequired: false };
  const status = lower(action.status || action.state || action.approval_state || action.approvalState);
  const approvalRequired = Boolean(
    action.approval_required ||
    action.approvalRequired ||
    status.includes("approval") ||
    lower(action.risk).includes("high") ||
    lower(action.risk).includes("critical"),
  );
  return {
    id: action.id || action.key || action.action || action.label || "action",
    label: action.label || action.title || action.action || action.id || "Action",
    status: action.status || action.state || (approvalRequired ? "approval_required" : "available"),
    risk: action.risk || null,
    approvalRequired,
    reason: action.reason || action.description || action.summary || null,
  };
};

const decisionRow = (entry) => {
  if (!entry) return null;
  if (typeof entry === "string") return { id: entry, summary: entry };
  return {
    id: entry.id || entry.decision_id || entry.key || entry.action || "decision",
    summary: entry.summary || entry.title || entry.action || entry.message || entry.decision || null,
    outcome: entry.outcome || entry.status || entry.state || null,
    actor: entry.actor || entry.user || entry.user_id || null,
    timestamp: entry.timestamp || entry.created_at || entry.updated_at || entry.time || null,
    approvalState: entry.approval_state || entry.approvalState || null,
  };
};

const evidenceRow = (entry, fallbackSource = "telemetry") => {
  if (!entry) return null;
  if (typeof entry === "string") return { source: fallbackSource, summary: entry };
  return {
    id: entry.id || entry.event_id || entry.finding_id || entry.key || null,
    source: entry.source || entry.connector || entry.panel || fallbackSource,
    summary: entry.summary || entry.title || entry.message || entry.reason || entry.finding || null,
    severity: entry.severity || entry.level || entry.risk || null,
    timestamp: entry.timestamp || entry.time || entry.created_at || entry.updated_at || null,
    affectedEntities: asArray(entry.affected_entities || entry.affectedEntities || entry.entities || entry.assets).slice(0, MAX_ITEMS),
    confidence: entry.confidence ?? entry.score ?? null,
  };
};

export function buildRealtimePlatformContext(input = {}) {
  const livePanelData = input.livePanelData || null;
  const monitoringContext = input.monitoringContext || {};
  const panels = livePanelData?.panels || {};
  const activePanelId = input.activeDashPanel || "none";
  const panel = findPanel(input.panelCatalog, activePanelId);
  const sector = findSector(input.sectorCatalog, input.activeSector, activePanelId);
  const incidents = asArray(panels?.["incident-feed"]?.items);
  const threatPanel = panels?.["threat-overview"] || {};
  const sources = buildSources(input);
  const sourceCounts = countByStatus(sources);
  // identitySessionsState.identityCard is the resolved tenant/user/role context
  // ({ tenant_id: { value, source }, ... }) — not a selected galaxy entity. It must
  // never be used as selectedIdentity here, or its nested {value, source} objects
  // get rendered directly as React children in the copilot's "Selected" card.
  const selectedIdentity = input.selectedIdentity || null;
  const scanResult = latestScan(input.aiSpmState);
  const ariaCenterPanel = panels?.["aria-center"] || {};
  const availableActions = [
    ...asArray(input.availableActions),
    ...asArray(input.approvalQueue).map((approval) => ({
      ...approval,
      status: "approval_required",
      approval_required: true,
    })),
    ...asArray(ariaCenterPanel.available_actions),
    ...asArray(livePanelData?.summary?.available_actions),
  ].map(actionRow).filter(Boolean);
  const decisionHistory = [
    ...asArray(input.decisionHistory),
    ...asArray(ariaCenterPanel.decision_history),
    ...asArray(ariaCenterPanel.decisions),
    ...asArray(livePanelData?.summary?.decision_history),
    ...asArray(input.policyChangeState?.history),
  ].map(decisionRow).filter(Boolean);
  const latestEvidence = [
    ...incidents.map((incident) => evidenceRow(incident, "incident-feed")),
    ...asArray(input.aiSpmState?.findings).map((finding) => evidenceRow(finding, "ai-spm")),
    ...asArray(monitoringContext.audit?.deniedEvents).map((event) => evidenceRow(event, "audit")),
    ...asArray(livePanelData?.feed).map((event) => evidenceRow(event, "live-feed")),
    ...asArray(input.liveFeed).map((event) => evidenceRow(event, "operator-feed")),
  ].filter(Boolean).slice(0, MAX_ITEMS);
  const unavailableData = Boolean(input.fetchError || input.telemetryOnline === false || input.securityAdminState?.dataUnavailable || input.identitySessionsState?.error);
  const staleData = Boolean(input.telemetryOnline === false || sourceCounts.stale > 0 || sourceCounts.unavailable > 0 || !livePanelData);
  const demoData = Boolean(livePanelData?.simulated || livePanelData?.demo || input.aiSpmState?.demoMode);

  return {
    generatedAt: new Date().toISOString(),
    route: {
      workspace: input.workspace || "orbital-visualizer",
      ariaState: input.ariaState || "idle",
      dashboardVisible: Boolean(input.dashVisible),
      activePanel: { id: activePanelId, label: panel?.label || (activePanelId === "none" ? "None" : activePanelId) },
      activeSector: { id: sector?.id || input.activeSector || "none", label: sector?.label || sector?.id || input.activeSector || "None" },
      modelMode: input.modelMode || "cloud",
    },
    identity: {
      selected: selectedIdentity ? compactObject(selectedIdentity) : null,
      galaxies: asArray(monitoringContext.identity?.galaxies).map((galaxy) => compactObject(galaxy)),
      dataMode: monitoringContext.identity?.dataMode || null,
      connectedSources: asArray(monitoringContext.identity?.connectedSources).slice(0, MAX_ITEMS).map((source) => compactObject(source)),
      sessionCount: asArray(input.identitySessionsState?.sessions).length,
      loading: Boolean(input.identitySessionsState?.loading),
      error: input.identitySessionsState?.error || null,
    },
    network: {
      authStatus: monitoringContext.network?.authStatus || null,
      authorization: compactObject(monitoringContext.network?.authorization),
      lastScan: compactObject(monitoringContext.network?.lastScan),
      activeScan: compactObject(monitoringContext.network?.activeScan),
      error: monitoringContext.network?.error || null,
    },
    metrics: {
      threatLevel: input.threatLevel || threatPanel.threat_level || livePanelData?.threat_level || "UNKNOWN",
      riskScore: threatPanel.risk_score ?? threatPanel.riskScore ?? livePanelData?.risk_score ?? null,
      incidentCount24h: Number(input.incidentCount24h || livePanelData?.incident_count_24h || incidents.length || 0),
      activeIncidents: incidents.length,
      criticalIncidents: incidents.filter((incident) => lower(incident.severity) === "critical").length,
      highIncidents: incidents.filter((incident) => lower(incident.severity) === "high").length,
      reviewItems: asArray(livePanelData?.summary?.review_items).slice(0, MAX_ITEMS),
    },
    sourceHealth: {
      telemetryOnline: input.telemetryOnline,
      fetchError: input.fetchError || null,
      counts: sourceCounts,
      sources,
    },
    scan: {
      state: input.aiSpmState?.loading ? "ai_spm_loading" : input.agentStatus || "monitoring",
      recentResult: scanResult,
    },
    panelSummary: summarizePanel(activePanelId, panels?.[activePanelId]),
    aiSpm: {
      loading: Boolean(input.aiSpmState?.loading),
      demoMode: Boolean(input.aiSpmState?.demoMode),
      assetCount: input.aiSpmState?.summary?.asset_count ?? input.aiSpmState?.inventory?.asset_count ?? null,
      findingCount: asArray(input.aiSpmState?.findings).length,
      criticalFindings: asArray(input.aiSpmState?.findings).filter((finding) => lower(finding.severity) === "critical").length,
      latestFinding: compactObject(asArray(input.aiSpmState?.findings)[0]),
      narrativeStatus: input.aiSpmState?.narrative?.status || null,
      actionMessage: input.aiSpmState?.actionMessage || null,
    },
    securityAdmin: {
      tenant: compactObject(input.securityAdminState?.tenantContext),
      denialCount: asArray(input.securityAdminState?.authDenials).length,
      recentDenials: asArray(input.securityAdminState?.authDenials).slice(0, MAX_ITEMS).map((item) => compactObject(item)),
      quotaStatus: compactObject(input.securityAdminState?.quotaStatus),
      complianceStatus: compactObject(input.securityAdminState?.complianceStatus),
      dataUnavailable: Boolean(input.securityAdminState?.dataUnavailable),
    },
    audit: {
      deniedEvents: asArray(monitoringContext.audit?.deniedEvents).slice(0, MAX_ITEMS).map((item) => compactObject(item)),
      totalDenied: monitoringContext.audit?.totalDenied ?? null,
      error: monitoringContext.audit?.error || null,
    },
    operationalLoop: compactObject(input.operationalLoop),
    policy: {
      policyCount: asArray(input.policyChangeState?.policies).length,
      recentChanges: asArray(input.policyChangeState?.history).slice(0, MAX_ITEMS).map((item) => compactObject(item)),
      loading: Boolean(input.policyChangeState?.loading),
      error: input.policyChangeState?.error || null,
    },
    governance: {
      autonomyMode: input.autonomyMode || null,
      availableActions: availableActions.slice(0, MAX_ITEMS),
      pendingApprovals: asArray(input.approvalQueue).slice(0, MAX_ITEMS).map((item) => compactObject(item)),
      approvalRequiredCount: availableActions.filter((action) => action.approvalRequired).length,
      decisionHistory: decisionHistory.slice(0, MAX_ITEMS),
    },
    evidence: {
      latest: latestEvidence,
    },
    incidents: incidents.slice(0, MAX_ITEMS).map((incident) => compactObject(incident)),
    overview: compactObject(input.overviewReport),
    events: {
      recentFeed: [...asArray(livePanelData?.feed), ...asArray(input.liveFeed)].slice(-MAX_ITEMS),
      recentToasts: asArray(input.toasts).slice(-MAX_ITEMS).map((toast) => compactObject(toast)),
    },
    flags: {
      mockData: demoData,
      demoData,
      staleData,
      unavailableData,
    },
  };
}

export function buildRealtimePlatformContextResult(input = {}) {
  return JSON.stringify(buildRealtimePlatformContext(input));
}

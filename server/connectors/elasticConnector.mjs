// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import { getElasticCredentials, elasticHttpRequest } from "./elasticAuthStore.mjs";

function now() {
  return new Date().toISOString();
}

const SECURITY_INDEX_PATTERNS = [/security/i, /siem/i, /alerts/i, /logs/i];

function isSecurityIndex(name) {
  return SECURITY_INDEX_PATTERNS.some((p) => p.test(name));
}

function tlsOpts(creds) {
  return { rejectUnauthorized: creds.tls_reject_unauthorized !== false };
}

async function fetchClusterHealth(creds) {
  const resp = await elasticHttpRequest(`${creds.elastic_url}/_cluster/health`, {
    headers: { Authorization: `ApiKey ${creds.api_key}` },
    ...tlsOpts(creds),
  });
  return resp.status === 200 ? resp.body : null;
}

async function fetchSecurityAlerts(creds) {
  const kibanaUrl = creds.kibana_url || creds.elastic_url;
  const body = JSON.stringify({
    query: { range: { "@timestamp": { gte: "now-7d" } } },
    size: 50,
    sort: [{ "@timestamp": { order: "desc" } }],
  });
  try {
    const resp = await elasticHttpRequest(`${kibanaUrl}/api/detection_engine/signals/search`, {
      method: "POST",
      headers: {
        Authorization: `ApiKey ${creds.api_key}`,
        "Content-Type": "application/json",
        "kbn-xsrf": "true",
      },
      body,
      ...tlsOpts(creds),
    });
    if (resp.status === 200) return resp.body;
    return null;
  } catch {
    return null;
  }
}

async function fetchDetectionRules(creds) {
  const kibanaUrl = creds.kibana_url || creds.elastic_url;
  try {
    const resp = await elasticHttpRequest(
      `${kibanaUrl}/api/detection_engine/rules/_find?page=1&per_page=50`,
      {
        headers: {
          Authorization: `ApiKey ${creds.api_key}`,
          "kbn-xsrf": "true",
        },
        ...tlsOpts(creds),
      }
    );
    if (resp.status === 200) return resp.body;
    return null;
  } catch {
    return null;
  }
}

async function fetchIndexStats(creds) {
  try {
    const resp = await elasticHttpRequest(
      `${creds.elastic_url}/_cat/indices?format=json&h=index,status,docs.count,store.size`,
      { headers: { Authorization: `ApiKey ${creds.api_key}` }, ...tlsOpts(creds) }
    );
    if (resp.status === 200 && Array.isArray(resp.body)) {
      return resp.body.filter((idx) => isSecurityIndex(idx.index || ""));
    }
    return [];
  } catch {
    return [];
  }
}

function buildFindings(clusterHealth, alertsResult, rulesResult, securityIndices) {
  const findings = [];

  if (clusterHealth) {
    const status = clusterHealth.status;
    if (status === "red" || status === "yellow") {
      findings.push({
        id: "ELASTIC-001",
        title: `Cluster health is ${status.toUpperCase()}`,
        severity: status === "red" ? "high" : "medium",
        detail: `Cluster "${clusterHealth.cluster_name}" reported status ${status}. Active shards: ${clusterHealth.active_shards}, unassigned: ${clusterHealth.unassigned_shards}.`,
        detected_at: now(),
      });
    }
  }

  if (alertsResult) {
    const hits = alertsResult.hits?.hits || [];
    const critical = hits.filter((h) => {
      const sev = h._source?.kibana?.alert?.severity || h._source?.signal?.rule?.severity || "";
      return /critical|high/i.test(sev);
    });
    if (critical.length > 0) {
      findings.push({
        id: "ELASTIC-002",
        title: `${critical.length} critical/high security alert${critical.length !== 1 ? "s" : ""} in last 7 days`,
        severity: "critical",
        detail: `${critical.length} critical or high-severity alerts detected. Immediate triage recommended.`,
        detected_at: now(),
      });
    }
  }

  if (rulesResult) {
    const rules = rulesResult.data || [];
    const disabled = rules.filter((r) => r.enabled === false);
    if (disabled.length > 0) {
      findings.push({
        id: "ELASTIC-003",
        title: `${disabled.length} detection rule${disabled.length !== 1 ? "s" : ""} disabled`,
        severity: "medium",
        detail: `${disabled.length} of ${rules.length} detection rules are disabled, reducing threat coverage.`,
        detected_at: now(),
      });
    }
  }

  const emptyIndices = securityIndices.filter((idx) => !idx["docs.count"] || idx["docs.count"] === "0");
  if (emptyIndices.length > 0) {
    findings.push({
      id: "ELASTIC-004",
      title: `${emptyIndices.length} security index${emptyIndices.length !== 1 ? "es" : ""} with zero documents`,
      severity: "low",
      detail: `Indices with no documents may indicate missing log ingestion: ${emptyIndices.map((i) => i.index).join(", ")}`,
      detected_at: now(),
    });
  }

  return findings;
}

export async function scanElasticSecurity(tenantId = "default") {
  const creds = await getElasticCredentials(tenantId);
  if (!creds?.elastic_url || !creds?.api_key) {
    return {
      connector: "elastic",
      mode: "not_configured",
      scanned_at: now(),
      findings: [],
      message: "Elastic credentials not configured. Connect via the AI-SPM panel.",
    };
  }

  const [clusterHealth, alertsResult, rulesResult, securityIndices] = await Promise.all([
    fetchClusterHealth(creds),
    fetchSecurityAlerts(creds),
    fetchDetectionRules(creds),
    fetchIndexStats(creds),
  ]);

  const findings = buildFindings(clusterHealth, alertsResult, rulesResult, securityIndices);

  const totalAlerts = alertsResult?.hits?.total?.value ?? (alertsResult?.hits?.hits?.length ?? 0);
  const allRules = rulesResult?.data || [];
  const enabledRules = allRules.filter((r) => r.enabled !== false);

  return {
    connector: "elastic",
    mode: "elastic-api",
    scanned_at: now(),
    cluster_name: clusterHealth?.cluster_name || null,
    cluster_status: clusterHealth?.status || null,
    alert_count: totalAlerts,
    rule_count: allRules.length,
    rules_enabled: enabledRules.length,
    security_indices: securityIndices.length,
    findings,
  };
}

export async function getElasticAlerts(tenantId = "default") {
  const creds = await getElasticCredentials(tenantId);
  if (!creds?.elastic_url || !creds?.api_key) return { alerts: [], error: "not_configured" };
  const result = await fetchSecurityAlerts(creds);
  if (!result) return { alerts: [], error: "fetch_failed" };
  const hits = result.hits?.hits || [];
  const alerts = hits.map((h) => ({
    id: h._id,
    timestamp: h._source?.["@timestamp"] || null,
    rule_name: h._source?.kibana?.alert?.rule?.name || h._source?.signal?.rule?.name || "Unknown rule",
    severity: h._source?.kibana?.alert?.severity || h._source?.signal?.rule?.severity || "unknown",
    status: h._source?.kibana?.alert?.workflow_status || h._source?.signal?.status || "open",
    host: h._source?.host?.name || null,
    user: h._source?.user?.name || null,
  }));
  return { alerts, total: result.hits?.total?.value ?? alerts.length };
}

export async function getElasticRules(tenantId = "default") {
  const creds = await getElasticCredentials(tenantId);
  if (!creds?.elastic_url || !creds?.api_key) return { rules: [], error: "not_configured" };
  const result = await fetchDetectionRules(creds);
  if (!result) return { rules: [], error: "fetch_failed" };
  const rules = (result.data || []).map((r) => ({
    id: r.id,
    name: r.name,
    enabled: r.enabled,
    severity: r.severity,
    type: r.type,
    tags: r.tags || [],
  }));
  return { rules, total: result.total ?? rules.length };
}

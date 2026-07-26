// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import { getStoredVirusTotalApiKey, vtGet } from "./virustotalAuthStore.mjs";

function now() {
  return new Date().toISOString();
}

export function virustotalCredentialsPresent() {
  return Boolean(getStoredVirusTotalApiKey());
}

export async function enrichIocWithVirusTotal(ioc) {
  const apiKey = getStoredVirusTotalApiKey();
  if (!apiKey) return { ioc, enriched: false, reason: "not_configured" };

  let path;
  if (/^[0-9a-fA-F]{32,64}$/.test(ioc)) {
    path = `/api/v3/files/${ioc}`;
  } else if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ioc)) {
    path = `/api/v3/ip_addresses/${ioc}`;
  } else if (/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(ioc)) {
    const encoded = encodeURIComponent(Buffer.from(ioc).toString("base64").replace(/=+$/, ""));
    path = `/api/v3/domains/${ioc}`;
  } else {
    const encoded = Buffer.from(ioc).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
    path = `/api/v3/urls/${encoded}`;
  }

  try {
    const resp = await vtGet(apiKey, path);
    if (resp.status === 404) return { ioc, enriched: false, reason: "not_found" };
    if (resp.status !== 200) return { ioc, enriched: false, reason: `http_${resp.status}` };

    const attrs = resp.body?.data?.attributes || {};
    const stats = attrs.last_analysis_stats || {};
    const malicious = stats.malicious || 0;
    const suspicious = stats.suspicious || 0;
    const total = Object.values(stats).reduce((s, v) => s + (v || 0), 0);

    return {
      ioc,
      enriched: true,
      malicious,
      suspicious,
      total_engines: total,
      reputation: attrs.reputation ?? null,
      last_analysis_date: attrs.last_analysis_date
        ? new Date(attrs.last_analysis_date * 1000).toISOString()
        : null,
      tags: attrs.tags || [],
      threat_verdict: malicious > 2 ? "malicious" : malicious > 0 ? "suspicious" : "clean",
    };
  } catch (err) {
    return { ioc, enriched: false, reason: err.message };
  }
}

export async function scanVirusTotalFindings(iocs = []) {
  const apiKey = getStoredVirusTotalApiKey();
  if (!apiKey) {
    return {
      connector: "virustotal",
      mode: "not_configured",
      scanned_at: now(),
      findings: [],
      message: "VirusTotal credentials not configured. Connect via the AI-SPM panel.",
    };
  }

  if (iocs.length === 0) {
    return {
      connector: "virustotal",
      mode: "virustotal-api",
      scanned_at: now(),
      findings: [],
      message: "No IOCs provided for enrichment.",
    };
  }

  const results = await Promise.all(iocs.slice(0, 10).map((ioc) => enrichIocWithVirusTotal(ioc)));

  const findings = [];
  const maliciousIocs = results.filter((r) => r.threat_verdict === "malicious");
  const suspiciousIocs = results.filter((r) => r.threat_verdict === "suspicious");

  if (maliciousIocs.length > 0) {
    findings.push({
      id: "VT-001",
      severity: "critical",
      title: "Malicious IOCs detected",
      description: `${maliciousIocs.length} IOC(s) flagged as malicious by VirusTotal.`,
      affected: maliciousIocs.map((r) => r.ioc),
      count: maliciousIocs.length,
      source: "virustotal",
      discovered_at: now(),
    });
  }

  if (suspiciousIocs.length > 0) {
    findings.push({
      id: "VT-002",
      severity: "medium",
      title: "Suspicious IOCs detected",
      description: `${suspiciousIocs.length} IOC(s) flagged as suspicious by VirusTotal.`,
      affected: suspiciousIocs.map((r) => r.ioc),
      count: suspiciousIocs.length,
      source: "virustotal",
      discovered_at: now(),
    });
  }

  return {
    connector: "virustotal",
    mode: "virustotal-api",
    scanned_at: now(),
    enriched: results,
    findings,
  };
}

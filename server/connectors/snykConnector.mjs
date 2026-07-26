// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import https from "node:https";
import { getStoredSnykCredentials } from "./snykAuthStore.mjs";

function now() {
  return new Date().toISOString();
}

function snykRequest(path, token) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "api.snyk.io",
      path,
      method: "GET",
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/json",
      },
    };
    const req = https.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => {
        if (res.statusCode >= 400) {
          reject(new Error(`Snyk API ${res.statusCode}: ${body.slice(0, 200)}`));
          return;
        }
        try { resolve(JSON.parse(body)); } catch { resolve({}); }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

export function snykCredentialsPresent() {
  return Boolean(getStoredSnykCredentials());
}

export async function scanSnykFindings() {
  const creds = getStoredSnykCredentials();
  if (!creds) {
    return {
      connector: "snyk",
      mode: "not_configured",
      scanned_at: now(),
      findings: [],
      message: "Snyk credentials not configured. Connect via the AI-SPM panel.",
    };
  }

  const { apiToken, orgId } = creds;
  const findings = [];

  // Resolve org ID: use stored one or pull from REST orgs list
  let resolvedOrgId = orgId;
  if (!resolvedOrgId) {
    try {
      const orgsResp = await snykRequest("/rest/orgs?version=2024-01-23", apiToken);
      const orgs = orgsResp?.data || [];
      if (orgs.length > 0) resolvedOrgId = orgs[0]?.id;
    } catch (err) {
      console.warn("[Snyk] orgs fetch failed:", err.message);
    }
  }

  if (!resolvedOrgId) {
    return {
      connector: "snyk",
      mode: "snyk-api",
      scanned_at: now(),
      findings: [],
      message: "No Snyk org ID available. Provide orgId on connect or ensure your token has org access.",
    };
  }

  // Fetch projects
  let projects = [];
  try {
    const projectsResp = await snykRequest(`/v1/org/${resolvedOrgId}/projects`, apiToken);
    projects = projectsResp?.projects || [];
  } catch (err) {
    console.warn("[Snyk] projects fetch failed:", err.message);
  }

  // Fetch issues for first 5 projects to stay within quota
  const projectSample = projects.slice(0, 5);
  const issueResults = await Promise.all(
    projectSample.map(async (proj) => {
      try {
        const resp = await snykRequest(`/v1/org/${resolvedOrgId}/project/${proj.id}/issues`, apiToken);
        return { project: proj, issues: resp?.issues || {} };
      } catch (err) {
        console.warn(`[Snyk] issues fetch failed for project ${proj.id}:`, err.message);
        return { project: proj, issues: {} };
      }
    })
  );

  // Aggregate vulnerability counts
  let criticalCount = 0;
  let highCount = 0;
  const criticalProjects = [];
  const highProjects = [];

  for (const { project, issues } of issueResults) {
    const vulns = issues.vulnerabilities || [];
    const criticals = vulns.filter((v) => v.severity === "critical");
    const highs = vulns.filter((v) => v.severity === "high");
    criticalCount += criticals.length;
    highCount += highs.length;
    if (criticals.length > 0) criticalProjects.push(project.name || project.id);
    if (highs.length > 0) highProjects.push(project.name || project.id);
  }

  if (criticalCount > 0) {
    findings.push({
      id: "SNYK-001",
      severity: "critical",
      title: "Critical vulnerabilities found",
      description: `${criticalCount} critical severity vulnerability(ies) detected across scanned projects.`,
      affected: criticalProjects.slice(0, 10),
      count: criticalCount,
      source: "snyk",
      discovered_at: now(),
    });
  }

  if (highCount > 0) {
    findings.push({
      id: "SNYK-002",
      severity: "high",
      title: "High vulnerabilities found",
      description: `${highCount} high severity vulnerability(ies) detected across scanned projects.`,
      affected: highProjects.slice(0, 10),
      count: highCount,
      source: "snyk",
      discovered_at: now(),
    });
  }

  // SNYK-003: projects with no recent scan (lastTestedDate older than 30 days or missing)
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const staleProjects = projects.filter((p) => {
    if (!p.lastTestedDate) return true;
    return new Date(p.lastTestedDate).getTime() < thirtyDaysAgo;
  });

  if (staleProjects.length > 0) {
    findings.push({
      id: "SNYK-003",
      severity: "low",
      title: "Projects with no recent scan",
      description: `${staleProjects.length} project(s) have not been scanned in the last 30 days or have never been scanned.`,
      affected: staleProjects.slice(0, 10).map((p) => p.name || p.id),
      count: staleProjects.length,
      source: "snyk",
      discovered_at: now(),
    });
  }

  return {
    connector: "snyk",
    mode: "snyk-api",
    scanned_at: now(),
    org_id: resolvedOrgId,
    counts: {
      projects: projects.length,
      projects_sampled: projectSample.length,
      critical_vulns: criticalCount,
      high_vulns: highCount,
      stale_projects: staleProjects.length,
    },
    findings,
  };
}

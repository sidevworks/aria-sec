// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import https from "node:https";
import { getStoredOktaCredentials } from "./oktaAuthStore.mjs";

function now() {
  return new Date().toISOString();
}

function oktaGet(domain, path, token) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: domain,
      path,
      method: "GET",
      headers: {
        Authorization: `SSWS ${token}`,
        Accept: "application/json",
      },
    };
    const req = https.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => {
        if (res.statusCode >= 400) {
          reject(new Error(`Okta API ${res.statusCode}: ${body.slice(0, 200)}`));
          return;
        }
        try { resolve(JSON.parse(body)); } catch { resolve([]); }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

export function oktaCredentialsPresent() {
  return Boolean(getStoredOktaCredentials());
}

export async function scanOktaFindings() {
  const creds = getStoredOktaCredentials();
  if (!creds) {
    return {
      connector: "okta",
      mode: "not_configured",
      scanned_at: now(),
      findings: [],
      message: "Okta credentials not configured. Connect via the AI-SPM panel.",
    };
  }

  const { apiToken, domain } = creds;
  const findings = [];

  // Fetch users, apps, groups, policies in parallel
  const [users, apps, groups, policies] = await Promise.all([
    oktaGet(domain, "/api/v1/users?limit=200", apiToken).catch((err) => {
      console.warn("[Okta] users fetch failed:", err.message);
      return [];
    }),
    oktaGet(domain, "/api/v1/apps?limit=100", apiToken).catch((err) => {
      console.warn("[Okta] apps fetch failed:", err.message);
      return [];
    }),
    oktaGet(domain, "/api/v1/groups?limit=100", apiToken).catch((err) => {
      console.warn("[Okta] groups fetch failed:", err.message);
      return [];
    }),
    oktaGet(domain, "/api/v1/policies?type=PASSWORD", apiToken).catch((err) => {
      console.warn("[Okta] policies fetch failed:", err.message);
      return [];
    }),
  ]);

  // OKTA-001: users with MFA not enrolled
  const mfaDisabledUsers = (Array.isArray(users) ? users : []).filter((u) => {
    if (u.profile?.mfaEnabled === false) return true;
    // factor_count of 0 also indicates no MFA
    if (typeof u.factor_count === "number" && u.factor_count === 0) return true;
    return false;
  });

  if (mfaDisabledUsers.length > 0) {
    findings.push({
      id: "OKTA-001",
      severity: "high",
      title: "Users with MFA not enrolled",
      description: `${mfaDisabledUsers.length} user(s) have no MFA factor enrolled.`,
      affected: mfaDisabledUsers.slice(0, 10).map((u) => u.profile?.login || u.id),
      count: mfaDisabledUsers.length,
      source: "okta",
      discovered_at: now(),
    });
  }

  // OKTA-002: apps with no MFA policy (active apps without sign-on policy indication)
  const activeApps = (Array.isArray(apps) ? apps : []).filter((a) => a.status === "ACTIVE");
  const appsNoMfa = activeApps.filter((a) => {
    const signOn = a.settings?.signOn || {};
    return !signOn.requireUserVerification && !signOn.mfa;
  });

  if (appsNoMfa.length > 0) {
    findings.push({
      id: "OKTA-002",
      severity: "medium",
      title: "Apps with no MFA policy",
      description: `${appsNoMfa.length} active app(s) have no MFA requirement configured.`,
      affected: appsNoMfa.slice(0, 10).map((a) => a.label || a.id),
      count: appsNoMfa.length,
      source: "okta",
      discovered_at: now(),
    });
  }

  // OKTA-003: password policy below minimum strength
  const weakPolicies = (Array.isArray(policies) ? policies : []).filter((p) => {
    const complexity = p.settings?.password?.complexity || {};
    const minLength = complexity.minLength || 0;
    const minLower = complexity.minLowerCase || 0;
    const minUpper = complexity.minUpperCase || 0;
    const minNumber = complexity.minNumber || 0;
    const minSymbol = complexity.minSymbol || 0;
    // Flag policies with weak minimum length or no complexity requirements
    return minLength < 12 || (minLower + minUpper + minNumber + minSymbol) < 2;
  });

  if (weakPolicies.length > 0) {
    findings.push({
      id: "OKTA-003",
      severity: "medium",
      title: "Password policy below minimum strength",
      description: `${weakPolicies.length} password policy(ies) do not meet minimum complexity requirements (min length 12, 2+ character classes).`,
      affected: weakPolicies.slice(0, 10).map((p) => p.name || p.id),
      count: weakPolicies.length,
      source: "okta",
      discovered_at: now(),
    });
  }

  return {
    connector: "okta",
    mode: "okta-api",
    scanned_at: now(),
    domain,
    counts: {
      users: Array.isArray(users) ? users.length : 0,
      apps: Array.isArray(apps) ? apps.length : 0,
      groups: Array.isArray(groups) ? groups.length : 0,
      policies: Array.isArray(policies) ? policies.length : 0,
    },
    findings,
  };
}

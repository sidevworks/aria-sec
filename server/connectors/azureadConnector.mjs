// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import { getStoredAzureAdCredentials, fetchAzureAccessToken } from "./azureadAuthStore.mjs";

function now() {
  return new Date().toISOString();
}

async function graphGet(accessToken, path) {
  const { request } = await import("node:https");
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "graph.microsoft.com",
      path,
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    };
    const req = request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error(`Non-JSON response from Graph API (${path})`)); }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

export async function discoverAzureAdAssets() {
  const creds = getStoredAzureAdCredentials();
  if (!creds) {
    return {
      connector: "azuread",
      mode: "not_configured",
      scanned_at: now(),
      assets: [],
      findings: [],
      message: "Azure AD credentials not configured. Connect via the AI-SPM panel.",
    };
  }

  let accessToken;
  try {
    accessToken = await fetchAzureAccessToken(creds.clientId, creds.clientSecret, creds.tenantId);
  } catch (err) {
    return {
      connector: "azuread",
      mode: "error",
      scanned_at: now(),
      assets: [],
      findings: [],
      message: `Azure AD token fetch failed: ${err.message}`,
    };
  }

  const [usersResp, appsResp, spResp, caResp] = await Promise.allSettled([
    graphGet(accessToken, "/v1.0/users?$top=100&$select=id,displayName,userPrincipalName,accountEnabled,createdDateTime"),
    graphGet(accessToken, "/v1.0/applications?$top=50&$select=id,displayName,createdDateTime,signInAudience"),
    graphGet(accessToken, "/v1.0/servicePrincipals?$top=50&$select=id,displayName,appId,enabled"),
    graphGet(accessToken, "/v1.0/identity/conditionalAccess/policies?$top=50"),
  ]);

  const users = usersResp.status === "fulfilled" ? (usersResp.value.value || []) : [];
  const apps = appsResp.status === "fulfilled" ? (appsResp.value.value || []) : [];
  const servicePrincipals = spResp.status === "fulfilled" ? (spResp.value.value || []) : [];
  const caPolicies = caResp.status === "fulfilled" ? (caResp.value.value || []) : [];

  const assets = [];
  const findings = [];

  for (const user of users) {
    assets.push({
      id: `azuread:user:${user.id}`,
      name: user.displayName || user.userPrincipalName,
      type: "identity",
      subtype: "azuread-user",
      source: "azure-ad",
      provider: "Microsoft Azure AD",
      accountEnabled: user.accountEnabled,
      userPrincipalName: user.userPrincipalName,
      createdDateTime: user.createdDateTime,
      sensitivity: user.accountEnabled ? "normal" : "low",
      discovered_at: now(),
    });
  }

  for (const app of apps) {
    assets.push({
      id: `azuread:app:${app.id}`,
      name: app.displayName || app.id,
      type: "application",
      subtype: "azuread-application",
      source: "azure-ad",
      provider: "Microsoft Azure AD",
      signInAudience: app.signInAudience,
      createdDateTime: app.createdDateTime,
      sensitivity: app.signInAudience === "AzureADandPersonalMicrosoftAccount" ? "sensitive" : "normal",
      discovered_at: now(),
    });

    if (app.signInAudience === "AzureADandPersonalMicrosoftAccount") {
      findings.push({
        id: `AZUREAD-002:${app.id}`,
        rule_id: "AZUREAD-002",
        severity: "medium",
        title: "App allows personal Microsoft accounts (overly permissive sign-in audience)",
        description: `Application "${app.displayName}" has signInAudience=AzureADandPersonalMicrosoftAccount, allowing external personal accounts.`,
        asset_id: `azuread:app:${app.id}`,
        asset_name: app.displayName,
        discovered_at: now(),
      });
    }
  }

  const disabledUsers = users.filter((u) => !u.accountEnabled);
  if (disabledUsers.length > 0) {
    findings.push({
      id: "AZUREAD-001",
      rule_id: "AZUREAD-001",
      severity: "medium",
      title: "Disabled accounts present in Azure AD",
      description: `${disabledUsers.length} disabled user account(s) detected. Verify they have no active app assignments.`,
      asset_count: disabledUsers.length,
      discovered_at: now(),
    });
  }

  if (caPolicies.length === 0) {
    findings.push({
      id: "AZUREAD-003",
      rule_id: "AZUREAD-003",
      severity: "high",
      title: "No Conditional Access policies found",
      description: "No Conditional Access policies are configured in this Azure AD tenant. Access controls may be insufficient.",
      discovered_at: now(),
    });
  }

  for (const sp of servicePrincipals) {
    assets.push({
      id: `azuread:sp:${sp.id}`,
      name: sp.displayName || sp.id,
      type: "service_principal",
      subtype: "azuread-service-principal",
      source: "azure-ad",
      provider: "Microsoft Azure AD",
      appId: sp.appId,
      enabled: sp.enabled,
      sensitivity: "normal",
      discovered_at: now(),
    });
  }

  if (servicePrincipals.length > 0) {
    findings.push({
      id: "AZUREAD-004",
      rule_id: "AZUREAD-004",
      severity: "low",
      title: "Service principals detected — verify recent sign-in activity",
      description: `${servicePrincipals.length} service principal(s) found. Audit for stale or unused identities.`,
      asset_count: servicePrincipals.length,
      discovered_at: now(),
    });
  }

  return {
    connector: "azuread",
    mode: "graph-api",
    scanned_at: now(),
    tenant_id: creds.tenantId,
    assets,
    findings,
    counts: {
      users: users.length,
      apps: apps.length,
      servicePrincipals: servicePrincipals.length,
      conditionalAccessPolicies: caPolicies.length,
    },
  };
}

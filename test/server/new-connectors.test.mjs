// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

/**
 * Tests for the 5 new connectors: Okta, Snyk, Azure AD, VirusTotal, Elastic.
 *
 * Coverage:
 * - AuthZ: unauthenticated → 401, viewer/analyst can read, write requires admin+
 * - Auth store unit tests: status/credentials return correct shapes when unconfigured
 * - Connector scan: returns mode="not_configured" when credentials absent
 */
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

process.env.ARIA_AI_SPM_DISABLE_GH_AUTO = "1";
delete process.env.ARIA_AUTHZ_ALLOW_LOCAL_BYPASS;

// Clear any credential env vars that might bleed from CI environment
for (const key of [
  "OKTA_API_TOKEN", "OKTA_DOMAIN",
  "SNYK_TOKEN", "SNYK_ORG_ID",
  "AZURE_CLIENT_ID", "AZURE_CLIENT_SECRET", "AZURE_TENANT_ID",
  "VIRUSTOTAL_API_KEY",
]) {
  delete process.env[key];
}

import { handleAriaRequest } from "../../server/index.mjs";
import { getOktaConnectorStatus, getStoredOktaCredentials } from "../../server/connectors/oktaAuthStore.mjs";
import { getSnykConnectorStatus, getStoredSnykCredentials } from "../../server/connectors/snykAuthStore.mjs";
import { getAzureAdConnectorStatus, getStoredAzureAdCredentials } from "../../server/connectors/azureadAuthStore.mjs";
import { getVirusTotalConnectorStatus, getStoredVirusTotalApiKey } from "../../server/connectors/virustotalAuthStore.mjs";
import { getElasticConnectorStatus } from "../../server/connectors/elasticAuthStore.mjs";
import { scanOktaFindings } from "../../server/connectors/oktaConnector.mjs";
import { scanSnykFindings } from "../../server/connectors/snykConnector.mjs";
import { scanVirusTotalFindings } from "../../server/connectors/virustotalConnector.mjs";
import { scanElasticSecurity } from "../../server/connectors/elasticConnector.mjs";
import { discoverAzureAdAssets } from "../../server/connectors/azureadConnector.mjs";

// ── HTTP helpers ──────────────────────────────────────────────────────────────

function createReq({ method = "GET", url = "/", body, headers = {} } = {}) {
  const req = new EventEmitter();
  req.method = method;
  req.url = url;
  req.headers = { "content-type": "application/json", ...headers };
  req.socket = { remoteAddress: "127.0.0.1" };
  req[Symbol.asyncIterator] = async function* () {
    if (body !== undefined) yield Buffer.from(JSON.stringify(body));
  };
  return req;
}

function createRes() {
  const res = {
    statusCode: 0,
    headers: {},
    payload: "",
    writeHead(statusCode, headers) { this.statusCode = statusCode; if (headers) Object.assign(this.headers, headers); },
    setHeader(name, value) { this.headers[name] = value; },
    getHeader(name) { return this.headers[name]; },
    end(payload = "") { this.payload = payload; },
    json() { return JSON.parse(this.payload || "{}"); },
  };
  return res;
}

async function req(options) {
  const r = createReq(options);
  const res = createRes();
  await handleAriaRequest(r, res);
  return res;
}

const OWNER   = { "x-tenant-id": "t1", "x-user-id": "u1", "x-role": "owner"   };
const ADMIN   = { "x-tenant-id": "t1", "x-user-id": "u1", "x-role": "admin"   };
const ANALYST = { "x-tenant-id": "t1", "x-user-id": "u1", "x-role": "analyst" };
const VIEWER  = { "x-tenant-id": "t1", "x-user-id": "u1", "x-role": "viewer"  };

// ── AuthZ: unauthenticated → 401 ─────────────────────────────────────────────

const AUTH_REQUIRED_ROUTES = [
  ["GET",  "/api/connectors/okta/status"],
  ["GET",  "/api/connectors/okta/health"],
  ["GET",  "/api/connectors/okta/scan"],
  ["POST", "/api/connectors/okta/connect"],
  ["POST", "/api/connectors/okta/disconnect"],
  ["GET",  "/api/connectors/snyk/status"],
  ["GET",  "/api/connectors/snyk/health"],
  ["GET",  "/api/connectors/snyk/scan"],
  ["POST", "/api/connectors/snyk/connect"],
  ["POST", "/api/connectors/snyk/disconnect"],
  ["GET",  "/api/connectors/azuread/status"],
  ["GET",  "/api/connectors/azuread/health"],
  ["GET",  "/api/connectors/azuread/scan"],
  ["POST", "/api/connectors/azuread/connect"],
  ["POST", "/api/connectors/azuread/disconnect"],
  ["GET",  "/api/connectors/virustotal/status"],
  ["GET",  "/api/connectors/virustotal/health"],
  ["POST", "/api/connectors/virustotal/connect"],
  ["POST", "/api/connectors/virustotal/disconnect"],
  ["POST", "/api/connectors/virustotal/enrich"],
  ["GET",  "/api/connectors/elastic/status"],
  ["GET",  "/api/connectors/elastic/health"],
  ["GET",  "/api/connectors/elastic/scan"],
  ["GET",  "/api/connectors/elastic/alerts"],
  ["GET",  "/api/connectors/elastic/rules"],
  ["POST", "/api/connectors/elastic/connect"],
  ["POST", "/api/connectors/elastic/disconnect"],
];

for (const [method, url] of AUTH_REQUIRED_ROUTES) {
  test(`${method} ${url} returns 401 without auth headers`, async () => {
    const res = await req({ method, url, body: {} });
    assert.equal(res.statusCode, 401, `Expected 401 but got ${res.statusCode} for ${method} ${url}`);
  });
}

// ── AuthZ: read routes succeed for viewer/analyst ─────────────────────────────

const READ_ROUTES = [
  "/api/connectors/okta/status",
  "/api/connectors/snyk/status",
  "/api/connectors/azuread/status",
  "/api/connectors/virustotal/status",
  "/api/connectors/elastic/status",
];

for (const url of READ_ROUTES) {
  test(`GET ${url} succeeds for viewer role`, async () => {
    const res = await req({ method: "GET", url, headers: VIEWER });
    assert.ok(res.statusCode < 400, `Expected <400 but got ${res.statusCode} for viewer on ${url}`);
  });

  test(`GET ${url} succeeds for analyst role`, async () => {
    const res = await req({ method: "GET", url, headers: ANALYST });
    assert.ok(res.statusCode < 400, `Expected <400 but got ${res.statusCode} for analyst on ${url}`);
  });
}

// ── AuthZ: write routes denied for analyst/viewer ────────────────────────────

const WRITE_ROUTES = [
  "/api/connectors/okta/connect",
  "/api/connectors/okta/disconnect",
  "/api/connectors/snyk/connect",
  "/api/connectors/snyk/disconnect",
  "/api/connectors/azuread/connect",
  "/api/connectors/azuread/disconnect",
  "/api/connectors/virustotal/connect",
  "/api/connectors/virustotal/disconnect",
  "/api/connectors/elastic/connect",
  "/api/connectors/elastic/disconnect",
];

for (const url of WRITE_ROUTES) {
  test(`POST ${url} returns 403 for analyst role`, async () => {
    const res = await req({ method: "POST", url, body: {}, headers: ANALYST });
    assert.equal(res.statusCode, 403, `Expected 403 but got ${res.statusCode} for analyst on ${url}`);
  });

  test(`POST ${url} returns 403 for viewer role`, async () => {
    const res = await req({ method: "POST", url, body: {}, headers: VIEWER });
    assert.equal(res.statusCode, 403, `Expected 403 but got ${res.statusCode} for viewer on ${url}`);
  });
}

// ── AuthZ: admin/owner can call disconnect (idempotent — no creds to clear) ──

const DISCONNECT_ROUTES = [
  "/api/connectors/okta/disconnect",
  "/api/connectors/snyk/disconnect",
  "/api/connectors/azuread/disconnect",
  "/api/connectors/virustotal/disconnect",
  "/api/connectors/elastic/disconnect",
];

for (const url of DISCONNECT_ROUTES) {
  test(`POST ${url} succeeds for admin role`, async () => {
    const res = await req({ method: "POST", url, body: {}, headers: ADMIN });
    assert.ok(res.statusCode < 400, `Expected <400 but got ${res.statusCode} for admin on ${url}`);
  });

  test(`POST ${url} succeeds for owner role`, async () => {
    const res = await req({ method: "POST", url, body: {}, headers: OWNER });
    assert.ok(res.statusCode < 400, `Expected <400 but got ${res.statusCode} for owner on ${url}`);
  });
}

// ── Auth store unit tests: unconfigured state ─────────────────────────────────

test("getOktaConnectorStatus returns connected:false when no credentials", () => {
  const { connector } = getOktaConnectorStatus();
  assert.equal(connector.id, "okta");
  assert.equal(connector.connected, false);
  assert.equal(connector.auth_mode, "none");
  assert.equal(connector.domain, null);
});

test("getStoredOktaCredentials returns null when no credentials", () => {
  assert.equal(getStoredOktaCredentials(), null);
});

test("getSnykConnectorStatus returns connected:false when no credentials", () => {
  const { connector } = getSnykConnectorStatus();
  assert.equal(connector.id, "snyk");
  assert.equal(connector.connected, false);
  assert.equal(connector.auth_mode, "none");
});

test("getStoredSnykCredentials returns null when no credentials", () => {
  assert.equal(getStoredSnykCredentials(), null);
});

test("getAzureAdConnectorStatus returns connected:false when no credentials", () => {
  const { connector } = getAzureAdConnectorStatus();
  assert.equal(connector.id, "azuread");
  assert.equal(connector.connected, false);
  assert.equal(connector.tenant_id, null);
});

test("getStoredAzureAdCredentials returns null when no credentials", () => {
  assert.equal(getStoredAzureAdCredentials(), null);
});

test("getVirusTotalConnectorStatus returns connected:false when no credentials", () => {
  const { connector } = getVirusTotalConnectorStatus();
  assert.equal(connector.id, "virustotal");
  assert.equal(connector.connected, false);
  assert.equal(connector.auth_mode, "none");
});

test("getStoredVirusTotalApiKey returns null when no credentials", () => {
  assert.equal(getStoredVirusTotalApiKey(), null);
});

test("getElasticConnectorStatus returns connected:false when no credentials", async () => {
  const { connector } = await getElasticConnectorStatus();
  assert.equal(connector.id, "elastic");
  assert.equal(connector.connected, false);
  assert.equal(connector.elastic_url, null);
});

// ── Env-var credential fallback (read-only, no store write) ──────────────────

test("getOktaConnectorStatus reflects OKTA_API_TOKEN env var when set", () => {
  process.env.OKTA_API_TOKEN = "test-token-12345678";
  process.env.OKTA_DOMAIN = "test.okta.com";
  const { connector } = getOktaConnectorStatus();
  assert.equal(connector.connected, true);
  assert.equal(connector.auth_mode, "env");
  assert.equal(connector.domain, "test.okta.com");
  delete process.env.OKTA_API_TOKEN;
  delete process.env.OKTA_DOMAIN;
});

test("getSnykConnectorStatus reflects SNYK_TOKEN env var when set", () => {
  process.env.SNYK_TOKEN = "snyk-token-test-1234";
  const { connector } = getSnykConnectorStatus();
  assert.equal(connector.connected, true);
  assert.equal(connector.auth_mode, "env");
  delete process.env.SNYK_TOKEN;
});

test("getAzureAdConnectorStatus reflects AZURE_CLIENT_ID env var when set", () => {
  process.env.AZURE_CLIENT_ID = "azure-client-test";
  process.env.AZURE_CLIENT_SECRET = "secret";
  process.env.AZURE_TENANT_ID = "tenant-id-test";
  const { connector } = getAzureAdConnectorStatus();
  assert.equal(connector.connected, true);
  assert.equal(connector.auth_mode, "env");
  delete process.env.AZURE_CLIENT_ID;
  delete process.env.AZURE_CLIENT_SECRET;
  delete process.env.AZURE_TENANT_ID;
});

test("getVirusTotalConnectorStatus reflects VIRUSTOTAL_API_KEY env var when set", () => {
  process.env.VIRUSTOTAL_API_KEY = "vt-key-test-abcdef";
  const { connector } = getVirusTotalConnectorStatus();
  assert.equal(connector.connected, true);
  assert.equal(connector.auth_mode, "env");
  delete process.env.VIRUSTOTAL_API_KEY;
});

// ── Connector scan: not_configured when no credentials ───────────────────────

test("scanOktaFindings returns mode=not_configured when no credentials", async () => {
  const result = await scanOktaFindings();
  assert.equal(result.connector, "okta");
  assert.equal(result.mode, "not_configured");
  assert.deepEqual(result.findings, []);
});

test("scanSnykFindings returns mode=not_configured when no credentials", async () => {
  const result = await scanSnykFindings();
  assert.equal(result.connector, "snyk");
  assert.equal(result.mode, "not_configured");
  assert.deepEqual(result.findings, []);
});

test("discoverAzureAdAssets returns mode=not_configured when no credentials", async () => {
  const result = await discoverAzureAdAssets();
  assert.equal(result.connector, "azuread");
  assert.equal(result.mode, "not_configured");
  assert.deepEqual(result.findings, []);
});

test("scanVirusTotalFindings returns mode=not_configured when no credentials", async () => {
  const result = await scanVirusTotalFindings(["8.8.8.8"]);
  assert.equal(result.connector, "virustotal");
  assert.equal(result.mode, "not_configured");
  assert.deepEqual(result.findings, []);
});

test("scanElasticSecurity returns mode=not_configured when no credentials", async () => {
  const result = await scanElasticSecurity();
  assert.equal(result.connector, "elastic");
  assert.equal(result.mode, "not_configured");
  assert.deepEqual(result.findings, []);
});

// ── HTTP scan routes: not_configured response via API ────────────────────────

test("GET /api/connectors/okta/scan returns 200 with mode=not_configured", async () => {
  const res = await req({ method: "GET", url: "/api/connectors/okta/scan", headers: VIEWER });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().mode, "not_configured");
});

test("GET /api/connectors/snyk/scan returns 200 with mode=not_configured", async () => {
  const res = await req({ method: "GET", url: "/api/connectors/snyk/scan", headers: VIEWER });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().mode, "not_configured");
});

test("GET /api/connectors/azuread/scan returns 200 with mode=not_configured", async () => {
  const res = await req({ method: "GET", url: "/api/connectors/azuread/scan", headers: VIEWER });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().mode, "not_configured");
});

test("GET /api/connectors/elastic/scan returns 200 with mode=not_configured", async () => {
  const res = await req({ method: "GET", url: "/api/connectors/elastic/scan", headers: VIEWER });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().mode, "not_configured");
});

// ── POST connect with missing required fields returns 400 ─────────────────────

test("POST /api/connectors/okta/connect with empty body returns 400", async () => {
  const res = await req({ method: "POST", url: "/api/connectors/okta/connect", body: {}, headers: ADMIN });
  assert.equal(res.statusCode, 400);
  assert.ok(res.json().error, "Expected error message in response");
});

test("POST /api/connectors/snyk/connect with empty body returns 400", async () => {
  const res = await req({ method: "POST", url: "/api/connectors/snyk/connect", body: {}, headers: ADMIN });
  assert.equal(res.statusCode, 400);
  assert.ok(res.json().error);
});

test("POST /api/connectors/azuread/connect with missing fields returns 400", async () => {
  const res = await req({
    method: "POST",
    url: "/api/connectors/azuread/connect",
    body: { clientId: "only-one-field" },
    headers: ADMIN,
  });
  assert.equal(res.statusCode, 400);
  assert.ok(res.json().error);
});

test("POST /api/connectors/virustotal/connect with empty body returns 400", async () => {
  const res = await req({ method: "POST", url: "/api/connectors/virustotal/connect", body: {}, headers: ADMIN });
  assert.equal(res.statusCode, 400);
  assert.ok(res.json().error);
});

test("POST /api/connectors/elastic/connect with missing url returns 400", async () => {
  const res = await req({
    method: "POST",
    url: "/api/connectors/elastic/connect",
    body: { apiKey: "key-only-no-url" },
    headers: ADMIN,
  });
  assert.equal(res.statusCode, 400);
  assert.ok(res.json().error);
});

// ── Status response shape validation ─────────────────────────────────────────

test("GET /api/connectors/okta/status returns correct shape", async () => {
  const res = await req({ method: "GET", url: "/api/connectors/okta/status", headers: VIEWER });
  assert.equal(res.statusCode, 200);
  const { connector } = res.json();
  assert.equal(typeof connector, "object");
  assert.equal(connector.id, "okta");
  assert.equal(typeof connector.connected, "boolean");
  assert.ok("auth_mode" in connector);
});

test("GET /api/connectors/snyk/status returns correct shape", async () => {
  const res = await req({ method: "GET", url: "/api/connectors/snyk/status", headers: VIEWER });
  const { connector } = res.json();
  assert.equal(connector.id, "snyk");
  assert.equal(typeof connector.connected, "boolean");
});

test("GET /api/connectors/azuread/status returns correct shape", async () => {
  const res = await req({ method: "GET", url: "/api/connectors/azuread/status", headers: VIEWER });
  const { connector } = res.json();
  assert.equal(connector.id, "azuread");
  assert.ok("tenant_id" in connector);
});

test("GET /api/connectors/virustotal/status returns correct shape", async () => {
  const res = await req({ method: "GET", url: "/api/connectors/virustotal/status", headers: VIEWER });
  const { connector } = res.json();
  assert.equal(connector.id, "virustotal");
  assert.ok("key_hint" in connector);
});

test("GET /api/connectors/elastic/status returns correct shape", async () => {
  const res = await req({ method: "GET", url: "/api/connectors/elastic/status", headers: VIEWER });
  const { connector } = res.json();
  assert.equal(connector.id, "elastic");
  assert.ok("elastic_url" in connector);
  assert.ok("cluster_status" in connector);
});

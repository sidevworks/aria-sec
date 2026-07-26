// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { scanLocalRepository } from "../../server/connectors/githubConnector.mjs";
import { evaluateAiSpmRisks } from "../../server/aiRiskEngine.mjs";
import { generateAttackNarrative } from "../../server/attackNarrative.mjs";
import {
  findAiSpmAttackPathCandidates,
  getAiSpmGraphStorePath,
  getAiSpmNodeNeighbors,
  getAiSpmRepoRiskGraphSummary,
  persistAiSpmGraphFromState,
} from "../../server/aiSpmGraphStore.mjs";
import { scanAiSpm } from "../../server/aiSpmInventory.mjs";
import { getAuditLogPath, readAuditEvents } from "../../server/auditLog.mjs";
import { handleAriaRequest } from "../../server/index.mjs";
import { resetQuotaGuardState } from "../../server/quotaGuard.mjs";

process.env.ARIA_AI_SPM_DISABLE_GH_AUTO = "1";

const DEFAULT_AUTH_HEADERS = {
  "x-tenant-id": "test-tenant",
  "x-user-id": "test-user",
  "x-role": "admin",
};

function createReq({ method = "GET", url = "/", body, headers = {} } = {}) {
  const req = new EventEmitter();
  req.method = method;
  req.url = url;
  req.headers = { ...DEFAULT_AUTH_HEADERS, ...headers };
  // Authz trusts identity headers from loopback by default in tests.
  req.socket = { remoteAddress: "127.0.0.1" };
  req[Symbol.asyncIterator] = async function* iterator() {
    if (body !== undefined) {
      yield Buffer.from(JSON.stringify(body));
    }
  };
  return req;
}

function createRes() {
  return {
    statusCode: 0,
    headers: {},
    payload: "",
    writeHead(statusCode, headers) {
      this.statusCode = statusCode;
      this.headers = headers;
    },
    setHeader(name, value) { this.headers[name] = value; },
    getHeader(name) { return this.headers[name]; },
    end(payload = "") {
      this.payload = payload;
    },
    json() {
      return JSON.parse(this.payload);
    },
  };
}

async function request(options) {
  const req = createReq(options);
  const res = createRes();
  await handleAriaRequest(req, res);
  return res;
}

async function withGuardEnv(values, fn) {
  const original = new Map();
  for (const [key, value] of Object.entries(values)) {
    original.set(key, process.env[key]);
    process.env[key] = String(value);
  }
  try {
    return await fn();
  } finally {
    for (const [key, value] of original.entries()) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function makeUnauthHeaders() {
  return {
    "x-tenant-id": undefined,
    "x-user-id": undefined,
    "x-role": undefined,
  };
}

test("AI-SPM local GitHub connector discovers AI assets without reading local env secrets", () => {
  const inventory = scanLocalRepository();

  assert.equal(inventory.connector, "github");
  assert.equal(inventory.mode, "local-repository");
  assert.ok(inventory.files_scanned > 0);
  assert.ok(inventory.assets.some((asset) => asset.type === "ai_system"));
  assert.ok(!inventory.assets.some((asset) => asset.files.includes(".env")));

  const serialized = JSON.stringify(inventory);
  assert.doesNotMatch(serialized, /AIza[0-9A-Za-z_-]{25,}/);
  assert.doesNotMatch(serialized, /sk-[A-Za-z0-9_-]{20,}/);
});

test("AI-SPM risk engine and narrative convert assets into action-ready findings", () => {
  const inventory = {
    assets: [
      {
        id: "ai-system:demo",
        type: "ai_system",
        name: "Demo support agent",
        repo: "demo/agent",
        evidence: [{ path: "agent.js", line: 12, signal: "OpenAI usage" }],
      },
      {
        id: "secret:demo",
        type: "secret",
        name: "OpenAI credential material",
        repo: "demo/agent",
        evidence: [{ path: "agent.js", line: 14, signal: "OpenAI secret pattern", snippet: "sk-a...1234" }],
      },
    ],
  };

  const findings = evaluateAiSpmRisks(inventory);
  const narrative = generateAttackNarrative({ inventory, findings });

  assert.ok(findings.some((finding) => finding.code === "ai-secret-in-source"));
  assert.ok(findings.some((finding) => finding.code === "ai-system-near-secret"));
  assert.equal(narrative.status, "ready");
  assert.match(narrative.likely_attack_path, /credential/i);
  assert.ok(narrative.recommended_actions.length > 0);
});

test("GitHub connector parses workflow CI/CD secret and trust-risk signals", () => {
  const root = mkdtempSync(join(tmpdir(), "ai-spm-gh-workflow-"));
  try {
    mkdirSync(join(root, ".github/workflows"), { recursive: true });
    writeFileSync(
      join(root, ".github/workflows/ai.yml"),
      `name: AI workflow
on:
  pull_request_target:
permissions:
  contents: write
  id-token: write
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: echo "\${{ secrets.OPENAI_API_KEY }}" >> debug.txt
      - run: printenv
      - run: curl https://example.com/install.sh | bash
`,
      "utf8"
    );
    writeFileSync(
      join(root, "agent.mjs"),
      "import OpenAI from 'openai'; import { exec } from 'node:child_process'; import fs from 'node:fs';",
      "utf8"
    );

    const inventory = scanLocalRepository({ root, repoName: "demo/workflow" });
    const workflowAssets = inventory.assets.filter((asset) => asset.type === "ci_workflow");
    assert.ok(workflowAssets.some((asset) => asset.subtype === "ai-provider-key-usage"));
    assert.ok(workflowAssets.some((asset) => asset.subtype === "dangerous-secret-handling"));
    assert.ok(workflowAssets.some((asset) => asset.subtype === "untrusted-pr-execution"));
    assert.ok(workflowAssets.some((asset) => asset.subtype === "token-permission-overreach"));
    assert.ok(workflowAssets.some((asset) => asset.subtype === "oidc-pr-target-combo"));
    assert.ok(workflowAssets.some((asset) => asset.subtype === "agentic-tool-surface"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("AI-SPM risk engine emits workflow-specific and correlated findings", () => {
  const inventory = {
    assets: [
      {
        id: "ai-system:repo",
        type: "ai_system",
        name: "Demo AI app",
        repo: "demo/workflow",
        evidence: [{ path: "agent.js", line: 8, signal: "OpenAI usage" }],
      },
      {
        id: "ci-workflow:repo:wf:untrusted-pr-execution",
        type: "ci_workflow",
        subtype: "untrusted-pr-execution",
        name: "Untrusted PR workflow execution",
        repo: "demo/workflow",
        evidence: [{ path: ".github/workflows/ai.yml", line: 2, signal: "pull_request_target with run" }],
      },
      {
        id: "ci-workflow:repo:wf:dangerous-secret-handling",
        type: "ci_workflow",
        subtype: "dangerous-secret-handling",
        name: "Dangerous secret handling",
        repo: "demo/workflow",
        evidence: [{ path: ".github/workflows/ai.yml", line: 10, signal: "echo secrets" }],
      },
    ],
  };

  const findings = evaluateAiSpmRisks(inventory);
  assert.ok(findings.some((item) => item.code === "github-untrusted-pr-execution"));
  assert.ok(findings.some((item) => item.code === "github-workflow-secret-handling"));
  assert.ok(findings.some((item) => item.code === "ai-system-cicd-workflow-coupling"));
});

test("AI-SPM HTTP routes expose inventory, findings, scan, and narrative", async () => {
  resetQuotaGuardState();
  const inventoryRes = await request({ method: "GET", url: "/api/ai-spm/inventory" });
  assert.equal(inventoryRes.statusCode, 200);
  assert.ok(Array.isArray(inventoryRes.json().inventory.assets));

  const findingsRes = await request({ method: "GET", url: "/api/ai-spm/findings" });
  assert.equal(findingsRes.statusCode, 200);
  assert.ok(Array.isArray(findingsRes.json().findings));

  const scanRes = await request({ method: "POST", url: "/api/ai-spm/scan", body: {} });
  assert.equal(scanRes.statusCode, 200);
  assert.ok(Array.isArray(scanRes.json().inventory.assets));

  const narrativeRes = await request({ method: "POST", url: "/api/ai-spm/narrative", body: {} });
  assert.equal(narrativeRes.statusCode, 200);
  assert.ok(narrativeRes.json().narrative.status);

  const commandRes = await request({
    method: "POST",
    url: "/api/aria/command",
    body: { text: "Run AI-SPM scan" },
  });
  assert.equal(commandRes.statusCode, 200);
  assert.match(commandRes.json().result.voice_response, /AI-SPM scan complete/);
});

test("Quota guard returns clear rate-limit payload for /api/aria routes", async () => {
  resetQuotaGuardState();
  await withGuardEnv({
    ARIA_RATE_LIMIT_WINDOW_MS: 60_000,
    ARIA_QUOTA_WINDOW_MS: 60_000,
    ARIA_ROUTE_RATE_LIMIT_PER_WINDOW: 1,
    ARIA_ROUTE_QUOTA_PER_WINDOW: 50,
  }, async () => {
    const first = await request({ method: "GET", url: "/api/aria/suggestions" });
    assert.equal(first.statusCode, 200);

    const second = await request({ method: "GET", url: "/api/aria/suggestions" });
    assert.equal(second.statusCode, 429);
    const payload = second.json();
    assert.equal(payload.error, "rate_limit_exceeded");
    assert.equal(payload.guard.type, "rate_limit");
    assert.equal(payload.guard.bucket, "aria");
    assert.equal(typeof payload.guard.retry_after_ms, "number");
  });
});

test("Quota guard returns clear quota payload for heavy AI-SPM routes", async () => {
  resetQuotaGuardState();
  await withGuardEnv({
    ARIA_RATE_LIMIT_WINDOW_MS: 60_000,
    ARIA_QUOTA_WINDOW_MS: 60_000,
    ARIA_AI_SPM_HEAVY_RATE_LIMIT_PER_WINDOW: 50,
    ARIA_AI_SPM_HEAVY_QUOTA_PER_WINDOW: 1,
  }, async () => {
    const first = await request({ method: "POST", url: "/api/ai-spm/evidence", body: { findingId: "missing" } });
    assert.notEqual(first.statusCode, 429);

    const second = await request({ method: "POST", url: "/api/ai-spm/evidence", body: { findingId: "missing" } });
    assert.equal(second.statusCode, 429);
    const payload = second.json();
    assert.equal(payload.error, "quota_exceeded");
    assert.equal(payload.guard.type, "quota");
    assert.equal(payload.guard.bucket, "aiSpmHeavy");
  });
});

test("GitHub connector status route exposes safe auth state", async () => {
  const statusRes = await request({ method: "GET", url: "/api/connectors/github/status" });
  assert.equal(statusRes.statusCode, 200);
  const connector = statusRes.json().connector;
  assert.equal(connector.id, "github");
  assert.equal(typeof connector.connected, "boolean");
  assert.equal(connector.token, undefined);
});

test("Identity sessions list returns 200 with stable shape for authorized caller", async () => {
  process.env.ARIA_SESSION_SECRET = "test-secret-aria-session-2026";
  await request({
    method: "POST",
    url: "/api/aria/session",
    body: { tenant_id: "test-tenant", user_id: "list-user", role: "analyst" },
  });

  const listRes = await request({ method: "GET", url: "/api/aria/sessions" });
  assert.equal(listRes.statusCode, 200);
  const payload = listRes.json();
  assert.ok(Array.isArray(payload.sessions));
  assert.equal(typeof payload.total, "number");
  if (payload.sessions.length > 0) {
    const item = payload.sessions[0];
    for (const key of ["user", "role", "issued_at", "expires_at", "last_seen"]) {
      assert.ok(key in item, `missing sessions[] field: ${key}`);
    }
  }
});

test("Identity sessions list denies unauthenticated caller with 401", async () => {
  const listRes = await request({
    method: "GET",
    url: "/api/aria/sessions",
    headers: makeUnauthHeaders(),
  });
  assert.equal(listRes.statusCode, 401);
});

test("Identity sessions list and revoke deny unauthorized role with 403", async () => {
  const listRes = await request({
    method: "GET",
    url: "/api/aria/sessions",
    headers: { "x-role": "superuser" },
  });
  assert.equal(listRes.statusCode, 403);

  const revokeRes = await request({
    method: "POST",
    url: "/api/aria/session/revoke",
    headers: { "x-role": "superuser" },
    body: { token: "invalid.token.value", reason: "contract unauthorized check" },
  });
  assert.equal(revokeRes.statusCode, 403);
});

test("Identity session revoke returns 404 for unknown session id", async () => {
  process.env.ARIA_SESSION_SECRET = "test-secret-aria-session-2026";
  const unknownTokenRes = await request({
    method: "POST",
    url: "/api/aria/session/revoke",
    body: { token: "eyJzaWQiOiJzaWQtbm9uZXhpc3RlbnQiLCJ0ZW5hbnRfaWQiOiJ0ZXN0LXRlbmFudCIsInVzZXJfaWQiOiJnaG9zdCIsInJvbGUiOiJhbmFseXN0IiwiaWF0IjoyMDAwMDAwMDAwLCJleHAiOjQwMDAwMDAwMDB9.invalidsig", reason: "cleanup" },
  });
  assert.ok([400, 404].includes(unknownTokenRes.statusCode));
});

test("Identity session revoke success returns 200 and audit events include success + denied attempts", async () => {
  process.env.ARIA_SESSION_SECRET = "test-secret-aria-session-2026";
  rmSync(getAuditLogPath(), { force: true });

  const issuedRes = await request({
    method: "POST",
    url: "/api/aria/session",
    body: { tenant_id: "test-tenant", user_id: "revoke-user", role: "analyst" },
  });
  assert.equal(issuedRes.statusCode, 200);
  const token = issuedRes.json().session_token;

  const deniedRes = await request({
    method: "POST",
    url: "/api/aria/session/revoke",
    body: { token: "invalid.token", reason: "expected denial" },
  });
  assert.ok([400, 403].includes(deniedRes.statusCode));

  const successRes = await request({
    method: "POST",
    url: "/api/aria/session/revoke",
    body: { token, reason: "security rotation" },
  });
  assert.equal(successRes.statusCode, 200);
  assert.equal(successRes.json().ok, true);

  const auditRes = await request({
    method: "GET",
    url: "/api/aria/audit-events?event_type=session.revoke_denied&status=denied&limit=200",
  });
  assert.equal(auditRes.statusCode, 200);
  assert.ok((auditRes.json().events || []).length > 0);

  const events = await readAuditEvents({ limit: 200 });
  assert.ok(events.some((event) => event.event_type === "session.revoke_denied"));
  assert.ok(events.some((event) => event.event_type === "session.revoked"));
});

test("Identity session revoke requires reason field", async () => {
  process.env.ARIA_SESSION_SECRET = "test-secret-aria-session-2026";
  const issuedRes = await request({
    method: "POST",
    url: "/api/aria/session",
    body: { tenant_id: "test-tenant", user_id: "reason-user", role: "analyst" },
  });
  assert.equal(issuedRes.statusCode, 200);
  const token = issuedRes.json().session_token;

  const revokeRes = await request({
    method: "POST",
    url: "/api/aria/session/revoke",
    body: { token },
  });
  assert.equal(revokeRes.statusCode, 400);
  assert.match(String(revokeRes.json().error || ""), /reason/i);
});

test("AI-SPM findings support evidence sandbox, reports, and persistent actions", async () => {
  resetQuotaGuardState();
  const scanRes = await request({ method: "POST", url: "/api/ai-spm/scan", body: {} });
  const finding = scanRes.json().findings[0];
  assert.ok(finding?.id);

  const evidenceRes = await request({
    method: "POST",
    url: "/api/ai-spm/evidence",
    body: { findingId: finding.id },
  });
  assert.equal(evidenceRes.statusCode, 200);
  assert.equal(evidenceRes.json().sandbox.mode, "read-only-evidence");

  const reportRes = await request({ method: "POST", url: "/api/ai-spm/report", body: {} });
  assert.equal(reportRes.statusCode, 200);
  assert.match(reportRes.json().report.markdown, /# Aria AI-SPM Report/);

  const ignoreRes = await request({
    method: "POST",
    url: "/api/ai-spm/finding-action",
    body: { findingId: finding.id, action: "ignore", note: "test suppression" },
  });
  assert.equal(ignoreRes.statusCode, 200);
  assert.equal(ignoreRes.json().decision.status, "ignored");
  assert.ok(Array.isArray(ignoreRes.json().state.findings));

  const reopenRes = await request({
    method: "POST",
    url: "/api/ai-spm/finding-action",
    body: { findingId: finding.id, action: "reopen" },
  });
  assert.equal(reopenRes.statusCode, 200);
  assert.equal(reopenRes.json().decision.status, "open");
});

test("AI-SPM graph store persists inventory relationships and supports neighbor queries", () => {
  rmSync(getAiSpmGraphStorePath(), { force: true });

  persistAiSpmGraphFromState({
    inventory: {
      assets: [
        {
          id: "asset:exposed",
          type: "ai_system",
          name: "Public AI endpoint",
          repo: "demo/repo",
          exposure: "repository",
          sensitivity: "unknown",
          evidence: [{ path: "server/api.mjs", line: 10 }],
        },
        {
          id: "asset:secret",
          type: "secret",
          name: "Credential material",
          repo: "demo/repo",
          exposure: "source-code",
          sensitivity: "secret",
          evidence: [{ path: "server/api.mjs", line: 18 }],
        },
      ],
    },
    findings: [
      {
        id: "finding:1",
        title: "Secret near exposed AI surface",
        code: "ai-secret-in-source",
        severity: "high",
        repo: "demo/repo",
        evidence: [{ source_asset: "asset:exposed" }],
        attack_path: [{ asset_id: "asset:secret" }],
      },
    ],
    suppressed_findings: [],
  });

  const neighbors = getAiSpmNodeNeighbors("asset:exposed", { repo: "demo/repo" });
  assert.ok(neighbors.node);
  assert.ok(neighbors.neighbors.some((item) => item.edge.type === "indicates_risk"));
  assert.ok(neighbors.neighbors.some((item) => item.edge.type === "has_exposure"));
});

test("AI-SPM graph store finds attack-path candidates and repo risk summary", () => {
  rmSync(getAiSpmGraphStorePath(), { force: true });

  persistAiSpmGraphFromState({
    inventory: {
      assets: [
        {
          id: "asset:entry",
          type: "agent",
          name: "Internet exposed agent",
          repo: "demo/repo",
          exposure: "repository",
          sensitivity: "unknown",
          evidence: [{ path: "agent.js", line: 4 }],
        },
        {
          id: "asset:data",
          type: "vector_store",
          name: "Sensitive vector store",
          repo: "demo/repo",
          exposure: "data-plane",
          sensitivity: "sensitive",
          evidence: [{ path: "db.js", line: 5 }],
        },
      ],
    },
    findings: [],
    suppressed_findings: [],
  });

  persistAiSpmGraphFromState({
    inventory: { assets: [] },
    findings: [
      {
        id: "finding:path",
        title: "Potential path",
        code: "ai-system-near-secret",
        severity: "critical",
        repo: "demo/repo",
        evidence: [{ source_asset: "asset:entry" }],
        attack_path: [{ asset_id: "asset:data" }],
      },
    ],
    suppressed_findings: [],
  });

  const paths = findAiSpmAttackPathCandidates({ repo: "demo/repo" });
  assert.ok(paths.length > 0);
  assert.equal(paths[0].from, "asset:entry");
  assert.equal(paths[0].to, "asset:data");

  const summary = getAiSpmRepoRiskGraphSummary("demo/repo");
  assert.ok(summary.node_count >= 4);
  assert.ok(summary.edge_count >= 4);
  assert.ok(summary.path_candidates >= 1);
  assert.ok(summary.edges_by_type.indicates_risk >= 1);
});

test("AI-SPM graph store prunes stale nodes and dangling edges by TTL on read cycle", () => {
  const graphPath = getAiSpmGraphStorePath();
  rmSync(graphPath, { force: true });

  const oldStamp = "2001-01-01T00:00:00.000Z";
  const freshStamp = new Date().toISOString();
  writeFileSync(graphPath, JSON.stringify({
    version: 1,
    updated_at: freshStamp,
    nodes: {
      "asset:fresh": { id: "asset:fresh", kind: "ai_system", repo: "demo/repo", updated_at: freshStamp },
      "asset:stale": { id: "asset:stale", kind: "secret", repo: "demo/repo", updated_at: oldStamp },
    },
    edges: {
      "asset:fresh::contains::asset:stale": {
        from: "asset:fresh",
        to: "asset:stale",
        type: "contains",
        repo: "demo/repo",
        updated_at: freshStamp,
      },
      "asset:stale::contains::asset:fresh": {
        from: "asset:stale",
        to: "asset:fresh",
        type: "contains",
        repo: "demo/repo",
        updated_at: oldStamp,
      },
    },
  }), "utf8");

  process.env.ARIA_AI_SPM_GRAPH_TTL_HOURS = "1";
  const summary = getAiSpmRepoRiskGraphSummary("demo/repo");
  delete process.env.ARIA_AI_SPM_GRAPH_TTL_HOURS;

  assert.equal(summary.node_count, 1);
  assert.equal(summary.edge_count, 0);

  const neighbors = getAiSpmNodeNeighbors("asset:fresh", { repo: "demo/repo" });
  assert.equal(neighbors.neighbors.length, 0);
});

test("AI-SPM graph store enforces max node and edge caps while preserving integrity", () => {
  const graphPath = getAiSpmGraphStorePath();
  rmSync(graphPath, { force: true });

  process.env.ARIA_AI_SPM_GRAPH_MAX_NODES = "3";
  process.env.ARIA_AI_SPM_GRAPH_MAX_EDGES = "2";

  persistAiSpmGraphFromState({
    inventory: {
      assets: [
        { id: "asset:1", type: "ai_system", name: "A1", repo: "cap/repo", exposure: "repository", evidence: [{ path: "a.js", line: 1 }] },
        { id: "asset:2", type: "secret", name: "A2", repo: "cap/repo", sensitivity: "secret", exposure: "source-code", evidence: [{ path: "b.js", line: 1 }] },
        { id: "asset:3", type: "agent", name: "A3", repo: "cap/repo", exposure: "runtime-tools", evidence: [{ path: "c.js", line: 1 }] },
      ],
    },
    findings: [{
      id: "finding:cap",
      title: "Cap path",
      code: "ai-system-near-secret",
      severity: "high",
      repo: "cap/repo",
      evidence: [{ source_asset: "asset:1" }],
      attack_path: [{ asset_id: "asset:2" }],
    }],
    suppressed_findings: [],
  });

  const summary = getAiSpmRepoRiskGraphSummary("cap/repo");
  delete process.env.ARIA_AI_SPM_GRAPH_MAX_NODES;
  delete process.env.ARIA_AI_SPM_GRAPH_MAX_EDGES;

  assert.ok(summary.node_count <= 3);
  assert.ok(summary.edge_count <= 2);
  const neighbors = getAiSpmNodeNeighbors("asset:1", { repo: "cap/repo" });
  assert.ok(Array.isArray(neighbors.neighbors));
  for (const relation of neighbors.neighbors) {
    assert.ok(relation.node?.id);
    assert.ok(relation.edge?.from);
    assert.ok(relation.edge?.to);
  }
});

// ── Agent B: graph query reliability additions ────────────────────────────────

test("AI-SPM graph queries return stable empty results when graph file is missing", () => {
  rmSync(getAiSpmGraphStorePath(), { force: true });

  const neighbors = getAiSpmNodeNeighbors("asset:missing", { repo: "demo/repo" });
  assert.equal(neighbors.node, null);
  assert.deepEqual(neighbors.neighbors, []);

  const paths = findAiSpmAttackPathCandidates({ repo: "demo/repo" });
  assert.deepEqual(paths, []);

  const summary = getAiSpmRepoRiskGraphSummary("demo/repo");
  assert.equal(summary.node_count, 0);
  assert.equal(summary.edge_count, 0);
  assert.equal(summary.path_candidates, 0);
  assert.deepEqual(summary.nodes_by_kind, {});
  assert.deepEqual(summary.edges_by_type, {});
});

test("AI-SPM graph neighbor queries preserve cross-tenant isolation by repo", () => {
  rmSync(getAiSpmGraphStorePath(), { force: true });

  persistAiSpmGraphFromState({
    inventory: {
      assets: [
        {
          id: "asset:tenant-a",
          type: "ai_system",
          name: "Tenant A service",
          repo: "tenant/a",
          exposure: "repository",
          sensitivity: "unknown",
        },
        {
          id: "asset:tenant-b",
          type: "ai_system",
          name: "Tenant B service",
          repo: "tenant/b",
          exposure: "repository",
          sensitivity: "unknown",
        },
      ],
    },
    findings: [
      {
        id: "finding:tenant-a",
        title: "Tenant A finding",
        code: "ai-system-near-secret",
        severity: "high",
        repo: "tenant/a",
        evidence: [{ source_asset: "asset:tenant-a" }],
      },
      {
        id: "finding:tenant-b",
        title: "Tenant B finding",
        code: "ai-system-near-secret",
        severity: "high",
        repo: "tenant/b",
        evidence: [{ source_asset: "asset:tenant-b" }],
      },
    ],
    suppressed_findings: [],
  });

  const tenantA = getAiSpmNodeNeighbors("asset:tenant-a", { repo: "tenant/a" });
  assert.ok(tenantA.neighbors.length > 0);
  assert.ok(tenantA.neighbors.every((item) => item.edge.repo === "tenant/a"));
  assert.ok(!tenantA.neighbors.some((item) => item.edge.repo === "tenant/b"));

  const tenantB = getAiSpmNodeNeighbors("asset:tenant-b", { repo: "tenant/b" });
  assert.ok(tenantB.neighbors.length > 0);
  assert.ok(tenantB.neighbors.every((item) => item.edge.repo === "tenant/b"));
  assert.ok(!tenantB.neighbors.some((item) => item.edge.repo === "tenant/a"));
});

test("AI-SPM graph queries ignore edges that reference missing nodes", () => {
  rmSync(getAiSpmGraphStorePath(), { force: true });

  persistAiSpmGraphFromState({
    inventory: {
      assets: [
        {
          id: "asset:known",
          type: "ai_system",
          name: "Known asset",
          repo: "demo/repo",
          exposure: "repository",
          sensitivity: "unknown",
        },
      ],
    },
    findings: [
      {
        id: "finding:dangling",
        title: "Dangling source reference",
        code: "ai-system-near-secret",
        severity: "medium",
        repo: "demo/repo",
        evidence: [{ source_asset: "asset:missing" }],
      },
    ],
    suppressed_findings: [],
  });

  const known = getAiSpmNodeNeighbors("asset:known", { repo: "demo/repo" });
  assert.ok(known.neighbors.length > 0);
  assert.ok(!known.neighbors.some((item) => item.node?.id === "asset:missing"));

  const summary = getAiSpmRepoRiskGraphSummary("demo/repo");
  assert.equal(summary.node_count, 5);
  assert.equal(summary.edge_count, 3);
  assert.equal(summary.edges_by_type.contains, 1);
  assert.equal(summary.edges_by_type.has_exposure, 1);
  assert.equal(summary.edges_by_type.has_severity, 1);
  assert.equal(summary.edges_by_type.indicates_risk, undefined);
});

test("AI-SPM demo mode is deterministic for scan and narrative", async () => {
  const first = await scanAiSpm({ demo: true });
  const second = await scanAiSpm({ demo: true });

  assert.equal(first.inventory.generated_at, second.inventory.generated_at);
  assert.deepEqual(
    first.inventory.assets.map((asset) => asset.id),
    second.inventory.assets.map((asset) => asset.id)
  );
  assert.deepEqual(
    first.findings.map((finding) => finding.id),
    second.findings.map((finding) => finding.id)
  );

  const firstNarrative = generateAttackNarrative({ inventory: first.inventory, findings: first.findings });
  const secondNarrative = generateAttackNarrative({ inventory: second.inventory, findings: second.findings });
  assert.deepEqual(firstNarrative, secondNarrative);
});

test("AI-SPM demo mode HTTP scan endpoint stays deterministic", async () => {
  const scanOne = await request({ method: "POST", url: "/api/ai-spm/scan", body: { demo: true } });
  const scanTwo = await request({ method: "POST", url: "/api/ai-spm/scan", body: { demo: true } });

  assert.equal(scanOne.statusCode, 200);
  assert.equal(scanTwo.statusCode, 200);

  const one = scanOne.json();
  const two = scanTwo.json();
  assert.equal(one.inventory.generated_at, two.inventory.generated_at);
  assert.deepEqual(
    one.findings.map((finding) => finding.id),
    two.findings.map((finding) => finding.id)
  );
});

test("AI-SPM scan and finding actions emit persistent audit events", async () => {
  rmSync(getAuditLogPath(), { force: true });

  await request({ method: "POST", url: "/api/ai-spm/scan", body: { demo: true } });
  const findingsRes = await request({ method: "GET", url: "/api/ai-spm/findings" });
  const finding = findingsRes.json().findings[0];
  await request({
    method: "POST",
    url: "/api/ai-spm/finding-action",
    body: { findingId: finding.id, action: "ignore", note: "audit test" },
  });

  const events = await readAuditEvents({ limit: 20 });
  assert.ok(events.some((event) => event.event_type === "ai_spm_scan_completed"));
  assert.ok(events.some((event) => event.event_type === "ai_spm_finding_action_recorded"));
});

test("Approval request and resolution emit audit events", async () => {
  rmSync(getAuditLogPath(), { force: true });

  const commandRes = await request({
    method: "POST",
    url: "/api/aria/command",
    body: { text: "isolate threat now" },
  });
  assert.equal(commandRes.statusCode, 200);
  assert.equal(commandRes.json().result.status, "approval_required");
  const approvalId = commandRes.json().result.approval?.id;
  assert.ok(approvalId);

  const resolutionRes = await request({
    method: "POST",
    url: "/api/aria/approval",
    body: { id: approvalId, decision: "approve" },
  });
  assert.equal(resolutionRes.statusCode, 200);
  assert.equal(resolutionRes.json().resolution.status, "approved");

  const events = await readAuditEvents({ limit: 20 });
  assert.ok(events.some((event) => event.event_type === "approval_requested"));
  assert.ok(events.some((event) => event.event_type === "aria.approval.resolved"));
});

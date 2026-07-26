// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { handleAriaRequest } from "../../server/index.mjs";

process.env.ARIA_AI_SPM_DISABLE_GH_AUTO = "1";

const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9_-]{20,}/,
  /AIza[0-9A-Za-z_-]{20,}/,
  /AKIA[0-9A-Z]{16}/,
  /ghp_[A-Za-z0-9]{20,}/,
];

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
  req.socket = { remoteAddress: "127.0.0.1" };
  req[Symbol.asyncIterator] = async function* iterator() {
    if (body !== undefined) yield Buffer.from(JSON.stringify(body));
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

function assertNoSecretLeak(value) {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  for (const pattern of SECRET_PATTERNS) {
    assert.doesNotMatch(serialized, pattern);
  }
}

function assertInventoryContract(inventory) {
  assert.equal(typeof inventory.generated_at, "string");
  assert.ok(Array.isArray(inventory.connectors));
  assert.ok(Array.isArray(inventory.assets));
  for (const connector of inventory.connectors) {
    assert.equal(typeof connector.id, "string");
    assert.equal(typeof connector.status, "string");
    assert.equal(typeof connector.mode, "string");
    assert.equal(typeof connector.scanned_at, "string");
    assert.equal(typeof connector.files_scanned, "number");
    assert.ok(Array.isArray(connector.repositories));
  }
}

function assertFindingContract(finding) {
  assert.equal(typeof finding.id, "string");
  assert.equal(typeof finding.code, "string");
  assert.ok(["critical", "high", "medium", "low"].includes(finding.severity));
  assert.equal(typeof finding.score, "number");
  assert.equal(typeof finding.title, "string");
  assert.equal(typeof finding.asset_id, "string");
  assert.equal(typeof finding.asset_name, "string");
  assert.equal(typeof finding.asset_type, "string");
  assert.equal(typeof finding.repo, "string");
  assert.ok(Array.isArray(finding.evidence));
  assert.equal(typeof finding.rationale, "string");
  assert.ok(Array.isArray(finding.attack_path));
  assert.ok(Array.isArray(finding.recommendations));
}

test("AI-SPM API contracts remain stable for inventory, findings, scan, and narrative", async () => {
  const inventoryRes = await request({ method: "GET", url: "/api/ai-spm/inventory" });
  assert.equal(inventoryRes.statusCode, 200);
  assertInventoryContract(inventoryRes.json().inventory);

  const findingsRes = await request({ method: "GET", url: "/api/ai-spm/findings" });
  assert.equal(findingsRes.statusCode, 200);
  const findingsPayload = findingsRes.json();
  assert.equal(typeof findingsPayload.summary, "object");
  assert.ok(Array.isArray(findingsPayload.findings));
  assert.ok(Array.isArray(findingsPayload.suppressed_findings));
  findingsPayload.findings.forEach(assertFindingContract);

  const scanRes = await request({ method: "POST", url: "/api/ai-spm/scan", body: {} });
  assert.equal(scanRes.statusCode, 200);
  const scanPayload = scanRes.json();
  assertInventoryContract(scanPayload.inventory);
  assert.ok(Array.isArray(scanPayload.raw_findings));
  assert.ok(Array.isArray(scanPayload.findings));
  assert.ok(Array.isArray(scanPayload.suppressed_findings));
  assert.equal(typeof scanPayload.summary, "object");
  scanPayload.findings.forEach(assertFindingContract);

  const narrativeRes = await request({ method: "POST", url: "/api/ai-spm/narrative", body: {} });
  assert.equal(narrativeRes.statusCode, 200);
  const narrativePayload = narrativeRes.json();
  assert.equal(typeof narrativePayload.summary, "object");
  assert.equal(typeof narrativePayload.narrative, "object");
  assert.equal(typeof narrativePayload.narrative.status, "string");
  assert.equal(typeof narrativePayload.narrative.summary, "string");
  assert.equal(typeof narrativePayload.narrative.confidence, "string");
  assert.ok(Array.isArray(narrativePayload.narrative.recommended_actions));
  assert.ok(Array.isArray(narrativePayload.narrative.evidence));
});

test("AI-SPM scan -> findings -> narrative regression stays coherent", async () => {
  const scanRes = await request({ method: "POST", url: "/api/ai-spm/scan", body: {} });
  assert.equal(scanRes.statusCode, 200);
  const scanPayload = scanRes.json();
  const scanFindingIds = new Set(scanPayload.findings.map((item) => item.id));

  const findingsRes = await request({ method: "GET", url: "/api/ai-spm/findings" });
  assert.equal(findingsRes.statusCode, 200);
  const findingsPayload = findingsRes.json();
  for (const finding of findingsPayload.findings) {
    assert.ok(scanFindingIds.has(finding.id));
  }

  const selected = findingsPayload.findings[0];
  const narrativeRes = await request({
    method: "POST",
    url: "/api/ai-spm/narrative",
    body: selected ? { findingId: selected.id } : {},
  });
  assert.equal(narrativeRes.statusCode, 200);
  const narrativePayload = narrativeRes.json();
  if (selected) {
    assert.equal(narrativePayload.narrative.finding?.id, selected.id);
  } else {
    assert.equal(narrativePayload.narrative.status, "empty");
  }
});

test("AI-SPM API payloads and log-like outputs do not leak obvious secrets", async () => {
  const inventoryRes = await request({ method: "GET", url: "/api/ai-spm/inventory" });
  const findingsRes = await request({ method: "GET", url: "/api/ai-spm/findings" });
  const scanRes = await request({ method: "POST", url: "/api/ai-spm/scan", body: {} });
  const narrativeRes = await request({ method: "POST", url: "/api/ai-spm/narrative", body: {} });
  const commandRes = await request({
    method: "POST",
    url: "/api/aria/command",
    body: { text: "Run AI-SPM scan and summarize findings for operators" },
  });

  assert.equal(inventoryRes.statusCode, 200);
  assert.equal(findingsRes.statusCode, 200);
  assert.equal(scanRes.statusCode, 200);
  assert.equal(narrativeRes.statusCode, 200);
  assert.equal(commandRes.statusCode, 200);

  assertNoSecretLeak(inventoryRes.json());
  assertNoSecretLeak(findingsRes.json());
  assertNoSecretLeak(scanRes.json());
  assertNoSecretLeak(narrativeRes.json());
  assertNoSecretLeak(commandRes.json());
});

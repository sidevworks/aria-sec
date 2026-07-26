// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { handleAriaRequest } from "../../server/index.mjs";

process.env.ARIA_AI_SPM_DISABLE_GH_AUTO = "1";

function createReq({ method = "GET", url = "/", headers = {} } = {}) {
  const req = new EventEmitter();
  req.method = method;
  req.url = url;
  req.headers = headers;
  req[Symbol.asyncIterator] = async function* () {};
  return req;
}

function createRes() {
  return {
    statusCode: 0,
    headers: {},
    payload: "",
    setHeader(k, v) { this.headers[k] = v; },
    writeHead(statusCode, headers) { this.statusCode = statusCode; Object.assign(this.headers, headers || {}); },
    end(payload = "") { this.payload = payload; },
    json() { return JSON.parse(this.payload); },
  };
}

async function request(options) {
  const req = createReq(options);
  const res = createRes();
  await handleAriaRequest(req, res);
  return res;
}

test("GET /api/aria/health returns 200 with correct shape", async () => {
  const res = await request({ method: "GET", url: "/api/aria/health" });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.ok(["ok", "degraded"].includes(body.status), `status must be ok or degraded, got ${body.status}`);
  assert.equal(typeof body.version, "string");
  assert.equal(typeof body.uptime, "number");
  assert.ok(body.uptime >= 0);
  assert.equal(typeof body.timestamp, "string");
  assert.ok(body.timestamp.includes("T"), "timestamp should be ISO format");
  assert.ok(body.stores && typeof body.stores === "object", "stores must be present");
  assert.ok(["connected", "in-memory"].includes(body.stores.kv), `stores.kv must be connected or in-memory, got ${body.stores.kv}`);
  assert.ok(["encrypted", "missing-key"].includes(body.stores.credentialVault), `stores.credentialVault must be encrypted or missing-key, got ${body.stores.credentialVault}`);
  assert.ok(["oauth", "headers"].includes(body.stores.auth), `stores.auth must be oauth or headers, got ${body.stores.auth}`);
  assert.ok(body.connectors && typeof body.connectors === "object", "connectors must be present");
  assert.ok(["connected", "disconnected"].includes(body.connectors.github), `connectors.github must be connected or disconnected, got ${body.connectors.github}`);
  assert.ok(["connected", "disconnected"].includes(body.connectors.aws), `connectors.aws must be connected or disconnected, got ${body.connectors.aws}`);
});

test("GET /api/aria/health is accessible without auth headers", async () => {
  const res = await request({ method: "GET", url: "/api/aria/health", headers: {} });
  assert.equal(res.statusCode, 200, "health endpoint must not require auth");
});

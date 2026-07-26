// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

/**
 * Production KV Smoke Test
 *
 * Verifies three end-to-end proofs that durable KV state persists correctly.
 * Uses a lightweight in-process mock of the Upstash REST pipeline API so that
 * isDurable() returns true and durableLpush actually fires HTTP requests —
 * exercising the real production code path, not just the in-memory fallback.
 *
 * Run: node test/server/smoke-kv-production.mjs
 */

import { createServer } from "node:http";
import { EventEmitter } from "node:events";

// ── Mock Upstash KV server ────────────────────────────────────────────────────

// In-memory state for the mock (shared with test assertions).
const kvStore = new Map();   // key → value
const kvLists = new Map();   // key → string[]  (index 0 = newest)

function kvMockHandlePipeline(commands) {
  const results = [];
  for (const cmd of commands) {
    const [op, key, ...args] = cmd;
    switch (op.toUpperCase()) {
      case "INCR": {
        const cur = Number(kvStore.get(key) ?? 0);
        const next = cur + 1;
        kvStore.set(key, next);
        results.push({ result: next });
        break;
      }
      case "EXPIRE": {
        // NX semantics: only set if no TTL — we ignore TTL in the mock.
        results.push({ result: 1 });
        break;
      }
      case "GET": {
        results.push({ result: kvStore.get(key) ?? null });
        break;
      }
      case "SET": {
        kvStore.set(key, args[0]);
        results.push({ result: "OK" });
        break;
      }
      case "DEL": {
        kvStore.delete(key);
        kvLists.delete(key);
        results.push({ result: 1 });
        break;
      }
      case "LPUSH": {
        const list = kvLists.get(key) ?? [];
        list.unshift(args[0]);
        kvLists.set(key, list);
        results.push({ result: list.length });
        break;
      }
      case "LTRIM": {
        const list = kvLists.get(key) ?? [];
        const start = Number(args[0]);
        const end = Number(args[1]);
        kvLists.set(key, list.slice(start, end + 1));
        results.push({ result: "OK" });
        break;
      }
      case "LRANGE": {
        const list = kvLists.get(key) ?? [];
        const start = Number(args[0]);
        const end = Number(args[1]);
        results.push({ result: end === -1 ? list.slice(start) : list.slice(start, end + 1) });
        break;
      }
      case "MGET": {
        results.push({ result: [key, ...args].map(k => kvStore.get(k) ?? null) });
        break;
      }
      case "SCAN": {
        // return cursor 0 + matching keys
        const match = args[1] ?? "";
        const prefix = match.replace(/\*$/, "");
        const keys = [...kvStore.keys(), ...kvLists.keys()].filter(k => k.startsWith(prefix));
        results.push({ result: [0, [...new Set(keys)]] });
        break;
      }
      default:
        results.push({ error: `unknown command: ${op}` });
    }
  }
  return results;
}

function startMockKv() {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      let body = "";
      req.on("data", chunk => { body += chunk; });
      req.on("end", () => {
        try {
          const commands = JSON.parse(body || "[]");
          const results = kvMockHandlePipeline(commands);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(results));
        } catch (err) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: err.message }));
        }
      });
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, port });
    });
  });
}

// ── Start mock KV and configure env vars before importing server modules ──────

const { server: mockKvServer, port: mockKvPort } = await startMockKv();

// Set env vars so isDurable() returns true in all subsequently-called functions.
// These are read at call-time (not module-load-time) so setting them here works.
process.env.ARIA_KV_REST_URL   = `http://127.0.0.1:${mockKvPort}`;
process.env.ARIA_KV_REST_TOKEN = "smoke-test-token";

process.env.ARIA_AI_SPM_DISABLE_GH_AUTO = "1";
process.env.ARIA_AUTHZ_ENFORCE = "true";
delete process.env.ARIA_AUTHZ_ALLOW_LOCAL_BYPASS;

// ── Import server modules (they will call isDurable() at use-time) ────────────

import { durableIncr, durableGet, resetDurableStore } from "../../server/durableStore.mjs";
import { handleAriaRequest } from "../../server/index.mjs";

// ── HTTP request helper ───────────────────────────────────────────────────────

function createReq({ method = "GET", url = "/", body, headers = {} } = {}) {
  const req = new EventEmitter();
  req.method = method;
  req.url = url;
  req.headers = { "content-type": "application/json", ...headers };
  req[Symbol.asyncIterator] = async function* () {
    if (body !== undefined) yield Buffer.from(JSON.stringify(body));
  };
  return req;
}

function createRes() {
  return {
    statusCode: 0,
    headers: {},
    payload: "",
    writeHead(code, hdrs) { this.statusCode = code; this.headers = hdrs ?? {}; },
    end(payload = "") { this.payload = payload; },
    json() { return JSON.parse(this.payload || "null"); },
  };
}

async function request(opts) {
  const req = createReq(opts);
  const res = createRes();
  await handleAriaRequest(req, res);
  return res;
}

// ── Proof helpers ─────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function proof(label, ok, detail = "") {
  if (ok) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.error(`  ❌ ${label}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

// ── Proof 1: Quota counter survives cold start ────────────────────────────────

console.log("\nProof 1 — quota counter survives cold start");
kvStore.clear(); kvLists.clear();

const quotaKey = "aria:quota:smoke:user1";
await durableIncr(quotaKey, 3600);
await durableIncr(quotaKey, 3600);
// In production this would survive a real cold start via Upstash.
// Here, the counter lives in the mock KV server (separate from the Node process).
const afterRedeploy = await durableGet(quotaKey);
proof(
  "quota counter value is 2 after two increments",
  Number(afterRedeploy) === 2,
  `got ${afterRedeploy}`,
);

// ── Proof 2: Audit event written to KV after authz-gated request ──────────────

console.log("\nProof 2 — audit event survives redeploy");
kvStore.clear(); kvLists.clear();

// Unauthenticated request triggers logAuditEvent (authz denial) → durableLpush fire-and-forget.
await request({
  method: "GET",
  url: "/api/connectors/aws/status",
  // no auth headers → authz.missing_context denial → audit event logged to KV
});

// durableLpush is fire-and-forget (no await in logAuditEvent); wait for the
// pending HTTP round-trip to the mock KV server to complete.
await new Promise(r => setTimeout(r, 150));

const auditList = kvLists.get("aria:audit:events") ?? [];
const parsedAudit = auditList.map(s => { try { return JSON.parse(s); } catch { return s; } });
proof(
  "at least one audit event written to KV list",
  parsedAudit.length >= 1,
  `list length: ${parsedAudit.length}`,
);
proof(
  "audit event has expected shape",
  parsedAudit.length > 0 &&
    typeof parsedAudit[0]?.event_type === "string" &&
    typeof parsedAudit[0]?.id === "string",
  parsedAudit.length > 0 ? JSON.stringify(parsedAudit[0]).slice(0, 120) : "empty list",
);

// ── Proof 3: AuthZ denial queryable from KV ───────────────────────────────────

console.log("\nProof 3 — authz denial queryable from KV");
kvStore.clear(); kvLists.clear();

// No auth headers → authz denial + audit event logged.
await request({
  method: "POST",
  url: "/api/connectors/aws/connect",
  body: { accessKeyId: "AKIA_SMOKE", secretAccessKey: "secret", region: "us-east-1" },
});

// Same flush wait as proof 2.
await new Promise(r => setTimeout(r, 150));

const allKvAudit = (kvLists.get("aria:audit:events") ?? [])
  .map(s => { try { return JSON.parse(s); } catch { return s; } });
const denials = allKvAudit.filter(
  e =>
    e?.status === "denied" ||
    String(e?.event_type).includes("denied") ||
    String(e?.event_type).includes("authz") ||
    String(e?.event_type).includes("unauthorized"),
);
proof(
  "KV audit list is non-empty after authz denial request",
  allKvAudit.length >= 1,
  `list length: ${allKvAudit.length}`,
);
proof(
  "at least one denial event is queryable from KV",
  denials.length >= 1,
  denials.length >= 1
    ? `found: ${denials[0]?.event_type}`
    : `events: ${JSON.stringify(allKvAudit.map(e => e?.event_type))}`,
);

// ── Summary ───────────────────────────────────────────────────────────────────

mockKvServer.close();

console.log(`\n${"─".repeat(50)}`);
console.log(`Smoke test complete: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

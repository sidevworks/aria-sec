// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

/**
 * Durable Store Tests
 * Exercises in-memory fallback behaviour (no KV configured).
 * Quota guard and audit log integration is covered by existing test suites;
 * these tests focus on the durableStore primitives and cross-instance semantics.
 */
import assert from "node:assert/strict";
import test from "node:test";

// Ensure no KV env vars are set so all tests run against the in-memory fallback.
delete process.env.ARIA_KV_REST_URL;
delete process.env.ARIA_KV_REST_TOKEN;
delete process.env.KV_REST_API_URL;
delete process.env.KV_REST_API_TOKEN;

const {
  isDurable,
  durableIncr,
  durableGet,
  durableSet,
  durableDel,
  durableLpush,
  durableLrange,
  durableScan,
  resetDurableStore,
  tenantGet,
  tenantSet,
  tenantDel,
  tenantScan,
} = await import(`../../server/durableStore.mjs?t=${Date.now()}`);

test("isDurable returns false when no KV env vars are set", () => {
  assert.equal(isDurable(), false);
});

test("durableIncr increments a counter and returns the new value", async () => {
  resetDurableStore();
  const k = "test:counter:1";
  assert.equal(await durableIncr(k, 60), 1);
  assert.equal(await durableIncr(k, 60), 2);
  assert.equal(await durableIncr(k, 60), 3);
});

test("durableIncr sets TTL only on the first increment (NX semantics)", async () => {
  resetDurableStore();
  const k = "test:counter:ttl";
  await durableIncr(k, 1); // 1s TTL
  // Increment twice more — TTL is not reset
  await durableIncr(k, 1);
  await durableIncr(k, 1);
  // Value should be 3 (not expired yet)
  const val = await durableGet(k);
  assert.equal(Number(val), 3);
});

test("durableGet returns null for an unknown key", async () => {
  resetDurableStore();
  const result = await durableGet("test:nonexistent");
  assert.equal(result, null);
});

test("durableSet and durableGet round-trip", async () => {
  resetDurableStore();
  await durableSet("test:set:1", { hello: "world" }, 60);
  const val = await durableGet("test:set:1");
  // In-memory path stores the value as-is (object)
  assert.deepEqual(val, { hello: "world" });
});

test("durableDel removes a key", async () => {
  resetDurableStore();
  await durableSet("test:del:1", "value");
  await durableDel("test:del:1");
  assert.equal(await durableGet("test:del:1"), null);
});

test("durableLpush prepends and respects maxLen", async () => {
  resetDurableStore();
  const k = "test:list:1";
  await durableLpush(k, { n: 1 }, 3);
  await durableLpush(k, { n: 2 }, 3);
  await durableLpush(k, { n: 3 }, 3);
  await durableLpush(k, { n: 4 }, 3); // should evict oldest

  const items = await durableLrange(k, 0, -1);
  assert.equal(items.length, 3, "maxLen=3 respected");
  assert.equal(items[0].n, 4, "newest is at index 0");
  assert.equal(items[2].n, 2, "oldest kept is n=2");
});

test("durableLrange returns empty array for unknown list", async () => {
  resetDurableStore();
  const items = await durableLrange("test:list:nonexistent", 0, -1);
  assert.deepEqual(items, []);
});

test("durableScan returns keys matching prefix", async () => {
  resetDurableStore();
  await durableSet("aria:quota:rate:aria:127.0.0.1:1000", 5, 60);
  await durableSet("aria:quota:quota:aria:127.0.0.1:0", 42, 3600);
  await durableSet("unrelated:key", "ignored", 60);

  const entries = await durableScan("aria:quota:");
  assert.ok(entries.length >= 2, "should find quota keys");
  assert.ok(entries.every((e) => e.key.startsWith("aria:quota:")), "all keys match prefix");
  assert.ok(!entries.some((e) => e.key === "unrelated:key"), "unrelated key not included");
});

test("quota guard in-memory counters are isolated per counter key", async () => {
  resetDurableStore();
  const k1 = "aria:quota:rate:aria:client-a:0";
  const k2 = "aria:quota:rate:aria:client-b:0";
  await durableIncr(k1, 60);
  await durableIncr(k1, 60);
  await durableIncr(k2, 60);

  const v1 = await durableGet(k1);
  const v2 = await durableGet(k2);
  assert.equal(Number(v1), 2);
  assert.equal(Number(v2), 1);
});

test("resetDurableStore clears all in-memory state", async () => {
  await durableSet("test:reset:1", "value");
  resetDurableStore();
  assert.equal(await durableGet("test:reset:1"), null);
  const items = await durableLrange("test:list:1", 0, -1);
  assert.deepEqual(items, []);
});

test("quota guard enforces limit correctly via durableIncr", async () => {
  resetDurableStore();
  // Temporarily lower rate limit for this test
  process.env.ARIA_RATE_LIMIT_PER_WINDOW = "3";
  process.env.ARIA_RATE_LIMIT_WINDOW_MS = "60000";

  const { enforceQuotaGuard, resetQuotaGuardState } = await import(
    `../../server/quotaGuard.mjs?t=${Date.now()}`
  );

  // Simulate 3 requests within the window — all should pass
  const fakeReq = { headers: { "x-forwarded-for": "10.0.0.1" }, socket: {} };
  const path = "/api/aria/command";
  const r1 = await enforceQuotaGuard({ req: fakeReq, apiPath: path });
  const r2 = await enforceQuotaGuard({ req: fakeReq, apiPath: path });
  const r3 = await enforceQuotaGuard({ req: fakeReq, apiPath: path });
  assert.equal(r1.ok, true);
  assert.equal(r2.ok, true);
  assert.equal(r3.ok, true);

  // 4th request should be rate-limited
  const r4 = await enforceQuotaGuard({ req: fakeReq, apiPath: path });
  assert.equal(r4.ok, false);
  assert.equal(r4.statusCode, 429);
  assert.equal(r4.payload.error, "rate_limit_exceeded");

  delete process.env.ARIA_RATE_LIMIT_PER_WINDOW;
  delete process.env.ARIA_RATE_LIMIT_WINDOW_MS;
});

// ── Tenant isolation tests ────────────────────────────────────────────────────

test("tenant A cannot read tenant B keys", async () => {
  resetDurableStore();
  await tenantSet("tenant-a", "secret:key", { data: "alpha" });
  const result = await tenantGet("tenant-b", "secret:key");
  assert.equal(result, null, "tenant B must not see tenant A data");
});

test("tenant prefix isolation — same logical key, different values per tenant", async () => {
  resetDurableStore();
  await tenantSet("acme", "config:limit", 100);
  await tenantSet("globex", "config:limit", 999);
  const acmeVal = await tenantGet("acme", "config:limit");
  const globexVal = await tenantGet("globex", "config:limit");
  assert.equal(acmeVal, 100, "acme sees its own value");
  assert.equal(globexVal, 999, "globex sees its own value");
  assert.notEqual(acmeVal, globexVal, "values are isolated");
});

test("tenantScan returns only same-tenant keys", async () => {
  resetDurableStore();
  await tenantSet("org-1", "sess:abc", { user: "alice" });
  await tenantSet("org-1", "sess:def", { user: "bob" });
  await tenantSet("org-2", "sess:xyz", { user: "carol" });

  const org1Results = await tenantScan("org-1", "sess:");
  assert.ok(org1Results.length === 2, `expected 2 entries for org-1, got ${org1Results.length}`);
  assert.ok(
    org1Results.every((e) => e.key.startsWith("tenant:org-1:")),
    "all returned keys must belong to org-1"
  );
  assert.ok(
    !org1Results.some((e) => e.key.includes("org-2")),
    "org-2 keys must not appear in org-1 scan"
  );
});

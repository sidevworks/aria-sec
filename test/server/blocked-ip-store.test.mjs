// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

delete process.env.ARIA_KV_REST_URL;
delete process.env.ARIA_KV_REST_TOKEN;
delete process.env.KV_REST_API_URL;
delete process.env.KV_REST_API_TOKEN;

const persistenceDir = mkdtempSync(join(tmpdir(), "aria-blocked-ip-store-"));
process.env.ARIA_PERSISTENCE_DIR = persistenceDir;

test.after(() => {
  rmSync(persistenceDir, { recursive: true, force: true });
});

async function loadStore() {
  return import(`../../server/blockedIpStore.mjs?test=${Date.now()}-${Math.random()}`);
}

test("blocked IPs persist to ARIA_PERSISTENCE_DIR when KV is not configured", async () => {
  const firstStore = await loadStore();
  const tenantId = "tenant-local";
  const ip = "203.0.113.42";

  await firstStore.blockIp(tenantId, ip, {
    reason: "local persistence regression",
    source: "test",
    actor: "tester",
  });

  const secondStore = await loadStore();
  const blocked = await secondStore.getBlockedIps(tenantId);

  assert.equal(blocked.length, 1);
  assert.equal(blocked[0].ip, ip);
  assert.equal(blocked[0].reason, "local persistence regression");

  const raw = JSON.parse(readFileSync(join(persistenceDir, "blocked-ip-store.json"), "utf8"));
  assert.equal(raw.blocked[`blocked:${tenantId}:${ip}`].ip, ip);
});

test("auto-block config persists to ARIA_PERSISTENCE_DIR when KV is not configured", async () => {
  const tenantId = "tenant-local";
  const ip = "198.51.100.7";
  const firstStore = await loadStore();

  await firstStore.configureAutoBlock(tenantId, { threshold: 2, windowMinutes: 10 });

  const secondStore = await loadStore();
  const entry = await secondStore.checkAutoBlock(tenantId, ip, 3);

  assert.equal(entry.ip, ip);
  assert.equal(entry.source, "auto-rule");

  const blocked = await secondStore.getBlockedIps(tenantId);
  assert.ok(blocked.some((item) => item.ip === ip));
});

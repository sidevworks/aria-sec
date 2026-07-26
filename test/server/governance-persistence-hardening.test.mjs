// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const root = mkdtempSync(join(tmpdir(), "aria-governance-"));
const rate = await import(`../../server/rateLimiter.mjs?test=${Date.now()}`);

test.after(() => rmSync(root, { recursive: true, force: true }));

test("file audit ledger rotates without dropping events", async () => {
  const script = `
    import * as audit from "./server/auditLog.mjs";
    for (let i = 0; i < 12; i++) audit.logAuditEvent({ event_type: "test.rotation", context: { tenant_id: "tenant-a", sequence: i } });
    const events = await audit.readAuditEvents({ limit: 20, tenant_id: "tenant-a" });
    process.stdout.write("\\nRESULT:" + JSON.stringify(events.map(e => e.context.sequence)));
  `;
  const child = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, ARIA_PERSISTENCE_DIR: root, ARIA_AUDIT_FILE_MAX_EVENTS: "10" },
  });
  assert.equal(child.status, 0, child.stderr);
  const sequences = JSON.parse(child.stdout.split("RESULT:").pop());
  assert.equal(sequences.length, 12);
  assert.deepEqual(sequences, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0]);
  const archiveDir = join(root, "audit-archive");
  assert.ok(existsSync(archiveDir));
  assert.ok(readdirSync(archiveDir).some((name) => name.endsWith(".json")));
});

test("structured lexical memory is tenant isolated and labels its retrieval method", () => {
  const script = `
    import * as memory from "./server/ariaMemory.mjs";
    const finding = { code: "IAM-001", asset_type: "identity", severity: "high" };
    memory.buildMemoryRecord({ tenantId: "tenant-a", findings: [finding], decision: { reasoning: "revoke stale session" } });
    const result = { other: memory.getMemoryRecords(10, "tenant-b").length, recalled: memory.recallSimilar({ tenantId: "tenant-a", findings: [finding] }) };
    process.stdout.write(JSON.stringify(result));
  `;
  const child = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, ARIA_PERSISTENCE_DIR: root, ARIA_AI_SPM_DISABLE_GH_AUTO: "1" },
  });
  assert.equal(child.status, 0, child.stderr);
  const { other, recalled } = JSON.parse(child.stdout);
  assert.equal(other, 0);
  assert.equal(recalled.matches.length, 1);
  assert.equal(recalled.retrieval_method, "structured_lexical_overlap");
});

test("legacy limiter ignores spoofed forwarding headers unless proxy secret is valid", () => {
  process.env.ARIA_TRUSTED_PROXY_SECRET = "0123456789abcdef";
  const base = {
    socket: { remoteAddress: "127.0.0.1" },
    headers: { "x-forwarded-for": "203.0.113.5" },
  };
  assert.equal(rate.getRateLimitClientIp(base), "127.0.0.1");
  assert.equal(rate.getRateLimitClientIp({
    ...base,
    headers: { ...base.headers, "x-aria-proxy-secret": "0123456789abcdef" },
  }), "203.0.113.5");
});

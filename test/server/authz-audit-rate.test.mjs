// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

async function withTempCwd(prefix, fn) {
  const originalCwd = process.cwd();
  const tempCwd = mkdtempSync(join(tmpdir(), prefix));
  process.chdir(tempCwd);
  try {
    return await fn(tempCwd);
  } finally {
    process.chdir(originalCwd);
  }
}

test("approval denial marks decision as denied, avoids action execution, and records audit trail", async () => {
  await withTempCwd("aria-authz-deny-", async (cwd) => {
    const mod = await import(`../../server/ariaMemory.mjs?deny=${Date.now()}`);
    const tenantId = "tenant-authz-deny";
    const approval = await mod.requestApproval(tenantId, {
      action: "isolate_threat",
      args: { incident_id: "INC-1", scope: "edge-node" },
      reason: "critical operator check",
      risk: "critical",
      source: "operator-command",
    });

    const resolution = await mod.resolveApproval(tenantId, approval.id, "deny", "analyst");
    assert.equal(resolution.status, "denied");
    assert.equal(resolution.result, null);
    assert.equal(resolution.approval.status, "denied");
    assert.match(resolution.approval.resolved_at, /^\d{4}-\d{2}-\d{2}T/);

    const approvals = await mod.getApprovals(tenantId, { status: "pending" });
    assert.equal(approvals.length, 0);

    const persistenceRoot = process.env.ARIA_PERSISTENCE_DIR || join(cwd, "aria-memory");
    const interventions = readFileSync(join(persistenceRoot, "human-interventions.md"), "utf8");
    assert.match(interventions, /Approval denied/);
    assert.match(interventions, /Denied isolate_threat\. Reason: analyst decision\./);
  });
});

test("missing approval id returns explicit missing status", async () => {
  await withTempCwd("aria-authz-missing-", async () => {
    const mod = await import(`../../server/ariaMemory.mjs?missing=${Date.now()}`);
    const resolution = await mod.resolveApproval("tenant-authz-missing", "APR-DOES-NOT-EXIST", "deny", "analyst");

    assert.equal(resolution.status, "missing");
    assert.equal(resolution.error, "Approval item not found");
  });
});

test("GitHub device poll maps slow_down into deterministic pending response for retry pacing", async () => {
  await withTempCwd("aria-rate-slowdown-", async () => {
    const previousClientId = process.env.GITHUB_OAUTH_CLIENT_ID;
    const previousFetch = global.fetch;
    process.env.GITHUB_OAUTH_CLIENT_ID = "test-client-id";

    global.fetch = async () => ({
      ok: true,
      async json() {
        return {
          error: "slow_down",
          error_description: "slow down and retry",
        };
      },
    });

    try {
      const mod = await import(`../../server/connectors/githubAuthStore.mjs?slow=${Date.now()}`);
      const result = await mod.pollGithubDeviceFlow({ device_code: "device-code" });

      assert.equal(result.pending, true);
      assert.equal(result.error, "slow_down");
      assert.equal(result.error_description, "slow down and retry");
    } finally {
      if (previousClientId === undefined) {
        delete process.env.GITHUB_OAUTH_CLIENT_ID;
      } else {
        process.env.GITHUB_OAUTH_CLIENT_ID = previousClientId;
      }
      global.fetch = previousFetch;
    }
  });
});

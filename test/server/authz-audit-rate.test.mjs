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
    const approval = mod.requestApproval({
      action: "isolate_threat",
      args: { incident_id: "INC-1", scope: "edge-node" },
      reason: "critical operator check",
      risk: "critical",
      source: "operator-command",
    });

    const resolution = mod.resolveApproval(approval.id, "deny");
    assert.equal(resolution.status, "denied");
    assert.equal(resolution.result, null);
    assert.equal(resolution.approval.status, "denied");
    assert.match(resolution.approval.resolved_at, /^\d{4}-\d{2}-\d{2}T/);

    const state = mod.getAriaState();
    assert.equal(state.approvals.length, 0);

    const interventions = readFileSync(join(cwd, "aria-memory", "human-interventions.md"), "utf8");
    assert.match(interventions, /Approval denied/);
    assert.match(interventions, /Denied isolate_threat\. Reason: analyst decision\./);
  });
});

test("missing approval id returns explicit missing status", async () => {
  await withTempCwd("aria-authz-missing-", async () => {
    const mod = await import(`../../server/ariaMemory.mjs?missing=${Date.now()}`);
    const resolution = mod.resolveApproval("APR-DOES-NOT-EXIST", "deny");

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

// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

process.env.ARIA_VERIFY_DELAY_MS = "0";

const persistenceRoot = process.env.ARIA_PERSISTENCE_DIR || join(process.cwd(), "aria-memory");
mkdirSync(persistenceRoot, { recursive: true });
writeFileSync(join(persistenceRoot, "autonomy-policy.json"), JSON.stringify({
  tiers: {
    low: { mode: "auto" },
    medium: { mode: "approve" },
    critical: { mode: "approve" },
  },
}), "utf8");

const { runAction } = await import(`../../server/actionRunner.mjs?truth=${Date.now()}`);

test("source-backed scan is independently verified as a completed observation", async () => {
  const result = await runAction({
    actionId: "run-scan",
    params: { target: "local host", depth: "standard" },
    actor: "human:test-operator",
    actorType: "human",
    tenantId: "truth-test",
  });

  assert.equal(result.outcome, "success");
  assert.equal(result.postState.scan.data_mode, "live");
  assert.equal(result.verification.verified, true);
  assert.equal(result.verification.observedState, "source-scan-complete");
});

test("a host isolation plan is labelled staged, never successful enforcement", async () => {
  const result = await runAction({
    actionId: "stage-host-isolation",
    params: { hostLabel: "workstation-7", reason: "operator review" },
    actor: "human:test-operator",
    actorType: "human",
    tenantId: "truth-test",
  });

  assert.equal(result.outcome, "staged");
  assert.equal(result.enforcementMode, "not-enforced");
  assert.equal(result.verification.verified, true);
  assert.equal(result.verification.observedState, "plan-staged");
});

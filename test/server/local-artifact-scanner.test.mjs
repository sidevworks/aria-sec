// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { buildHostIsolationPlan, scanLocalArtifacts } from "../../server/localArtifactScanner.mjs";

test("local artifact scanner finds suspicious hidden profile and launch items", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "aria-scan-"));
  mkdirSync(path.join(root, "Library", "LaunchAgents"), { recursive: true });
  mkdirSync(path.join(root, ".ssh"), { recursive: true });

  writeFileSync(path.join(root, ".zshrc"), "export PATH=/tmp/bin:$PATH\n", "utf8");
  writeFileSync(path.join(root, "Library", "LaunchAgents", "com.test.agent.plist"), "<plist />\n", "utf8");
  writeFileSync(path.join(root, ".ssh", "authorized_keys"), "ssh-ed25519 AAAA\n", "utf8");

  const result = await scanLocalArtifacts({ roots: [root], maxDepth: 6, maxEntries: 100 });
  const foundPaths = result.findings.map((finding) => finding.path);

  assert.ok(foundPaths.some((item) => item.endsWith(".zshrc")));
  assert.ok(foundPaths.some((item) => item.endsWith("com.test.agent.plist")));
  assert.ok(foundPaths.some((item) => item.endsWith("authorized_keys")));
  assert.equal(result.truncated, false);
});

test("host isolation plan stays local-only and non-destructive", () => {
  const plan = buildHostIsolationPlan({ hostLabel: "lab-mac", reason: "Critical containment drill" });
  assert.equal(plan.mode, "local-host-only");
  assert.ok(plan.constraints.includes("No remote device wipe or destruction."));
  assert.ok(plan.actions.some((item) => /firewall layer/i.test(item)));
});

// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createStateBackup, restoreStateBackup, verifyStateBackup } from "../../server/stateBackup.mjs";

test("file persistence backup verifies and restores into an empty target", () => {
  const root = mkdtempSync(join(tmpdir(), "aria-backup-test-"));
  const source = join(root, "source");
  const backup = join(root, "backup");
  const restored = join(root, "restored");
  mkdirSync(join(source, "tenants", "acme"), { recursive: true });
  writeFileSync(join(source, "tenants", "acme", "trust-scores.json"), "{\"trust\":1}\n", "utf8");
  writeFileSync(join(source, "audit-events.json"), "[]\n", "utf8");

  const manifest = createStateBackup({ sourceDir: source, backupDir: backup });
  assert.equal(manifest.files.length, 2);
  assert.equal(verifyStateBackup(backup).ok, true);
  assert.equal(restoreStateBackup({ backupDir: backup, targetDir: restored }).restored_files, 2);
  assert.equal(readFileSync(join(restored, "tenants", "acme", "trust-scores.json"), "utf8"), "{\"trust\":1}\n");
});

test("backup verification detects tampering", () => {
  const root = mkdtempSync(join(tmpdir(), "aria-backup-tamper-"));
  const source = join(root, "source");
  const backup = join(root, "backup");
  mkdirSync(source, { recursive: true });
  writeFileSync(join(source, "state.json"), "{\"ok\":true}\n", "utf8");
  createStateBackup({ sourceDir: source, backupDir: backup });
  writeFileSync(join(backup, "state.json"), "{\"ok\":false}\n", "utf8");
  assert.equal(verifyStateBackup(backup).ok, false);
});

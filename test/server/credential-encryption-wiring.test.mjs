// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  deleteCredential,
  loadCredential,
  storeCredential,
} from "../../server/connectors/credentialVault.mjs";

test("preferred credential encryption key stores and loads encrypted connector data", async () => {
  const originalDir = process.env.ARIA_PERSISTENCE_DIR;
  const originalPreferred = process.env.ARIA_CREDENTIAL_ENCRYPTION_KEY;
  const originalLegacy = process.env.ARIA_CREDENTIAL_KEY;
  const root = mkdtempSync(join(tmpdir(), "aria-credential-vault-"));

  process.env.ARIA_PERSISTENCE_DIR = root;
  process.env.ARIA_CREDENTIAL_ENCRYPTION_KEY = "ab".repeat(32);
  delete process.env.ARIA_CREDENTIAL_KEY;

  try {
    await storeCredential("test-provider", "tenant-a", { token: "secret-value" });
    assert.deepEqual(
      await loadCredential("test-provider", "tenant-a"),
      { token: "secret-value" },
    );
    await deleteCredential("test-provider", "tenant-a");
    assert.equal(await loadCredential("test-provider", "tenant-a"), null);
  } finally {
    if (originalDir === undefined) delete process.env.ARIA_PERSISTENCE_DIR;
    else process.env.ARIA_PERSISTENCE_DIR = originalDir;
    if (originalPreferred === undefined) delete process.env.ARIA_CREDENTIAL_ENCRYPTION_KEY;
    else process.env.ARIA_CREDENTIAL_ENCRYPTION_KEY = originalPreferred;
    if (originalLegacy === undefined) delete process.env.ARIA_CREDENTIAL_KEY;
    else process.env.ARIA_CREDENTIAL_KEY = originalLegacy;
    rmSync(root, { recursive: true, force: true });
  }
});

test("credential vault rejects malformed encryption keys", async () => {
  const originalPreferred = process.env.ARIA_CREDENTIAL_ENCRYPTION_KEY;
  const originalLegacy = process.env.ARIA_CREDENTIAL_KEY;
  process.env.ARIA_CREDENTIAL_ENCRYPTION_KEY = "too-short";
  delete process.env.ARIA_CREDENTIAL_KEY;

  try {
    await assert.rejects(
      storeCredential("test-provider", "tenant-a", { token: "secret-value" }),
      /64-character hex/,
    );
  } finally {
    if (originalPreferred === undefined) delete process.env.ARIA_CREDENTIAL_ENCRYPTION_KEY;
    else process.env.ARIA_CREDENTIAL_ENCRYPTION_KEY = originalPreferred;
    if (originalLegacy === undefined) delete process.env.ARIA_CREDENTIAL_KEY;
    else process.env.ARIA_CREDENTIAL_KEY = originalLegacy;
  }
});

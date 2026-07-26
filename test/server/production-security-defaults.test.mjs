// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const ROOT = new URL("../../", import.meta.url);

function runModule(source, env = {}) {
  return execFileSync(process.execPath, ["--input-type=module", "-e", source], {
    cwd: ROOT,
    encoding: "utf8",
    env: {
      PATH: process.env.PATH,
      ...env,
    },
  }).trim();
}

test("built-in operator/aria login is disabled in production", () => {
  const output = runModule(
    'const { verifyCredentials } = await import("./server/authSessions.mjs"); console.log(JSON.stringify(verifyCredentials("operator", "aria")));',
    { NODE_ENV: "production" },
  );
  assert.equal(output, "null");
});

test("built-in operator remains available in explicit development mode", () => {
  const output = runModule(
    'const { verifyCredentials } = await import("./server/authSessions.mjs"); console.log(verifyCredentials("operator", "aria")?.role || "none");',
    { NODE_ENV: "development" },
  );
  assert.equal(output, "owner");
});

test("local launch commands explicitly enable development demo login", () => {
  const packageJson = readFileSync(new URL("../../package.json", import.meta.url), "utf8");
  const launcher = readFileSync(new URL("../../scripts/aria.mjs", import.meta.url), "utf8");
  const globalLauncher = readFileSync(new URL("../../scripts/aria.sh", import.meta.url), "utf8");

  assert.match(packageJson, /NODE_ENV=development ARIA_ENABLE_DEMO_LOGIN=true/);
  assert.match(packageJson, /"aria": "NODE_ENV=development ARIA_ENABLE_DEMO_LOGIN=true node scripts\/aria\.mjs"/);
  assert.match(globalLauncher, /NODE_ENV=.*development/);
  assert.match(globalLauncher, /ARIA_ENABLE_DEMO_LOGIN=.*true/);
  assert.doesNotMatch(launcher, /ARIA_ENABLE_DEMO_LOGIN: process\.env\.ARIA_ENABLE_DEMO_LOGIN/);
});

test("production startup check is fatal without credential encryption", () => {
  assert.throws(
    () => runModule(
      'const { runStartupChecks } = await import("./server/persistenceConfig.mjs"); runStartupChecks();',
      { NODE_ENV: "production", ARIA_PERSISTENCE_DIR: "./aria-memory" },
    ),
    (error) => {
      assert.equal(error.status, 1);
      assert.match(String(error.stderr), /production startup requires a valid 64-character hex/i);
      return true;
    },
  );
});

test("production startup accepts a valid AES-256 key", () => {
  const output = runModule(
    'const { runStartupChecks } = await import("./server/persistenceConfig.mjs"); runStartupChecks(); console.log("started");',
    {
      NODE_ENV: "production",
      ARIA_PERSISTENCE_DIR: "./aria-memory",
      ARIA_CREDENTIAL_ENCRYPTION_KEY: "a".repeat(64),
    },
  );
  assert.match(output, /started$/);
});

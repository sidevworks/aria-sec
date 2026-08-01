// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const testRoot = join(root, "test");

function collect(dir) {
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return collect(path);
      return entry.name.endsWith(".test.mjs") ? [path] : [];
    })
    .sort();
}

const files = collect(testRoot);
let passed = 0;
const failed = [];

for (const file of files) {
  const sandbox = mkdtempSync(join(tmpdir(), "aria-test-"));
  const persistenceDir = join(sandbox, "aria-memory");
  const relative = file.slice(root.length + 1);
  try {
    const result = spawnSync(
      process.execPath,
      ["--test", "--test-reporter=dot", file],
      {
        cwd: root,
        encoding: "utf8",
        env: {
          ...process.env,
          NODE_ENV: "test",
          ARIA_AI_SPM_DISABLE_GH_AUTO: "1",
          ARIA_ENABLE_DEMO_LOGIN: "true",
          ARIA_ALLOW_UNAUTH_SESSION_ISSUE: "true",
          ARIA_SESSION_RATE_LIMIT_PER_WINDOW: "1000",
          ARIA_PERSISTENCE_DIR: persistenceDir,
          ARIA_QUARANTINE_PATH: join(sandbox, "quarantine"),
          ARIA_SESSION_SECRET: "aria-isolated-test-suite-secret",
        },
      },
    );

    if (result.status === 0) {
      passed += 1;
      process.stdout.write(`PASS ${relative}\n`);
    } else {
      failed.push(relative);
      process.stdout.write(`FAIL ${relative}\n`);
      process.stdout.write(result.stdout || "");
      process.stderr.write(result.stderr || "");
    }
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
}

process.stdout.write(`\nTest files: ${files.length}, passed: ${passed}, failed: ${failed.length}\n`);
if (failed.length) {
  process.stdout.write(`Failed files:\n${failed.map((file) => `- ${file}`).join("\n")}\n`);
  process.exitCode = 1;
}

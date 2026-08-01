// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import { restoreStateBackup } from "../server/stateBackup.mjs";

const backupDir = process.argv[2];
const targetDir = process.argv[3];
if (!backupDir || !targetDir) {
  process.stderr.write("Usage: node scripts/restore-state.mjs /backup/directory /empty/restore/target\n");
  process.exitCode = 1;
} else {
  process.stdout.write(`${JSON.stringify({ ok: true, ...restoreStateBackup({ backupDir, targetDir }) })}\n`);
}

// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import { createStateBackup } from "../server/stateBackup.mjs";

const backupDir = process.argv[2];
const sourceDir = process.env.ARIA_PERSISTENCE_DIR;
if (!sourceDir || !backupDir) {
  process.stderr.write("Usage: ARIA_PERSISTENCE_DIR=/path/to/state node scripts/backup-state.mjs /empty/backup/directory\n");
  process.exitCode = 1;
} else {
  const manifest = createStateBackup({ sourceDir, backupDir });
  process.stdout.write(`${JSON.stringify({ ok: true, files: manifest.files.length, backupDir })}\n`);
}

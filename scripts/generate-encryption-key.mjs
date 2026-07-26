#!/usr/bin/env node
// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

/**
 * Generates a random AES-256 key for ARIA_CREDENTIAL_ENCRYPTION_KEY.
 * Run once and add the output to your .env.local or secret manager.
 *
 * Usage:
 *   node scripts/generate-encryption-key.mjs
 *   node scripts/generate-encryption-key.mjs --write   # appends to .env.local
 */
import { randomBytes } from "node:crypto";
import { existsSync, appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

const key = randomBytes(32).toString("hex");
const envLine = `ARIA_CREDENTIAL_ENCRYPTION_KEY=${key}`;

const writeFlag = process.argv.includes("--write");

if (writeFlag) {
  const envPath = join(process.cwd(), ".env.local");
  const existing = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";

  if (existing.includes("ARIA_CREDENTIAL_ENCRYPTION_KEY=")) {
    console.error("⚠  ARIA_CREDENTIAL_ENCRYPTION_KEY is already set in .env.local — aborting.");
    console.error("   Delete the existing key first if you want to rotate it.");
    process.exit(1);
  }

  appendFileSync(envPath, `\n${envLine}\n`);
  console.log(`✓ Written ARIA_CREDENTIAL_ENCRYPTION_KEY to .env.local`);
  console.log(`  Key: ${key.slice(0, 8)}…${key.slice(-8)} (${key.length} chars)`);
  console.log("");
  console.log("⚠  WARNING: Rotating the key will make existing encrypted credentials");
  console.log("   unreadable. Disconnect all connectors before rotating.");
} else {
  console.log("# Add this to your .env.local or secret manager:");
  console.log(envLine);
  console.log("");
  console.log("# Or run with --write to append automatically:");
  console.log("# node scripts/generate-encryption-key.mjs --write");
}

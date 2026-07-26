#!/usr/bin/env node
// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

// ARIA demo license tool — offline, signed keys (ECDSA P-256).
//
//   node scripts/mint-license.mjs init
//       One-time: generate the signing keypair. Writes the PUBLIC key to
//       src/license-public-key.json (committed, shipped in the app) and the
//       PRIVATE key to .secrets/license-private.pem (gitignored — keep it safe;
//       anyone with it can mint keys).
//
//   node scripts/mint-license.mjs mint [--minutes 60] [--days 60] [--label "Investor X"]
//       Mint a license key. --minutes = active session length (default 60).
//       --days = hard absolute expiry from now (default 60) — the key is dead
//       after this regardless of use. --label is embedded for your reference.
//
// The key the investor pastes is:  ARIA-<base64url(payload)>.<base64url(sig)>

import { generateKeyPairSync, sign, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUB_PATH = join(ROOT, "src", "license-public-key.json");
const PRIV_PATH = join(ROOT, ".secrets", "license-private.pem");

const b64url = (buf) => Buffer.from(buf).toString("base64url");

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith("--")) {
      const key = argv[i].slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[(i += 1)] : "true";
      out[key] = val;
    }
  }
  return out;
}

function init() {
  if (existsSync(PRIV_PATH)) {
    console.error(`Refusing to overwrite existing private key at ${PRIV_PATH}.`);
    console.error("Delete it first if you really mean to rotate (invalidates all issued keys).");
    process.exit(1);
  }
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const jwk = publicKey.export({ format: "jwk" });
  mkdirSync(dirname(PUB_PATH), { recursive: true });
  mkdirSync(dirname(PRIV_PATH), { recursive: true });
  writeFileSync(PUB_PATH, `${JSON.stringify(jwk, null, 2)}\n`);
  writeFileSync(PRIV_PATH, privateKey.export({ format: "pem", type: "pkcs8" }), { mode: 0o600 });
  console.log(`✓ Public key  → ${PUB_PATH}  (commit this)`);
  console.log(`✓ Private key → ${PRIV_PATH}  (KEEP SECRET — gitignored)`);
}

function mint(args) {
  if (!existsSync(PRIV_PATH)) {
    console.error("No private key. Run `node scripts/mint-license.mjs init` first.");
    process.exit(1);
  }
  const privateKey = readFileSync(PRIV_PATH, "utf8");
  const minutes = Number(args.minutes || 60);
  const days = Number(args.days || 60);
  const payload = {
    id: randomUUID(),
    dur: minutes,                                   // session length in minutes
    exp: Date.now() + days * 24 * 60 * 60 * 1000,   // absolute hard expiry (ms)
    label: args.label || "",
    iat: Date.now(),
  };
  const payloadB64 = b64url(JSON.stringify(payload));
  const sig = sign("sha256", Buffer.from(payloadB64), { key: privateKey, dsaEncoding: "ieee-p1363" });
  const key = `ARIA-${payloadB64}.${b64url(sig)}`;
  console.log(`\nLicense key (give this to ${payload.label || "the recipient"}):\n`);
  console.log(key);
  console.log(`\n  session length : ${minutes} min`);
  console.log(`  hard expiry    : ${new Date(payload.exp).toISOString()}`);
  console.log(`  id             : ${payload.id}\n`);
}

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === "init") init();
else if (cmd === "mint") mint(parseArgs(rest));
else {
  console.log("Usage:\n  node scripts/mint-license.mjs init\n  node scripts/mint-license.mjs mint [--minutes 60] [--days 60] [--label \"Investor X\"]");
  process.exit(cmd ? 1 : 0);
}

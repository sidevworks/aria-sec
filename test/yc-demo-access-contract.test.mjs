// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const buildFlagsSource = readFileSync(new URL("../src/ariaBuildFlags.js", import.meta.url), "utf8");
const licenseSource = readFileSync(new URL("../src/ariaLicense.js", import.meta.url), "utf8");
const gateSource = readFileSync(new URL("../src/AriaDemoLicenseScreen.jsx", import.meta.url), "utf8");
const publicKey = readFileSync(new URL("../src/license-public-key.json", import.meta.url));
const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("YC review build preserves the submitted reusable license contract", () => {
  assert.match(buildFlagsSource, /VITE_ARIA_YC_DEMO/);
  assert.match(buildFlagsSource, /export const YC_DEMO_BUILD/);
  assert.match(licenseSource, /YC_DEMO_BUILD \? \["d6a23ad2-78a6-4cbc-9db1-f869b4540700"\] : \[\]/);
  assert.match(gateSource, /YC Demo Access/);
  assert.match(gateSource, /type=\{YC_DEMO_BUILD \? "password" : "text"\}/);
  assert.equal(
    packageJson.scripts["build:yc-demo"],
    "VITE_ARIA_DEMO_BUILD=true VITE_ARIA_YC_DEMO=true vite build",
  );
});

test("YC license verification public key remains unchanged", () => {
  assert.equal(
    createHash("sha256").update(publicKey).digest("hex"),
    "d157b4b084ba82924960c4df8bf81518d831806d1d8527e7539d5696ae4e33ab",
  );
});

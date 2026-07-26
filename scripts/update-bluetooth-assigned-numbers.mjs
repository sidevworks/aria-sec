#!/usr/bin/env node
// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = "https://bitbucket.org/bluetooth-SIG/public/raw/main/assigned_numbers";
const SOURCES = {
  companies: `${BASE}/company_identifiers/company_identifiers.yaml`,
  services: `${BASE}/uuids/service_uuids.yaml`,
  members: `${BASE}/uuids/member_uuids.yaml`,
};
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(projectRoot, "server/data/bluetooth-assigned-numbers.json");

function yamlScalar(raw) {
  const value = String(raw || "").trim();
  if (value.startsWith('"') && value.endsWith('"')) return JSON.parse(value);
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replace(/''/g, "'");
  }
  return value;
}

function parsePairs(text, keyName) {
  const rows = [];
  const lines = String(text).split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(new RegExp(`^\\s*-\\s+${keyName}:\\s*0x([0-9a-f]+)\\s*$`, "i"));
    if (!match) continue;
    const nameLine = lines.slice(index + 1, index + 5).find((line) => /^\s+name:\s*/.test(line));
    if (!nameLine) continue;
    const name = yamlScalar(nameLine.replace(/^\s+name:\s*/, ""));
    if (name) rows.push([match[1].toUpperCase(), name]);
  }
  return rows;
}

async function download(url) {
  const response = await fetch(url, {
    headers: { "user-agent": "Aria-Guardian-Bluetooth-Registry-Updater/1.0" },
  });
  if (!response.ok) throw new Error(`Bluetooth SIG registry download failed: ${response.status} ${url}`);
  return response.text();
}

const [companyYaml, serviceYaml, memberYaml] = await Promise.all([
  download(SOURCES.companies),
  download(SOURCES.services),
  download(SOURCES.members),
]);

const companies = Object.fromEntries(
  parsePairs(companyYaml, "value")
    .map(([hex, name]) => [String(Number.parseInt(hex, 16)), name])
    .sort(([left], [right]) => Number(left) - Number(right))
);
const standardServices = Object.fromEntries(
  parsePairs(serviceYaml, "uuid").map(([hex, name]) => [
    hex.padStart(4, "0"),
    { name, kind: "standard", owner: "Bluetooth SIG" },
  ])
);
const memberServices = Object.fromEntries(
  parsePairs(memberYaml, "uuid").map(([hex, owner]) => [
    hex.padStart(4, "0"),
    { name: `${owner} member service`, kind: "member", owner },
  ])
);

if (Object.keys(companies).length < 3_500) {
  throw new Error(`Only ${Object.keys(companies).length} company identifiers parsed; refusing to replace registry.`);
}
if (Object.keys(standardServices).length < 50 || Object.keys(memberServices).length < 500) {
  throw new Error("Bluetooth service registries were unexpectedly small; refusing to replace registry.");
}

const output = {
  metadata: {
    source: "Bluetooth SIG Assigned Numbers",
    repository: "https://bitbucket.org/bluetooth-SIG/public/src/main/assigned_numbers/",
    generatedAt: new Date().toISOString(),
    sourceSha256: {
      companies: createHash("sha256").update(companyYaml).digest("hex"),
      services: createHash("sha256").update(serviceYaml).digest("hex"),
      members: createHash("sha256").update(memberYaml).digest("hex"),
    },
  },
  companies,
  services: { ...memberServices, ...standardServices },
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(output)}\n`, "utf8");
console.log(`Wrote ${Object.keys(companies).length} companies and ${Object.keys(output.services).length} services to ${outputPath}`);

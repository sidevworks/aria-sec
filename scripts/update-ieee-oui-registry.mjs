#!/usr/bin/env node
// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const IEEE_MA_L_URL = "https://standards-oui.ieee.org/oui/oui.csv";
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(projectRoot, "server/data/ieee-ma-l.json");
const inputPath = process.argv[2] ? resolve(process.cwd(), process.argv[2]) : null;

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows;
}

async function loadRegistry() {
  if (inputPath) return readFile(inputPath, "utf8");

  const response = await fetch(IEEE_MA_L_URL, {
    headers: { "user-agent": "Aria-Guardian-Registry-Updater/1.0" },
  });
  if (!response.ok) {
    throw new Error(`IEEE registry download failed with HTTP ${response.status}`);
  }
  return response.text();
}

const csv = await loadRegistry();
const rows = parseCsv(csv);
const headers = rows.shift();
if (
  headers?.[0] !== "Registry" ||
  headers?.[1] !== "Assignment" ||
  headers?.[2] !== "Organization Name"
) {
  throw new Error("Unexpected IEEE MA-L CSV schema; refusing to replace the bundled registry.");
}

const registry = {};
for (const [type, assignment, organization] of rows) {
  const prefix = String(assignment || "").trim().toUpperCase();
  const vendor = String(organization || "").trim();
  if (type !== "MA-L" || !/^[0-9A-F]{6}$/.test(prefix) || !vendor) continue;
  registry[prefix] = vendor;
}

const sortedRegistry = Object.fromEntries(
  Object.entries(registry).sort(([left], [right]) => left.localeCompare(right))
);
if (Object.keys(sortedRegistry).length < 30_000) {
  throw new Error(`IEEE registry contained only ${Object.keys(sortedRegistry).length} usable entries.`);
}

const output = `${JSON.stringify(sortedRegistry)}\n`;
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, output, "utf8");

const sourceSha256 = createHash("sha256").update(csv).digest("hex");
console.log(`Wrote ${Object.keys(sortedRegistry).length} IEEE MA-L assignments to ${outputPath}`);
console.log(`Source: ${inputPath || IEEE_MA_L_URL}`);
console.log(`Source SHA-256: ${sourceSha256}`);

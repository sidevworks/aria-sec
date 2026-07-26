// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

// Pre-baked demo fixtures served in demo builds so the AI surfaces look
// model-powered without shipping a Gemini key.

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), "demo-fixtures");

// True when the request opted into demo mode (x-aria-demo:1 or ?demo=true).
export function isDemoRequest(req) {
  if (String(req?.headers?.["x-aria-demo"] || "") === "1") return true;
  try {
    return new URL(req.url, "http://localhost").searchParams.get("demo") === "true";
  } catch {
    return false;
  }
}

const _cache = new Map();
function loadFixture(name) {
  if (_cache.has(name)) return _cache.get(name);
  let value = null;
  try {
    value = JSON.parse(readFileSync(join(FIXTURE_DIR, `${name}.json`), "utf8"));
  } catch {
    value = null; // fixture not generated — caller falls back
  }
  _cache.set(name, value);
  return value;
}

export function getDecisionFixture() {
  return loadFixture("decision-engine");
}

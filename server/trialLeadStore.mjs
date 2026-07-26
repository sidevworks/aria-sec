// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import { existsSync, mkdirSync, appendFileSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Public trial / contact submissions from the marketing landing. Append-only
// so a burst of requests can never clobber earlier leads; each line is one JSON
// record. Honors ARIA_PERSISTENCE_DIR when set, else falls back beside the
// server module (same convention as the scan-records store).
const __dir = dirname(fileURLToPath(import.meta.url));
const LEADS_DIR = String(process.env.ARIA_PERSISTENCE_DIR || join(__dir, "trial-leads")).trim();
const LEADS_FILE = join(LEADS_DIR, "trial-leads.jsonl");

try { mkdirSync(LEADS_DIR, { recursive: true }); } catch { /* already exists */ }

const FIELD_LIMITS = {
  name: 200,
  email: 320,
  organisation: 200,
  size: 40,
  role: 200,
  industry: 80,
  footprint: 120,
  message: 4000,
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clean(value, max) {
  return String(value ?? "").trim().slice(0, max);
}

// Validates and normalises a raw submission. Returns { ok, record } or
// { ok:false, error } — required fields are name, email, organisation, size.
export function normaliseTrialLead(raw, meta = {}) {
  const body = raw && typeof raw === "object" ? raw : {};
  const record = {};
  for (const [field, max] of Object.entries(FIELD_LIMITS)) {
    record[field] = clean(body[field], max);
  }
  if (!record.name) return { ok: false, error: "Name is required." };
  if (!EMAIL_RE.test(record.email)) return { ok: false, error: "A valid work email is required." };
  if (!record.organisation) return { ok: false, error: "Organisation is required." };
  if (!record.size) return { ok: false, error: "Organisation size is required." };

  return {
    ok: true,
    record: {
      id: `lead-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ...record,
      source: clean(body.source, 60) || "landing",
      received_at: new Date().toISOString(),
      ip: meta.ip || null,
      user_agent: clean(meta.userAgent, 400) || null,
    },
  };
}

export function saveTrialLead(record) {
  appendFileSync(LEADS_FILE, `${JSON.stringify(record)}\n`, "utf8");
  return record;
}

export function listTrialLeads(limit = 200) {
  if (!existsSync(LEADS_FILE)) return [];
  const lines = readFileSync(LEADS_FILE, "utf8").split(/\r?\n/).filter(Boolean);
  return lines
    .slice(-limit)
    .map((line) => { try { return JSON.parse(line); } catch { return null; } })
    .filter(Boolean)
    .reverse();
}

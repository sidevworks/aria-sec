// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

/**
 * Audit Log — durable via KV when configured; local/dev fallback to file.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, renameSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { isDurable, durableLpush, durableLrange } from "./durableStore.mjs";
import { resolveLegacyMemoryDir } from "./persistenceConfig.mjs";
import { isDbConfigured, query } from "./db.mjs";

const MEMORY_DIR = resolveLegacyMemoryDir();
const AUDIT_LOG_PATH = join(MEMORY_DIR, "audit-events.json");
const AUDIT_ARCHIVE_DIR = join(MEMORY_DIR, "audit-archive");
const MAX_EVENTS = Math.max(10, Number(process.env.ARIA_AUDIT_FILE_MAX_EVENTS || 2000));
const KV_LIST_KEY = "aria:audit:events";

function retentionDays() {
  const v = Number(process.env.ARIA_AUDIT_RETENTION_DAYS ?? 90);
  return Number.isFinite(v) && v >= 0 ? v : 90;
}

function now() {
  return new Date().toISOString();
}

function ensureStore() {
  if (!existsSync(MEMORY_DIR)) mkdirSync(MEMORY_DIR, { recursive: true });
  if (!existsSync(AUDIT_LOG_PATH)) {
    writeFileSync(AUDIT_LOG_PATH, "[]\n", "utf8");
  }
}

function readAuditStore() {
  ensureStore();
  try {
    const data = JSON.parse(readFileSync(AUDIT_LOG_PATH, "utf8"));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function writeAuditStore(events) {
  ensureStore();
  if (events.length > MAX_EVENTS) {
    mkdirSync(AUDIT_ARCHIVE_DIR, { recursive: true });
    const archiveName = `audit-events-${new Date().toISOString().replace(/[:.]/g, "-")}-${process.pid}.json`;
    renameSync(AUDIT_LOG_PATH, join(AUDIT_ARCHIVE_DIR, archiveName));
    events = events.slice(-1);
  }
  writeFileSync(AUDIT_LOG_PATH, `${JSON.stringify(events, null, 2)}\n`, "utf8");
}

function readFileEvents(path) {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function archivePaths() {
  if (!existsSync(AUDIT_ARCHIVE_DIR)) return [];
  return readdirSync(AUDIT_ARCHIVE_DIR)
    .filter((name) => /^audit-events-.*\.json$/.test(name))
    .sort()
    .reverse()
    .map((name) => join(AUDIT_ARCHIVE_DIR, name));
}

function readAllFileEvents() {
  return [...archivePaths().reverse().flatMap(readFileEvents), ...readAuditStore()];
}

function rewriteAllFileEvents(events) {
  mkdirSync(AUDIT_ARCHIVE_DIR, { recursive: true });
  for (const path of archivePaths()) unlinkSync(path);
  const chunks = [];
  for (let i = 0; i < events.length; i += MAX_EVENTS) chunks.push(events.slice(i, i + MAX_EVENTS));
  const current = chunks.pop() || [];
  chunks.forEach((chunk, index) => {
    const name = `audit-events-rewrite-${String(index).padStart(6, "0")}.json`;
    writeFileSync(join(AUDIT_ARCHIVE_DIR, name), `${JSON.stringify(chunk, null, 2)}\n`, "utf8");
  });
  writeFileSync(AUDIT_LOG_PATH, `${JSON.stringify(current, null, 2)}\n`, "utf8");
}

export function getAuditLogPath() {
  return AUDIT_LOG_PATH;
}

export function logAuditEvent({ event_type, status = "success", actor = "system", context = {} } = {}) {
  const type = String(event_type || "").trim();
  if (!type) return null;

  const ttl = retentionDays();
  const retainUntil = ttl > 0 ? new Date(Date.now() + ttl * 86_400_000).toISOString() : null;

  const event = {
    id: `AUD-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    timestamp: now(),
    event_type: type,
    status: String(status || "success"),
    actor: String(actor || "system"),
    context: context && typeof context === "object" ? context : {},
    retention: {
      ttl_days: ttl > 0 ? ttl : null,
      retain_until: retainUntil,
      redacted_at: null,
    },
  };

  try {
    const events = readAuditStore();
    events.push(event);
    writeAuditStore(events);
  } catch (err) {
    process.stderr.write(`[auditLog] file write error: ${err.message}\n`);
  }

  process.stdout.write(JSON.stringify({ level: "audit", ...event }) + "\n");

  if (isDurable()) {
    durableLpush(KV_LIST_KEY, event, MAX_EVENTS).catch((err) => {
      process.stdout.write(JSON.stringify({ level: "warn", msg: "audit KV push failed", error: String(err) }) + "\n");
    });
  }

  // Postgres mirror — fire-and-forget so logAuditEvent stays synchronous and
  // call sites never need to await. The same `event` object built above is the
  // single source of truth for every backend.
  if (isDbConfigured()) {
    query(
      "INSERT INTO audit_events (id, tenant_id, event_type, status, actor, context, retain_until) VALUES ($1,$2,$3,$4,$5,$6,$7)",
      [event.id, event.context?.tenant_id ?? null, event.event_type, event.status, event.actor, event.context, event.retention.retain_until]
    ).catch((err) => {
      process.stderr.write(`[auditLog] pg insert error: ${err.message}\n`);
    });
  }

  return event;
}

// Maps a Postgres audit_events row back to the same shape the file/KV stores
// return, so readAuditEvents callers are backend-agnostic.
function rowToEvent(row) {
  return {
    id: row.id,
    timestamp: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    event_type: row.event_type,
    status: row.status,
    actor: row.actor,
    context: row.context && typeof row.context === "object" ? row.context : {},
    retention: {
      ttl_days: null,
      retain_until: row.retain_until instanceof Date ? row.retain_until.toISOString() : (row.retain_until ?? null),
      redacted_at: row.redacted_at instanceof Date ? row.redacted_at.toISOString() : (row.redacted_at ?? null),
    },
  };
}

export async function pruneAuditEvents() {
  if (isDbConfigured()) {
    const { rowCount } = await query("DELETE FROM audit_events WHERE retain_until < now()");
    return rowCount || 0;
  }
  const events = readAllFileEvents();
  const cutoff = new Date().toISOString();
  const kept = events.filter((e) => {
    const until = e.retention?.retain_until;
    if (!until) return true;
    return until > cutoff;
  });
  const pruned = events.length - kept.length;
  if (pruned > 0) {
    rewriteAllFileEvents(kept);
  }
  return pruned;
}

export async function redactAuditEvent(id) {
  if (!id) return false;
  if (isDbConfigured()) {
    const { rowCount } = await query(
      "UPDATE audit_events SET actor='[redacted]', context='{}'::jsonb, redacted_at=now() WHERE id=$1",
      [id]
    );
    return (rowCount || 0) > 0;
  }
  const events = readAllFileEvents();
  let found = false;
  const updated = events.map((e) => {
    if (e.id !== id) return e;
    found = true;
    return {
      ...e,
      actor: "[redacted]",
      context: {},
      retention: { ...(e.retention || {}), redacted_at: now() },
    };
  });
  if (found) {
    rewriteAllFileEvents(updated);
  }
  return found;
}

export async function readAuditEvents({ limit = 200, event_type = null, status = null, tenant_id = null } = {}) {
  // tenant_id is read at a generously wide window (max * 2) before slicing to
  // `max`, because the underlying stores are not tenant-partitioned — filtering
  // happens here. This trades a little extra read work for not needing a
  // separate audit file/list per tenant for what is, by design, a single
  // append-only security ledger.
  const max = Number.isFinite(Number(limit)) && Number(limit) > 0 ? Math.floor(Number(limit)) : 200;

  if (isDbConfigured()) {
    const { rows } = await query(
      `SELECT * FROM audit_events
         WHERE ($1::text IS NULL OR event_type = $1)
           AND ($2::text IS NULL OR status = $2)
           AND ($3::text IS NULL OR tenant_id = $3)
         ORDER BY created_at DESC
         LIMIT $4`,
      [event_type || null, status || null, tenant_id || null, max]
    );
    return rows.map(rowToEvent);
  }

  let events;
  if (isDurable()) {
    try {
      const raw = await durableLrange(KV_LIST_KEY, 0, max * 4 - 1);
      events = raw.filter((e) => e && typeof e === "object");
    } catch (err) {
      process.stdout.write(JSON.stringify({ level: "warn", msg: "audit KV read failed, using file fallback", error: String(err) }) + "\n");
      events = readAllFileEvents().slice().reverse();
    }
  } else {
    events = readAllFileEvents().slice().reverse();
  }

  if (event_type) events = events.filter((e) => e.event_type === event_type);
  if (status) events = events.filter((e) => e.status === status);
  if (tenant_id) events = events.filter((e) => e.context?.tenant_id === tenant_id);

  return events.slice(0, max);
}

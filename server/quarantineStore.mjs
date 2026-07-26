// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

/**
 * quarantineStore.mjs
 * KV-backed store for quarantined files per tenant.
 * Key pattern: quarantine:{tenantId}:{id}
 *
 * In Electron mode (isDurable() is false), uses files under ARIA_QUARANTINE_PATH.
 */

import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { durableGet, durableSet, durableDel, durableScan, isDurable } from "./durableStore.mjs";
import { logAuditEvent } from "./auditLog.mjs";

// ── Electron / file fallback ──────────────────────────────────────────────────

const QUARANTINE_PATH = process.env.ARIA_QUARANTINE_PATH ?? null;

function getFileStorePath() {
  return QUARANTINE_PATH ?? join(process.cwd(), "aria-quarantine");
}

function ensureFileStore() {
  const dir = getFileStorePath();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function fileRecordPath(tenantId, id) {
  return join(ensureFileStore(), `${tenantId}_${id}.json`);
}

function fileReadEntry(tenantId, id) {
  const p = fileRecordPath(tenantId, id);
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; }
}

function fileWriteEntry(tenantId, id, entry) {
  writeFileSync(fileRecordPath(tenantId, id), JSON.stringify(entry, null, 2), "utf8");
}

function fileDeleteEntry(tenantId, id) {
  const p = fileRecordPath(tenantId, id);
  if (existsSync(p)) unlinkSync(p);
}

function fileScanTenant(tenantId) {
  const dir = ensureFileStore();
  const prefix = `${tenantId}_`;
  const results = [];
  for (const name of readdirSync(dir)) {
    if (!name.startsWith(prefix) || !name.endsWith(".json")) continue;
    try {
      const entry = JSON.parse(readFileSync(join(dir, name), "utf8"));
      if (entry) results.push(entry);
    } catch { /* skip corrupt */ }
  }
  return results;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function quarantineKey(tenantId, id) {
  return `quarantine:${tenantId}:${id}`;
}

function parseValue(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "object") return raw;
  try { return JSON.parse(raw); } catch { return null; }
}

const DEFAULT_RETENTION_DAYS = 90;

function formatBytes(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number <= 0) return "";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(number) / Math.log(1024)));
  return `${(number / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function normalizeEntry(entry) {
  if (!entry || typeof entry !== "object") return entry;
  const name = entry.name ?? entry.filename ?? entry.filepath?.split(/[\\/]/).pop() ?? entry.id;
  const path = entry.path ?? entry.filepath ?? entry.filename ?? entry.id;
  const size = entry.size ?? formatBytes(entry.file_size);
  return {
    ...entry,
    name,
    path,
    size,
    kind: entry.kind ?? "quarantined-file",
    source: entry.source ?? (isDurable() ? "quarantine-kv" : "quarantine-file-store"),
    modified: entry.modified ?? (entry.quarantined_at ? new Date(entry.quarantined_at).toISOString() : null),
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Purge expired quarantine entries for a tenant.
 * @returns {Promise<number>} count of purged entries
 */
export async function purgeExpired(tenantId) {
  const now = Date.now();
  let count = 0;

  if (isDurable()) {
    const prefix = `quarantine:${tenantId}:`;
    const entries = await durableScan(prefix);
    for (const { key, value } of entries) {
      const entry = parseValue(value);
      if (!entry) { await durableDel(key); count++; continue; }
      if (entry.purge_after != null && entry.purge_after < now) {
        await durableDel(key);
        count++;
      }
    }
  } else {
    const entries = fileScanTenant(tenantId);
    for (const entry of entries) {
      if (entry.purge_after != null && entry.purge_after < now) {
        fileDeleteEntry(tenantId, entry.id);
        count++;
      }
    }
  }

  if (count > 0) {
    logAuditEvent({
      event_type: "quarantine.purge_run",
      actor: "system",
      context: { tenantId, count },
    });
  }

  return count;
}

/**
 * List all quarantine entries for a tenant. Purges expired entries first.
 */
export async function getQuarantineList(tenantId) {
  await purgeExpired(tenantId);

  const now = Date.now();

  if (isDurable()) {
    const prefix = `quarantine:${tenantId}:`;
    const entries = await durableScan(prefix);
    const results = [];
    for (const { value } of entries) {
      const entry = parseValue(value);
      if (!entry) continue;
      // Defensive: skip anything still past purge_after (race condition)
      if (entry.purge_after != null && entry.purge_after < now) continue;
      results.push(normalizeEntry(entry));
    }
    return results;
  }

  return fileScanTenant(tenantId).filter(
    (e) => e.purge_after == null || e.purge_after >= now
  ).map(normalizeEntry);
}

/**
 * Synchronous list helper for telemetry snapshots.
 * Durable KV providers remain available through the async route API; the sync
 * collector surfaces the local file-backed provider used by Electron/dev.
 */
export function getQuarantineListSync(tenantId) {
  if (isDurable()) return [];

  const now = Date.now();
  return fileScanTenant(tenantId)
    .filter((e) => e.purge_after == null || e.purge_after >= now)
    .map(normalizeEntry);
}

/**
 * Add a file to quarantine.
 * @param {string} tenantId
 * @param {object} fileData - { filename, filepath, sha256, file_size, scan_result, malware_family, quarantined_by, retention_days }
 */
export async function quarantineFile(tenantId, fileData) {
  const id = randomUUID();
  const quarantined_at = Date.now();
  const retention_days = fileData.retention_days ?? DEFAULT_RETENTION_DAYS;
  const purge_after = quarantined_at + retention_days * 86_400_000;

  const entry = {
    id,
    filename: fileData.filename ?? null,
    filepath: fileData.filepath ?? null,
    sha256: fileData.sha256 ?? null,
    file_size: fileData.file_size ?? null,
    scan_result: fileData.scan_result ?? "suspicious",
    malware_family: fileData.malware_family ?? null,
    quarantined_at,
    quarantined_by: fileData.quarantined_by ?? "system",
    retention_days,
    purge_after,
  };

  if (isDurable()) {
    const key = quarantineKey(tenantId, id);
    await durableSet(key, entry);
  } else {
    fileWriteEntry(tenantId, id, entry);
  }

  logAuditEvent({
    event_type: "quarantine.added",
    actor: fileData.quarantined_by ?? "system",
    context: { tenantId, id, filename: entry.filename, sha256: entry.sha256, scan_result: entry.scan_result },
  });

  return normalizeEntry(entry);
}

/**
 * Get a single quarantine entry by id.
 */
export async function getQuarantineEntry(tenantId, id) {
  if (isDurable()) {
    const raw = await durableGet(quarantineKey(tenantId, id));
    return normalizeEntry(parseValue(raw));
  }
  return normalizeEntry(fileReadEntry(tenantId, id));
}

/**
 * Release (restore) a quarantined file.
 */
export async function releaseFile(tenantId, id, actor = "system") {
  const entry = await getQuarantineEntry(tenantId, id);
  const filename = entry?.filename ?? id;

  if (isDurable()) {
    await durableDel(quarantineKey(tenantId, id));
  } else {
    fileDeleteEntry(tenantId, id);
  }

  logAuditEvent({
    event_type: "quarantine.released",
    actor,
    context: { tenantId, id, filename },
  });

  return normalizeEntry(entry);
}

/**
 * Permanently delete a quarantined file record.
 */
export async function deleteFile(tenantId, id, actor = "system") {
  const entry = await getQuarantineEntry(tenantId, id);
  const sha256 = entry?.sha256 ?? null;

  if (isDurable()) {
    await durableDel(quarantineKey(tenantId, id));
  } else {
    fileDeleteEntry(tenantId, id);
  }

  logAuditEvent({
    event_type: "quarantine.deleted",
    actor,
    context: { tenantId, id, sha256 },
  });

  return normalizeEntry(entry);
}

/**
 * Perform a bulk action on multiple quarantine entries.
 * @param {string} tenantId
 * @param {string[]} ids
 * @param {"release"|"delete"} action
 * @param {string} actor
 * @returns {{ processed: number, errors: Array<{id: string, error: string}> }}
 */
export async function bulkAction(tenantId, ids, action, actor = "system") {
  let processed = 0;
  const errors = [];

  for (const id of ids) {
    try {
      if (action === "release") {
        await releaseFile(tenantId, id, actor);
      } else if (action === "delete") {
        await deleteFile(tenantId, id, actor);
      } else {
        errors.push({ id, error: `Unknown action: ${action}` });
        continue;
      }
      processed++;
    } catch (err) {
      errors.push({ id, error: err?.message ?? String(err) });
    }
  }

  return { processed, errors };
}

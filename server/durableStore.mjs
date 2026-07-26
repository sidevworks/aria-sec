// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

/**
 * Durable Store — pluggable KV abstraction for quota counters and audit events.
 *
 * Providers (selected automatically):
 *   1. Upstash Redis REST API — when ARIA_KV_REST_URL and ARIA_KV_REST_TOKEN are set.
 *      Compatible with any Upstash Redis instance.
 *   2. In-memory Map — safe local-dev fallback; state is per-process and lost on
 *      cold start. Semantically identical to the current quotaGuard behaviour.
 *
 * Required env vars (production):
 *   ARIA_KV_REST_URL    — e.g. https://<name>.upstash.io
 *   ARIA_KV_REST_TOKEN  — Upstash REST token (read-write)
 *
 * Local dev (no KV configured):
 *   All operations use the in-memory store. Quota counters reset on process restart;
 *   audit events are written to the file store as before.
 */

// ── Provider detection ────────────────────────────────────────────────────────

function kvUrl() {
  return process.env.ARIA_KV_REST_URL || "";
}

function kvToken() {
  return process.env.ARIA_KV_REST_TOKEN || "";
}

export function isDurable() {
  return Boolean(kvUrl() && kvToken());
}

// ── Upstash REST pipeline helper ──────────────────────────────────────────────

/**
 * Execute one or more Redis commands via the Upstash REST pipeline endpoint.
 * Commands is an array of arrays, e.g. [["INCR", "key"], ["EXPIRE", "key", 60]].
 * Returns an array of result objects: [{ result }, ...] or [{ error }, ...].
 * Throws on network/HTTP errors.
 */
async function kvPipeline(commands) {
  const url = `${kvUrl()}/pipeline`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${kvToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(commands),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`KV pipeline HTTP ${resp.status}: ${text}`);
  }
  return resp.json();
}

/**
 * Execute a single Redis command via the Upstash REST API.
 * Returns the result value directly (unwrapped from { result: ... }).
 */
async function kvCmd(...args) {
  const [results] = await kvPipeline([args]);
  if (results?.error) throw new Error(`KV command error: ${results.error}`);
  return results?.result ?? null;
}

// ── In-memory fallback ────────────────────────────────────────────────────────

// Counter store: key → { value: number, expiresAt: number | null }
const _memStore = new Map();

function memGet(key) {
  const entry = _memStore.get(key);
  if (!entry) return null;
  if (entry.expiresAt && Date.now() > entry.expiresAt) {
    _memStore.delete(key);
    return null;
  }
  return entry.value;
}

function memSet(key, value, ttlSeconds = null) {
  _memStore.set(key, {
    value,
    expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null,
  });
}

function memDel(key) {
  _memStore.delete(key);
}

function memIncr(key) {
  const current = memGet(key);
  const next = (typeof current === "number" ? current : 0) + 1;
  const existing = _memStore.get(key);
  // Preserve existing TTL on increment (don't reset it)
  _memStore.set(key, { value: next, expiresAt: existing?.expiresAt ?? null });
  return next;
}

// List store: key → string[]  (index 0 = newest, LPUSH semantics)
const _memLists = new Map();

function memLpush(key, value, maxLen) {
  const list = _memLists.get(key) || [];
  list.unshift(value); // prepend (newest first)
  if (maxLen && list.length > maxLen) list.length = maxLen;
  _memLists.set(key, list);
  return list.length;
}

function memLrange(key, start, end) {
  const list = _memLists.get(key) || [];
  // Redis semantics: -1 means "to end of list"
  if (end === -1 || end === undefined || end === null) return list.slice(start);
  return list.slice(start, end + 1);
}

/** Scan in-memory store for keys matching a prefix. */
function memScan(prefix) {
  const out = [];
  const now = Date.now();
  for (const [k, entry] of _memStore) {
    if (!k.startsWith(prefix)) continue;
    if (entry.expiresAt && now > entry.expiresAt) { _memStore.delete(k); continue; }
    out.push({ key: k, value: entry.value });
  }
  return out;
}

/** Purge all in-memory state (used in tests). */
export function resetDurableStore() {
  _memStore.clear();
  _memLists.clear();
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Atomically increment a counter key by 1.
 * On first increment, sets a TTL (seconds) using EXPIRE NX so the window
 * boundary is established only once and not reset by subsequent increments.
 * Returns the new counter value.
 */
export async function durableIncr(key, ttlSeconds) {
  if (isDurable()) {
    try {
      const results = await kvPipeline([
        ["INCR", key],
        // EXPIRE ... NX: only set TTL if no TTL is currently assigned.
        // Requires Redis 7+ / Upstash — gracefully ignored on older versions.
        ["EXPIRE", key, ttlSeconds, "NX"],
      ]);
      const count = results[0]?.result ?? 1;
      return Number(count);
    } catch (err) {
      // Fall through to in-memory on transient KV error.
      process.stdout.write(
        JSON.stringify({ level: "warn", msg: "durableIncr KV error, using in-memory fallback", error: String(err) }) + "\n"
      );
    }
  }
  // In-memory path: set TTL on first write (when value was null/missing).
  const before = memGet(key);
  const count = memIncr(key);
  if (before === null && ttlSeconds) {
    const entry = _memStore.get(key);
    if (entry) entry.expiresAt = Date.now() + ttlSeconds * 1000;
  }
  return count;
}

/** Get a value by key. Returns null if absent or expired. */
export async function durableGet(key) {
  if (isDurable()) {
    try {
      return await kvCmd("GET", key);
    } catch (err) {
      process.stdout.write(
        JSON.stringify({ level: "warn", msg: "durableGet KV error", error: String(err) }) + "\n"
      );
    }
  }
  return memGet(key);
}

/** Set a value with optional TTL (seconds). */
export async function durableSet(key, value, ttlSeconds = null) {
  if (isDurable()) {
    try {
      const args = ["SET", key, JSON.stringify(value)];
      if (ttlSeconds) args.push("EX", String(ttlSeconds));
      await kvCmd(...args);
      return;
    } catch (err) {
      process.stdout.write(
        JSON.stringify({ level: "warn", msg: "durableSet KV error", error: String(err) }) + "\n"
      );
    }
  }
  memSet(key, value, ttlSeconds);
}

/** Delete a key. */
export async function durableDel(key) {
  if (isDurable()) {
    try {
      await kvCmd("DEL", key);
      return;
    } catch (err) {
      process.stdout.write(
        JSON.stringify({ level: "warn", msg: "durableDel KV error", error: String(err) }) + "\n"
      );
    }
  }
  memDel(key);
}

/**
 * Prepend a JSON-serializable value to a list, trimming to maxLen.
 * Semantics: newest item at index 0 (LPUSH + LTRIM).
 */
export async function durableLpush(key, value, maxLen) {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  if (isDurable()) {
    try {
      await kvPipeline([
        ["LPUSH", key, serialized],
        ["LTRIM", key, 0, maxLen - 1],
      ]);
      return;
    } catch (err) {
      process.stdout.write(
        JSON.stringify({ level: "warn", msg: "durableLpush KV error", error: String(err) }) + "\n"
      );
    }
  }
  memLpush(key, serialized, maxLen);
}

/**
 * Read a range from a list (inclusive, 0-based, newest-first).
 * Pass end = -1 for all items.
 * Returns an array of parsed JSON values (or raw strings if parsing fails).
 */
export async function durableLrange(key, start, end) {
  let raw;
  if (isDurable()) {
    try {
      raw = await kvCmd("LRANGE", key, start, end);
    } catch (err) {
      process.stdout.write(
        JSON.stringify({ level: "warn", msg: "durableLrange KV error", error: String(err) }) + "\n"
      );
      raw = memLrange(key, start, end);
    }
  } else {
    raw = memLrange(key, start, end);
  }
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    try { return JSON.parse(item); } catch { return item; }
  });
}

// ── Tenant-partitioned API ────────────────────────────────────────────────────
// All keys are prefixed with `tenant:{tenantId}:` to ensure strict isolation
// between tenants at the KV layer. tenant_id must come from the verified session
// token, never from user-supplied request bodies.

export async function tenantGet(tenantId, key) {
  return durableGet(`tenant:${tenantId}:${key}`);
}

export async function tenantSet(tenantId, key, value, ttlSeconds = null) {
  return durableSet(`tenant:${tenantId}:${key}`, value, ttlSeconds);
}

export async function tenantDel(tenantId, key) {
  return durableDel(`tenant:${tenantId}:${key}`);
}

export async function tenantIncr(tenantId, key, ttlSeconds) {
  return durableIncr(`tenant:${tenantId}:${key}`, ttlSeconds);
}

export async function tenantLpush(tenantId, key, value, maxLen) {
  return durableLpush(`tenant:${tenantId}:${key}`, value, maxLen);
}

export async function tenantLrange(tenantId, key, start, end) {
  return durableLrange(`tenant:${tenantId}:${key}`, start, end);
}

export async function tenantScan(tenantId, prefix) {
  return durableScan(`tenant:${tenantId}:${prefix}`);
}

/**
 * Scan for all keys matching a prefix and return their values.
 * Used by quota snapshot. In-memory: O(n) Map scan.
 * KV: Uses SCAN with MATCH — suitable for low-cardinality key sets.
 * Returns [{key, value}].
 */
export async function durableScan(prefix) {
  if (isDurable()) {
    try {
      // SCAN 0 MATCH prefix* COUNT 200
      const result = await kvCmd("SCAN", 0, "MATCH", `${prefix}*`, "COUNT", 200);
      const keys = Array.isArray(result) && Array.isArray(result[1]) ? result[1] : [];
      if (!keys.length) return [];
      const values = await kvCmd("MGET", ...keys);
      return keys.map((k, i) => ({ key: k, value: values?.[i] ?? null }));
    } catch (err) {
      process.stdout.write(
        JSON.stringify({ level: "warn", msg: "durableScan KV error", error: String(err) }) + "\n"
      );
    }
  }
  return memScan(prefix);
}

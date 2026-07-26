// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

/**
 * blockedIpStore.mjs
 * KV-backed store for blocked IPs per tenant.
 * Key pattern: blocked:{tenantId}:{ip}
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { durableGet, durableSet, durableDel, durableScan, isDurable } from "./durableStore.mjs";
import { persistencePath, PersistenceMisconfiguredError } from "./persistenceConfig.mjs";
import { logAuditEvent } from "./auditLog.mjs";

// ── Local fallback stores ─────────────────────────────────────────────────────

const _memBlocked = new Map();
const _memAutoBlockConfig = new Map();
let _warnedFallback = false;
let _warnedFileFallback = false;

function fileStorePath() {
  try {
    return persistencePath(["blocked-ip-store.json"], {
      purpose: "blocked IP persistence",
      requireWritable: true,
    });
  } catch (error) {
    if (error instanceof PersistenceMisconfiguredError) return null;
    throw error;
  }
}

function readFileStore() {
  const path = fileStorePath();
  if (!path) return null;
  try {
    if (!existsSync(path)) return { blocked: {}, autoBlockConfig: {} };
    const data = JSON.parse(readFileSync(path, "utf8"));
    return {
      blocked: data?.blocked && typeof data.blocked === "object" ? data.blocked : {},
      autoBlockConfig: data?.autoBlockConfig && typeof data.autoBlockConfig === "object" ? data.autoBlockConfig : {},
    };
  } catch (error) {
    warnFileFallback(error);
    return null;
  }
}

function writeFileStore(store) {
  const path = fileStorePath();
  if (!path) return false;
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(store, null, 2)}\n`, "utf8");
    return true;
  } catch (error) {
    warnFileFallback(error);
    return false;
  }
}

function warnFileFallback(error) {
  if (_warnedFileFallback) return;
  _warnedFileFallback = true;
  console.warn(`[blockedIpStore] local file persistence unavailable — using in-memory fallback. ${error?.message || ""}`.trim());
}

function warnFallback() {
  if (!_warnedFallback) {
    console.warn("[blockedIpStore] no KV or local persistence configured — using in-memory fallback. State will be lost on restart.");
    _warnedFallback = true;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function blockedKey(tenantId, ip) {
  return `blocked:${tenantId}:${ip}`;
}

function autoBlockConfigKey(tenantId) {
  return `autoblock-config:${tenantId}`;
}

function parseValue(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "object") return raw;
  try { return JSON.parse(raw); } catch { return null; }
}

function isExpired(entry) {
  if (!entry) return true;
  if (entry.expires_at === null || entry.expires_at === undefined) return false;
  return entry.expires_at < Date.now();
}

function listFileBlockedIps(tenantId) {
  const store = readFileStore();
  if (!store) return null;
  const results = [];
  const prefix = `blocked:${tenantId}:`;
  let changed = false;

  for (const [key, entry] of Object.entries(store.blocked)) {
    if (!key.startsWith(prefix)) continue;
    if (isExpired(entry)) {
      delete store.blocked[key];
      changed = true;
      continue;
    }
    results.push(entry);
  }

  if (changed) writeFileStore(store);
  return results;
}

function setFileBlockedIp(key, entry) {
  const store = readFileStore();
  if (!store) return false;
  store.blocked[key] = entry;
  return writeFileStore(store);
}

function deleteFileBlockedIp(key) {
  const store = readFileStore();
  if (!store) return false;
  delete store.blocked[key];
  return writeFileStore(store);
}

function setFileAutoBlockConfig(key, config) {
  const store = readFileStore();
  if (!store) return false;
  store.autoBlockConfig[key] = config;
  return writeFileStore(store);
}

function getFileAutoBlockConfig(key) {
  const store = readFileStore();
  if (!store) return null;
  return store.autoBlockConfig[key] ?? null;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * List all blocked IPs for a tenant, filtering out expired entries.
 */
export async function getBlockedIps(tenantId) {
  if (isDurable()) {
    const prefix = `blocked:${tenantId}:`;
    const entries = await durableScan(prefix);
    const results = [];
    for (const { value } of entries) {
      const entry = parseValue(value);
      if (!entry) continue;
      if (isExpired(entry)) continue;
      results.push(entry);
    }
    return results;
  }

  const fileResults = listFileBlockedIps(tenantId);
  if (fileResults) return fileResults;

  warnFallback();
  const results = [];
  const prefix = `blocked:${tenantId}:`;
  for (const [key, entry] of _memBlocked) {
    if (!key.startsWith(prefix)) continue;
    if (isExpired(entry)) { _memBlocked.delete(key); continue; }
    results.push(entry);
  }
  return results;
}

/**
 * Block an IP address for a tenant.
 * @param {string} tenantId
 * @param {string} ip
 * @param {{ reason: string, source: string, expiresIn: number|null, actor: string }} options
 */
export async function blockIp(tenantId, ip, { reason = "", source = "manual", expiresIn = null, actor = "system" } = {}) {
  const now = Date.now();
  const expires_at = expiresIn != null ? now + expiresIn * 1000 : null;

  const entry = {
    ip,
    reason,
    source,
    blocked_at: now,
    expires_at,
    blocked_by: actor,
  };

  const key = blockedKey(tenantId, ip);

  if (isDurable()) {
    await durableSet(key, entry, expiresIn ?? null);
  } else if (!setFileBlockedIp(key, entry)) {
    warnFallback();
    _memBlocked.set(key, entry);
  } else {
    _memBlocked.delete(key);
  }

  logAuditEvent({
    event_type: "ip.blocked",
    actor,
    context: { tenantId, ip, reason, source, expires_at },
  });

  return entry;
}

/**
 * Unblock an IP address for a tenant.
 */
export async function unblockIp(tenantId, ip, actor = "system") {
  const key = blockedKey(tenantId, ip);

  if (isDurable()) {
    await durableDel(key);
  } else if (!deleteFileBlockedIp(key)) {
    warnFallback();
    _memBlocked.delete(key);
  } else {
    _memBlocked.delete(key);
  }

  logAuditEvent({
    event_type: "ip.unblocked",
    actor,
    context: { tenantId, ip },
  });
}

/**
 * Unblock multiple IPs in bulk.
 * @returns {{ unblocked: number }}
 */
export async function bulkUnblock(tenantId, ips, actor = "system") {
  let unblocked = 0;
  for (const ip of ips) {
    await unblockIp(tenantId, ip, actor);
    unblocked++;
  }
  return { unblocked };
}

/**
 * Configure auto-block rule for a tenant.
 * @param {string} tenantId
 * @param {{ threshold: number, windowMinutes: number }} config
 */
export async function configureAutoBlock(tenantId, { threshold, windowMinutes } = {}) {
  const config = {
    tenantId,
    threshold: Number(threshold),
    windowMinutes: Number(windowMinutes),
    updated_at: Date.now(),
  };

  const key = autoBlockConfigKey(tenantId);

  if (isDurable()) {
    await durableSet(key, config);
  } else if (!setFileAutoBlockConfig(key, config)) {
    warnFallback();
    _memAutoBlockConfig.set(key, config);
  } else {
    _memAutoBlockConfig.delete(key);
  }

  return config;
}

/**
 * Check if an IP should be auto-blocked based on incident count.
 * If incidentCount > threshold, automatically blocks the IP.
 */
export async function checkAutoBlock(tenantId, ip, incidentCount) {
  const key = autoBlockConfigKey(tenantId);

  let config;
  if (isDurable()) {
    const raw = await durableGet(key);
    config = parseValue(raw);
  } else {
    config = getFileAutoBlockConfig(key) ?? _memAutoBlockConfig.get(key) ?? null;
  }

  if (!config) return null;

  const { threshold, windowMinutes } = config;
  if (typeof threshold !== "number" || incidentCount <= threshold) return null;

  const expiresIn = windowMinutes != null ? windowMinutes * 60 : null;
  return blockIp(tenantId, ip, {
    reason: `Auto-blocked: ${incidentCount} incidents exceeded threshold of ${threshold}`,
    source: "auto-rule",
    expiresIn,
    actor: "system",
  });
}

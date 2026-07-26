// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import { existsSync as _existsSync, mkdirSync, readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { isDurable } from "./durableStore.mjs";

const DEFAULT_ERROR_CODE = "PERSISTENCE_BACKEND_UNAVAILABLE";
const warnedPurposes = new Set();
const STRICT_TRUE = new Set(["1", "true", "yes", "on", "strict"]);

export class PersistenceMisconfiguredError extends Error {
  constructor(message, { purpose = "state persistence" } = {}) {
    super(message);
    this.name = "PersistenceMisconfiguredError";
    this.code = DEFAULT_ERROR_CODE;
    this.statusCode = 503;
    this.purpose = purpose;
  }
}

function loadDotEnvKey(key) {
  for (const name of [".env.local", ".env"]) {
    try {
      const envPath = join(process.cwd(), name);
      if (!_existsSync(envPath)) continue;
      const line = readFileSync(envPath, "utf8").split(/\r?\n/).find(l => l.trim().startsWith(`${key}=`));
      if (line) return line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
    } catch { /* ignore */ }
  }
  return "";
}

function envPersistenceDir() {
  return String(
    process.env.ARIA_PERSISTENCE_DIR ||
    process.env.ARIA_DURABLE_STATE_DIR ||
    loadDotEnvKey("ARIA_PERSISTENCE_DIR") ||
    loadDotEnvKey("ARIA_DURABLE_STATE_DIR") ||
    ""
  ).trim();
}

export function hasLocalPersistenceConfig() {
  return Boolean(envPersistenceDir());
}

function asAbsolutePath(pathValue) {
  if (!pathValue) return "";
  return isAbsolute(pathValue) ? pathValue : join(process.cwd(), pathValue);
}

// Resolves the local file-persistence dir for the legacy file-based stores
// (policyStore, actionRunner, autonomy-policy reads). Honors ARIA_PERSISTENCE_DIR
// whether it is absolute or relative, and falls back to <cwd>/aria-memory.
// Unlike getPersistenceRoot this never throws — these stores predate durable KV
// and must keep working with the default dir when nothing is configured.
export function resolveLegacyMemoryDir() {
  const configured = String(process.env.ARIA_PERSISTENCE_DIR || "").trim();
  return configured ? asAbsolutePath(configured) : join(process.cwd(), "aria-memory");
}

export function getPersistenceRoot({ purpose = "state persistence", requireWritable = true } = {}) {
  const configured = envPersistenceDir();
  if (!configured) {
    throw new PersistenceMisconfiguredError(
      `No durable persistence backend configured for ${purpose}. Set ARIA_PERSISTENCE_DIR (or ARIA_DURABLE_STATE_DIR) to a writable durable path.`,
      { purpose }
    );
  }

  const root = asAbsolutePath(configured);
  if (requireWritable) {
    try {
      mkdirSync(root, { recursive: true });
    } catch (error) {
      throw new PersistenceMisconfiguredError(
        `Configured persistence path is not writable for ${purpose}: ${root}. ${error.message}`,
        { purpose }
      );
    }
  }
  return root;
}

export function persistencePath(parts = [], options = {}) {
  const root = getPersistenceRoot(options);
  return join(root, ...parts);
}

export function logPersistenceMisconfiguration(error, { purpose = "state persistence" } = {}) {
  const key = `${purpose}:${error?.message || "unknown"}`;
  if (warnedPurposes.has(key)) return;
  warnedPurposes.add(key);
  console.error(`[Persistence] ${purpose} unavailable: ${error?.message || "unknown error"}`);
}

export function isStrictProductionMode() {
  const explicit = String(process.env.ARIA_STRICT_PROD || "").toLowerCase();
  if (STRICT_TRUE.has(explicit)) return true;
  return String(process.env.NODE_ENV || "").toLowerCase() === "production";
}

function log(entry) {
  process.stdout.write(JSON.stringify(entry) + "\n");
}

export function runStartupChecks() {
  if (isDurable()) {
    const kvUrl = process.env.ARIA_KV_REST_URL || "";
    log({ level: "info", msg: "durable store ✓ KV connected", url: kvUrl.slice(0, 20) });
  } else if (hasLocalPersistenceConfig()) {
    log({
      level: "info",
      msg: "durable store ✓ local file persistence configured",
      path: asAbsolutePath(envPersistenceDir()),
    });
  } else {
    log({
      level: "warn",
      msg: "durable store: using in-memory fallback — set ARIA_PERSISTENCE_DIR for local persistence or ARIA_KV_REST_URL and ARIA_KV_REST_TOKEN for KV persistence",
    });
  }

  // ARIA_CREDENTIAL_ENCRYPTION_KEY (preferred) or ARIA_CREDENTIAL_KEY (legacy alias)
  // must be a 64-char hex string (32 bytes). Without it, connector credentials are
  // stored as plaintext on disk — a security risk in any non-ephemeral environment.
  const encKey = String(
    process.env.ARIA_CREDENTIAL_ENCRYPTION_KEY ||
    process.env.ARIA_CREDENTIAL_KEY ||
    ""
  ).trim();
  const hasSecretsManager = process.env.ARIA_USE_SECRETS_MANAGER === "true";
  const keyValid = encKey.length === 64 && /^[0-9a-fA-F]+$/.test(encKey);

  if (!hasSecretsManager && !keyValid) {
    const isProduction = isStrictProductionMode();
    const message = isProduction
      ? "SECURITY: production startup requires a valid 64-character hex ARIA_CREDENTIAL_ENCRYPTION_KEY (or AWS Secrets Manager). Generate a key: node scripts/generate-encryption-key.mjs"
      : "credential vault: ARIA_CREDENTIAL_ENCRYPTION_KEY missing or invalid - connector credentials stored as plaintext. Run: node scripts/generate-encryption-key.mjs";
    log({
      level: isProduction ? "error" : "warn",
      msg: message,
    });
    if (isProduction) {
      throw new PersistenceMisconfiguredError(message, { purpose: "credential encryption" });
    }
  } else if (!hasSecretsManager && keyValid) {
    log({ level: "info", msg: "credential vault ✓ AES-256-GCM encryption active" });
  } else if (hasSecretsManager) {
    log({ level: "info", msg: "credential vault ✓ AWS Secrets Manager active" });
  }
}

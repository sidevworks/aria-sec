// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import https from "node:https";
import http from "node:http";
import { durableGet, durableSet, durableDel, isDurable } from "../durableStore.mjs";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

// ── Legacy file-based store (fallback when KV not configured) ─────────────────
const _BASE_DIR = join(process.cwd(), "aria-memory");
const MEMORY_DIR = join(_BASE_DIR, "connectors");

function legacyStorePath(tenantId) {
  return join(MEMORY_DIR, `elastic-${tenantId}.json`);
}

const SENSITIVE_FIELDS = ["api_key"];

// ── Encryption ────────────────────────────────────────────────────────────────

function getEncryptionKey() {
  const hex = String(
    process.env.ARIA_CREDENTIAL_ENCRYPTION_KEY ||
    process.env.ARIA_CREDENTIAL_KEY ||
    ""
  ).trim();
  if (hex.length === 64 && /^[0-9a-fA-F]+$/.test(hex)) {
    return Buffer.from(hex, "hex");
  }
  return null;
}

function encryptField(plaintext) {
  const key = getEncryptionKey();
  if (!key || !plaintext) return plaintext;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

function decryptField(value) {
  if (!value || !String(value).startsWith("enc:")) return value;
  const key = getEncryptionKey();
  if (!key) {
    process.stderr.write("[elasticAuthStore] ARIA_CREDENTIAL_ENCRYPTION_KEY not set; cannot decrypt stored credential\n");
    return null;
  }
  try {
    const [, ivHex, tagHex, dataHex] = String(value).split(":");
    const iv = Buffer.from(ivHex, "hex");
    const tag = Buffer.from(tagHex, "hex");
    const data = Buffer.from(dataHex, "hex");
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch {
    process.stderr.write("[elasticAuthStore] Decryption failed; credential may be corrupted\n");
    return null;
  }
}

// ── Serialization helpers ─────────────────────────────────────────────────────

function encryptSensitiveFields(record) {
  const out = { ...record };
  for (const field of SENSITIVE_FIELDS) {
    if (out[field]) out[field] = encryptField(out[field]);
  }
  return out;
}

function decryptSensitiveFields(record) {
  if (!record) return null;
  const out = { ...record };
  for (const field of SENSITIVE_FIELDS) {
    if (out[field]) out[field] = decryptField(out[field]);
  }
  return out;
}

// ── KV key ────────────────────────────────────────────────────────────────────

function kvKey(tenantId) {
  return `connector:elastic:${tenantId}`;
}

// ── Storage: KV-backed with file fallback ─────────────────────────────────────

async function readStore(tenantId) {
  if (isDurable()) {
    const raw = await durableGet(kvKey(tenantId));
    if (!raw) return null;
    const record = typeof raw === "object" ? raw : JSON.parse(raw);
    return decryptSensitiveFields(record);
  }

  // File fallback
  const path = legacyStorePath(tenantId);
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, "utf8"));
    return decryptSensitiveFields(raw);
  } catch {
    return null;
  }
}

async function writeStore(tenantId, value) {
  const encrypted = encryptSensitiveFields(value);

  if (isDurable()) {
    await durableSet(kvKey(tenantId), encrypted);
    return;
  }

  // File fallback
  mkdirSync(dirname(legacyStorePath(tenantId)), { recursive: true });
  writeFileSync(
    legacyStorePath(tenantId),
    `${JSON.stringify(encrypted, null, 2)}\n`,
    { mode: 0o600 }
  );
}

async function deleteStore(tenantId) {
  if (isDurable()) {
    await durableDel(kvKey(tenantId));
    return;
  }

  const path = legacyStorePath(tenantId);
  if (existsSync(path)) rmSync(path, { force: true });
}

// ── HTTP client ───────────────────────────────────────────────────────────────

/**
 * Make an HTTP/HTTPS request to an Elastic endpoint.
 * TLS verification is enabled by default. Pass tlsRejectUnauthorized: false
 * only for clusters with self-signed certs — this must be an explicit opt-in
 * stored per-connector, never a global default.
 */
export function elasticHttpRequest(urlStr, opts = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const lib = url.protocol === "https:" ? https : http;
    const req = lib.request(url, {
      method: opts.method || "GET",
      headers: opts.headers || {},
      rejectUnauthorized: opts.rejectUnauthorized !== false,
    }, (res) => {
      let body = "";
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, body });
        }
      });
    });
    req.on("error", reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

function now() {
  return new Date().toISOString();
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function getElasticConnectorStatus(tenantId = "default") {
  const store = await readStore(tenantId);
  if (store?.elastic_url) {
    const urlHint = store.elastic_url.replace(/^https?:\/\//, "").slice(0, 40);
    return {
      connector: {
        id: "elastic",
        connected: true,
        elastic_url: store.elastic_url,
        kibana_url: store.kibana_url || store.elastic_url,
        url_hint: urlHint,
        cluster_name: store.cluster_name || null,
        cluster_status: store.cluster_status || null,
        updated_at: store.updated_at || null,
        message: `Connected to ${store.cluster_name || urlHint} · ${store.cluster_status || "unknown"}`,
      },
    };
  }
  return {
    connector: {
      id: "elastic",
      connected: false,
      elastic_url: null,
      kibana_url: null,
      url_hint: null,
      cluster_name: null,
      cluster_status: null,
      updated_at: null,
      message: null,
    },
  };
}

export async function saveElasticCredentials({ url, apiKey, kibanaUrl, tlsRejectUnauthorized = true } = {}, tenantId = "default") {
  const elasticUrl = String(url || "").replace(/\/+$/, "").trim();
  const key = String(apiKey || "").trim();
  const kibUrl = String(kibanaUrl || "").replace(/\/+$/, "").trim() || elasticUrl;

  if (!elasticUrl) throw new Error("Elastic URL is required.");
  if (!key) throw new Error("API key is required.");

  const resp = await elasticHttpRequest(`${elasticUrl}/_cluster/health`, {
    headers: { Authorization: `ApiKey ${key}` },
    rejectUnauthorized: tlsRejectUnauthorized,
  });

  if (resp.status !== 200) {
    throw new Error(`Elastic cluster health check failed (HTTP ${resp.status}). Verify URL and API key.`);
  }

  const health = resp.body;
  const record = {
    id: "elastic",
    elastic_url: elasticUrl,
    kibana_url: kibUrl,
    api_key: key,
    tls_reject_unauthorized: tlsRejectUnauthorized,
    cluster_name: health.cluster_name || null,
    cluster_status: health.status || null,
    updated_at: now(),
  };

  await writeStore(tenantId, record);

  return {
    connector: {
      id: "elastic",
      connected: true,
      elastic_url: elasticUrl,
      kibana_url: kibUrl,
      url_hint: elasticUrl.replace(/^https?:\/\//, "").slice(0, 40),
      cluster_name: health.cluster_name || null,
      cluster_status: health.status || null,
      updated_at: record.updated_at,
      message: `Connected to ${health.cluster_name || elasticUrl} · ${health.status || "unknown"}`,
    },
  };
}

export async function disconnectElasticConnector(tenantId = "default") {
  await deleteStore(tenantId);
  return { connector: (await getElasticConnectorStatus(tenantId)).connector };
}

export async function elasticHealthCheck(tenantId = "default") {
  const store = await readStore(tenantId);
  if (!store?.elastic_url || !store?.api_key) return { status: "unconfigured" };
  try {
    const resp = await elasticHttpRequest(`${store.elastic_url}/_cluster/health`, {
      headers: { Authorization: `ApiKey ${store.api_key}` },
      rejectUnauthorized: store.tls_reject_unauthorized !== false,
    });
    if (resp.status !== 200) return { status: "error", message: `HTTP ${resp.status}` };
    return {
      status: "ok",
      cluster_name: resp.body.cluster_name,
      cluster_status: resp.body.status,
      last_validated: now(),
    };
  } catch (err) {
    return { status: "error", message: err.message };
  }
}

export async function getElasticCredentials(tenantId = "default") {
  return readStore(tenantId);
}

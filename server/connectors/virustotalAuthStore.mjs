// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { resolveLegacyMemoryDir } from "../persistenceConfig.mjs";

const _BASE_DIR = resolveLegacyMemoryDir();
const MEMORY_DIR = join(_BASE_DIR, "connectors");
const STORE_PATH = join(MEMORY_DIR, "virustotal.json");

const SENSITIVE_FIELDS = ["api_key"];

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
    process.stderr.write("[virustotalAuthStore] ARIA_CREDENTIAL_ENCRYPTION_KEY not set; cannot decrypt stored credential\n");
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
    process.stderr.write("[virustotalAuthStore] Decryption failed; credential may be corrupted\n");
    return null;
  }
}

function now() {
  return new Date().toISOString();
}

function ensureStoreDir() {
  mkdirSync(dirname(STORE_PATH), { recursive: true });
}

function readStore() {
  if (!existsSync(STORE_PATH)) return null;
  try {
    const raw = JSON.parse(readFileSync(STORE_PATH, "utf8"));
    if (!raw) return null;
    const decrypted = { ...raw };
    for (const field of SENSITIVE_FIELDS) {
      if (raw[field]) decrypted[field] = decryptField(raw[field]);
    }
    return decrypted;
  } catch {
    return null;
  }
}

function writeStore(value) {
  ensureStoreDir();
  const toWrite = { ...value };
  for (const field of SENSITIVE_FIELDS) {
    if (toWrite[field]) toWrite[field] = encryptField(toWrite[field]);
  }
  writeFileSync(STORE_PATH, `${JSON.stringify(toWrite, null, 2)}\n`, { mode: 0o600 });
}

export function getVirusTotalConnectorStatus() {
  const envKey = process.env.VIRUSTOTAL_API_KEY;
  const store = readStore();

  if (envKey) {
    return {
      connector: {
        id: "virustotal",
        connected: true,
        auth_mode: "env",
        key_hint: `${envKey.slice(0, 4)}…${envKey.slice(-4)}`,
        updated_at: store?.updated_at || null,
        message: "API key loaded from environment variables.",
      },
    };
  }

  if (store?.api_key) {
    return {
      connector: {
        id: "virustotal",
        connected: true,
        auth_mode: "stored",
        key_hint: `${store.api_key.slice(0, 4)}…${store.api_key.slice(-4)}`,
        updated_at: store.updated_at || null,
        message: "VirusTotal connected — threat intelligence enrichment active.",
      },
    };
  }

  return {
    connector: {
      id: "virustotal",
      connected: false,
      auth_mode: "none",
      key_hint: null,
      updated_at: null,
      message: null,
    },
  };
}

export function getStoredVirusTotalApiKey() {
  if (process.env.VIRUSTOTAL_API_KEY) return process.env.VIRUSTOTAL_API_KEY;
  const store = readStore();
  return store?.api_key || null;
}

async function vtGet(apiKey, path) {
  const { request } = await import("node:https");
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "www.virustotal.com",
      path,
      method: "GET",
      headers: {
        "x-apikey": apiKey,
        Accept: "application/json",
      },
    };
    const req = request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { reject(new Error(`Non-JSON response from VirusTotal (${path})`)); }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

export async function saveVirusTotalCredentials({ apiKey } = {}) {
  const key = String(apiKey || "").trim();
  if (!key) throw new Error("API key is required.");

  let resp;
  try {
    resp = await vtGet(key, "/api/v3/users/me");
  } catch (err) {
    throw new Error(`VirusTotal API validation failed: ${err.message}`);
  }
  if (resp.status === 401 || resp.status === 403) {
    throw new Error("VirusTotal API key is invalid or lacks permissions.");
  }
  if (resp.status !== 200) {
    throw new Error(`VirusTotal validation returned HTTP ${resp.status}`);
  }

  const store = {
    id: "virustotal",
    api_key: key,
    updated_at: now(),
  };
  writeStore(store);
  process.env.VIRUSTOTAL_API_KEY = key;

  return {
    connector: {
      id: "virustotal",
      connected: true,
      auth_mode: "stored",
      key_hint: `${key.slice(0, 4)}…${key.slice(-4)}`,
      updated_at: store.updated_at,
      message: "VirusTotal connected — threat intelligence enrichment active.",
    },
  };
}

export function disconnectVirusTotalConnector() {
  if (existsSync(STORE_PATH)) {
    rmSync(STORE_PATH, { force: true });
  }
  delete process.env.VIRUSTOTAL_API_KEY;
  return { connector: getVirusTotalConnectorStatus().connector };
}

export async function virusTotalHealthCheck() {
  const apiKey = getStoredVirusTotalApiKey();
  if (!apiKey) return { status: "unconfigured" };
  try {
    const resp = await vtGet(apiKey, "/api/v3/users/me");
    if (resp.status !== 200) return { status: "error", message: `HTTP ${resp.status}` };
    const quotas = resp.body?.data?.attributes?.quotas;
    return {
      status: "ok",
      last_validated: new Date().toISOString(),
      daily_quota: quotas?.api_requests_daily || null,
    };
  } catch (err) {
    return { status: "error", message: err.message };
  }
}

export { vtGet };

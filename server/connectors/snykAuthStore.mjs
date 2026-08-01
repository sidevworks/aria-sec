// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import https from "node:https";
import { resolveLegacyMemoryDir } from "../persistenceConfig.mjs";

const _BASE_DIR = resolveLegacyMemoryDir();
const MEMORY_DIR = join(_BASE_DIR, "connectors");
const STORE_PATH = join(MEMORY_DIR, "snyk.json");

const SENSITIVE_FIELDS = ["api_token"];

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
    process.stderr.write("[snykAuthStore] ARIA_CREDENTIAL_ENCRYPTION_KEY not set; cannot decrypt stored credential\n");
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
    process.stderr.write("[snykAuthStore] Decryption failed; credential may be corrupted\n");
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

function snykRequest(path, token) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "api.snyk.io",
      path,
      method: "GET",
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/json",
      },
    };
    const req = https.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => {
        if (res.statusCode >= 400) {
          reject(new Error(`Snyk API ${res.statusCode}: ${body.slice(0, 200)}`));
          return;
        }
        try { resolve(JSON.parse(body)); } catch { resolve(body); }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

export function getSnykConnectorStatus() {
  const envToken = process.env.SNYK_TOKEN;
  const store = readStore();

  if (envToken) {
    return {
      connector: {
        id: "snyk",
        connected: true,
        auth_mode: "env",
        org_id: process.env.SNYK_ORG_ID || store?.org_id || null,
        token_hint: `${envToken.slice(0, 4)}…${envToken.slice(-4)}`,
        updated_at: store?.updated_at || null,
        message: "Credentials loaded from environment variables.",
      },
    };
  }

  if (store?.api_token) {
    return {
      connector: {
        id: "snyk",
        connected: true,
        auth_mode: "stored",
        org_id: store.org_id || null,
        token_hint: `${store.api_token.slice(0, 4)}…${store.api_token.slice(-4)}`,
        updated_at: store.updated_at || null,
        message: store.org_id ? `Connected · org ${store.org_id}` : "Connected to Snyk",
      },
    };
  }

  return {
    connector: {
      id: "snyk",
      connected: false,
      auth_mode: "none",
      org_id: null,
      token_hint: null,
      updated_at: null,
      message: null,
    },
  };
}

export function getStoredSnykCredentials() {
  if (process.env.SNYK_TOKEN) {
    return { apiToken: process.env.SNYK_TOKEN, orgId: process.env.SNYK_ORG_ID || null };
  }
  const store = readStore();
  if (!store?.api_token) return null;
  return { apiToken: store.api_token, orgId: store.org_id || null };
}

export async function saveSnykCredentials({ apiToken, orgId } = {}) {
  const token = String(apiToken || "").trim();
  const org = String(orgId || "").trim() || null;

  if (!token) throw new Error("Snyk API token is required.");

  let userInfo;
  try {
    userInfo = await snykRequest("/v1/user/me", token);
  } catch (err) {
    throw new Error(`Snyk credential validation failed: ${err.message}`);
  }

  const store = {
    id: "snyk",
    api_token: token,
    org_id: org,
    username: userInfo?.username || userInfo?.name || null,
    updated_at: now(),
  };
  writeStore(store);

  process.env.SNYK_TOKEN = token;
  if (org) process.env.SNYK_ORG_ID = org;

  return {
    connector: {
      id: "snyk",
      connected: true,
      auth_mode: "stored",
      org_id: org,
      token_hint: `${token.slice(0, 4)}…${token.slice(-4)}`,
      updated_at: store.updated_at,
      message: org ? `Connected · org ${org}` : "Connected to Snyk",
    },
  };
}

export function disconnectSnykConnector() {
  if (existsSync(STORE_PATH)) {
    rmSync(STORE_PATH, { force: true });
  }
  delete process.env.SNYK_TOKEN;
  delete process.env.SNYK_ORG_ID;
  return { connector: getSnykConnectorStatus().connector };
}

export async function snykHealthCheck() {
  const creds = getStoredSnykCredentials();
  if (!creds) return { status: "unconfigured" };
  try {
    const user = await snykRequest("/v1/user/me", creds.apiToken);
    return { status: "ok", username: user?.username || user?.name || null, last_validated: now() };
  } catch (err) {
    return { status: "error", message: err.message };
  }
}

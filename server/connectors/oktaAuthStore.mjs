// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import https from "node:https";

const _BASE_DIR = join(process.cwd(), "aria-memory");
const MEMORY_DIR = join(_BASE_DIR, "connectors");
const STORE_PATH = join(MEMORY_DIR, "okta.json");

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
    process.stderr.write("[oktaAuthStore] ARIA_CREDENTIAL_ENCRYPTION_KEY not set; cannot decrypt stored credential\n");
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
    process.stderr.write("[oktaAuthStore] Decryption failed; credential may be corrupted\n");
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

function oktaGet(domain, path, token) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: domain,
      path,
      method: "GET",
      headers: {
        Authorization: `SSWS ${token}`,
        Accept: "application/json",
      },
    };
    const req = https.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => {
        if (res.statusCode >= 400) {
          reject(new Error(`Okta API ${res.statusCode}: ${body.slice(0, 200)}`));
          return;
        }
        try { resolve(JSON.parse(body)); } catch { resolve(body); }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

export function getOktaConnectorStatus() {
  const envToken = process.env.OKTA_API_TOKEN;
  const envDomain = process.env.OKTA_DOMAIN;
  const store = readStore();

  if (envToken && envDomain) {
    return {
      connector: {
        id: "okta",
        connected: true,
        auth_mode: "env",
        domain: envDomain,
        token_hint: `${envToken.slice(0, 4)}…${envToken.slice(-4)}`,
        updated_at: store?.updated_at || null,
        message: "Credentials loaded from environment variables.",
      },
    };
  }

  if (store?.api_token && store?.domain) {
    return {
      connector: {
        id: "okta",
        connected: true,
        auth_mode: "stored",
        domain: store.domain,
        token_hint: `${store.api_token.slice(0, 4)}…${store.api_token.slice(-4)}`,
        updated_at: store.updated_at || null,
        message: `Connected to ${store.domain}`,
      },
    };
  }

  return {
    connector: {
      id: "okta",
      connected: false,
      auth_mode: "none",
      domain: null,
      token_hint: null,
      updated_at: null,
      message: null,
    },
  };
}

export function getStoredOktaCredentials() {
  if (process.env.OKTA_API_TOKEN && process.env.OKTA_DOMAIN) {
    return { apiToken: process.env.OKTA_API_TOKEN, domain: process.env.OKTA_DOMAIN };
  }
  const store = readStore();
  if (!store?.api_token || !store?.domain) return null;
  return { apiToken: store.api_token, domain: store.domain };
}

export async function saveOktaCredentials({ apiToken, domain } = {}) {
  const token = String(apiToken || "").trim();
  const dom = String(domain || "").trim().replace(/^https?:\/\//, "").replace(/\/$/, "");

  if (!token || !dom) throw new Error("API token and Okta domain are required.");

  try {
    await oktaGet(dom, "/api/v1/users?limit=1", token);
  } catch (err) {
    throw new Error(`Okta credential validation failed: ${err.message}`);
  }

  const store = {
    id: "okta",
    api_token: token,
    domain: dom,
    updated_at: now(),
  };
  writeStore(store);

  process.env.OKTA_API_TOKEN = token;
  process.env.OKTA_DOMAIN = dom;

  return {
    connector: {
      id: "okta",
      connected: true,
      auth_mode: "stored",
      domain: dom,
      token_hint: `${token.slice(0, 4)}…${token.slice(-4)}`,
      updated_at: store.updated_at,
      message: `Connected to ${dom}`,
    },
  };
}

export function disconnectOktaConnector() {
  if (existsSync(STORE_PATH)) {
    rmSync(STORE_PATH, { force: true });
  }
  delete process.env.OKTA_API_TOKEN;
  delete process.env.OKTA_DOMAIN;
  return { connector: getOktaConnectorStatus().connector };
}

export async function oktaHealthCheck() {
  const creds = getStoredOktaCredentials();
  if (!creds) return { status: "unconfigured" };
  try {
    await oktaGet(creds.domain, "/api/v1/users?limit=1", creds.apiToken);
    return { status: "ok", domain: creds.domain, last_validated: now() };
  } catch (err) {
    return { status: "error", message: err.message };
  }
}

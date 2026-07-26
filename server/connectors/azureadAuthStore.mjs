// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const _BASE_DIR = join(process.cwd(), "aria-memory");
const MEMORY_DIR = join(_BASE_DIR, "connectors");
const STORE_PATH = join(MEMORY_DIR, "azuread.json");

const SENSITIVE_FIELDS = ["client_id", "client_secret"];

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
    process.stderr.write("[azureadAuthStore] ARIA_CREDENTIAL_ENCRYPTION_KEY not set; cannot decrypt stored credential\n");
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
    process.stderr.write("[azureadAuthStore] Decryption failed; credential may be corrupted\n");
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

export function getAzureAdConnectorStatus() {
  const envClientId = process.env.AZURE_CLIENT_ID;
  const store = readStore();

  if (envClientId) {
    return {
      connector: {
        id: "azuread",
        connected: true,
        auth_mode: "env",
        tenant_id: process.env.AZURE_TENANT_ID || store?.tenant_id || null,
        client_hint: `${envClientId.slice(0, 4)}…${envClientId.slice(-4)}`,
        updated_at: store?.updated_at || null,
        message: "Credentials loaded from environment variables.",
      },
    };
  }

  if (store?.client_id) {
    return {
      connector: {
        id: "azuread",
        connected: true,
        auth_mode: "stored",
        tenant_id: store.tenant_id || null,
        client_hint: `${store.client_id.slice(0, 4)}…${store.client_id.slice(-4)}`,
        updated_at: store.updated_at || null,
        message: `Connected to tenant ${store.tenant_id || "Azure AD"}`,
      },
    };
  }

  return {
    connector: {
      id: "azuread",
      connected: false,
      auth_mode: "none",
      tenant_id: null,
      client_hint: null,
      updated_at: null,
      message: null,
    },
  };
}

export function getStoredAzureAdCredentials() {
  if (process.env.AZURE_CLIENT_ID && process.env.AZURE_CLIENT_SECRET && process.env.AZURE_TENANT_ID) {
    return {
      clientId: process.env.AZURE_CLIENT_ID,
      clientSecret: process.env.AZURE_CLIENT_SECRET,
      tenantId: process.env.AZURE_TENANT_ID,
    };
  }
  const store = readStore();
  if (!store?.client_id || !store?.client_secret || !store?.tenant_id) return null;
  return {
    clientId: store.client_id,
    clientSecret: store.client_secret,
    tenantId: store.tenant_id,
  };
}

export async function fetchAzureAccessToken(clientId, clientSecret, tenantId) {
  const { request } = await import("node:https");
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
      scope: "https://graph.microsoft.com/.default",
    }).toString();
    const options = {
      hostname: "login.microsoftonline.com",
      path: `/${tenantId}/oauth2/v2.0/token`,
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(body),
      },
    };
    const req = request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.access_token) resolve(parsed.access_token);
          else reject(new Error(parsed.error_description || parsed.error || "Token fetch failed"));
        } catch {
          reject(new Error("Invalid JSON from Azure token endpoint"));
        }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

export async function saveAzureAdCredentials({ clientId, clientSecret, tenantId } = {}) {
  const cid = String(clientId || "").trim();
  const csec = String(clientSecret || "").trim();
  const tid = String(tenantId || "").trim();

  if (!cid || !csec || !tid) throw new Error("Client ID, Client Secret, and Tenant ID are all required.");

  try {
    await fetchAzureAccessToken(cid, csec, tid);
  } catch (err) {
    throw new Error(`Azure AD credential validation failed: ${err.message}`);
  }

  const store = {
    id: "azuread",
    client_id: cid,
    client_secret: csec,
    tenant_id: tid,
    updated_at: now(),
  };
  writeStore(store);

  process.env.AZURE_CLIENT_ID = cid;
  process.env.AZURE_CLIENT_SECRET = csec;
  process.env.AZURE_TENANT_ID = tid;

  return {
    connector: {
      id: "azuread",
      connected: true,
      auth_mode: "stored",
      tenant_id: tid,
      client_hint: `${cid.slice(0, 4)}…${cid.slice(-4)}`,
      updated_at: store.updated_at,
      message: `Connected to Azure AD tenant ${tid}`,
    },
  };
}

export function disconnectAzureAdConnector() {
  if (existsSync(STORE_PATH)) {
    rmSync(STORE_PATH, { force: true });
  }
  delete process.env.AZURE_CLIENT_ID;
  delete process.env.AZURE_CLIENT_SECRET;
  delete process.env.AZURE_TENANT_ID;
  return { connector: getAzureAdConnectorStatus().connector };
}

export async function azureAdHealthCheck() {
  const creds = getStoredAzureAdCredentials();
  if (!creds) return { status: "unconfigured" };
  try {
    await fetchAzureAccessToken(creds.clientId, creds.clientSecret, creds.tenantId);
    return { status: "ok", tenant_id: creds.tenantId, last_validated: new Date().toISOString() };
  } catch (err) {
    return { status: "error", message: err.message };
  }
}

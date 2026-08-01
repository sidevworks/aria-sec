// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

/**
 * AWS Credential Store
 * Persists AWS credentials in aria-memory/connectors/aws.json (mode 0o600).
 * Credentials from the store take effect immediately without restarting the app.
 *
 * SVC-020 / AWS-001: Sensitive fields (access_key_id, secret_access_key,
 *   session_token) are AES-256-GCM encrypted at rest when
 *   ARIA_CREDENTIAL_ENCRYPTION_KEY is set (32-byte hex string, 64 hex chars).
 *
 * TODO: set ARIA_CREDENTIAL_ENCRYPTION_KEY in production (64-char hex).
 *   Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *
 * Priority order for credentials used by awsConnector.mjs:
 *   1. Environment variables (AWS_ACCESS_KEY_ID etc.) — set externally, never overwritten
 *   2. Stored credentials (aria-memory/connectors/aws.json) — managed by this module
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { storeCredential, loadCredential, deleteCredential } from "./credentialVault.mjs";
import { resolveLegacyMemoryDir } from "../persistenceConfig.mjs";

// Credentials persist under the local project directory. For production,
// callers should prefer env vars or AWS Secrets Manager.
const _BASE_DIR = resolveLegacyMemoryDir();
const MEMORY_DIR = join(_BASE_DIR, "connectors");
const AWS_STORE_PATH = join(MEMORY_DIR, "aws.json");

const SENSITIVE_FIELDS = ["access_key_id", "secret_access_key", "session_token"];

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
    process.stderr.write("[awsAuthStore] ARIA_CREDENTIAL_ENCRYPTION_KEY not set; cannot decrypt stored credential\n");
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
    process.stderr.write("[awsAuthStore] Decryption failed; credential may be corrupted\n");
    return null;
  }
}

function now() {
  return new Date().toISOString();
}

function ensureStoreDir() {
  mkdirSync(dirname(AWS_STORE_PATH), { recursive: true });
}

function readStore() {
  if (!existsSync(AWS_STORE_PATH)) return null;
  try {
    const raw = JSON.parse(readFileSync(AWS_STORE_PATH, "utf8"));
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
  // mode 0o600 — owner read/write only, no group or world access
  writeFileSync(AWS_STORE_PATH, `${JSON.stringify(toWrite, null, 2)}\n`, { mode: 0o600 });
}

/**
 * Returns stored credentials (if any). Env vars always take precedence —
 * if AWS_ACCESS_KEY_ID is set in the environment this returns null so the
 * SDK uses the environment directly.
 */
export function getStoredAwsCredentials() {
  // Env vars win — don't shadow them
  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    return null;
  }
  const store = readStore();
  if (!store?.access_key_id || !store?.secret_access_key) return null;
  return {
    accessKeyId: store.access_key_id,
    secretAccessKey: store.secret_access_key,
    sessionToken: store.session_token || undefined,
    region: store.region || "us-east-1",
  };
}

export function getAwsConnectorStatus() {
  const envKey = process.env.AWS_ACCESS_KEY_ID;
  const store = readStore();

  if (envKey) {
    return {
      connector: {
        id: "aws",
        connected: true,
        auth_mode: "env",
        account: store?.account || null,
        region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || store?.region || "us-east-1",
        key_hint: `${envKey.slice(0, 4)}…${envKey.slice(-4)}`,
        updated_at: store?.updated_at || null,
        message: "Credentials loaded from environment variables.",
      },
    };
  }

  if (store?.access_key_id) {
    return {
      connector: {
        id: "aws",
        connected: true,
        auth_mode: "stored",
        account: store.account || null,
        region: store.region || "us-east-1",
        key_hint: `${store.access_key_id.slice(0, 4)}…${store.access_key_id.slice(-4)}`,
        updated_at: store.updated_at || null,
        message: `Connected as ${store.account || "AWS account"} · ${store.region || "us-east-1"}`,
      },
    };
  }

  return {
    connector: {
      id: "aws",
      connected: false,
      auth_mode: "none",
      account: null,
      region: null,
      key_hint: null,
      updated_at: null,
      message: null,
    },
  };
}

/**
 * Validate credentials via STS, then persist them.
 * Also injects them into process.env so the running server picks them up
 * immediately without restart.
 */
export async function saveAwsCredentials({ accessKeyId, secretAccessKey, sessionToken, region } = {}) {
  const key = String(accessKeyId || "").trim();
  const secret = String(secretAccessKey || "").trim();
  const rgn = String(region || "us-east-1").trim();

  if (!key || !secret) throw new Error("Access Key ID and Secret Access Key are required.");
  if (!/^[A-Z0-9]{16,}$/.test(key)) throw new Error("Access Key ID format looks incorrect (expected AKIA… or ASIA…).");

  // Validate by calling STS with the supplied credentials
  const { STSClient, GetCallerIdentityCommand } = await import("@aws-sdk/client-sts");
  const sts = new STSClient({
    region: rgn,
    credentials: sessionToken
      ? { accessKeyId: key, secretAccessKey: secret, sessionToken }
      : { accessKeyId: key, secretAccessKey: secret },
  });

  let identity;
  try {
    const resp = await sts.send(new GetCallerIdentityCommand({}));
    identity = { account: resp.Account, arn: resp.Arn, userId: resp.UserId };
  } catch (err) {
    throw new Error(`AWS credential validation failed: ${err.message}`);
  }

  // Persist to secure store
  const store = {
    id: "aws",
    access_key_id: key,
    secret_access_key: secret,
    session_token: sessionToken || null,
    region: rgn,
    account: identity.account,
    arn: identity.arn,
    user_id: identity.userId,
    updated_at: now(),
  };
  writeStore(store);

  // Inject into running process so AWS SDK clients pick up new creds immediately
  process.env.AWS_ACCESS_KEY_ID = key;
  process.env.AWS_SECRET_ACCESS_KEY = secret;
  process.env.AWS_REGION = rgn;
  if (sessionToken) process.env.AWS_SESSION_TOKEN = sessionToken;

  return {
    connector: {
      id: "aws",
      connected: true,
      auth_mode: "stored",
      account: identity.account,
      arn: identity.arn,
      region: rgn,
      key_hint: `${key.slice(0, 4)}…${key.slice(-4)}`,
      updated_at: store.updated_at,
      message: `Connected as ${identity.account} · ${rgn}`,
    },
  };
}

export function disconnectAwsConnector() {
  // Clear the store
  if (existsSync(AWS_STORE_PATH)) {
    rmSync(AWS_STORE_PATH, { force: true });
  }

  // Remove injected env vars (don't touch vars that were set externally — only clear ones we know we injected)
  // We can't easily distinguish, so just unset if store was the source. If env var was original source, the
  // user will need to restart to reload them (which is expected behaviour).
  delete process.env.AWS_ACCESS_KEY_ID;
  delete process.env.AWS_SECRET_ACCESS_KEY;
  delete process.env.AWS_SESSION_TOKEN;

  return { connector: getAwsConnectorStatus().connector };
}

export async function awsHealthCheck(tenantId) {
  // Try vault first; fall back to local store for backward compatibility
  let creds = null;
  try {
    creds = await loadCredential("aws", tenantId);
  } catch (_) {
    // vault unavailable — fall through to local store
  }
  // If vault had nothing, try the legacy local store
  if (!creds) {
    creds = getStoredAwsCredentials();
    if (creds) {
      // Normalise field names from getStoredAwsCredentials format
      creds = {
        accessKeyId: creds.accessKeyId,
        secretAccessKey: creds.secretAccessKey,
        sessionToken: creds.sessionToken,
        region: creds.region,
      };
    }
  }
  if (!creds) return { status: "unconfigured" };
  try {
    const { STSClient, GetCallerIdentityCommand } = await import("@aws-sdk/client-sts");
    const client = new STSClient({
      region: creds.region || process.env.AWS_REGION || "us-east-1",
      credentials: {
        accessKeyId: creds.accessKeyId,
        secretAccessKey: creds.secretAccessKey,
        sessionToken: creds.sessionToken,
      },
    });
    const result = await client.send(new GetCallerIdentityCommand({}));
    return {
      status: "ok",
      account_id: result.Account,
      arn: result.Arn,
      last_validated: new Date().toISOString(),
    };
  } catch (err) {
    return { status: "error", message: err.message };
  }
}

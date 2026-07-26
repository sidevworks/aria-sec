// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

// Two-tier credential store — plaintext is NEVER permitted:
// 1. AWS Secrets Manager — when ARIA_USE_SECRETS_MANAGER=true
// 2. AES-256-GCM encrypted local file — when the preferred
//    ARIA_CREDENTIAL_ENCRYPTION_KEY (or legacy ARIA_CREDENTIAL_KEY alias) is set.
// If neither is configured the vault throws — fail loud, never silently store plaintext.

const ALGORITHM = "aes-256-gcm";

function credentialKey() {
  const key = String(
    process.env.ARIA_CREDENTIAL_ENCRYPTION_KEY ||
    process.env.ARIA_CREDENTIAL_KEY ||
    ""
  ).trim();
  if (!/^[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error(
      "FATAL: credential storage requires a valid 64-character hex " +
      "ARIA_CREDENTIAL_ENCRYPTION_KEY or ARIA_USE_SECRETS_MANAGER=true. " +
      "Generate one with: node scripts/generate-encryption-key.mjs --write"
    );
  }
  return key;
}

function getLocalPath(service, tenantId) {
  const dir = process.env.ARIA_PERSISTENCE_DIR || "./aria-memory";
  const connDir = join(dir, "connectors");
  if (!existsSync(connDir)) mkdirSync(connDir, { recursive: true });
  return join(connDir, `${service}-${tenantId}.json`);
}

function encrypt(plaintext, keyHex) {
  const key = Buffer.from(keyHex, "hex");
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    iv: iv.toString("hex"),
    tag: tag.toString("hex"),
    data: encrypted.toString("hex"),
  });
}

function decrypt(ciphertext, keyHex) {
  const key = Buffer.from(keyHex, "hex");
  const { iv, tag, data } = JSON.parse(ciphertext);
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, "hex"));
  decipher.setAuthTag(Buffer.from(tag, "hex"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(data, "hex")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

async function getSecretsManagerClient() {
  const { SecretsManagerClient } = await import("@aws-sdk/client-secrets-manager");
  return new SecretsManagerClient({ region: process.env.AWS_REGION || "us-east-1" });
}

export async function storeCredential(service, tenantId, data) {
  const serialized = JSON.stringify(data);

  if (process.env.ARIA_USE_SECRETS_MANAGER === "true") {
    const { PutSecretValueCommand, CreateSecretCommand } = await import("@aws-sdk/client-secrets-manager");
    const client = await getSecretsManagerClient();
    const secretId = `aria/${tenantId}/connectors/${service}`;
    try {
      await client.send(new PutSecretValueCommand({ SecretId: secretId, SecretString: serialized }));
    } catch (err) {
      if (err.name === "ResourceNotFoundException") {
        await client.send(new CreateSecretCommand({ Name: secretId, SecretString: serialized }));
      } else {
        throw err;
      }
    }
    return;
  }

  const credKey = credentialKey();
  const path = getLocalPath(service, tenantId);
  writeFileSync(path, encrypt(serialized, credKey), { mode: 0o600 });
}

export async function loadCredential(service, tenantId) {
  if (process.env.ARIA_USE_SECRETS_MANAGER === "true") {
    const { GetSecretValueCommand } = await import("@aws-sdk/client-secrets-manager");
    const client = await getSecretsManagerClient();
    const secretId = `aria/${tenantId}/connectors/${service}`;
    try {
      const resp = await client.send(new GetSecretValueCommand({ SecretId: secretId }));
      return JSON.parse(resp.SecretString);
    } catch (err) {
      if (err.name === "ResourceNotFoundException") return null;
      throw err;
    }
  }

  const credKey = credentialKey();
  const path = getLocalPath(service, tenantId);
  if (!existsSync(path)) return null;
  return JSON.parse(decrypt(readFileSync(path, "utf8"), credKey));
}

export async function deleteCredential(service, tenantId) {
  if (process.env.ARIA_USE_SECRETS_MANAGER === "true") {
    const { DeleteSecretCommand } = await import("@aws-sdk/client-secrets-manager");
    const client = await getSecretsManagerClient();
    const secretId = `aria/${tenantId}/connectors/${service}`;
    try {
      await client.send(new DeleteSecretCommand({ SecretId: secretId, ForceDeleteWithoutRecovery: true }));
    } catch (err) {
      if (err.name !== "ResourceNotFoundException") throw err;
    }
    return;
  }

  const { unlinkSync } = await import("node:fs");
  const path = getLocalPath(service, tenantId);
  if (existsSync(path)) unlinkSync(path);
}

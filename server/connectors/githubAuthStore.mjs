// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { storeCredential, loadCredential, deleteCredential } from "./credentialVault.mjs";

// Connector metadata persists under the local project directory; the raw
// token is NEVER written to this file. Durable token storage goes through
// credentialVault (encrypted); gh-cli tokens are re-read live from `gh`.
const _BASE_DIR = join(process.cwd(), "aria-memory");
const MEMORY_DIR = join(_BASE_DIR, "connectors");
const GITHUB_CONNECTOR_PATH = join(MEMORY_DIR, "github.json");

const VAULT_TENANT = "local";

// Session-scoped token cache — process memory only.
let sessionToken = "";
let vaultHydrated = false;
let cliTokenCache = { value: "", at: 0 };

function loadDotEnvValue(key) {
  const envPath = join(process.cwd(), ".env");
  if (!existsSync(envPath)) return "";

  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  const match = lines.find((line) => line.trim().startsWith(`${key}=`));
  if (!match) return "";

  return match.slice(match.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
}

function now() {
  return new Date().toISOString();
}

function ensureStoreDir() {
  mkdirSync(dirname(GITHUB_CONNECTOR_PATH), { recursive: true });
}

function readStore() {
  if (!existsSync(GITHUB_CONNECTOR_PATH)) return null;
  try {
    return JSON.parse(readFileSync(GITHUB_CONNECTOR_PATH, "utf8"));
  } catch {
    return null;
  }
}

function writeStore(value) {
  ensureStoreDir();
  writeFileSync(GITHUB_CONNECTOR_PATH, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

// Legacy installs persisted the raw token in github.json — pull it into
// memory and immediately rewrite the file without it.
function migrateLegacyStore(store) {
  if (!store?.token) return store;
  if (!sessionToken) sessionToken = store.token;
  const { token: _legacy, ...rest } = store;
  writeStore({ ...rest, token_storage: rest.token_storage || "session" });
  return rest;
}

function loadStore() {
  return migrateLegacyStore(readStore());
}

function tokenFromGhCli() {
  if (process.env.ARIA_AI_SPM_DISABLE_GH_AUTO === "1") return "";
  const at = Date.now();
  if (at - cliTokenCache.at < 60_000) return cliTokenCache.value;
  let value = "";
  try {
    value = execFileSync("gh", ["auth", "token"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    // gh CLI missing or logged out
  }
  cliTokenCache = { value, at };
  return value;
}

async function hydrateFromVault() {
  if (vaultHydrated || sessionToken) return;
  vaultHydrated = true;
  try {
    const creds = await loadCredential("github", VAULT_TENANT);
    if (creds?.token && !creds.token_expired) sessionToken = creds.token;
  } catch {
    // vault not configured
  }
}

function sanitizeRepo(repo) {
  return String(repo || "").trim().replace(/^https:\/\/github\.com\//i, "").replace(/\.git$/i, "");
}

function sanitizeRepositories(repositories = []) {
  return [...new Set(
    repositories
      .map(sanitizeRepo)
      .filter((repo) => /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo))
  )];
}

function connectorSummary(store = loadStore()) {
  const repositories = sanitizeRepositories(store?.repositories || []);
  const tokenAvailable = Boolean(store) && Boolean(getStoredGithubToken());
  return {
    id: "github",
    label: "GitHub",
    connected: tokenAvailable,
    auth_mode: store?.auth_mode || "none",
    username: store?.user?.login || "",
    avatar_url: store?.user?.avatar_url || "",
    repositories,
    repository_count: repositories.length,
    token_present: tokenAvailable,
    token_storage: tokenAvailable ? (store?.token_storage || "session") : "none",
    oauth_device_configured: Boolean(process.env.GITHUB_OAUTH_CLIENT_ID || loadDotEnvValue("GITHUB_OAUTH_CLIENT_ID")),
    updated_at: store?.updated_at || "",
  };
}

async function githubJson(url, token, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.headers || {}),
    },
  });
  if (!response.ok) {
    throw new Error(`GitHub API failed ${response.status}`);
  }
  return response.json();
}

export function getStoredGithubToken() {
  if (!sessionToken) loadStore(); // migrates any legacy plaintext token into memory
  return sessionToken
    || process.env.GITHUB_TOKEN
    || loadDotEnvValue("GITHUB_TOKEN")
    || tokenFromGhCli();
}

export function getStoredGithubRepositories() {
  return sanitizeRepositories(loadStore()?.repositories || []);
}

export function getGithubConnectorStatus() {
  return { connector: connectorSummary() };
}

export async function saveGithubTokenConnector({ token, repositories = [], authMode = "token" } = {}) {
  const cleanToken = String(token || "").trim();
  if (!cleanToken) throw new Error("GitHub token is required");

  const user = await githubJson("https://api.github.com/user", cleanToken);
  const current = loadStore() || {};
  const selectedRepositories = sanitizeRepositories(repositories.length ? repositories : current.repositories || []);

  sessionToken = cleanToken;
  cliTokenCache = { value: "", at: 0 };

  // gh-cli tokens are re-read live from `gh auth token`, so nothing needs
  // storing. Other modes go to the encrypted vault when configured; if the
  // vault isn't set up the token stays session-only (reconnect after restart).
  let tokenStorage = authMode === "gh-cli" ? "gh-cli" : "session";
  if (authMode !== "gh-cli") {
    try {
      await storeCredential("github", VAULT_TENANT, { token: cleanToken, auth_mode: authMode });
      tokenStorage = "vault";
    } catch {
      // vault not configured — session-only
    }
  }

  const store = {
    id: "github",
    auth_mode: authMode,
    token_type: "bearer",
    token_storage: tokenStorage,
    user: {
      login: user.login || "",
      id: user.id || "",
      avatar_url: user.avatar_url || "",
    },
    repositories: selectedRepositories,
    updated_at: now(),
  };

  writeStore(store);
  return { connector: connectorSummary(store) };
}

// GH-002: token expiry detection — call before any token-using API call
async function checkTokenExpiry(token) {
  const resp = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": "Aria-Platform/1.0",
    },
  });
  if (resp.status === 401) {
    sessionToken = "";
    cliTokenCache = { value: "", at: 0 };
    const store = loadStore();
    if (store) {
      writeStore({ ...store, token_expired: true, updated_at: now() });
    }
    try {
      await deleteCredential("github", VAULT_TENANT);
    } catch {
      // vault unavailable — local store updated above is sufficient
    }
    throw new Error("GitHub token expired — reconnect required");
  }
}

export async function listGithubConnectorRepositories() {
  await hydrateFromVault();
  const token = getStoredGithubToken();
  if (!token) throw new Error("GitHub connector is not connected");

  // GH-002: verify token is not expired before listing repos
  await checkTokenExpiry(token);

  // GH-004/AI-004: paginated repo listing
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
  };
  let page = 1;
  const all = [];
  while (true) {
    const resp = await fetch(
      `https://api.github.com/user/repos?per_page=50&page=${page}&sort=updated&affiliation=owner,collaborator,organization_member`,
      { headers }
    );
    if (!resp.ok) throw new Error(`GitHub API failed ${resp.status}`);
    const repos = await resp.json();
    if (!Array.isArray(repos) || repos.length === 0) break;
    all.push(...repos);
    if (repos.length < 50) break;
    page++;
  }

  return {
    repositories: all.map((repo) => ({
      full_name: repo.full_name,
      private: Boolean(repo.private),
      default_branch: repo.default_branch || "main",
      updated_at: repo.updated_at || "",
      description: repo.description || "",
    })),
    connector: connectorSummary(),
  };
}

export function updateGithubConnectorRepositories({ repositories = [] } = {}) {
  const store = loadStore();
  if (!store || !getStoredGithubToken()) throw new Error("GitHub connector is not connected");

  const updated = {
    ...store,
    repositories: sanitizeRepositories(repositories),
    updated_at: now(),
  };
  writeStore(updated);
  return { connector: connectorSummary(updated) };
}

export function disconnectGithubConnector() {
  sessionToken = "";
  vaultHydrated = false;
  cliTokenCache = { value: "", at: 0 };
  deleteCredential("github", VAULT_TENANT).catch(() => {});
  if (existsSync(GITHUB_CONNECTOR_PATH)) {
    rmSync(GITHUB_CONNECTOR_PATH, { force: true });
  }
  return { connector: connectorSummary(null) };
}

export async function startGithubDeviceFlow() {
  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID || loadDotEnvValue("GITHUB_OAUTH_CLIENT_ID");
  if (!clientId) throw new Error("GITHUB_OAUTH_CLIENT_ID is not configured");

  const response = await fetch("https://github.com/login/device/code", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      scope: "repo read:user",
    }),
  });
  if (!response.ok) throw new Error(`GitHub device flow failed ${response.status}`);

  const data = await response.json();
  return {
    device: {
      device_code: data.device_code,
      user_code: data.user_code,
      verification_uri: data.verification_uri,
      expires_in: data.expires_in,
      interval: data.interval,
    },
  };
}

export async function pollGithubDeviceFlow({ device_code } = {}) {
  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID || loadDotEnvValue("GITHUB_OAUTH_CLIENT_ID");
  if (!clientId) throw new Error("GITHUB_OAUTH_CLIENT_ID is not configured");
  if (!device_code) throw new Error("device_code is required");

  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      device_code,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    }),
  });
  if (!response.ok) throw new Error(`GitHub token exchange failed ${response.status}`);

  const data = await response.json();
  if (data.error) {
    return {
      pending: ["authorization_pending", "slow_down"].includes(data.error),
      error: data.error,
      error_description: data.error_description || "",
    };
  }

  return saveGithubTokenConnector({ token: data.access_token, authMode: "device" });
}

export async function githubHealthCheck(tenantId) {
  // Try vault first; fall back to session/env/gh-cli token
  let creds = null;
  try {
    creds = await loadCredential("github", tenantId);
  } catch (_) {
    // vault unavailable — fall through
  }
  const token = creds?.token || getStoredGithubToken();
  if (!token) return { status: "unconfigured" };
  try {
    const resp = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": "Aria-Platform/1.0",
      },
    });
    if (!resp.ok) return { status: "error", httpStatus: resp.status };
    const user = await resp.json();
    const rateLimit = {
      remaining: Number(resp.headers.get("x-ratelimit-remaining")),
      reset: Number(resp.headers.get("x-ratelimit-reset")),
    };
    return {
      status: "ok",
      username: user.login,
      rate_limit_remaining: rateLimit.remaining,
      rate_limit_reset: rateLimit.reset,
    };
  } catch (err) {
    return { status: "error", message: err.message };
  }
}

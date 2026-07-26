// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import { spawn, execSync } from "node:child_process";

const ROOT = process.cwd();
const HOST = "127.0.0.1";
const API_PORT = 5000;
const WEB_PORT = 5173;

function log(msg) {
  process.stdout.write(`${msg}\n`);
}

function run(cmd) {
  return execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] }).toString("utf8").trim();
}

function findPidsOnPort(port) {
  try {
    const out = run(`lsof -ti tcp:${port}`);
    if (!out) return [];
    return out
      .split(/\s+/)
      .map((v) => Number(v))
      .filter((n) => Number.isFinite(n));
  } catch {
    return [];
  }
}

function killPids(pids) {
  if (!pids.length) return;
  const unique = [...new Set(pids)];
  try {
    execSync(`kill ${unique.join(" ")}`, { stdio: "ignore" });
  } catch {
    // Ignore; we'll hard-kill next.
  }
  try {
    execSync(`sleep 1; kill -9 ${unique.join(" ")}`, { stdio: "ignore" });
  } catch {
    // Ignore if already gone.
  }
}

function startProcess(name, cmd, args, env = {}) {
  const child = spawn(cmd, args, {
    cwd: ROOT,
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
  child.on("exit", (code, signal) => {
    log(`[${name}] exited (code=${code ?? "null"} signal=${signal ?? "null"})`);
  });
  return child;
}

async function waitFor(url, timeoutMs = 20000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {
      // Keep polling.
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

function bindSignals(children) {
  const shutdown = () => {
    for (const child of children) {
      if (child && !child.killed) child.kill("SIGTERM");
    }
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

async function main() {
  log("Step 1/4: Cleaning stale local listeners...");
  killPids([
    ...findPidsOnPort(API_PORT),
    ...findPidsOnPort(WEB_PORT),
    ...findPidsOnPort(5174),
    ...findPidsOnPort(5175),
  ]);

  log("Step 2/4: Starting backend on 127.0.0.1:5000...");
  const backend = startProcess("backend", process.execPath, ["server/index.mjs"], {
    ARIA_HOST: HOST,
    ARIA_PORT: String(API_PORT),
    ARIA_PERSISTENCE_DIR: "./aria-memory",
    ARIA_DEFAULT_TENANT_ID: "tenant-local",
    ARIA_DEFAULT_USER_ID: "admin",
    ARIA_DEFAULT_ROLE: "owner",
  });

  const ok = await waitFor(`http://${HOST}:${API_PORT}/api/live`, 30000);
  if (!ok) {
    log("Backend did not become healthy in time. Stopping.");
    if (!backend.killed) backend.kill("SIGTERM");
    process.exit(1);
  }
  log("Backend health check: OK");

  log("Step 3/4: Starting frontend on 127.0.0.1:5173...");
  const frontend = startProcess(
    "frontend",
    process.execPath,
    ["./node_modules/vite/bin/vite.js", "--host", HOST, "--port", String(WEB_PORT)],
    {
      VITE_ARIA_API_BASE: "",
      VITE_ARIA_TENANT_ID: "tenant-local",
      VITE_ARIA_USER_ID: "admin",
      VITE_ARIA_ROLE: "owner",
    }
  );

  bindSignals([backend, frontend]);

  log("Step 4/4: Stack ready.");
  log(`Open: http://${HOST}:${WEB_PORT}`);
}

await main();


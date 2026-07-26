#!/usr/bin/env node
// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import { spawn, execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(SCRIPT_DIR, "..");
const HOST = "127.0.0.1";
const PORTS = (process.env.ARIA_DEV_PORTS || "5000,5001,5002,5173,5174,5175")
  .split(",")
  .map((port) => Number(port.trim()))
  .filter((port) => Number.isInteger(port) && port > 0);

function log(message) {
  process.stdout.write(`[aria] ${message}\n`);
}

function run(cmd, args, options = {}) {
  return execFileSync(cmd, args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    ...options,
  }).trim();
}

function runInherited(cmd, args, options = {}) {
  execFileSync(cmd, args, {
    cwd: ROOT,
    stdio: "inherit",
    ...options,
  });
}

function pidsListeningOn(port) {
  try {
    const output = run("lsof", ["-ti", `tcp:${port}`]);
    if (!output) return [];
    return output
      .split(/\s+/)
      .map((value) => Number(value))
      .filter((pid) => Number.isInteger(pid) && pid > 0 && pid !== process.pid);
  } catch {
    return [];
  }
}

function ariaElectronPids() {
  try {
    const output = run("ps", ["-axo", "pid=,command="]);
    return output
      .split("\n")
      .map((line) => {
        const match = line.trim().match(/^(\d+)\s+(.+)$/);
        return match ? { pid: Number(match[1]), command: match[2] } : null;
      })
      .filter(Boolean)
      .filter(({ pid, command }) => {
        if (pid === process.pid) return false;
        if (!command.includes(ROOT)) return false;
        return /electron-vite|Electron\.app|node_modules\/electron|out\/main\/main\.js/.test(command);
      })
      .map(({ pid }) => pid);
  } catch {
    return [];
  }
}

function killPids(pids, label) {
  const unique = [...new Set(pids)].filter((pid) => pid !== process.pid);
  if (!unique.length) return;

  log(`stopping ${label}: ${unique.join(", ")}`);
  for (const pid of unique) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // Already exited.
    }
  }
}

async function forceKillRemaining(pids) {
  await new Promise((resolve) => setTimeout(resolve, 900));
  for (const pid of [...new Set(pids)]) {
    try {
      process.kill(pid, 0);
      process.kill(pid, "SIGKILL");
    } catch {
      // Already exited.
    }
  }
}

function ensureElectronInstalled() {
  const electronDist = join(ROOT, "node_modules", "electron", "dist");
  if (existsSync(electronDist)) return;
  log("Electron runtime missing; installing it now...");
  run(process.execPath, [join(ROOT, "node_modules", "electron", "install.js")], {
    stdio: "inherit",
  });
}

function setLaunchEnv(env) {
  if (process.platform !== "darwin") return;
  for (const [key, value] of Object.entries(env)) {
    run("launchctl", ["setenv", key, String(value)]);
  }
}

async function waitForUrl(url, label) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (res.ok) return;
    } catch {
      // Keep polling while the dev server starts.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`${label} did not become ready at ${url}`);
}

function startRenderer() {
  const vite = join(ROOT, "node_modules", "vite", "bin", "vite.js");
  if (!existsSync(vite)) {
    throw new Error(`vite not found at ${vite}. Run npm install first.`);
  }

  return spawn(process.execPath, [vite, "--host", HOST, "--port", "5173", "--strictPort"], {
    cwd: ROOT,
    stdio: "inherit",
    env: {
      ...process.env,
      VITE_ARIA_API_BASE: "",
      VITE_ARIA_TENANT_ID: process.env.VITE_ARIA_TENANT_ID || "tenant-local",
      VITE_ARIA_USER_ID: process.env.VITE_ARIA_USER_ID || "admin",
      VITE_ARIA_ROLE: process.env.VITE_ARIA_ROLE || "owner",
    },
  });
}

function startBackend() {
  const serverEntry = join(ROOT, "server", "index.mjs");
  if (!existsSync(serverEntry)) {
    throw new Error(`server entry not found at ${serverEntry}`);
  }

  return spawn(process.execPath, [serverEntry], {
    cwd: ROOT,
    stdio: "inherit",
    env: {
      ...process.env,
      ARIA_HOST: HOST,
      ARIA_PORT: "5000",
      ARIA_PERSISTENCE_DIR: join(ROOT, "aria-memory"),
      ARIA_DEFAULT_TENANT_ID: process.env.ARIA_DEFAULT_TENANT_ID || "tenant-local",
      ARIA_DEFAULT_USER_ID: process.env.ARIA_DEFAULT_USER_ID || "admin",
      ARIA_DEFAULT_ROLE: process.env.ARIA_DEFAULT_ROLE || "owner",
    },
  });
}

function openElectronApp() {
  const appPath = join(ROOT, "node_modules", "electron", "dist", "Electron.app");
  const entry = join(ROOT, "out", "main", "main.js");
  if (!existsSync(appPath)) {
    throw new Error(`Electron.app not found at ${appPath}. Run npm install first.`);
  }
  if (!existsSync(entry)) {
    throw new Error(`Electron main bundle not found at ${entry}.`);
  }

  log(`open ${appPath} --args ${entry}`);
  const child = spawn("open", ["-n", appPath, "--args", entry], {
    cwd: ROOT,
    stdio: "inherit",
  });

  child.on("exit", (code, signal) => {
    if (signal) log(`Electron exited on ${signal}`);
    else if (code) log(`Electron launcher exited with code ${code}`);
  });
}

function attachShutdown(children) {
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
      for (const child of children) {
        if (!child.killed) child.kill(signal);
      }
      process.exit(signal === "SIGINT" ? 130 : 143);
    });
  }
}

async function printElectronLogTail() {
  const path = join(ROOT, "aria-memory", "aria-electron.log");
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (existsSync(path)) {
      const lines = readFileSync(path, "utf8").trim().split(/\r?\n/).slice(-12);
      if (lines.some((line) => line.includes("[Aria] preload path:"))) {
        log(`Electron diagnostics (${path}):`);
        for (const line of lines) process.stdout.write(`${line}\n`);
        return;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  log(`Electron diagnostics not written yet; check ${path}`);
}

async function main() {
  log(`using ${ROOT}`);

  const portPids = PORTS.flatMap((port) => pidsListeningOn(port));
  const electronPids = ariaElectronPids();
  const allPids = [...new Set([...portPids, ...electronPids])];
  killPids(portPids, `listeners on ports ${PORTS.join(", ")}`);
  killPids(electronPids, "existing Aria Electron dev processes");
  await forceKillRemaining(allPids);

  ensureElectronInstalled();
  const electronVite = join(ROOT, "node_modules", "electron-vite", "bin", "electron-vite.js");
  if (!existsSync(electronVite)) {
    throw new Error(`electron-vite not found at ${electronVite}. Run npm install first.`);
  }

  log("building Electron main/preload bundles");
  runInherited(process.execPath, [electronVite, "build"]);

  const rendererUrl = `http://${HOST}:5173`;
  setLaunchEnv({
    ARIA_HOST: HOST,
    ARIA_PORT: "5000",
    ARIA_PERSISTENCE_DIR: join(ROOT, "aria-memory"),
    ARIA_DEFAULT_TENANT_ID: process.env.ARIA_DEFAULT_TENANT_ID || "tenant-local",
    ARIA_DEFAULT_USER_ID: process.env.ARIA_DEFAULT_USER_ID || "admin",
    ARIA_DEFAULT_ROLE: process.env.ARIA_DEFAULT_ROLE || "owner",
    ELECTRON_RENDERER_URL: rendererUrl,
  });

  log(`starting backend on http://${HOST}:5000`);
  const backend = startBackend();
  await waitForUrl(`http://${HOST}:5000/api/aria/health`, "backend");

  log(`starting renderer on ${rendererUrl}`);
  const renderer = startRenderer();
  attachShutdown([backend, renderer]);
  await waitForUrl(rendererUrl, "renderer");

  log("opening Electron.app through macOS Launch Services");
  openElectronApp();
  await printElectronLogTail();
}

main().catch((error) => {
  console.error(`[aria] ${error.message}`);
  process.exit(1);
});

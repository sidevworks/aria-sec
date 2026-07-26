// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import { spawn } from "node:child_process";
import { createServer } from "node:net";

function isPortFree(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const srv = createServer();
    srv.once("error", () => resolve(false));
    srv.once("listening", () => {
      srv.close(() => resolve(true));
    });
    srv.listen(port, host);
  });
}

function run(name, cmd, args, extraEnv = {}) {
  const child = spawn(cmd, args, {
    stdio: "inherit",
    env: {
      ...process.env,
      ARIA_PERSISTENCE_DIR: "./aria-memory",
      VITE_ARIA_API_BASE: "",
      VITE_ARIA_TENANT_ID: "tenant-local",
      VITE_ARIA_USER_ID: "admin",
      VITE_ARIA_ROLE: "owner",
      ...extraEnv,
    },
  });
  child.on("exit", (code, signal) => {
    const tag = `[${name}]`;
    if (signal) console.log(`${tag} exited on signal ${signal}`);
    else console.log(`${tag} exited with code ${code ?? 0}`);
  });
  return child;
}

let backend = null;
const backendFree = await isPortFree(5000);
if (backendFree) {
  backend = run("backend", process.execPath, ["server/index.mjs"]);
} else {
  console.log("[backend] 127.0.0.1:5000 already in use, reusing existing backend process.");
}

const frontend = run("frontend", process.execPath, ["./node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "5173"]);

function shutdown(signal = "SIGTERM") {
  if (backend && !backend.killed) backend.kill(signal);
  if (!frontend.killed) frontend.kill(signal);
}

process.on("SIGINT", () => {
  shutdown("SIGINT");
  process.exit(0);
});

process.on("SIGTERM", () => {
  shutdown("SIGTERM");
  process.exit(0);
});

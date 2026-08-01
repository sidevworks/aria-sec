// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import {
  app, BrowserWindow, ipcMain, Menu, nativeImage,
  Notification, session, shell, systemPreferences, Tray,
  protocol, net,
} from "electron";

// Allow audio to autoplay without a prior user gesture (boot screen WAV, etc.)
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

// Register app:// as a privileged secure scheme so the packaged renderer is treated
// as a secure context — required for navigator.mediaDevices.getUserMedia to work
// when loading from disk (file:// is not a secure context in Chromium).
// Must be called synchronously before app.whenReady().
protocol.registerSchemesAsPrivileged([{
  scheme: "app",
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
}]);

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const mainDir = dirname(fileURLToPath(import.meta.url));
const ARIA_PORT = process.env.ARIA_PORT || "5000";
const SERVER_HOST = process.env.ARIA_HOST || "127.0.0.1";
const SERVER_URL = `http://${SERVER_HOST}:${ARIA_PORT}`;

let mainWindow;
let serverProcess;
let tray;
let healthTimer;
let serverOnline = false;
let currentThreatState = { state: "UNKNOWN", threat: "UNKNOWN" };

// ── Utility ───────────────────────────────────────────────────────────────────

function getAppRoot() {
  return app.isPackaged ? app.getAppPath() : join(mainDir, "../..");
}

// Real-filesystem root for files that must exist outside the asar archive (the
// spawned server + its deps are asarUnpack'd). app.getAppPath() points at
// app.asar (a file, not a directory) in packaged builds, so spawning the server
// or using it as a cwd fails with ENOTDIR — use the .unpacked sibling instead.
function unpackedRoot() {
  const root = getAppRoot();
  return app.isPackaged ? root.replace(/app\.asar$/, "app.asar.unpacked") : root;
}

// The persistence dir the spawned server uses. Must be writable — a packaged app
// bundle is read-only (and code-signed), so writes there fail. Use userData.
function persistenceDir() {
  const configured = process.env.ARIA_PERSISTENCE_DIR;
  if (configured) return isAbsolute(configured) ? configured : join(getAppRoot(), configured);
  return app.isPackaged ? join(app.getPath("userData"), "aria-memory") : join(getAppRoot(), "aria-memory");
}

function logPath() {
  return join(persistenceDir(), "aria-electron.log");
}

// Per-install credential encryption key (64-hex / 32 bytes), used by the server's
// credentialVault to AES-256-GCM the connector secrets a user enters in the setup
// wizard. Without this the vault throws and "Connect my own" fails on a fresh
// install. We generate a UNIQUE key per machine (never a shared baked-in key) and
// persist it under the persistence dir.
let cachedCredentialKey = null;
function resolveCredentialEncryptionKey() {
  if (cachedCredentialKey) return cachedCredentialKey;

  const fromEnv = String(
    process.env.ARIA_CREDENTIAL_ENCRYPTION_KEY ||
    process.env.ARIA_CREDENTIAL_KEY ||
    ""
  ).trim();
  if (fromEnv) {
    cachedCredentialKey = fromEnv;
    return cachedCredentialKey;
  }

  const file = join(persistenceDir(), "credential-encryption-key");
  try {
    if (existsSync(file)) {
      const stored = readFileSync(file, "utf8").trim();
      if (stored) {
        cachedCredentialKey = stored;
        return cachedCredentialKey;
      }
    }
  } catch {
    // Unreadable key file — fall through and regenerate.
  }

  const generated = randomBytes(32).toString("hex");
  try {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, generated, { encoding: "utf8", mode: 0o600 });
  } catch {
    // If we can't persist, fall back to an in-memory key for this launch.
  }
  cachedCredentialKey = generated;
  return cachedCredentialKey;
}

function appLog(...parts) {
  const message = parts.map((part) => (
    typeof part === "string" ? part : JSON.stringify(part)
  )).join(" ");
  console.log(message);
  try {
    mkdirSync(dirname(logPath()), { recursive: true });
    appendFileSync(logPath(), `${new Date().toISOString()} ${message}\n`, "utf8");
  } catch {
    // Diagnostic logging must not block app startup.
  }
}

function getServerEntry() {
  return join(unpackedRoot(), "server", "index.mjs");
}

function getTrayIconPath() {
  const candidates = [
    join(mainDir, "../renderer/tray-icon.png"),
    join(getAppRoot(), "public/tray-icon.png"),
    join(getAppRoot(), "out/renderer/tray-icon.png"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

function buildTrayIcon() {
  const iconPath = getTrayIconPath();
  if (iconPath) {
    const img = nativeImage.createFromPath(iconPath);
    if (process.platform === "darwin") img.setTemplateImage(true);
    return img;
  }
  // Fallback: 16x16 empty template image (shows as blank but won't crash)
  return nativeImage.createEmpty();
}

function ariaApiHeaders() {
  return {
    "x-tenant-id": process.env.ARIA_DEFAULT_TENANT_ID || "tenant-local",
    "x-user-id": process.env.ARIA_DEFAULT_USER_ID || "admin",
    "x-role": process.env.ARIA_DEFAULT_ROLE || "owner",
  };
}

// ── Native notification ───────────────────────────────────────────────────────

function sendNativeNotification({ title, body, urgency = "normal" }) {
  if (!Notification.isSupported()) return;
  const n = new Notification({
    title,
    body,
    silent: urgency === "low",
    urgency,
  });
  n.on("click", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
  n.show();
}

// ── Tray ──────────────────────────────────────────────────────────────────────

function buildTrayMenu() {
  const statusLabel = serverOnline
    ? `State: ${currentThreatState.state}  ·  Threat: ${currentThreatState.threat}`
    : "Server offline";

  return Menu.buildFromTemplate([
    { label: "ARIA-SEC", enabled: false },
    { label: statusLabel, enabled: false },
    { type: "separator" },
    {
      label: "Show Aria",
      click: () => {
        if (!mainWindow) return;
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
      },
    },
    {
      label: "Quick Scan",
      enabled: serverOnline,
      click: () => {
        if (mainWindow) {
          mainWindow.webContents.send("aria:tray-action", "scan");
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    {
      label: "Open AI-SPM",
      enabled: serverOnline,
      click: () => {
        if (mainWindow) {
          mainWindow.webContents.send("aria:tray-action", "ai-spm");
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    { type: "separator" },
    {
      label: "Quit Aria",
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);
}

function createTray() {
  tray = new Tray(buildTrayIcon());
  tray.setToolTip("Aria — Security Operations");

  tray.on("click", () => {
    if (!mainWindow) return;
    if (mainWindow.isVisible() && !mainWindow.isMinimized()) {
      mainWindow.hide();
    } else {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  tray.setContextMenu(buildTrayMenu());
}

function updateTray() {
  if (!tray) return;
  const threat = currentThreatState.threat;
  const tip = serverOnline
    ? `Aria · ${currentThreatState.state} · Threat: ${threat}`
    : "Aria · Server offline";
  tray.setToolTip(tip);
  tray.setContextMenu(buildTrayMenu());
}

// ── Server health monitor ─────────────────────────────────────────────────────

async function checkServerHealth() {
  try {
    const res = await fetch(`${SERVER_URL}/api/aria/health`, {
      headers: ariaApiHeaders(),
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function broadcastServerStatus(online) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("aria:server-status", { online });
}

function startHealthMonitor() {
  if (healthTimer) return;

  const poll = async () => {
    const online = await checkServerHealth();
    if (online !== serverOnline) {
      serverOnline = online;
      broadcastServerStatus(online);
      updateTray();
      if (!online) {
        sendNativeNotification({
          title: "Aria — Server Offline",
          body: "The Aria backend is not responding. Some features may be unavailable.",
          urgency: "normal",
        });
      } else {
        sendNativeNotification({
          title: "Aria — Back Online",
          body: "The Aria server has reconnected.",
          urgency: "low",
        });
      }
    }
    healthTimer = setTimeout(poll, 15_000);
  };

  // First check after 2s (give the server time to start)
  healthTimer = setTimeout(poll, 2_000);
}

function stopHealthMonitor() {
  if (healthTimer) {
    clearTimeout(healthTimer);
    healthTimer = null;
  }
}

// ── IPC handlers ──────────────────────────────────────────────────────────────

function registerIpcHandlers() {
  // Renderer → Main: trigger native OS notification
  ipcMain.on("aria:notify", (_event, { title, body, urgency }) => {
    sendNativeNotification({ title, body, urgency });
  });

  ipcMain.handle("aria:open-external", async (_event, { url } = {}) => {
    try {
      const parsed = new URL(String(url || ""));
      if (!["mailto:", "https:", "http:"].includes(parsed.protocol)) {
        return { ok: false, error: "UNSUPPORTED_PROTOCOL" };
      }
      await shell.openExternal(parsed.toString());
      return { ok: true };
    } catch (err) {
      appLog("[Aria] open external failed:", err?.message || err);
      return { ok: false, error: "OPEN_EXTERNAL_FAILED", message: err?.message || "" };
    }
  });

  // Renderer → Main: update tray with current threat state
  ipcMain.on("aria:threat-state", (_event, { state, threat }) => {
    currentThreatState = { state, threat };
    updateTray();
  });

}

// ── Server lifecycle ──────────────────────────────────────────────────────────

async function startAriaServer() {
  if (serverProcess) return;

  if (await checkServerHealth()) {
    serverOnline = true;
    appLog(`[Aria] Reusing existing server at ${SERVER_URL}`);
    return;
  }

  const serverEntry = getServerEntry();
  if (!existsSync(serverEntry)) {
    appLog(`Aria server entry not found: ${serverEntry}`);
    return;
  }

  const credentialEncryptionKey = resolveCredentialEncryptionKey();
  serverProcess = spawn(process.execPath, [serverEntry], {
    cwd: unpackedRoot(),
    env: {
      ...process.env,
      ARIA_PORT,
      ARIA_PERSISTENCE_DIR: persistenceDir(),
      ARIA_DEFAULT_TENANT_ID: process.env.ARIA_DEFAULT_TENANT_ID || "tenant-local",
      ARIA_DEFAULT_USER_ID: process.env.ARIA_DEFAULT_USER_ID || "admin",
      ARIA_DEFAULT_ROLE: process.env.ARIA_DEFAULT_ROLE || "owner",
      ARIA_DEMO_BUILD: process.env.ARIA_DEMO_BUILD || process.env.VITE_ARIA_DEMO_BUILD || "",
      // Per-install key so the credential vault can encrypt connector secrets
      // entered via the setup wizard. Generated/persisted per machine.
      ARIA_CREDENTIAL_ENCRYPTION_KEY: credentialEncryptionKey,
      ARIA_CREDENTIAL_KEY: credentialEncryptionKey,
      ELECTRON_RUN_AS_NODE: "1",
    },
    stdio: app.isPackaged ? ["ignore", "ignore", "pipe"] : "inherit",
  });

  if (app.isPackaged && serverProcess.stderr) {
    serverProcess.stderr.on("data", (chunk) => {
      appLog("[Aria server]", chunk.toString().trim());
    });
  }

  serverProcess.on("exit", (code, signal) => {
    if (!app.isQuitting) {
      appLog(`Aria server exited with code ${code ?? "null"} and signal ${signal ?? "null"}`);
    }
    serverProcess = undefined;
  });
}

function stopAriaServer() {
  if (!serverProcess) return;
  serverProcess.kill();
  serverProcess = undefined;
}

async function waitForAriaServer() {
  const url = `${SERVER_URL}/api/aria/health`;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(3000),
      });
      if (response.ok) return;

      const body = await response.text().catch(() => "");
      appLog("[Aria] readiness failed", {
        status: response.status,
        url,
        body,
      });
    } catch {
      // still starting
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  appLog("[Aria] Server did not become ready in time - API calls will 404.");
}

// ── Window ────────────────────────────────────────────────────────────────────

async function createWindow() {
  const preloadCandidates = [
    join(mainDir, "../preload/preload.mjs"),
    join(mainDir, "../preload/preload.js"),
    join(getAppRoot(), "out/preload/preload.mjs"),
    join(getAppRoot(), "out/preload/preload.js"),
    join(mainDir, "preload.mjs"),
    join(mainDir, "preload.js"),
  ];
  const preloadPath = preloadCandidates.find((candidate) => existsSync(candidate));
  appLog("[Aria] mainDir:", mainDir);
  appLog("[Aria] appRoot:", getAppRoot());
  appLog("[Aria] isPackaged:", app.isPackaged);
  appLog("[Aria] rendererUrl:", process.env.ELECTRON_RENDERER_URL || "");
  appLog("[Aria] preload path:", preloadPath || "missing");

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1024,
    minHeight: 720,
    title: "Aria",
    backgroundColor: "#05070d",
    // Hide from Dock/taskbar when minimised to tray — macOS only
    // (hiddenInMissionControl on older Electron; skipTaskbar on Windows)
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      // electron-vite emits the preload as an ESM bundle (`preload.mjs`).
      // Keep the renderer unsandboxed so Electron can execute that preload and
      // expose `window.aria` while page JS stays isolated.
      sandbox: false,
      preload: preloadPath,
    },
  });

  mainWindow.maximize();

  // Closing the window hides it to tray rather than quitting (macOS behaviour)
  mainWindow.on("close", (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  await waitForAriaServer();

  // Only honor the Vite dev-server URL in development. A packaged build must load
  // the bundled renderer via app://, even if ELECTRON_RENDERER_URL is leaking in
  // from the launching shell — otherwise the window tries to reach a dev server
  // that isn't running and comes up blank.
  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    await mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    await mainWindow.loadURL("app://index/index.html");
  }

  // Mark server as online once window has loaded
  serverOnline = true;
  updateTray();
}

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  // ── app:// protocol handler ────────────────────────────────────────────────
  const APP_MIME = {
    ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
    ".css": "text/css", ".json": "application/json", ".map": "application/json",
    ".mp3": "audio/mpeg", ".wav": "audio/wav", ".ogg": "audio/ogg", ".m4a": "audio/mp4",
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif",
    ".svg": "image/svg+xml", ".webp": "image/webp", ".ico": "image/x-icon",
    ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf",
  };
  protocol.handle("app", (request) => {
    const { pathname } = new URL(request.url);
    const filePath = join(mainDir, "../renderer/", decodeURIComponent(pathname));
    const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
    const contentType = APP_MIME[ext] || "application/octet-stream";

    // Serve a byte range when the client asks for one (required by Chromium's
    // <audio>/<video> elements — without 206 support, longer media won't play).
    const rangeHeader = request.headers.get("range");
    try {
      const size = statSync(filePath).size;
      if (rangeHeader) {
        const m = /bytes=(\d*)-(\d*)/.exec(rangeHeader);
        let start = m && m[1] ? parseInt(m[1], 10) : 0;
        let end = m && m[2] ? parseInt(m[2], 10) : size - 1;
        if (Number.isNaN(start)) start = 0;
        if (Number.isNaN(end) || end >= size) end = size - 1;
        if (start > end) start = 0;
        const chunk = readFileSync(filePath).subarray(start, end + 1);
        return new Response(chunk, {
          status: 206,
          headers: {
            "Content-Type": contentType,
            "Content-Length": String(chunk.length),
            "Content-Range": `bytes ${start}-${end}/${size}`,
            "Accept-Ranges": "bytes",
          },
        });
      }
      return new Response(readFileSync(filePath), {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Content-Length": String(size),
          "Accept-Ranges": "bytes",
        },
      });
    } catch {
      // Fall back to the original fetch (e.g. file truly missing → proper 404)
      return net.fetch(pathToFileURL(filePath).toString());
    }
  });

  // ── Content-Security-Policy ────────────────────────────────────────────────
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [
          "default-src 'self' app: 'unsafe-inline' 'unsafe-eval' data: blob: ws: wss: http://localhost:* http://127.0.0.1:* https:; connect-src 'self' app: data: blob: ws: wss: http://localhost:* http://127.0.0.1:* https:;",
        ],
      },
    });
  });

  // ── Microphone permission ──────────────────────────────────────────────────
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === "media");
  });
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    return permission === "media";
  });

  if (process.platform === "darwin") {
    const micStatus = systemPreferences.getMediaAccessStatus("microphone");
    appLog("[Aria] macOS mic status:", micStatus);
    // Voice is optional (and unused in the demo). Never block startup on a
    // permission dialog. Request access fire-and-forget if undecided; otherwise
    // just continue — getUserMedia will trigger the OS prompt later if needed.
    if (micStatus === "not-determined") {
      systemPreferences.askForMediaAccess("microphone").catch(() => {});
    }
  }

  registerIpcHandlers();
  createTray();
  await startAriaServer();
  await createWindow();
  startHealthMonitor();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
});

app.on("before-quit", () => {
  app.isQuitting = true;
  stopHealthMonitor();
  stopAriaServer();
});

app.on("will-quit", () => {
  stopHealthMonitor();
  stopAriaServer();
});

app.on("window-all-closed", () => {
  // On macOS keep running in tray; on other platforms quit normally.
  if (process.platform !== "darwin") {
    app.quit();
  }
});

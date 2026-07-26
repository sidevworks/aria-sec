// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

// ════════════════════════════════════════════════════════════════════════════
// NETWORK INTELLIGENCE · HTTP Routes
// /api/network/* — authorization gate + passive/active discovery + galaxy data.
//
// DEFENSIVE OBSERVABILITY ONLY. Default posture is DENY: active scanning requires
// an explicit, operator-confirmed, time-limited authorization record. There is
// no implicit authorization and no default that runs a scan on launch.
// ════════════════════════════════════════════════════════════════════════════
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import { discoverPassive, discoverActive, isExpired, isPrivateCidr } from "./NetworkIntelligence/networkDiscovery.mjs";
import { scanDeviceExposures, summarizeExposures } from "./NetworkIntelligence/exposureScanner.mjs";
import { discoveryToGalaxies, buildDevSampleGalaxies } from "./NetworkIntelligence/liveGalaxyAdapter.mjs";
import { inferDeviceRole } from "./NetworkIntelligence/deviceInference.mjs";
import { subnet24Of } from "./NetworkIntelligence/subnetClassifier.mjs";
import { assessEntityObservation, recordEntityObservation } from "./identityBaselineStore.mjs";
import { isStrictProductionMode, resolveLegacyMemoryDir } from "./persistenceConfig.mjs";

const MEMORY_DIR = resolveLegacyMemoryDir();
const AUTH_PATH = join(MEMORY_DIR, "network-auth.json");
const LAST_SCAN_PATH = join(MEMORY_DIR, "network-last-scan.json");
const ACTIVE_SCAN_PATH = join(MEMORY_DIR, "network-active-scan.json");
const AUTH_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours
const ACTIVE_SCAN_STALE_MS = 2 * 60 * 1000;

const ALLOWED_TECHNIQUES = new Set(["passive", "ping_sweep", "port_scan"]);

function isNetworkSampleModeEnabled() {
  return ["1", "true", "yes", "on"].includes(
    String(process.env.ARIA_NETWORK_SAMPLE_MODE || "").toLowerCase()
  );
}

// Per-request demo toggle (?demo=true or x-aria-demo:1) — UI demo mode.
function wantsDemo(req) {
  if (String(req?.headers?.["x-aria-demo"] || "") === "1") return true;
  try {
    return new URL(req.url, "http://localhost").searchParams.get("demo") === "true";
  } catch {
    return false;
  }
}

function now() {
  return new Date().toISOString();
}

function ensureStore() {
  if (!existsSync(MEMORY_DIR)) mkdirSync(MEMORY_DIR, { recursive: true });
}

function readAuthRecord() {
  ensureStore();
  if (!existsSync(AUTH_PATH)) return null;
  try {
    const rec = JSON.parse(readFileSync(AUTH_PATH, "utf8"));
    if (!rec || typeof rec !== "object") return null;
    // Lazily reconcile expiry so a stale "active" never reads as authorized.
    if (rec.status === "active" && isExpired(rec)) {
      rec.status = "expired";
      writeAuthRecord(rec);
    }
    return rec;
  } catch {
    return null;
  }
}

function writeAuthRecord(rec) {
  ensureStore();
  writeFileSync(AUTH_PATH, `${JSON.stringify(rec, null, 2)}\n`, "utf8");
}

function clearAuthRecord() {
  if (existsSync(AUTH_PATH)) rmSync(AUTH_PATH, { force: true });
}

function readLastScan() {
  ensureStore();
  if (!existsSync(LAST_SCAN_PATH)) return null;
  try {
    return JSON.parse(readFileSync(LAST_SCAN_PATH, "utf8"));
  } catch {
    return null;
  }
}

function writeLastScan(summary) {
  ensureStore();
  writeFileSync(LAST_SCAN_PATH, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
}

function readActiveScan() {
  ensureStore();
  if (!existsSync(ACTIVE_SCAN_PATH)) return null;
  try {
    const scan = JSON.parse(readFileSync(ACTIVE_SCAN_PATH, "utf8"));
    if (scan?.status === "running") {
      const updatedAt = new Date(scan.updatedAt || scan.startedAt || 0).getTime();
      if (Number.isFinite(updatedAt) && Date.now() - updatedAt > ACTIVE_SCAN_STALE_MS) {
        const stale = {
          ...scan,
          status: "error",
          stage: "stale",
          message: "Active scan did not report progress before the local timeout window.",
          error: "ACTIVE_SCAN_STALE",
          completedAt: now(),
          updatedAt: now(),
        };
        writeActiveScan(stale);
        return stale;
      }
    }
    return scan;
  } catch {
    return null;
  }
}

function writeActiveScan(scan) {
  ensureStore();
  writeFileSync(ACTIVE_SCAN_PATH, `${JSON.stringify(scan, null, 2)}\n`, "utf8");
}

function grantedByFrom(context, req) {
  const tenant = context?.tenant_id || req?.headers?.["x-tenant-id"] || "tenant-local";
  const user = context?.user_id || req?.headers?.["x-user-id"] || "user-local";
  return `${tenant}:${user}`;
}

function isAuthActive(rec) {
  return Boolean(rec) && rec.status === "active" && !isExpired(rec);
}

function isScanRunning(scan) {
  return scan?.status === "running";
}

function networkBaselineEntityId(device = {}) {
  const mac = String(device.mac || "").trim().toLowerCase();
  return `network-device:${mac || device.ip || "unknown"}`;
}

function networkObservation(device = {}) {
  return {
    openPorts: Array.isArray(device.openPorts) ? device.openPorts : [],
    subnet: subnet24Of(device.ip),
    hostname: device.hostname || null,
    vendor: device.vendor || null,
    deviceType: inferDeviceRole(device),
    deviceTypeSource: "inferred",
    riskScore: null,
  };
}

function identityFindingSummary(devices = []) {
  const findings = devices.flatMap((device) =>
    Array.isArray(device.identityFindings) ? device.identityFindings : []
  );
  return {
    identityFindingCount: findings.length,
    highConfidenceIdentityFindingCount: findings.filter((finding) =>
      Number(finding.confidence || 0) >= 0.85
    ).length,
    identityFindingTypes: [...new Set(findings.map((finding) => finding.type).filter(Boolean))],
  };
}

async function enrichDevicesWithIdentityAssessment(devices = [], { record = false } = {}) {
  await Promise.all(devices.map(async (device) => {
    const entityId = networkBaselineEntityId(device);
    const observation = networkObservation(device);
    const result = record
      ? await recordEntityObservation(entityId, observation)
      : await assessEntityObservation(entityId, observation);
    device.baselineEntityId = entityId;
    device.identityFindings = Array.isArray(result)
      ? result
      : (result.currentIdentityFindings || []);
    device.deviceType = observation.deviceType;
    device.subnet = observation.subnet;
  }));
  return devices;
}

async function runActiveScanJob({ scanId, rec, context, req, logAuditEvent }) {
  const start = Date.now();
  const actor = grantedByFrom(context, req);
  const updateScan = (patch) => {
    const current = readActiveScan() || {};
    writeActiveScan({
      ...current,
      ...patch,
      id: scanId,
      mode: "active",
      updatedAt: now(),
    });
  };

  try {
    updateScan({
      status: "running",
      stage: "discovering",
      message: "Discovering live hosts.",
      progress: { completed: 0, total: 0, alive: 0, elapsedMs: 0 },
    });
    const devices = await discoverActive(rec.scope, rec, {
      concurrency: 32,
      maxDurationMs: 75_000,
      onProgress: (progress) => {
        const pct = progress.total > 0 ? progress.completed / progress.total : 0;
        const etaMs = pct > 0.05
          ? Math.round((progress.elapsedMs / pct) * (1 - pct))
          : null;
        const etaStr = etaMs != null ? ` — ~${Math.max(1, Math.round(etaMs / 1000))}s remaining` : "";
        const elapsed = Math.round(progress.elapsedMs / 1000);
        updateScan({
          status: "running",
          stage: "discovering",
          message: `Discovering live hosts (${progress.completed}/${progress.total})${etaStr}  [${elapsed}s elapsed]`,
          progress,
        });
      },
    });

    if (rec.techniques.includes("port_scan")) {
      const exposureStart = Date.now();
      let devIdx = 0;
      for (const d of devices) {
        devIdx += 1;
        const elapsed = Math.round((Date.now() - start) / 1000);
        updateScan({
          status: "running",
          stage: "exposure_scan",
          message: `Scanning exposure surface (device ${devIdx}/${devices.length})  [${elapsed}s elapsed]`,
          deviceCount: devices.length,
          deviceProgress: devIdx,
        });
        const exposures = await scanDeviceExposures(d.ip);
        d.exposures = exposures;
        const summary = summarizeExposures(exposures);
        d.openPorts = summary.openPorts;
        if (!d.discoveryMethod.includes("port_scan")) d.discoveryMethod.push("port_scan");
      }
    }

    await enrichDevicesWithIdentityAssessment(devices, { record: true });
    const mapElapsed = Math.round((Date.now() - start) / 1000);
    updateScan({ status: "running", stage: "mapping", message: `Building network galaxy map.  [${mapElapsed}s elapsed]` });
    const result = discoveryToGalaxies(devices, rec);
    const summary = {
      mode: "active",
      deviceCount: devices.length,
      galaxyCount: result.galaxies.length,
      duration: Date.now() - start,
      scannedAt: now(),
      ...identityFindingSummary(devices),
    };
    writeLastScan(summary);
    updateScan({
      status: "complete",
      stage: "complete",
      message: "Active scan complete.",
      completedAt: now(),
      summary,
    });

    logAuditEvent({
      event_type: "network:scan_complete",
      status: "success",
      actor,
      context: {
        deviceCount: summary.deviceCount,
        galaxyCount: summary.galaxyCount,
        duration: summary.duration,
        scope: rec.scope,
        techniques: rec.techniques,
        authorizationId: rec.id,
        scanId,
      },
    });
  } catch (err) {
    updateScan({
      status: "error",
      stage: "error",
      message: err.message || "Active scan failed.",
      error: /SCAN_NOT_AUTHORIZED/.test(err.message || "") ? "SCAN_NOT_AUTHORIZED" : "ACTIVE_SCAN_FAILED",
      completedAt: now(),
    });
    logAuditEvent({
      event_type: "network:scan_error",
      status: "error",
      actor,
      context: { message: err.message, authorizationId: rec.id, scanId },
    });
  }
}

// ─── Shared accessor for cross-module network device lookup ───────────────────
export async function getNetworkGalaxyData() {
  const rec = readAuthRecord();
  const lastScan = readLastScan();
  if (isAuthActive(rec) && lastScan) {
    let devices = [];
    try { devices = await discoverPassive(rec.scope); } catch { devices = []; }
    await enrichDevicesWithIdentityAssessment(devices);
    return discoveryToGalaxies(devices, rec);
  }
  if (isNetworkSampleModeEnabled()) return buildDevSampleGalaxies();
  return null;
}

export async function getNetworkRawDevices() {
  const rec = readAuthRecord();
  if (isAuthActive(rec)) {
    try {
      const devices = await discoverPassive(rec.scope);
      return await enrichDevicesWithIdentityAssessment(devices);
    } catch {
      return [];
    }
  }
  return [];
}

// ─── Main handler ──────────────────────────────────────────────────────────────
export async function handleNetworkIntelligenceRoute(
  req,
  res,
  apiPath,
  jsonResponse,
  readJson,
  authorizeRequest,
  logAuditEvent
) {
  // Every route calls authorizeRequest() at entry (RBAC / tenant guard).
  const authz = await authorizeRequest({ req, apiPath });
  if (!authz.allowed) {
    jsonResponse(req, res, authz.statusCode || 403, { error: authz.error || "Forbidden" });
    return true;
  }
  const context = authz.context;

  // ── GET /api/network/status ──────────────────────────────────────────────
  if (req.method === "GET" && apiPath === "/api/network/status") {
    const rec = readAuthRecord();
    const lastScan = readLastScan();
    const activeScan = readActiveScan();
    jsonResponse(req, res, 200, {
      authStatus: isAuthActive(rec) ? "active" : rec ? rec.status : "none",
      authorization: rec
        ? {
            id: rec.id,
            scope: rec.scope,
            techniques: rec.techniques,
            grantedAt: rec.grantedAt,
            grantedBy: rec.grantedBy,
            expiresAt: rec.expiresAt,
            status: rec.status,
          }
        : null,
      lastScan: lastScan || null,
      activeScan: activeScan || null,
    });
    return true;
  }

  // ── GET /api/network/interfaces — local network interfaces for scope pre-fill ─
  if (req.method === "GET" && apiPath === "/api/network/interfaces") {
    const { networkInterfaces } = await import("node:os");
    const ifaces = networkInterfaces();
    const privateNets = [];
    for (const [name, addrs] of Object.entries(ifaces)) {
      for (const addr of addrs || []) {
        if (addr.family === "IPv4" && !addr.internal) {
          // Derive the /24 CIDR from the interface address
          const parts = addr.address.split(".");
          const cidr = `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
          if (isPrivateCidr(cidr)) {
            privateNets.push({ iface: name, address: addr.address, cidr });
          }
        }
      }
    }
    jsonResponse(req, res, 200, { interfaces: privateNets });
    return true;
  }

  // ── POST /api/network/authorize ──────────────────────────────────────────
  if (req.method === "POST" && apiPath === "/api/network/authorize") {
    const body = (await readJson(req)) || {};

    // Coerce bare IPs (192.168.8.98) → /24 CIDRs (192.168.8.0/24) before validation.
    const rawScope = Array.isArray(body.scope) ? body.scope.map((s) => String(s).trim()).filter(Boolean) : [];
    const scope = rawScope.map((entry) => {
      if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(entry)) {
        const parts = entry.split(".");
        return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
      }
      return entry;
    });

    const techniques = Array.isArray(body.techniques)
      ? body.techniques.map((t) => String(t).trim()).filter((t) => ALLOWED_TECHNIQUES.has(t))
      : [];

    // Operator must explicitly confirm authority — no implicit consent.
    if (body.confirmAuthority !== true) {
      logAuditEvent({
        event_type: "network:authorize_rejected",
        status: "denied",
        actor: grantedByFrom(context, req),
        context: { reason: "confirmAuthority not set", scope },
      });
      jsonResponse(req, res, 400, {
        error: "AUTHORITY_NOT_CONFIRMED",
        message: "confirmAuthority must be true — the operator must explicitly confirm authority over these segments.",
      });
      return true;
    }

    if (!scope.length) {
      jsonResponse(req, res, 400, { error: "EMPTY_SCOPE", message: "At least one subnet is required (e.g. 192.168.8.0/24)." });
      return true;
    }

    // Validate every CIDR is an RFC-1918 private range. Refuse public IPs.
    const invalid = scope.filter((c) => !isPrivateCidr(c));
    if (invalid.length) {
      logAuditEvent({
        event_type: "network:authorize_rejected",
        status: "denied",
        actor: grantedByFrom(context, req),
        context: { reason: "non-private scope", invalid },
      });
      jsonResponse(req, res, 400, {
        error: "INVALID_SCOPE",
        message: `These don't look like private network ranges: ${invalid.join(", ")}. Use your local subnet (e.g. 192.168.8.0/24).`,
      });
      return true;
    }

    if (!techniques.length) {
      jsonResponse(req, res, 400, {
        error: "NO_TECHNIQUES",
        message: "Select at least one technique: passive, ping_sweep, port_scan.",
      });
      return true;
    }

    const grantedAt = now();
    const grantedBy = grantedByFrom(context, req);
    const rec = {
      id: randomUUID(),
      grantedAt,
      grantedBy,
      scope,
      techniques,
      expiresAt: new Date(Date.now() + AUTH_TTL_MS).toISOString(),
      status: "active",
    };
    writeAuthRecord(rec);

    logAuditEvent({
      event_type: "network:scan_authorized",
      status: "success",
      actor: grantedBy,
      context: { scope, techniques, grantedBy, authorizationId: rec.id },
    });

    jsonResponse(req, res, 200, { authorization: rec });
    return true;
  }

  // ── POST /api/network/authorize/revoke ─────────────────────────────────────
  if (req.method === "POST" && apiPath === "/api/network/authorize/revoke") {
    const rec = readAuthRecord();
    if (rec) {
      rec.status = "revoked";
      writeAuthRecord(rec);
      logAuditEvent({
        event_type: "network:scan_revoked",
        status: "success",
        actor: grantedByFrom(context, req),
        context: { authorizationId: rec.id },
      });
    }
    jsonResponse(req, res, 200, { authStatus: "none", revoked: Boolean(rec) });
    return true;
  }

  // ── DELETE /api/network/authorization ──────────────────────────────────────
  if (req.method === "DELETE" && apiPath === "/api/network/authorization") {
    clearAuthRecord();
    logAuditEvent({
      event_type: "network:authorization_cleared",
      status: "success",
      actor: grantedByFrom(context, req),
      context: {},
    });
    jsonResponse(req, res, 200, { cleared: true, authStatus: "none" });
    return true;
  }

  // ── GET /api/network/scan/passive (no auth gate required) ──────────────────
  // Passive discovery reads only what the OS already has. Still scoped to the
  // authorization record's scope if one exists, otherwise all private subnets.
  if (req.method === "GET" && apiPath === "/api/network/scan/passive") {
    const rec = readAuthRecord();
    const scope = isAuthActive(rec) ? rec.scope : [];
    const start = Date.now();
    let devices = [];
    try {
      devices = await discoverPassive(scope);
    } catch (err) {
      jsonResponse(req, res, 500, { error: "PASSIVE_SCAN_FAILED", message: err.message });
      return true;
    }
    await enrichDevicesWithIdentityAssessment(devices, { record: true });
    const result = discoveryToGalaxies(devices, rec);
    const summary = {
      mode: "passive",
      deviceCount: devices.length,
      galaxyCount: result.galaxies.length,
      duration: Date.now() - start,
      scannedAt: now(),
      ...identityFindingSummary(devices),
    };
    writeLastScan(summary);
    logAuditEvent({
      event_type: "network:passive_scan_complete",
      status: "success",
      actor: grantedByFrom(context, req),
      context: summary,
    });
    jsonResponse(req, res, 200, { ...result, summary });
    return true;
  }

  // ── POST /api/network/scan/active (auth gate REQUIRED) ─────────────────────
  if (req.method === "POST" && apiPath === "/api/network/scan/active") {
    const rec = readAuthRecord();
    if (!isAuthActive(rec)) {
      logAuditEvent({
        event_type: "network:scan_denied",
        status: "denied",
        actor: grantedByFrom(context, req),
        context: { reason: rec ? rec.status : "no authorization" },
      });
      jsonResponse(req, res, 403, {
        error: "SCAN_NOT_AUTHORIZED",
        message: "No active authorization. Record an authorization (with confirmAuthority) before running an active scan.",
      });
      return true;
    }

    const start = Date.now();
    const existingScan = readActiveScan();
    if (isScanRunning(existingScan)) {
      jsonResponse(req, res, 202, {
        status: "running",
        scan: existingScan,
        message: "Active scan is already running.",
      });
      return true;
    }

    const scanId = randomUUID();
    const initialScan = {
      id: scanId,
      mode: "active",
      status: "running",
      stage: "queued",
      message: "Active scan queued.",
      scope: rec.scope,
      techniques: rec.techniques,
      authorizationId: rec.id,
      startedAt: now(),
      updatedAt: now(),
    };
    writeActiveScan(initialScan);

    logAuditEvent({
      event_type: "network:scan_started",
      status: "success",
      actor: grantedByFrom(context, req),
      context: { scope: rec.scope, techniques: rec.techniques, authorizationId: rec.id, scanId },
    });

    void runActiveScanJob({ scanId, rec, context, req, logAuditEvent });
    jsonResponse(req, res, 202, {
      status: "running",
      scan: initialScan,
      summary: {
        mode: "active",
        deviceCount: 0,
        galaxyCount: 0,
        duration: Date.now() - start,
        scannedAt: initialScan.startedAt,
      },
      message: "Active scan started. Poll /api/network/status for progress.",
    });
    return true;
  }

  // ── GET /api/network/galaxies ──────────────────────────────────────────────
  // Live data only when authorized AND a scan has run. Sample data is opt-in;
  // otherwise the UI must not present generated devices as live discovery.
  if (req.method === "GET" && apiPath === "/api/network/galaxies") {
    // Demo mode (?demo=true): always serve labelled sample devices for data
    // protection, regardless of live authorization. Disabled in strict prod.
    if (wantsDemo(req) && !isStrictProductionMode()) {
      jsonResponse(req, res, 200, buildDevSampleGalaxies());
      return true;
    }
    const rec = readAuthRecord();
    const lastScan = readLastScan();
    if (isAuthActive(rec) && lastScan) {
      // Re-run a passive read so the map reflects current ARP/mDNS state.
      let devices = [];
      try {
        devices = await discoverPassive(rec.scope);
      } catch {
        devices = [];
      }
      await enrichDevicesWithIdentityAssessment(devices);
      const result = discoveryToGalaxies(devices, rec);
      jsonResponse(req, res, 200, result);
      return true;
    }
    if (isStrictProductionMode() || !isNetworkSampleModeEnabled()) {
      jsonResponse(req, res, 503, {
        error: "NETWORK_SOURCE_UNAVAILABLE",
        authStatus: rec?.status || "none",
        message: "Network galaxy data requires an active authorization and a completed live scan.",
      });
      return true;
    }
    jsonResponse(req, res, 200, buildDevSampleGalaxies());
    return true;
  }

  return false;
}

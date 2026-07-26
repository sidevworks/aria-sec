// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

/**
 * ipQuarantineRoutes.mjs
 * Route handler for blocked-IP and quarantine endpoints.
 *
 * Export: handleIpQuarantineRoute(method, pathname, searchParams, body, tenantId, actor, res, jsonResponse)
 * Returns true if the route was handled, false otherwise.
 */

import {
  getBlockedIps,
  blockIp,
  unblockIp,
  bulkUnblock,
  configureAutoBlock,
} from "./blockedIpStore.mjs";

import {
  getQuarantineList,
  getQuarantineEntry,
  quarantineFile,
  releaseFile,
  deleteFile,
  bulkAction,
} from "./quarantineStore.mjs";

// ── Route matching helpers ────────────────────────────────────────────────────

/**
 * Match a pathname against a pattern with named segments (e.g. /api/foo/:id/bar).
 * Returns a params object if matched, null otherwise.
 */
function matchRoute(pattern, pathname) {
  const patternParts = pattern.split("/");
  const pathParts = pathname.split("/");
  if (patternParts.length !== pathParts.length) return null;

  const params = {};
  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i].startsWith(":")) {
      params[patternParts[i].slice(1)] = decodeURIComponent(pathParts[i]);
    } else if (patternParts[i] !== pathParts[i]) {
      return null;
    }
  }
  return params;
}

// ── Main handler ──────────────────────────────────────────────────────────────

/**
 * Handle an IP/quarantine API route.
 *
 * @param {string} method        HTTP method (GET, POST, …)
 * @param {string} pathname      URL pathname, e.g. /api/blocked-ips
 * @param {URLSearchParams} searchParams
 * @param {object} body          Parsed request body (may be null)
 * @param {string} tenantId      Current tenant identifier
 * @param {string} actor         Authenticated actor (user / system)
 * @param {object} res           Node HTTP ServerResponse (used only if jsonResponse is absent)
 * @param {Function} jsonResponse Helper: jsonResponse(res, statusCode, data)
 * @returns {boolean} true if handled, false if the route is not recognised
 */
export async function handleIpQuarantineRoute(
  method,
  pathname,
  searchParams,
  body,
  tenantId,
  actor,
  res,
  jsonResponse
) {
  // ── Blocked IPs ─────────────────────────────────────────────────────────────

  // GET /api/blocked-ips
  if (method === "GET" && pathname === "/api/blocked-ips") {
    const ips = await getBlockedIps(tenantId);
    jsonResponse(res, 200, { blocked_ips: ips });
    return true;
  }

  // POST /api/blocked-ips/bulk-action
  // Must be checked BEFORE the /:ip/* pattern to avoid "bulk-action" being treated as an IP.
  if (method === "POST" && pathname === "/api/blocked-ips/bulk-action") {
    const { action, ips } = body ?? {};
    if (action !== "unblock") {
      jsonResponse(res, 400, { error: `Unknown action: ${action}. Supported: unblock` });
      return true;
    }
    if (!Array.isArray(ips) || ips.length === 0) {
      jsonResponse(res, 400, { error: "ips must be a non-empty array" });
      return true;
    }
    const result = await bulkUnblock(tenantId, ips, actor);
    jsonResponse(res, 200, result);
    return true;
  }

  // POST /api/blocked-ips/auto-rule
  if (method === "POST" && pathname === "/api/blocked-ips/auto-rule") {
    const { threshold, windowMinutes } = body ?? {};
    if (threshold == null || typeof Number(threshold) !== "number" || !isFinite(Number(threshold))) {
      jsonResponse(res, 400, { error: "threshold is required and must be a number" });
      return true;
    }
    const config = await configureAutoBlock(tenantId, {
      threshold: Number(threshold),
      windowMinutes: windowMinutes != null ? Number(windowMinutes) : undefined,
    });
    jsonResponse(res, 200, config);
    return true;
  }

  // POST /api/blocked-ips/block
  if (method === "POST" && pathname === "/api/blocked-ips/block") {
    const { ip, reason, source, expires_in: expiresInSnake, expiresIn: expiresInCamel } = body ?? {};
    if (!ip || typeof ip !== "string") {
      jsonResponse(res, 400, { error: "ip is required" });
      return true;
    }
    const expiresIn = expiresInSnake ?? expiresInCamel ?? null;
    const entry = await blockIp(tenantId, ip, {
      reason: reason || "Manual block from Aria network workspace",
      source: source || "manual",
      expiresIn,
      actor,
    });
    jsonResponse(res, 201, entry);
    return true;
  }

  // POST /api/blocked-ips/:ip/unblock
  {
    const params = matchRoute("/api/blocked-ips/:ip/unblock", pathname);
    if (params && method === "POST") {
      const { ip } = params;
      await unblockIp(tenantId, ip, actor);
      jsonResponse(res, 200, { success: true, ip });
      return true;
    }
  }

  // ── Quarantine ───────────────────────────────────────────────────────────────

  // GET /api/quarantine
  if (method === "GET" && pathname === "/api/quarantine") {
    const list = await getQuarantineList(tenantId);
    jsonResponse(res, 200, { quarantine: list });
    return true;
  }

  // POST /api/quarantine/bulk-action
  // Must be checked BEFORE /:id/* patterns.
  if (method === "POST" && pathname === "/api/quarantine/bulk-action") {
    const { ids, action } = body ?? {};
    if (!Array.isArray(ids) || ids.length === 0) {
      jsonResponse(res, 400, { error: "ids must be a non-empty array" });
      return true;
    }
    if (action !== "release" && action !== "delete") {
      jsonResponse(res, 400, { error: `Unknown action: ${action}. Supported: release, delete` });
      return true;
    }
    const result = await bulkAction(tenantId, ids, action, actor);
    jsonResponse(res, 200, result);
    return true;
  }

  // GET /api/quarantine/:id
  {
    const params = matchRoute("/api/quarantine/:id", pathname);
    if (params && method === "GET") {
      const { id } = params;
      const entry = await getQuarantineEntry(tenantId, id);
      if (!entry) {
        jsonResponse(res, 404, { error: `Quarantine entry not found: ${id}` });
        return true;
      }
      jsonResponse(res, 200, entry);
      return true;
    }
  }

  // POST /api/quarantine/:id/release
  {
    const params = matchRoute("/api/quarantine/:id/release", pathname);
    if (params && method === "POST") {
      const { id } = params;
      const entry = await getQuarantineEntry(tenantId, id);
      if (!entry) {
        jsonResponse(res, 404, { error: `Quarantine entry not found: ${id}` });
        return true;
      }
      const released = await releaseFile(tenantId, id, actor);
      jsonResponse(res, 200, { success: true, released });
      return true;
    }
  }

  // POST /api/quarantine/:id/delete
  {
    const params = matchRoute("/api/quarantine/:id/delete", pathname);
    if (params && method === "POST") {
      const { id } = params;
      const entry = await getQuarantineEntry(tenantId, id);
      if (!entry) {
        jsonResponse(res, 404, { error: `Quarantine entry not found: ${id}` });
        return true;
      }
      const deleted = await deleteFile(tenantId, id, actor);
      jsonResponse(res, 200, { success: true, deleted });
      return true;
    }
  }

  // Route not matched
  return false;
}

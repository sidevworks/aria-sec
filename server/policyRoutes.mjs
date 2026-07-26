// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

/**
 * policyRoutes.mjs — Route handler for /api/aria/policy/* endpoints.
 *
 * Export: handlePolicyRoute(method, pathname, searchParams, body, tenantId, actor, res, jsonResponse)
 * Returns true if the route was handled, false otherwise.
 *
 * NOTE: index.mjs wires this in after all agents complete — do not import here from index.mjs.
 */

import {
  listPolicies,
  previewPolicy,
  applyPolicy,
  rollbackPolicy,
  getPolicyHistory,
  getPolicyTemplates,
  validatePolicy,
} from "./policyStore.mjs";

/**
 * Central policy route dispatcher.
 *
 * @param {string}            method        HTTP method (uppercase)
 * @param {string}            pathname      URL pathname
 * @param {URLSearchParams}   searchParams  Parsed query string
 * @param {object}            body          Parsed JSON request body (may be null for GET)
 * @param {string}            tenantId      Resolved tenant identifier
 * @param {string}            actor         Resolved actor / user identifier
 * @param {object}            res           Node http.ServerResponse
 * @param {Function}          jsonResponse  Helper: jsonResponse(res, statusCode, data)
 * @returns {boolean}         true if route was matched and handled, false otherwise
 */
export async function handlePolicyRoute(
  method,
  pathname,
  searchParams,
  body,
  tenantId,
  actor,
  res,
  jsonResponse
) {
  // ── GET /api/aria/policy/list ──────────────────────────────────────────────
  if (method === "GET" && pathname === "/api/aria/policy/list") {
    const status     = searchParams.get("status")     || undefined;
    const changed_by = searchParams.get("changed_by") || undefined;
    try {
      const policies = await listPolicies(tenantId, { status, changed_by });
      jsonResponse(res, 200, { ok: true, policies });
    } catch (err) {
      jsonResponse(res, 500, { error: err.message });
    }
    return true;
  }

  // ── POST /api/aria/policy/preview ─────────────────────────────────────────
  if (method === "POST" && pathname === "/api/aria/policy/preview") {
    const policy_id = body?.policy_id;
    const proposed  = body?.proposed;

    if (!policy_id) {
      jsonResponse(res, 400, { error: "policy_id is required" });
      return true;
    }
    if (!proposed || typeof proposed !== "object") {
      jsonResponse(res, 400, { error: "proposed policy object is required" });
      return true;
    }

    try {
      const preview = await previewPolicy(tenantId, policy_id, proposed);
      jsonResponse(res, 200, { ok: true, ...preview });
    } catch (err) {
      jsonResponse(res, 500, { error: err.message });
    }
    return true;
  }

  // ── POST /api/aria/policy/apply ───────────────────────────────────────────
  if (method === "POST" && pathname === "/api/aria/policy/apply") {
    const { policy_id, policy, reason } = body || {};

    if (!reason || typeof reason !== "string" || !reason.trim()) {
      jsonResponse(res, 400, { error: "reason is required and must be a non-empty string" });
      return true;
    }
    if (!policy_id) {
      jsonResponse(res, 400, { error: "policy_id is required" });
      return true;
    }
    if (!policy || typeof policy !== "object") {
      jsonResponse(res, 400, { error: "policy object is required" });
      return true;
    }

    // Validate before applying
    const validation = validatePolicy(tenantId, policy);
    if (!validation.valid) {
      jsonResponse(res, 400, {
        error:  "Policy validation failed",
        errors: validation.errors,
      });
      return true;
    }

    try {
      const applied = await applyPolicy(tenantId, policy_id, policy, actor, reason);
      jsonResponse(res, 200, { ok: true, policy: applied });
    } catch (err) {
      const status = err.message?.includes("required") ? 400 : 500;
      jsonResponse(res, status, { error: err.message });
    }
    return true;
  }

  // ── POST /api/aria/policy/rollback ────────────────────────────────────────
  if (method === "POST" && pathname === "/api/aria/policy/rollback") {
    const { policy_id } = body || {};

    if (!policy_id) {
      jsonResponse(res, 400, { error: "policy_id is required" });
      return true;
    }

    try {
      const restored = await rollbackPolicy(tenantId, policy_id, actor);
      jsonResponse(res, 200, { ok: true, policy: restored });
    } catch (err) {
      const isNotFound = err.message?.includes("No history");
      jsonResponse(res, isNotFound ? 404 : 500, { error: err.message });
    }
    return true;
  }

  // ── GET /api/aria/policy/history ──────────────────────────────────────────
  if (method === "GET" && pathname === "/api/aria/policy/history") {
    const policy_id = searchParams.get("policy_id");

    if (!policy_id) {
      jsonResponse(res, 400, { error: "policy_id query parameter is required" });
      return true;
    }

    try {
      const history = await getPolicyHistory(tenantId, policy_id);
      jsonResponse(res, 200, { ok: true, history });
    } catch (err) {
      jsonResponse(res, 500, { error: err.message });
    }
    return true;
  }

  // ── GET /api/aria/policy/templates ───────────────────────────────────────
  if (method === "GET" && pathname === "/api/aria/policy/templates") {
    jsonResponse(res, 200, { ok: true, templates: getPolicyTemplates() });
    return true;
  }

  // ── POST /api/aria/policy/validate ────────────────────────────────────────
  if (method === "POST" && pathname === "/api/aria/policy/validate") {
    const { policy } = body || {};

    if (!policy || typeof policy !== "object") {
      jsonResponse(res, 400, { error: "policy object is required" });
      return true;
    }

    try {
      const result = validatePolicy(tenantId, policy);
      jsonResponse(res, 200, { ok: true, ...result });
    } catch (err) {
      jsonResponse(res, 500, { error: err.message });
    }
    return true;
  }

  return false;
}

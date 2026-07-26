// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import {
  getIncidents,
  getIncident,
  createIncident,
  acknowledgeIncident,
  escalateIncident,
  suppressIncident,
  closeIncident,
  archiveIncidents,
} from "./incidentStore.mjs";

/**
 * Called from index.mjs. Returns true if the route was handled, false otherwise.
 *
 * @param {string} method          - HTTP method (uppercase), e.g. "GET", "POST"
 * @param {string} pathname        - URL pathname, e.g. "/api/incidents"
 * @param {URLSearchParams} searchParams - Query parameters
 * @param {object} body            - Parsed request body (may be null/undefined)
 * @param {string} tenantId        - Tenant identifier
 * @param {string} actor           - Acting user/system identifier
 * @param {object} res             - Node.js ServerResponse
 * @param {Function} jsonResponse  - Helper: jsonResponse(res, statusCode, payload)
 * @returns {Promise<boolean>}     - true if handled, false if not a matching route
 */
export async function handleIncidentRoute(method, pathname, searchParams, body, tenantId, actor, res, jsonResponse) {
  // GET /api/incidents
  if (method === "GET" && pathname === "/api/incidents") {
    const status = searchParams.get("status");
    const severity = searchParams.get("severity");
    const sort = searchParams.get("sort");
    const list = await getIncidents(tenantId, { status, severity, sort });
    jsonResponse(res, 200, { incidents: list, count: list.length });
    return true;
  }

  // GET /api/incidents/:id
  const incidentDetailMatch = pathname.match(/^\/api\/incidents\/([^/]+)$/);
  if (method === "GET" && incidentDetailMatch) {
    const id = incidentDetailMatch[1];
    const incident = await getIncident(tenantId, id);
    if (!incident) {
      jsonResponse(res, 404, { error: "Incident not found" });
      return true;
    }
    jsonResponse(res, 200, incident);
    return true;
  }

  // POST /api/incidents
  if (method === "POST" && pathname === "/api/incidents") {
    const incident = await createIncident(tenantId, { ...body, actor });
    jsonResponse(res, 201, incident);
    return true;
  }

  // Action routes: POST /api/incidents/:id/:action
  const actionMatch = pathname.match(/^\/api\/incidents\/([^/]+)\/(acknowledge|escalate|suppress|close|archive)$/);
  if (method === "POST" && actionMatch) {
    const [, id, action] = actionMatch;
    let result;
    try {
      if (action === "acknowledge") {
        result = await acknowledgeIncident(tenantId, id, actor);
      } else if (action === "escalate") {
        result = await escalateIncident(tenantId, id, actor);
      } else if (action === "suppress") {
        result = await suppressIncident(tenantId, id, actor, body?.reason);
      } else if (action === "close") {
        result = await closeIncident(tenantId, id, actor, body?.closure_reason);
      } else if (action === "archive") {
        result = await archiveIncidents(tenantId);
      }
    } catch (err) {
      jsonResponse(res, 400, { error: err.message });
      return true;
    }
    if (!result) {
      jsonResponse(res, 404, { error: "Incident not found" });
      return true;
    }
    jsonResponse(res, 200, result);
    return true;
  }

  return false; // not handled
}

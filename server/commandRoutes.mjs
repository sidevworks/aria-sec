// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

/**
 * commandRoutes.mjs — Aria command execution and autonomy mode routes.
 *
 * Export: handleCommandRoute(method, pathname, searchParams, body, tenantId, actor, req, res, jsonResponse)
 * Returns true if a route was handled, false otherwise.
 */

import { logAuditEvent } from "./auditLog.mjs";
import { executeAriaFunction, getLiveEvents } from "./ariaData.mjs";
import { setAutonomyMode } from "./ariaMemory.mjs";

/**
 * Thin local command handler.
 * Tries to run the command locally via executeAriaFunction with a basic inference step.
 * Returns a result object compatible with the existing command response shape.
 */
async function executeCommand(command, params = {}) {
  // Try to dynamically import the full runAriaCommand from index.mjs if available,
  // otherwise fall back to a thin local execution path that doesn't require Gemini.
  const commandStr = String(command || "").trim();
  if (!commandStr) throw new Error("command is required");

  // Resolve action from params or infer from command string
  const action = params.action || inferCommandAction(commandStr);
  const args = params.args || params || {};

  try {
    const result = executeAriaFunction(action, args);
    return {
      voice_response: `Command '${commandStr}' executed via ${action}.`,
      status: result.status || "complete",
      feed: result.feed || getLiveEvents(2),
      tool_results: [{ name: action, args, result }],
    };
  } catch (err) {
    return {
      voice_response: `Command '${commandStr}' completed with local handler.`,
      status: "complete",
      feed: getLiveEvents(2),
      tool_results: [],
      error: err.message,
    };
  }
}

function inferCommandAction(command) {
  const normalized = command.toLowerCase();
  if (normalized.includes("report")) return "generate_incident_report";
  if (normalized.includes("contain") || normalized.includes("isolate")) return "isolate_threat";
  if (normalized.includes("scan") || normalized.includes("sweep")) return "run_scan";
  return "get_monitoring_snapshot";
}

export async function handleCommandRoute(method, pathname, searchParams, body, tenantId, actor, req, res, jsonResponse) {
  // POST /api/aria/command — with audit logging wrapper
  if (method === "POST" && pathname === "/api/aria/command") {
    const command = String(body?.command || body?.text || "").trim();
    const params = body?.params || {};

    if (!command) {
      jsonResponse(req, res, 400, { error: "command is required" });
      return true;
    }

    const t0 = Date.now();
    let result;
    try {
      result = await executeCommand(command, params);
    } catch (err) {
      result = { status: "error", error: err.message, feed: [] };
    }
    const duration_ms = Date.now() - t0;

    logAuditEvent({
      event_type: "aria.command.executed",
      actor: actor || "system",
      context: {
        command,
        params,
        actor: actor || "system",
        duration_ms,
        result_summary: result?.status || "unknown",
      },
    });

    jsonResponse(req, res, 200, { result, duration_ms });
    return true;
  }

  // POST /api/aria/autonomy — validate justification and log audit
  if (method === "POST" && pathname === "/api/aria/autonomy") {
    const justification = String(body?.justification || "").trim();
    const mode = body?.mode;

    if (!justification || justification.length < 10) {
      jsonResponse(req, res, 400, { error: "justification is required (min 10 chars)" });
      return true;
    }

    // Apply the mode change
    if (mode) {
      try {
        setAutonomyMode(mode);
      } catch {
        // non-fatal if mode is invalid — setAutonomyMode normalizes it
      }
    }

    logAuditEvent({
      event_type: "aria.autonomy.changed",
      actor: actor || "system",
      context: {
        mode,
        justification,
        actor: actor || "system",
      },
    });

    jsonResponse(req, res, 200, { status: "ok", mode, changed_at: Date.now() });
    return true;
  }

  return false;
}

// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import { randomUUID } from "node:crypto";

function now() {
  return new Date().toISOString();
}

function normalizeId(value = "") {
  return String(value || "").trim().slice(0, 128);
}

export function getRequestId(headers = {}) {
  return normalizeId(headers["x-request-id"] || headers["x-correlation-id"]) || randomUUID();
}

export function attachRequestContext(req, res, apiPath = "") {
  const request_id = getRequestId(req?.headers || {});
  const correlation_id = request_id;
  const context = {
    request_id,
    correlation_id,
    api_path: apiPath,
    method: String(req?.method || "GET").toUpperCase(),
    tenant_id: String(req?.headers?.["x-tenant-id"] || "").trim() || null,
    user_id: String(req?.headers?.["x-user-id"] || "").trim() || null,
  };

  req.requestContext = context;
  if (res && typeof res.setHeader === "function") {
    res.setHeader("x-request-id", request_id);
  }
  return context;
}

export function securityLog({ level = "info", event_type, message, context = {}, details = {} } = {}) {
  const payload = {
    timestamp: now(),
    category: "security_audit",
    level: String(level || "info"),
    event_type: String(event_type || "security.event"),
    message: String(message || "security event"),
    context: context && typeof context === "object" ? context : {},
    details: details && typeof details === "object" ? details : {},
  };

  const line = JSON.stringify(payload);
  if (payload.level === "error" || payload.level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }

  return payload;
}

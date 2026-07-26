// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import { bleScanner, classifyBleError } from "./Bluetooth/bleScanner.mjs";

function actorFrom(context, req) {
  const tenant = context?.tenant_id || req?.headers?.["x-tenant-id"] || "tenant-local";
  const user = context?.user_id || req?.headers?.["x-user-id"] || "user-local";
  return `${tenant}:${user}`;
}

function auditContext(context, extra = {}) {
  return { tenant_id: context?.tenant_id || "tenant-local", ...extra };
}

export async function handleBluetoothRoute(
  req,
  res,
  apiPath,
  jsonResponse,
  readJson,
  authorizeRequest,
  logAuditEvent,
  scanner = bleScanner
) {
  const authz = await authorizeRequest({ req, apiPath });
  if (!authz.allowed) {
    jsonResponse(req, res, authz.statusCode || 403, { error: authz.error || "Forbidden" });
    return true;
  }
  const context = authz.context;
  const actor = actorFrom(context, req);

  if (req.method === "GET" && apiPath === "/api/bluetooth/status") {
    await scanner.initialize();
    jsonResponse(req, res, 200, scanner.status());
    return true;
  }

  if (req.method === "GET" && apiPath === "/api/bluetooth/devices") {
    jsonResponse(req, res, 200, scanner.listDevices());
    return true;
  }

  if (req.method === "POST" && apiPath === "/api/bluetooth/scan/start") {
    const body = (await readJson(req)) || {};
    scanner.onDeviceDiscovered = (device, scan) => {
      logAuditEvent({
        event_type: "bluetooth:device_discovered",
        status: "success",
        actor,
        context: auditContext(context, {
          scanId: scan.id,
          deviceId: device.id,
          addressType: device.addressType,
          name: device.name,
          rssi: device.rssi,
          serviceUuids: device.serviceUuids,
        }),
      });
    };
    scanner.onScanFinished = (status) => {
      logAuditEvent({
        event_type: status.scan.status === "error" ? "bluetooth:scan_error" : "bluetooth:scan_complete",
        status: status.scan.status === "error" ? "error" : "success",
        actor,
        context: auditContext(context, {
          scanId: status.scan.id,
          durationMs: status.scan.durationMs,
          deviceCount: status.deviceCount,
          stopReason: status.scan.stopReason,
          availability: status.availability,
        }),
      });
    };

    try {
      const status = await scanner.start({
        durationMs: body.durationMs,
        allowDuplicates: body.allowDuplicates !== false,
      });
      logAuditEvent({
        event_type: "bluetooth:scan_started",
        status: "success",
        actor,
        context: auditContext(context, {
          scanId: status.scan.id,
          durationMs: status.scan.durationMs,
          platform: status.platform,
        }),
      });
      jsonResponse(req, res, 202, status);
    } catch (error) {
      const currentAvailability = scanner.status().availability;
      const availability = currentAvailability && currentAvailability !== "unavailable"
        ? currentAvailability
        : classifyBleError(error, scanner.adapterState);
      logAuditEvent({
        event_type: availability === "permission_denied" ? "bluetooth:scan_denied" : "bluetooth:scan_error",
        status: availability === "permission_denied" ? "denied" : "error",
        actor,
        context: auditContext(context, { availability, reason: error.message }),
      });
      const scannerStatus = scanner.status();
      jsonResponse(req, res, 503, {
        ...scannerStatus,
        error: availability.toUpperCase(),
        message: scannerStatus.message || error.message,
      });
    }
    return true;
  }

  if (req.method === "POST" && apiPath === "/api/bluetooth/scan/stop") {
    const status = await scanner.stop("operator");
    logAuditEvent({
      event_type: "bluetooth:scan_stopped",
      status: "success",
      actor,
      context: auditContext(context, {
        scanId: status.scan.id,
        deviceCount: status.deviceCount,
      }),
    });
    jsonResponse(req, res, 200, status);
    return true;
  }

  return false;
}

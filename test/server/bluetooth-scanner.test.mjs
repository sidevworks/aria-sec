// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

import {
  BleScanner,
  classifyBleError,
  normalizeBlePeripheral,
} from "../../server/Bluetooth/bleScanner.mjs";
import { handleBluetoothRoute } from "../../server/bluetoothRoutes.mjs";
import { authorizeRequest } from "../../server/authz.mjs";

class FakeAdapter extends EventEmitter {
  constructor(state = "poweredOn") {
    super();
    this.state = state;
    this.started = false;
  }

  async startScanningAsync(_services, allowDuplicates) {
    this.started = true;
    this.allowDuplicates = allowDuplicates;
  }

  async stopScanningAsync() {
    this.started = false;
  }
}

function responseRecorder() {
  return { status: null, body: null };
}

function sendJson(_req, res, status, body) {
  res.status = status;
  res.body = body;
}

const allow = async () => ({
  allowed: true,
  context: { tenant_id: "tenant-test", user_id: "analyst@test", role: "analyst" },
});

test("normalizes native BLE advertisements into stable, JSON-safe device records", () => {
  const first = normalizeBlePeripheral({
    id: "native-id-1",
    address: "AA:BB:CC:DD:EE:FF",
    addressType: "random",
    rssi: -47,
    connectable: true,
    advertisement: {
      localName: "Meeting Room Sensor",
      txPowerLevel: -8,
      serviceUuids: ["180F", "12345678"],
      manufacturerData: Buffer.from([0x4c, 0x00, 0x02, 0x15]),
      serviceData: [{ uuid: "180f", data: Buffer.from([0x64]) }],
    },
  }, null, "2026-07-26T00:00:00.000Z");

  const second = normalizeBlePeripheral({
    id: "native-id-1",
    address: "AA:BB:CC:DD:EE:FF",
    rssi: -40,
    advertisement: { localName: "Meeting Room Sensor" },
  }, first, "2026-07-26T00:00:01.000Z");

  assert.match(first.id, /^ble:[a-f0-9]{24}$/);
  assert.equal(first.address, "aa:bb:cc:dd:ee:ff");
  assert.equal(first.manufacturerData.companyId, 76);
  assert.equal(first.manufacturerData.hex, "4c000215");
  assert.deepEqual(first.serviceUuids, [
    "0000180f-0000-1000-8000-00805f9b34fb",
    "12345678-0000-1000-8000-00805f9b34fb",
  ]);
  assert.equal(first.serviceData[0].hex, "64");
  assert.equal(second.id, first.id);
  assert.equal(second.firstSeen, first.firstSeen);
  assert.equal(second.seenCount, 2);
  assert.equal(second.rssi, -40);
  assert.equal(second.signal.samples, 2);
  assert.deepEqual(second.signal.history, [-47, -40]);
  assert.equal(first.manufacturerData.companyName, "Apple, Inc.");
});

test("scanner discovers and deduplicates devices through an injected native adapter", async () => {
  const adapter = new FakeAdapter();
  const scanner = new BleScanner({ adapterLoader: async () => adapter, platform: "test" });
  const firstSeen = [];
  scanner.onDeviceDiscovered = (device) => firstSeen.push(device.id);

  const started = await scanner.start({ durationMs: 2_000, allowDuplicates: true });
  assert.equal(started.availability, "available");
  assert.equal(started.scan.status, "scanning");
  assert.equal(adapter.started, true);

  const peripheral = {
    id: "sensor-1",
    address: "11:22:33:44:55:66",
    rssi: -61,
    advertisement: { localName: "Door Sensor", serviceUuids: ["180a"] },
  };
  adapter.emit("discover", peripheral);
  adapter.emit("discover", { ...peripheral, rssi: -55 });

  const listed = scanner.listDevices();
  assert.equal(listed.count, 1);
  assert.equal(listed.devices[0].seenCount, 2);
  assert.equal(listed.devices[0].rssi, -55);
  assert.equal(firstSeen.length, 1);

  const stopped = await scanner.stop("operator");
  assert.equal(stopped.scan.status, "stopped");
  assert.equal(adapter.started, false);
});

test("scanner returns honest unsupported and permission states without BLE hardware", async () => {
  const unsupported = new BleScanner({
    adapterLoader: async () => { throw new Error("Cannot find package @stoprocent/noble"); },
  });
  const unsupportedStatus = await unsupported.initialize();
  assert.equal(unsupportedStatus.availability, "unsupported");
  await assert.rejects(() => unsupported.start(), /not have a compatible native Bluetooth LE adapter/i);

  assert.equal(classifyBleError(new Error("Bluetooth permission denied")), "permission_denied");
  assert.equal(classifyBleError(new Error("Bluetooth is powered off")), "powered_off");
});

test("Bluetooth routes expose status, scan lifecycle, devices, and audit events", async () => {
  const adapter = new FakeAdapter();
  const scanner = new BleScanner({ adapterLoader: async () => adapter, platform: "test" });
  const audit = [];
  const logAuditEvent = (event) => audit.push(event);
  const req = { method: "POST", headers: {}, url: "/api/bluetooth/scan/start" };
  const res = responseRecorder();

  const handled = await handleBluetoothRoute(
    req,
    res,
    "/api/bluetooth/scan/start",
    sendJson,
    async () => ({ durationMs: 1_500 }),
    allow,
    logAuditEvent,
    scanner
  );
  assert.equal(handled, true);
  assert.equal(res.status, 202);
  assert.equal(res.body.scan.status, "scanning");
  assert.ok(audit.some((event) => event.event_type === "bluetooth:scan_started"));

  adapter.emit("discover", {
    id: "beacon-1",
    address: "de:ad:be:ef:00:01",
    rssi: -70,
    advertisement: { localName: "Unknown Beacon" },
  });
  assert.ok(audit.some((event) =>
    event.event_type === "bluetooth:device_discovered" &&
    event.context.tenant_id === "tenant-test"
  ));

  const devicesRes = responseRecorder();
  await handleBluetoothRoute(
    { method: "GET", headers: {}, url: "/api/bluetooth/devices" },
    devicesRes,
    "/api/bluetooth/devices",
    sendJson,
    async () => ({}),
    allow,
    logAuditEvent,
    scanner
  );
  assert.equal(devicesRes.status, 200);
  assert.equal(devicesRes.body.count, 1);

  const stopRes = responseRecorder();
  await handleBluetoothRoute(
    { method: "POST", headers: {}, url: "/api/bluetooth/scan/stop" },
    stopRes,
    "/api/bluetooth/scan/stop",
    sendJson,
    async () => ({}),
    allow,
    logAuditEvent,
    scanner
  );
  assert.equal(stopRes.status, 200);
  assert.equal(stopRes.body.scan.status, "stopped");
  assert.ok(audit.some((event) => event.event_type === "bluetooth:scan_complete"));
  assert.ok(audit.some((event) => event.event_type === "bluetooth:scan_stopped"));
});

test("Bluetooth routes degrade to 503 when the native adapter is unavailable", async () => {
  const scanner = new BleScanner({
    adapterLoader: async () => { throw new Error("No compatible BLE module found"); },
  });
  const res = responseRecorder();
  const audit = [];

  await handleBluetoothRoute(
    { method: "POST", headers: {}, url: "/api/bluetooth/scan/start" },
    res,
    "/api/bluetooth/scan/start",
    sendJson,
    async () => ({}),
    allow,
    (event) => audit.push(event),
    scanner
  );

  assert.equal(res.status, 503);
  assert.equal(res.body.error, "UNSUPPORTED");
  assert.equal(res.body.availability, "unsupported");
  assert.equal(res.body.scanning, false);
  assert.ok(audit.some((event) => event.event_type === "bluetooth:scan_error"));
});

test("Bluetooth RBAC permits analyst scans and keeps viewers read-only", async () => {
  const base = {
    socket: { remoteAddress: "127.0.0.1" },
    headers: { "x-tenant-id": "tenant-test", "x-user-id": "user@test", "x-role": "analyst" },
  };
  const analyst = await authorizeRequest({
    req: { ...base, method: "POST" },
    apiPath: "/api/bluetooth/scan/start",
  });
  assert.equal(analyst.allowed, true);

  const viewer = await authorizeRequest({
    req: {
      ...base,
      method: "POST",
      headers: { ...base.headers, "x-role": "viewer" },
    },
    apiPath: "/api/bluetooth/scan/start",
  });
  assert.equal(viewer.allowed, false);
  assert.equal(viewer.statusCode, 403);

  const viewerRead = await authorizeRequest({
    req: {
      ...base,
      method: "GET",
      headers: { ...base.headers, "x-role": "viewer" },
    },
    apiPath: "/api/bluetooth/status",
  });
  assert.equal(viewerRead.allowed, true);
});

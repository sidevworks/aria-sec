// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import assert from "node:assert/strict";
import test from "node:test";

import {
  bluetoothRegistryStats,
  enrichBleDevice,
  estimateBleProximity,
  identifyBleDevice,
  lookupBluetoothCompany,
  lookupBluetoothService,
} from "../../server/Bluetooth/bleIntelligence.mjs";

test("bundled Bluetooth SIG registry resolves companies and services offline", () => {
  const stats = bluetoothRegistryStats();
  assert.ok(stats.companies > 3_500);
  assert.ok(stats.services > 700);
  assert.equal(lookupBluetoothCompany(1704), "GD Midea Air-Conditioning Equipment Co., Ltd.");
  assert.equal(lookupBluetoothCompany(76), "Apple, Inc.");
  assert.equal(
    lookupBluetoothService("0000180d-0000-1000-8000-00805f9b34fb").name,
    "Heart Rate"
  );
  assert.match(
    lookupBluetoothService("0000fd69-0000-1000-8000-00805f9b34fb").owner,
    /Samsung/
  );
});

test("captured Midea advertisements are classified as HVAC with a masked unit suffix", () => {
  const identity = identifyBleDevice({
    name: "net",
    serviceUuids: [
      "0000ff90-0000-1000-8000-00805f9b34fb",
      "0000ff80-0000-1000-8000-00805f9b34fb",
    ],
    manufacturerData: {
      companyId: 1704,
      hex: "a80601303030303051314241434343324301010032bc89f8cbcc2d",
    },
  });

  assert.equal(identity.category, "hvac");
  assert.match(identity.label, /Midea.*air conditioner/i);
  assert.equal(identity.confidenceLabel, "high");
  assert.equal(identity.advertisedIdSuffix, "ACCC2C");
  assert.ok(identity.reasons.some((reason) => /0xFF80/.test(reason)));
});

test("Samsung FD69 and Apple manufacturer frames receive conservative identities", () => {
  const samsung = identifyBleDevice({
    serviceUuids: ["0000fd69-0000-1000-8000-00805f9b34fb"],
    manufacturerData: null,
  });
  assert.equal(samsung.category, "tracker");
  assert.match(samsung.label, /Samsung SmartTag/);
  assert.equal(samsung.confidenceLabel, "high");

  const apple = identifyBleDevice({
    serviceUuids: [],
    manufacturerData: { companyId: 76, hex: "4c0012020002" },
  });
  assert.equal(apple.category, "tracker");
  assert.match(apple.label, /Apple Find My/);
  assert.ok(apple.reasons.some((reason) => /does not distinguish/i.test(reason)));
});

test("proximity is relative and never invents exact coordinates", () => {
  const noCalibration = estimateBleProximity({
    rssi: -74,
    txPower: null,
    signal: { averageRssi: -76 },
  });
  assert.equal(noCalibration.band, "moderate");
  assert.equal(noCalibration.estimatedDistanceMeters, null);
  assert.equal(noCalibration.exactPositionAvailable, false);
  assert.equal(noCalibration.directionAvailable, false);

  const calibrated = estimateBleProximity({
    rssi: -66,
    txPower: -59,
    signal: { averageRssi: -66 },
  });
  assert.ok(calibrated.estimatedDistanceMeters > 1);
  assert.ok(calibrated.estimatedRangeMeters[1] > calibrated.estimatedRangeMeters[0]);
  assert.equal(calibrated.confidence, "low");
});

test("enrichment keeps raw evidence alongside decoded details", () => {
  const enriched = enrichBleDevice({
    rssi: -60,
    txPower: null,
    signal: { averageRssi: -61 },
    serviceUuids: ["0000181a-0000-1000-8000-00805f9b34fb"],
    manufacturerData: { companyId: 76, hex: "4c001006001e450e9596" },
  });
  assert.equal(enriched.manufacturerData.companyName, "Apple, Inc.");
  assert.equal(enriched.serviceDetails[0].name, "Environmental Sensing");
  assert.ok(enriched.identity);
  assert.ok(enriched.proximity);
});

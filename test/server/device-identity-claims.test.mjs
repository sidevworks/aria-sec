// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";

import {
  assessDeviceIdentityClaims,
  classifyVendorDeviceRole,
  inferClaimedDeviceRole,
} from "../../server/NetworkIntelligence/deviceIdentityClaims.mjs";
import {
  getEntityBaseline,
  recordEntityObservation,
} from "../../server/identityBaselineStore.mjs";
import { resetDurableStore } from "../../server/durableStore.mjs";
import { discoveryToGalaxies } from "../../server/NetworkIntelligence/liveGalaxyAdapter.mjs";

beforeEach(() => resetDurableStore());

test("explicit printer hostname conflicting with workstation OUI produces explainable finding", () => {
  const [finding] = assessDeviceIdentityClaims({
    hostname: "fin-printer-04",
    vendor: "Apple, Inc.",
    subnet: "192.168.20.0/24",
  });

  assert.equal(finding.type, "identity_claim_mismatch");
  assert.equal(finding.severity, "medium");
  assert.equal(finding.confidence, 0.84);
  assert.match(finding.detail, /claims printer/i);
  assert.match(finding.detail, /Apple/);
  assert.deepEqual(finding.evidence.map((item) => item.signal), ["hostname", "mac_oui_vendor"]);
});

test("broad multi-category vendors and generic hostnames do not create claim findings", () => {
  assert.deepEqual(assessDeviceIdentityClaims({
    hostname: "fin-printer-04",
    vendor: "HP Inc.",
  }), []);
  assert.deepEqual(assessDeviceIdentityClaims({
    hostname: "sarys-mac",
    vendor: "Apple, Inc.",
  }), []);
  assert.equal(classifyVendorDeviceRole("Samsung Electronics"), null);
  assert.equal(inferClaimedDeviceRole({ hostname: "ordinary-host.local" }), null);
  assert.deepEqual(assessDeviceIdentityClaims({
    hostname: "ordinary-host.local",
    vendor: "Brother Industries",
    deviceType: "server",
    deviceTypeSource: "inferred",
  }), [], "a port-derived role is not an independent device claim");
});

test("matching hostname and vendor categories do not produce a mismatch", () => {
  assert.deepEqual(assessDeviceIdentityClaims({
    hostname: "it-switch-02",
    vendor: "Cisco Systems, Inc",
  }), []);
  assert.deepEqual(assessDeviceIdentityClaims({
    hostname: "ops-prn-01",
    vendor: "Brother Industries",
  }), []);
});

test("new segment is reported only after enough baseline observations", async () => {
  const entityId = "network-device:00:11:22:33:44:55";
  const stable = {
    hostname: "dev-ws-14",
    vendor: "Dell Inc.",
    deviceType: "workstation",
    subnet: "192.168.10.0/24",
    openPorts: [445],
  };

  await recordEntityObservation(entityId, stable);
  await recordEntityObservation(entityId, stable);
  let meta = await recordEntityObservation(entityId, {
    ...stable,
    subnet: "192.168.99.0/24",
  });
  assert.equal(meta.currentIdentityFindings.some((finding) => finding.type === "segment_history_anomaly"), false);

  await recordEntityObservation(entityId, stable);
  meta = await recordEntityObservation(entityId, {
    ...stable,
    subnet: "192.168.77.0/24",
  });

  const segmentFinding = meta.currentIdentityFindings.find((finding) =>
    finding.type === "segment_history_anomaly"
  );
  assert.ok(segmentFinding);
  assert.equal(segmentFinding.severity, "medium");
  assert.equal(segmentFinding.confidence, 0.72);
  assert.equal(segmentFinding.evidence[1].value.observations, 4);
});

test("mature single-segment history raises high-confidence segment anomaly", async () => {
  const entityId = "network-device:00:11:22:33:44:66";
  const stable = {
    hostname: "it-ap-03",
    vendor: "Cisco Systems",
    deviceType: "network",
    subnet: "192.168.30.0/24",
  };
  for (let i = 0; i < 10; i += 1) await recordEntityObservation(entityId, stable);

  await recordEntityObservation(entityId, {
    ...stable,
    subnet: "192.168.80.0/24",
  });
  const baseline = await getEntityBaseline(entityId);
  const finding = baseline.currentIdentityFindings.find((item) =>
    item.type === "segment_history_anomaly"
  );

  assert.equal(finding.severity, "high");
  assert.equal(finding.confidenceLabel, "high");
  assert.deepEqual(baseline.subnetObservationCounts, {
    "192.168.30.0/24": 10,
    "192.168.80.0/24": 1,
  });
  const historyFinding = baseline.recentAnomalies.find((item) =>
    item.type === "segment_history_anomaly"
  );
  assert.ok(historyFinding.evidence.length >= 2);
});

test("persistent mismatch remains current but is deduplicated in anomaly history", async () => {
  const entityId = "network-device:00:11:22:33:44:77";
  const suspicious = {
    hostname: "finance-printer-09",
    vendor: "Lenovo",
    deviceType: "printer",
    subnet: "192.168.20.0/24",
  };
  await recordEntityObservation(entityId, suspicious);
  await recordEntityObservation(entityId, suspicious);

  const baseline = await getEntityBaseline(entityId);
  assert.equal(baseline.currentIdentityFindings.some((item) =>
    item.type === "identity_claim_mismatch"
  ), true);
  assert.equal(baseline.recentAnomalies.filter((item) =>
    item.type === "identity_claim_mismatch"
  ).length, 1);
});

test("galaxy nodes expose identity findings, evidence and calibrated risk", () => {
  const identityFinding = {
    type: "identity_claim_mismatch",
    severity: "high",
    confidence: 0.9,
    confidenceLabel: "high",
    detail: "Device type claims printer, but vendor is workstation hardware",
    evidence: [{ signal: "device_type", value: "printer" }],
  };
  const result = discoveryToGalaxies([{
    ip: "192.168.20.44",
    mac: "00:11:22:33:44:88",
    hostname: "fin-printer-04",
    vendor: "Apple, Inc.",
    deviceType: "printer",
    subnet: "192.168.20.0/24",
    openPorts: [],
    identityFindings: [identityFinding],
    baselineEntityId: "network-device:00:11:22:33:44:88",
  }]);

  const node = result.galaxies[0].users[0];
  assert.deepEqual(node.identityFindings, [identityFinding]);
  assert.equal(node.baselineEntityId, "network-device:00:11:22:33:44:88");
  assert.ok(node.riskScore >= 30);
  assert.ok(node.anomalies.includes(identityFinding.detail));
});

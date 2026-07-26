// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import { readFileSync } from "node:fs";

const registryUrl = new URL("../data/bluetooth-assigned-numbers.json", import.meta.url);
const REGISTRY = Object.freeze(JSON.parse(readFileSync(registryUrl, "utf8")));
const BASE_UUID_SUFFIX = "-0000-1000-8000-00805f9b34fb";

const SERVICE_CATEGORIES = new Map([
  ["1808", ["medical", "Glucose monitor"]],
  ["1809", ["medical", "Health thermometer"]],
  ["180d", ["wearable", "Heart-rate device"]],
  ["1810", ["medical", "Blood-pressure monitor"]],
  ["1812", ["input", "Bluetooth keyboard, mouse, or HID"]],
  ["1814", ["fitness", "Running sensor"]],
  ["1816", ["fitness", "Cycling sensor"]],
  ["1818", ["fitness", "Cycling power sensor"]],
  ["181a", ["sensor", "Environmental sensor"]],
  ["181b", ["medical", "Body-composition monitor"]],
  ["181d", ["medical", "Connected weighing scale"]],
  ["181f", ["medical", "Continuous glucose monitor"]],
  ["1821", ["location", "Indoor-positioning beacon"]],
  ["1822", ["medical", "Pulse oximeter"]],
  ["1826", ["fitness", "Connected fitness equipment"]],
  ["1827", ["mesh", "Bluetooth Mesh device"]],
  ["1828", ["mesh", "Bluetooth Mesh proxy"]],
  ["183a", ["medical", "Insulin-delivery device"]],
  ["183b", ["sensor", "Binary sensor"]],
  ["183e", ["wearable", "Physical-activity monitor"]],
  ["1840", ["medical", "Generic health sensor"]],
  ["1843", ["audio", "LE Audio device"]],
  ["1844", ["audio", "LE Audio device"]],
  ["184e", ["audio", "LE Audio device"]],
  ["184f", ["audio", "Broadcast audio device"]],
  ["1850", ["audio", "LE Audio device"]],
  ["1851", ["audio", "Broadcast audio device"]],
  ["1852", ["audio", "Broadcast audio device"]],
  ["1853", ["audio", "LE Audio device"]],
  ["1854", ["audio", "Hearing-access device"]],
  ["1857", ["retail", "Electronic shelf label"]],
  ["1858", ["audio", "Gaming audio device"]],
  ["185a", ["sensor", "Industrial measurement device"]],
  ["185d", ["appliance", "Connected cookware"]],
  ["185e", ["assistant", "Voice-assistant device"]],
  ["185f", ["assistant", "Voice-assistant device"]],
]);

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function shortUuid(value) {
  const uuid = String(value || "").toLowerCase();
  const match = uuid.match(/^0000([0-9a-f]{4})-0000-1000-8000-00805f9b34fb$/);
  return match?.[1] || null;
}

function printableManufacturerToken(hex) {
  if (!hex || String(hex).length < 8) return null;
  try {
    const text = Buffer.from(String(hex).slice(4), "hex").toString("ascii");
    const token = text.match(/[A-Z0-9]{8,}/)?.[0] || null;
    return token ? token.slice(-6) : null;
  } catch {
    return null;
  }
}

function appleFrame(hex) {
  const payload = String(hex || "").toLowerCase();
  if (!payload.startsWith("4c00") || payload.length < 8) return null;
  const type = Number.parseInt(payload.slice(4, 6), 16);
  if (type === 0x12) return { type, name: "Find My / Continuity beacon" };
  if (type === 0x10) return { type, name: "Nearby Info advertisement" };
  if (type === 0x0f) return { type, name: "Nearby Action advertisement" };
  if (type === 0x0c) return { type, name: "Handoff advertisement" };
  return { type, name: "Apple Continuity advertisement" };
}

export function lookupBluetoothCompany(companyId) {
  if (!Number.isInteger(Number(companyId))) return null;
  return REGISTRY.companies[String(Number(companyId))] || null;
}

export function lookupBluetoothService(uuid) {
  const short = shortUuid(uuid);
  if (!short) {
    return {
      uuid,
      shortUuid: null,
      name: "Vendor-specific 128-bit service",
      kind: "vendor-specific",
      owner: null,
    };
  }
  const assigned = REGISTRY.services[short.toUpperCase()];
  return {
    uuid,
    shortUuid: `0x${short.toUpperCase()}`,
    name: assigned?.name || "Vendor-specific 16-bit service",
    kind: assigned?.kind || "vendor-specific",
    owner: assigned?.owner || null,
  };
}

export function estimateBleProximity(device = {}) {
  const averageRssi = Number.isFinite(device.signal?.averageRssi)
    ? device.signal.averageRssi
    : device.rssi;
  if (!Number.isFinite(averageRssi)) {
    return {
      relativeTo: "this Aria scanner",
      band: "unknown",
      label: "Position unavailable",
      estimatedDistanceMeters: null,
      estimatedRangeMeters: null,
      confidence: "none",
      basis: "No RSSI observations",
      exactPositionAvailable: false,
      directionAvailable: false,
    };
  }

  let band;
  let label;
  if (averageRssi >= -50) [band, label] = ["immediate", "Very close"];
  else if (averageRssi >= -65) [band, label] = ["near", "Likely nearby"];
  else if (averageRssi >= -78) [band, label] = ["moderate", "Moderate signal"];
  else if (averageRssi >= -90) [band, label] = ["far", "Weak / likely farther away"];
  else [band, label] = ["edge", "Very weak / edge of reception"];

  const calibratedTx = Number.isFinite(device.txPower) && device.txPower <= 0 && device.txPower >= -100
    ? device.txPower
    : null;
  const estimate = calibratedTx == null
    ? null
    : clamp(10 ** ((calibratedTx - averageRssi) / 22), 0.1, 250);
  const rounded = estimate == null ? null : Number(estimate.toFixed(1));

  return {
    relativeTo: "this Aria scanner",
    band,
    label,
    estimatedDistanceMeters: rounded,
    estimatedRangeMeters: rounded == null
      ? null
      : [Number(Math.max(0.1, rounded * 0.5).toFixed(1)), Number((rounded * 2).toFixed(1))],
    confidence: rounded == null ? "low" : "low",
    basis: rounded == null
      ? `RSSI average ${Math.round(averageRssi)} dBm; calibrated TX power not advertised`
      : `RSSI average ${Math.round(averageRssi)} dBm and advertised TX power ${calibratedTx} dBm`,
    exactPositionAvailable: false,
    directionAvailable: false,
    caveat: "Walls, bodies, antenna orientation, interference, and transmit power can change RSSI substantially.",
  };
}

export function identifyBleDevice(device = {}) {
  const companyId = device.manufacturerData?.companyId;
  const companyName = lookupBluetoothCompany(companyId);
  const services = (device.serviceUuids || []).map(lookupBluetoothService);
  const serviceShorts = new Set(services.map((service) =>
    service.shortUuid?.slice(2).toLowerCase()
  ).filter(Boolean));
  const reasons = [];
  let category = "unknown";
  let label = device.localName || device.name || "Unknown BLE peripheral";
  let confidence = 0.25;

  if (companyName) reasons.push(`Manufacturer data uses Bluetooth SIG company ID ${companyId}: ${companyName}`);

  if (companyId === 1704) {
    category = "hvac";
    label = "Midea smart air conditioner / HVAC controller";
    confidence = serviceShorts.has("ff80") || serviceShorts.has("ff90") ? 0.96 : 0.9;
    reasons.push("The manufacturer is specifically registered as Midea Air-Conditioning Equipment");
    if (serviceShorts.has("ff80") || serviceShorts.has("ff90")) {
      reasons.push("Advertises Midea-style vendor services 0xFF80 and 0xFF90");
    }
  } else if (serviceShorts.has("fd69")) {
    category = "tracker";
    label = "Samsung SmartTag / Find My Mobile beacon";
    confidence = 0.92;
    reasons.push("Service 0xFD69 is assigned to Samsung and is used for SmartTag discovery");
  } else if (companyId === 76) {
    const frame = appleFrame(device.manufacturerData?.hex);
    category = frame?.type === 0x12 ? "tracker" : "apple-device";
    label = frame ? `Apple ${frame.name}` : "Apple ecosystem device";
    confidence = frame ? 0.84 : 0.72;
    if (frame) reasons.push(`Apple manufacturer frame type 0x${frame.type.toString(16).padStart(2, "0").toUpperCase()}`);
    reasons.push("The advertisement does not distinguish an iPhone, Mac, Watch, AirTag, or accessory reliably");
  } else {
    for (const service of services) {
      const mapping = service.shortUuid && SERVICE_CATEGORIES.get(service.shortUuid.slice(2).toLowerCase());
      if (!mapping) continue;
      [category, label] = mapping;
      confidence = 0.82;
      reasons.push(`Advertises standard ${service.name} service`);
      break;
    }
    if (category === "unknown" && companyName) {
      category = "vendor-device";
      label = `${companyName} BLE device`;
      confidence = 0.58;
    } else if (category === "unknown" && services.some((service) => service.owner)) {
      const owned = services.find((service) => service.owner);
      category = "vendor-device";
      label = `${owned.owner} BLE device`;
      confidence = 0.62;
      reasons.push(`${owned.shortUuid} is assigned to ${owned.owner}`);
    }
  }

  const token = printableManufacturerToken(device.manufacturerData?.hex);
  return {
    label,
    category,
    vendor: companyName || services.find((service) => service.owner)?.owner || null,
    confidence,
    confidenceLabel: confidence >= 0.85 ? "high" : confidence >= 0.65 ? "medium" : "low",
    reasons,
    advertisedIdSuffix: token,
    evidenceLevel: reasons.length ? "evidence-backed inference" : "insufficient advertisement data",
  };
}

export function enrichBleDevice(device = {}) {
  const companyName = lookupBluetoothCompany(device.manufacturerData?.companyId);
  const serviceDetails = (device.serviceUuids || []).map(lookupBluetoothService);
  return {
    ...device,
    manufacturerData: device.manufacturerData
      ? { ...device.manufacturerData, companyName }
      : null,
    serviceDetails,
    identity: identifyBleDevice(device),
    proximity: estimateBleProximity(device),
  };
}

export function bluetoothRegistryStats() {
  return {
    companies: Object.keys(REGISTRY.companies).length,
    services: Object.keys(REGISTRY.services).length,
    metadata: REGISTRY.metadata,
  };
}

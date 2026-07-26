// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

// ════════════════════════════════════════════════════════════════════════════
// NETWORK INTELLIGENCE · Device Inference
// Infers device role, department, and observational risk from passive/active
// signals. Observation only — no authentication, no modification.
// ════════════════════════════════════════════════════════════════════════════

function hasPort(device, port) {
  return Array.isArray(device.openPorts) && device.openPorts.includes(port);
}

export function inferDeviceRole(device = {}) {
  const host = String(device.hostname || "").toLowerCase();
  const vendor = String(device.vendor || "").toLowerCase();

  // Hostname patterns first — strongest signal.
  if (/(^|[-_])(srv|server|dc|ad|sql|db|web|app)([-_]|\d|$)/.test(host)) return "server";
  if (/(^|[-_])(print|prn|mfp)/.test(host) || hasPort(device, 9100)) return "printer";
  if (/(^|[-_])(ap|gw|rtr|router|switch|sw|fw|firewall)([-_]|\d|$)/.test(host)) return "network";
  if (/(^|[-_])(iphone|ipad|android|mobile|phone)/.test(host)) return "mobile";

  // Port-based inference.
  const serverPorts = [80, 443, 22].filter((p) => hasPort(device, p));
  if (serverPorts.length >= 2) return "server";
  if (hasPort(device, 3389) || hasPort(device, 445)) return "workstation";

  // Vendor hints.
  if (vendor.includes("cisco") || vendor.includes("netgear") || vendor.includes("tp-link") || vendor.includes("d-link") || vendor.includes("asustek")) return "network";
  if (vendor.includes("brother") || vendor.includes("epson") || vendor.includes("printer")) return "printer";
  if (vendor.includes("apple")) return "workstation";
  if (vendor.includes("vmware") || vendor.includes("qemu") || vendor.includes("virtualbox") || vendor.includes("hyper-v") || vendor.includes("super micro")) return "server";

  return "unknown";
}

export function inferDepartment(device = {}, subnetLabel = "") {
  const host = String(device.hostname || "").toLowerCase();
  const prefix = /^([a-z]+)/.exec(host.split(".")[0] || "");
  const key = prefix ? prefix[1] : "";
  const table = {
    fin: "Finance",
    finance: "Finance",
    hr: "HR",
    dev: "Engineering",
    eng: "Engineering",
    it: "IT Operations",
    ops: "IT Operations",
  };
  return table[key] || subnetLabel || "Unclassified";
}

// Observational risk from exposed surface only. 0..100.
export function computeDeviceRisk(device = {}) {
  let score = 0;
  const banners = device.banners || {};

  if (hasPort(device, 3389)) score += 25; // RDP exposed
  if (hasPort(device, 23)) score += 30;   // Telnet (unencrypted admin)

  const role = inferDeviceRole(device);
  if (hasPort(device, 80) && role === "server") score += 15; // unencrypted admin on server

  const noHostname = !device.hostname;
  const genericMac = !device.vendor;
  if (noHostname && genericMac) score += 20; // unknown device

  if (hasPort(device, 445) && role === "workstation") score += 15; // SMB on workstation

  // Outdated banner indicators.
  for (const banner of Object.values(banners)) {
    if (/outdated|deprecated|eol|legacy|telnet|ssh-1\.|sslv2|sslv3/i.test(String(banner))) {
      score += 10;
    }
  }

  return Math.round(Math.min(100, Math.max(0, score)));
}

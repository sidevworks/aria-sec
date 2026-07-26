// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

// ════════════════════════════════════════════════════════════════════════════
// NETWORK INTELLIGENCE · Subnet Classifier
// Groups discovered devices into /24 subnets and infers human-readable labels.
// ════════════════════════════════════════════════════════════════════════════

function subnet24Of(ip) {
  const m = /^(\d+)\.(\d+)\.(\d+)\.\d+$/.exec(String(ip || ""));
  if (!m) return null;
  return `${m[1]}.${m[2]}.${m[3]}.0/24`;
}

export function classifyDevicesToSubnets(devices = []) {
  const map = new Map();
  for (const d of devices) {
    const cidr = subnet24Of(d.ip);
    if (!cidr) continue;
    if (!map.has(cidr)) map.set(cidr, []);
    map.get(cidr).push(d);
  }
  return map;
}

export function generateSubnetId(cidr) {
  return `subnet:${cidr}`;
}

// Heuristic label:
//  1. majority hostname prefix (alpha segment before digits/dash)
//  2. else most common OUI vendor present
//  3. else "Subnet 192.168.x.x"
export function inferSubnetLabel(cidr, devices = []) {
  const prefixCounts = new Map();
  for (const d of devices) {
    if (!d.hostname) continue;
    const prefix = hostnamePrefix(d.hostname);
    if (!prefix) continue;
    prefixCounts.set(prefix, (prefixCounts.get(prefix) || 0) + 1);
  }
  const topPrefix = topEntry(prefixCounts);
  if (topPrefix && topPrefix.count >= 2) {
    return mapPrefixToLabel(topPrefix.key) || `${capitalize(topPrefix.key)} Segment`;
  }

  const vendorCounts = new Map();
  for (const d of devices) {
    if (!d.vendor) continue;
    vendorCounts.set(d.vendor, (vendorCounts.get(d.vendor) || 0) + 1);
  }
  const topVendor = topEntry(vendorCounts);
  if (topVendor && topVendor.count >= Math.max(2, Math.ceil(devices.length / 2))) {
    return `${topVendor.key} Devices`;
  }

  const base = cidr.replace(/\.0\/24$/, ".x");
  return `Subnet ${base}`;
}

function hostnamePrefix(hostname) {
  const head = String(hostname).toLowerCase().split(".")[0];
  const m = /^([a-z]+)/.exec(head);
  return m ? m[1] : null;
}

function mapPrefixToLabel(prefix) {
  const table = {
    fin: "Finance",
    finance: "Finance",
    hr: "HR",
    dev: "Engineering",
    eng: "Engineering",
    it: "IT Operations",
    ops: "IT Operations",
    srv: "Server Segment",
    dc: "Domain Controllers",
    print: "Printers",
    ap: "Wireless Access",
    gw: "Network Core",
  };
  return table[prefix] || null;
}

function topEntry(map) {
  let best = null;
  for (const [key, count] of map) {
    if (!best || count > best.count) best = { key, count };
  }
  return best;
}

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

export { subnet24Of };

// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

// ════════════════════════════════════════════════════════════════════════════
// NETWORK INTELLIGENCE · Live Galaxy Adapter
// Converts DiscoveredDevice[] → DepartmentGalaxy[] satisfying identityContract.
// Also provides a clearly-labelled dev-sample dataset for the unauthorized path.
// ════════════════════════════════════════════════════════════════════════════
import { classifyDevicesToSubnets, generateSubnetId, inferSubnetLabel } from "./subnetClassifier.mjs";
import { inferDeviceRole, inferDepartment, computeDeviceRisk } from "./deviceInference.mjs";
import { summarizeExposures } from "./exposureScanner.mjs";

function now() {
  return new Date().toISOString();
}

function riskBand(score) {
  if (score >= 76) return "critical";
  if (score >= 51) return "warning";
  if (score >= 26) return "elevated";
  return "nominal";
}

const SERVER_ROLES = new Set(["server", "network"]);

function deviceToNode(device, departmentId, departmentName) {
  const role = inferDeviceRole(device);
  const exposure = summarizeExposures(
    Array.isArray(device.exposures) ? device.exposures : []
  );
  const baseRisk = computeDeviceRisk(device);
  const identityFindings = Array.isArray(device.identityFindings) ? device.identityFindings : [];
  const identityRisk = identityFindings.reduce((score, finding) => {
    if (finding.type === "identity_claim_mismatch") return Math.max(score, finding.severity === "high" ? 30 : 20);
    if (finding.type === "segment_history_anomaly") return Math.max(score, finding.severity === "high" ? 25 : 15);
    return score;
  }, 0);
  const riskScore = Math.round(Math.min(100, baseRisk + identityRisk));

  const macSuffix = device.mac ? device.mac.split(":").slice(-3).join("").toUpperCase() : "UNKNOWN";
  const name = device.hostname || `Unknown-${macSuffix}`;

  const anomalies = [...exposure.findings];
  for (const finding of identityFindings) {
    if (finding.detail && !anomalies.includes(finding.detail)) anomalies.push(finding.detail);
  }
  if (!device.hostname && !device.vendor) anomalies.push("Unknown device");
  if (Array.isArray(device.openPorts) && device.openPorts.includes(3389)) {
    if (!anomalies.some((a) => /RDP/.test(a))) anomalies.push("Open RDP port");
  }

  const isAdmin = SERVER_ROLES.has(role);

  const riskReasons = [];
  if (!device.hostname) riskReasons.push("Hostname unresolvable — device not registered in DNS");
  if (!device.vendor) riskReasons.push("MAC vendor unrecognised — possible rogue device");
  if (device.openPorts?.includes(22)) riskReasons.push("SSH port (22) open — administrative access");
  if (device.openPorts?.includes(23)) riskReasons.push("Telnet port (23) open — unencrypted admin protocol");
  if (device.openPorts?.includes(3389)) riskReasons.push("RDP port (3389) open — remote desktop access");
  if (device.openPorts?.includes(5900)) riskReasons.push("VNC port (5900) open — screen sharing");
  if (device.openPorts?.includes(445)) riskReasons.push("SMB port (445) open — file sharing");
  if (anomalies.length > 0) riskReasons.push(`${anomalies.length} exposure findings on this device`);
  for (const finding of identityFindings) {
    riskReasons.push(`${finding.detail} (${finding.confidenceLabel || "unrated"} confidence)`);
  }

  return {
    id: `device:${device.ip}`,
    name,
    upn: device.ip,
    departmentId,
    department: departmentName,
    riskScore,
    riskBand: riskBand(riskScore),
    isAdmin,
    isPrivileged: isAdmin,
    accountEnabled: true,
    lastSeen: device.lastSeen || now(),
    ip: device.ip,
    mac: device.mac || null,
    hostname: device.hostname || null,
    vendor: device.vendor || null,
    deviceType: device.deviceType || role,
    openPorts: Array.isArray(device.openPorts) ? device.openPorts : [],
    subnet: device.subnet || null,
    baselineEntityId: device.baselineEntityId || null,
    identityFindings,
    anomalies,
    riskReasons,
    source: "network",
  };
}

function buildGalaxyFromSubnet(cidr, devices) {
  const label = inferSubnetLabel(cidr, devices);
  const id = generateSubnetId(cidr);
  const nodes = devices.map((d) => deviceToNode(d, id, label));

  const adminCount = nodes.filter((n) => n.isAdmin).length;
  const anomalyCount = nodes.reduce((acc, n) => acc + (n.anomalies?.length || 0), 0);
  const userCount = nodes.length;

  const avgRisk = userCount
    ? Math.round(nodes.reduce((acc, n) => acc + n.riskScore, 0) / userCount)
    : 0;
  // Subnet risk leans on the worst-exposed devices, not just the mean.
  const maxRisk = nodes.reduce((acc, n) => Math.max(acc, n.riskScore), 0);
  const riskScore = Math.round(Math.min(100, avgRisk * 0.6 + maxRisk * 0.4));

  return {
    id,
    name: label,
    riskScore,
    riskBand: riskBand(riskScore),
    signals: {
      userCount,
      adminCount,
      anomalyCount,
      policyViolations24h: 0,
      failedAuths24h: 0,
      privilegeDriftCount: 0,
      disabledWithAccessCount: 0,
    },
    source: "network",
    scannedAt: now(),
    users: nodes,
  };
}

export function discoveryToGalaxies(discoveryResult = [], authRecord = null) {
  const devices = Array.isArray(discoveryResult) ? discoveryResult : [];
  const bySubnet = classifyDevicesToSubnets(devices);
  const galaxies = [];
  for (const [cidr, subnetDevices] of bySubnet) {
    galaxies.push(buildGalaxyFromSubnet(cidr, subnetDevices));
  }
  galaxies.sort((a, b) => b.riskScore - a.riskScore);

  return {
    dataMode: "live",
    connectedSources: ["network"],
    galaxies,
    scannedAt: now(),
    authorizationId: authRecord?.id || null,
  };
}

// ─── Dev-sample (clearly labelled, no real network access) ─────────────────────
export function buildDevSampleGalaxies() {
  const ts = now();
  const subnets = [
    {
      cidr: "192.168.10.0/24",
      label: "Engineering",
      prefix: "dev",
      seed: [
        { host: "dev-build01", role: "server", ports: [22, 80, 443], vendor: "VMware" },
        { host: "dev-ws14", role: "workstation", ports: [445, 3389], vendor: "Intel" },
        { host: "dev-ws22", role: "workstation", ports: [445], vendor: "Apple" },
        { host: "dev-ws07", role: "workstation", ports: [], vendor: "Apple" },
        { host: "dev-mac09", role: "workstation", ports: [22], vendor: "Apple" },
        { host: "dev-ci-runner", role: "server", ports: [22, 8080], vendor: "VMware" },
        { host: null, role: "unknown", ports: [23], vendor: null },
        { host: "dev-ws31", role: "workstation", ports: [445], vendor: "Intel" },
        { host: "dev-print2", role: "printer", ports: [9100], vendor: "Brother (printer)" },
      ],
    },
    {
      cidr: "192.168.20.0/24",
      label: "Finance",
      prefix: "fin",
      seed: [
        { host: "fin-app01", role: "server", ports: [443, 8443], vendor: "Super Micro" },
        { host: "fin-db01", role: "server", ports: [22, 443], vendor: "Super Micro" },
        { host: "fin-ws03", role: "workstation", ports: [445, 3389], vendor: "Intel" },
        { host: "fin-ws08", role: "workstation", ports: [445], vendor: "Intel" },
        { host: "fin-ws11", role: "workstation", ports: [3389], vendor: "Intel" },
        { host: "fin-ws19", role: "workstation", ports: [445], vendor: "Apple" },
        { host: "fin-legacy-pos", role: "server", ports: [23, 80], vendor: null },
        { host: "fin-print1", role: "printer", ports: [9100, 80], vendor: "HP (printer)" },
        { host: null, role: "unknown", ports: [5900], vendor: null },
        { host: "fin-ws27", role: "workstation", ports: [445], vendor: "Apple" },
      ],
    },
    {
      cidr: "192.168.30.0/24",
      label: "IT Operations",
      prefix: "it",
      seed: [
        { host: "it-dc01", role: "server", ports: [445, 443], vendor: "Microsoft Hyper-V" },
        { host: "it-gw01", role: "network", ports: [22, 443], vendor: "Cisco" },
        { host: "it-ap03", role: "network", ports: [443], vendor: "Cisco" },
        { host: "it-nas01", role: "server", ports: [22, 445, 5900], vendor: "Synology" },
        { host: "it-ws02", role: "workstation", ports: [445, 3389], vendor: "Intel" },
        { host: "it-ws05", role: "workstation", ports: [3389], vendor: "Intel" },
        { host: "it-jump01", role: "server", ports: [22, 3389], vendor: "VMware" },
        { host: "it-print1", role: "printer", ports: [9100], vendor: "Brother (printer)" },
      ],
    },
  ];

  const galaxies = subnets.map((s, si) => {
    const devices = s.seed.map((d, di) => ({
      ip: `${s.cidr.replace(/\.0\/24$/, "")}.${10 + di}`,
      mac: d.vendor ? sampleMac(si, di) : null,
      hostname: d.host,
      vendor: d.vendor,
      openPorts: d.ports,
      banners: {},
      discoveryMethod: ["sample"],
      firstSeen: ts,
      lastSeen: ts,
      exposures: d.ports.map((p) => ({ port: p, label: String(p), open: true, risk: portRisk(p) })),
    }));
    const bySubnet = classifyDevicesToSubnets(devices);
    const [, subnetDevices] = [...bySubnet][0] || [s.cidr, devices];
    return buildGalaxyFromSubnet(s.cidr, subnetDevices);
  });

  galaxies.sort((a, b) => b.riskScore - a.riskScore);

  return {
    dataMode: "sample",
    connectedSources: [],
    galaxies,
    scannedAt: ts,
  };
}

function sampleMac(si, di) {
  const a = (0x02 + si).toString(16).padStart(2, "0");
  const b = (0x10 + di).toString(16).padStart(2, "0");
  return `${a}:${b}:de:ad:be:ef`;
}

function portRisk(port) {
  const table = { 22: 10, 23: 30, 80: 15, 443: 5, 3389: 25, 8080: 10, 8443: 8, 445: 20, 5900: 28, 9100: 5 };
  return table[port] ?? 5;
}

// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

// ════════════════════════════════════════════════════════════════════════════
// NETWORK INTELLIGENCE · Exposure Scanner
// Light port observation. READ-ONLY. No authentication, no exploit, no payload
// beyond the TCP connect handshake. Used only inside an authorized active scan.
// ════════════════════════════════════════════════════════════════════════════
import net from "node:net";

export const CRITICAL_PORTS = [
  { port: 22,   label: "SSH",        risk: 10 },
  { port: 23,   label: "Telnet",     risk: 30 }, // unencrypted admin
  { port: 80,   label: "HTTP admin", risk: 15 },
  { port: 443,  label: "HTTPS",      risk: 5  },
  { port: 445,  label: "SMB",        risk: 20 },
  { port: 3389, label: "RDP",        risk: 25 },
  { port: 5900, label: "VNC",        risk: 28 },
];

export const EXTENDED_PORTS = [
  { port: 8080,  label: "Alt HTTP",    risk: 10 },
  { port: 8443,  label: "Alt HTTPS",   risk: 8  },
  { port: 9100,  label: "Printer",     risk: 5  },
  { port: 5432,  label: "PostgreSQL",  risk: 18 },
  { port: 3306,  label: "MySQL",       risk: 18 },
  { port: 1433,  label: "MSSQL",       risk: 18 },
  { port: 6379,  label: "Redis",       risk: 22 },
  { port: 27017, label: "MongoDB",     risk: 22 },
  { port: 53,    label: "DNS",         risk: 5  },
  { port: 21,    label: "FTP",         risk: 15 },
];

export const ADMIN_PORTS = [...CRITICAL_PORTS, ...EXTENDED_PORTS];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// TCP connect probe only — we open the socket and immediately close it. No data
// is ever written to the socket, so no banner-grab payload, no auth, no exploit.
function connectProbe(ip, port, timeoutMs = 500) {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    let settled = false;
    const finish = (open) => {
      if (settled) return;
      settled = true;
      try { sock.destroy(); } catch { /* noop */ }
      resolve(open);
    };
    sock.setTimeout(timeoutMs);
    sock.once("connect", () => finish(true));
    sock.once("timeout", () => finish(false));
    sock.once("error", () => finish(false));
    try { sock.connect(port, ip); } catch { finish(false); }
  });
}

export async function scanDeviceExposures(ip, { fullScan = false } = {}) {
  const portList = fullScan ? ADMIN_PORTS : CRITICAL_PORTS;
  const results = [];
  for (const entry of portList) {
    const open = await connectProbe(ip, entry.port, 500);
    results.push({ port: entry.port, label: entry.label, open, risk: entry.risk });
    await sleep(50);
  }
  return results;
}

export function summarizeExposures(exposureResults = []) {
  const openPorts = [];
  const findings = [];
  let totalRisk = 0;
  for (const r of exposureResults) {
    if (!r.open) continue;
    openPorts.push(r.port);
    totalRisk += r.risk;
    findings.push(`Open ${r.label} (port ${r.port})`);
  }
  return { openPorts, totalRisk: Math.min(100, totalRisk), findings };
}

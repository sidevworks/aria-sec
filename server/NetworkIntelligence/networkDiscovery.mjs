// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

// ════════════════════════════════════════════════════════════════════════════
// NETWORK INTELLIGENCE · Discovery Engine
// DEFENSIVE OBSERVABILITY ONLY — discover and observe, never authenticate or
// modify any target. Active probes require a verified authorization record.
// macOS-targeted (Darwin): /sbin/ping, arp -a, node:dns, node:dgram, node:net.
// ════════════════════════════════════════════════════════════════════════════
import { execFile as _execFile } from "node:child_process";
import { promisify } from "node:util";
import { promises as dns } from "node:dns";
import dgram from "node:dgram";
import net from "node:net";
import { ouiLookup } from "./ouiRegistry.mjs";

const execFile = promisify(_execFile);

function normalizeMac(mac) {
  if (!mac) return null;
  const norm = String(mac).toLowerCase().replace(/-/g, ":");
  const parts = norm.split(":");
  if (parts.length !== 6) return mac;
  return parts.map((p) => p.padStart(2, "0")).join(":");
}

function isBroadcastMac(mac) {
  return normalizeMac(mac) === "ff:ff:ff:ff:ff:ff";
}

function isMulticastMac(mac) {
  const normalized = normalizeMac(mac);
  if (!/^[0-9a-f]{2}(?::[0-9a-f]{2}){5}$/.test(String(normalized || ""))) return false;
  // IEEE 802 group bit: multicast addresses have the low bit of octet 1 set.
  return (Number.parseInt(normalized.slice(0, 2), 16) & 1) === 1;
}

function now() {
  return new Date().toISOString();
}

function isPrivateIp(ip) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(ip || ""));
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

function isNetworkOrBroadcastIp(ip) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(ip || ""));
  if (!m) return true;
  const lastOctet = Number(m[4]);
  return lastOctet === 0 || lastOctet === 255;
}

function isDiscoverableHost(ip, mac = null) {
  return isPrivateIp(ip) && !isNetworkOrBroadcastIp(ip) && !isBroadcastMac(mac) && !isMulticastMac(mac);
}

// ─── Authorization helpers ─────────────────────────────────────────────────────
export function isExpired(authRecord) {
  if (!authRecord || !authRecord.expiresAt) return true;
  return new Date(authRecord.expiresAt).getTime() <= Date.now();
}

function assertAuthorized(authRecord) {
  if (!authRecord) {
    throw new Error("SCAN_NOT_AUTHORIZED: no authorization record provided.");
  }
  if (authRecord.status !== "active") {
    throw new Error(`SCAN_NOT_AUTHORIZED: authorization status is '${authRecord.status}'.`);
  }
  if (isExpired(authRecord)) {
    throw new Error("SCAN_NOT_AUTHORIZED: authorization has expired.");
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── ARP table read ────────────────────────────────────────────────────────────
export async function readArpTable() {
  let stdout = "";
  try {
    const result = await execFile("arp", ["-a"], { timeout: 5000 });
    stdout = result.stdout || "";
  } catch {
    return [];
  }
  const entries = [];
  // macOS format: hostname (192.168.1.1) at a:b:c:d:e:f on en0 ifscope [ethernet]
  const lineRe = /\(([\d.]+)\)\s+at\s+([0-9a-fA-F:]+)(?:\s+on\s+(\w+))?/;
  for (const line of stdout.split("\n")) {
    const m = lineRe.exec(line);
    if (!m) continue;
    const ip = m[1];
    const rawMac = m[2];
    if (rawMac === "(incomplete)" || !rawMac.includes(":")) continue;
    const mac = normalizeMac(rawMac);
    if (!isDiscoverableHost(ip, mac)) continue;
    entries.push({ ip, mac, iface: m[3] || null });
  }
  return entries;
}

// ─── Passive mDNS listen ───────────────────────────────────────────────────────
// Binds a UDP socket, joins the mDNS multicast group, and listens for whatever
// the OS / other hosts broadcast. Listen-only: we never send a query.
export async function passiveMdnsListen(windowMs = 2000) {
  return new Promise((resolve) => {
    const seen = new Map(); // ip -> { ip, hostname, serviceType }
    let socket;
    let done = false;

    const finish = () => {
      if (done) return;
      done = true;
      try { socket && socket.close(); } catch { /* noop */ }
      resolve(Array.from(seen.values()));
    };

    try {
      socket = dgram.createSocket({ type: "udp4", reuseAddr: true });
    } catch {
      resolve([]);
      return;
    }

    socket.on("error", () => finish());

    socket.on("message", (msg, rinfo) => {
      const ip = rinfo.address;
      if (!isPrivateIp(ip)) return;
      const parsed = parseMdnsNames(msg);
      const prev = seen.get(ip) || { ip, hostname: null, serviceType: null };
      seen.set(ip, {
        ip,
        hostname: prev.hostname || parsed.hostname,
        serviceType: prev.serviceType || parsed.serviceType,
      });
    });

    try {
      socket.bind(5353, () => {
        try { socket.addMembership("224.0.0.251"); } catch { /* may already be joined */ }
      });
    } catch {
      finish();
      return;
    }

    setTimeout(finish, Math.max(200, Number(windowMs) || 2000));
  });
}

// Very small, read-only mDNS/DNS name extractor — reads labels for hostnames
// and detects ._tcp / ._udp service types. Never sends anything.
function parseMdnsNames(buf) {
  const result = { hostname: null, serviceType: null };
  try {
    const names = [];
    let i = 12; // skip DNS header
    let guard = 0;
    while (i < buf.length && guard < 256) {
      guard++;
      const len = buf[i];
      if (len === 0) { i++; continue; }
      if ((len & 0xc0) === 0xc0) { i += 2; continue; } // compression pointer
      if (i + 1 + len > buf.length) break;
      const label = buf.toString("utf8", i + 1, i + 1 + len);
      names.push(label);
      i += 1 + len;
    }
    for (const n of names) {
      if (n.startsWith("_") && !result.serviceType) result.serviceType = n;
      if (n.endsWith(".local") || (/^[a-zA-Z0-9-]+$/.test(n) && n.length > 1 && !n.startsWith("_") && !result.hostname)) {
        result.hostname = n.replace(/\.local$/, "");
      }
    }
  } catch { /* tolerate malformed packets */ }
  return result;
}

// ─── rDNS ──────────────────────────────────────────────────────────────────────
async function reverseDns(ip) {
  try {
    const names = await dns.reverse(ip);
    return names && names.length ? names[0] : null;
  } catch {
    return null;
  }
}

// ─── Passive discovery (no authorization required) ─────────────────────────────
// Reads only what the OS already knows: the ARP cache and ambient mDNS chatter,
// plus rDNS on the IPs already present in the ARP cache. No packets are sent to
// targets to elicit a response.
export async function discoverPassive(subnets = []) {
  const scopeSet = Array.isArray(subnets) && subnets.length ? new Set(subnets) : null;
  const inScope = (ip) => {
    if (!isDiscoverableHost(ip)) return false;
    if (!scopeSet) return true;
    return [...scopeSet].some((cidr) => ipInCidr24(ip, cidr));
  };

  const devices = new Map(); // ip -> DiscoveredDevice
  const ts = now();

  const upsert = (ip) => {
    if (!devices.has(ip)) {
      devices.set(ip, {
        ip,
        mac: null,
        hostname: null,
        vendor: null,
        openPorts: [],
        banners: {},
        discoveryMethod: [],
        firstSeen: ts,
        lastSeen: ts,
      });
    }
    return devices.get(ip);
  };

  // ARP
  const arp = await readArpTable();
  for (const entry of arp) {
    if (!inScope(entry.ip)) continue;
    const d = upsert(entry.ip);
    d.mac = entry.mac;
    d.vendor = ouiLookup(entry.mac);
    if (!d.discoveryMethod.includes("arp")) d.discoveryMethod.push("arp");
  }

  // mDNS (listen-only)
  const mdns = await passiveMdnsListen(2000);
  for (const m of mdns) {
    if (!inScope(m.ip)) continue;
    const d = upsert(m.ip);
    if (m.hostname && !d.hostname) d.hostname = m.hostname;
    if (!d.discoveryMethod.includes("mdns")) d.discoveryMethod.push("mdns");
  }

  // rDNS on already-known IPs
  await Promise.all(
    [...devices.keys()].map(async (ip) => {
      const d = devices.get(ip);
      if (d.hostname) return;
      const name = await reverseDns(ip);
      if (name) {
        d.hostname = name;
        if (!d.discoveryMethod.includes("rdns")) d.discoveryMethod.push("rdns");
      }
    })
  );

  return [...devices.values()];
}

// ─── Active discovery (authorization REQUIRED) ─────────────────────────────────
// Ping sweep + light TCP port fingerprint. Verifies authorization at the top and
// throws if not authorized — it never silently degrades to a passive scan.
export async function discoverActive(subnets = [], authRecord = null, options = {}) {
  assertAuthorized(authRecord); // throws immediately if null / expired / not active

  const scope = (Array.isArray(subnets) && subnets.length ? subnets : authRecord.scope || []).filter((c) =>
    isPrivateCidr(c)
  );

  const ts = now();
  const devices = new Map();
  const concurrency = Math.max(1, Math.min(64, Number(options.concurrency || 32)));
  const startedAt = Date.now();
  const maxDurationMs = Math.max(5000, Number(options.maxDurationMs || 60_000));
  const allHosts = scope.flatMap((cidr) => enumerateCidr24Hosts(cidr));
  let completed = 0;

  const reportProgress = () => {
    options.onProgress?.({
      completed,
      total: allHosts.length,
      alive: devices.size,
      elapsedMs: Date.now() - startedAt,
    });
  };

  async function probeHost(ip) {
    if (Date.now() - startedAt > maxDurationMs) { completed += 1; return; }
    const hostDeadline = 1500;
    const alive = await Promise.race([
      pingHost(ip),
      sleep(hostDeadline).then(() => false),
    ]);
    completed += 1;
    if (alive) {
      const d = {
        ip,
        mac: null,
        hostname: null,
        vendor: null,
        openPorts: [],
        banners: {},
        discoveryMethod: ["ping"],
        firstSeen: ts,
        lastSeen: ts,
      };
      const name = await reverseDns(ip);
      if (name) { d.hostname = name; d.discoveryMethod.push("rdns"); }
      devices.set(ip, d);
    }
    if (completed % 8 === 0 || completed === allHosts.length) reportProgress();
  }

  reportProgress();
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, allHosts.length) }, async () => {
    while (next < allHosts.length && Date.now() - startedAt <= maxDurationMs) {
      const ip = allHosts[next++];
      await probeHost(ip);
      await sleep(10);
    }
  }));
  reportProgress();

  // Enrich with ARP (MAC/vendor) for hosts we just woke up.
  const arp = await readArpTable();
  const arpByIp = new Map(arp.map((e) => [e.ip, e]));
  for (const [ip, d] of devices) {
    const a = arpByIp.get(ip);
    if (a) {
      d.mac = a.mac;
      d.vendor = ouiLookup(a.mac);
      if (!d.discoveryMethod.includes("arp")) d.discoveryMethod.push("arp");
    }
  }

  return [...devices.values()];
}

async function pingHost(ip) {
  try {
    const args = process.platform === "darwin"
      ? ["-c", "1", "-W", "300", "-t", "1", ip]
      : ["-c", "1", "-W", "1", ip];
    await execFile("/sbin/ping", args, { timeout: 1000 });
    return true;
  } catch {
    return false;
  }
}

// Light TCP connect fingerprint — connect only, no payload sent. Used by callers
// that already hold authorization (exposureScanner performs the real probe).
export async function tcpProbe(ip, port, timeoutMs = 500) {
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

// ─── CIDR helpers (/24 only — scope is validated to private /24-ish ranges) ────
function isPrivateCidr(cidr) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/.exec(String(cidr || ""));
  if (!m) return false;
  return isPrivateIp(`${m[1]}.${m[2]}.${m[3]}.${m[4]}`);
}

function ipInCidr24(ip, cidr) {
  const im = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(ip);
  const cm = /^(\d+)\.(\d+)\.(\d+)\.(\d+)\/(\d+)$/.exec(cidr);
  if (!im || !cm) return false;
  return im[1] === cm[1] && im[2] === cm[2] && im[3] === cm[3];
}

function enumerateCidr24Hosts(cidr) {
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)\/(\d+)$/.exec(cidr);
  if (!m) return [];
  const prefix = `${m[1]}.${m[2]}.${m[3]}`;
  const hosts = [];
  for (let h = 1; h <= 254; h++) hosts.push(`${prefix}.${h}`);
  return hosts;
}

export { ouiLookup, normalizeMac, isBroadcastMac, isMulticastMac, isPrivateIp, isPrivateCidr, isDiscoverableHost, ipInCidr24, enumerateCidr24Hosts };

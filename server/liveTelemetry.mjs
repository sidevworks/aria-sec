// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import { execFileSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { cpus, freemem, hostname, loadavg, platform, release, totalmem, uptime } from "node:os";
import { getGithubConnectorStatus } from "./connectors/githubAuthStore.mjs";
import { getAwsConnectorStatus } from "./connectors/awsAuthStore.mjs";
import { getQuarantineListSync } from "./quarantineStore.mjs";

const IS_LINUX = platform() === "linux";
const now = () => new Date().toISOString();

function safeUptime() {
  try {
    return uptime();
  } catch {
    return 0;
  }
}

function run(command, args = [], { timeout = 1800 } = {}) {
  try {
    return {
      ok: true,
      output: execFileSync(command, args, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout,
      }),
    };
  } catch (error) {
    const stderr = typeof error.stderr === "string" ? error.stderr : (error.stderr?.toString?.() || "");
    return { ok: false, output: "", error: error.message, stderr, status: error.status ?? null };
  }
}

function bytes(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(number) / Math.log(1024)));
  return `${(number / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function processName(command = "") {
  const first = String(command || "").trim().split(/\s+/)[0] || "unknown";
  return first.split("/").pop() || first;
}

function parseProcesses(output) {
  return output
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const cols = line.split(/\s+/);
      const pid = Number(cols[0]);
      if (!Number.isFinite(pid)) return null;

      // ps format: pid user stat lstart(5 cols) %cpu %mem command...
      const user = cols[1] || "unknown";
      const state = cols[2] || "";
      const started = cols.slice(3, 8).join(" ");
      const cpu = Number(cols[8] || 0);
      const memory = Number(cols[9] || 0);
      const command = cols.slice(10).join(" ") || processName(cols[10]);

      return {
        pid,
        user,
        state,
        started,
        name: processName(command),
        command,
        cpu: Number.isFinite(cpu) ? cpu : 0,
        memory: Number.isFinite(memory) ? memory : 0,
        source: "ps",
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.cpu + b.memory - (a.cpu + a.memory))
    .slice(0, 300);
}

function parseConnections(output) {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^(tcp|udp)/i.test(line))
    .map((line) => {
      const cols = line.split(/\s+/);
      const proto = cols[0]?.toUpperCase() || "TCP";
      const local = cols[3] || cols[1] || "";
      const remote = cols[4] || cols[2] || "";
      const state = cols.find((col) => /LISTEN|ESTABLISHED|CLOSE_WAIT|TIME_WAIT|SYN/i.test(col)) || "OPEN";
      return { proto, local, remote, state, source: "netstat" };
    })
    .filter((item) => item.local || item.remote)
    .slice(0, 28);
}

// Parse `ss -tan` output (Linux)
function parseSsConnections(output) {
  return output
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const cols = line.split(/\s+/);
      const proto = "TCP";
      const state = cols[0] || "OPEN";
      const local = cols[3] || "";
      const remote = cols[4] || "";
      return { proto, local, remote, state, source: "ss" };
    })
    .filter((item) => item.local || item.remote)
    .slice(0, 28);
}

function parseDisk(output) {
  const rows = output.split(/\r?\n/).slice(1).map((line) => line.trim()).filter(Boolean);
  return rows.map((line) => {
    const cols = line.split(/\s+/);
    const capacity = cols[4] || "0%";
    return {
      filesystem: cols[0],
      size: cols[1],
      used: cols[2],
      available: cols[3],
      capacity,
      mounted: cols.slice(8).join(" ") || cols[8] || cols[5] || "/",
      usage: Number(capacity.replace("%", "")) || 0,
      use_percent: Number(capacity.replace("%", "")) || 0,
      source: "df",
    };
  });
}

function parseFirewallBlocklist(output) {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      const matches = line.match(/\b(?:\d{1,3}\.){3}\d{1,3}(?:\/\d{1,2})?\b/g) || [];
      return matches.map((ip) => ({
        ip,
        rule: line,
        source: "firewall",
        status: "blocked",
      }));
    })
    .filter((item, index, array) => array.findIndex((candidate) => candidate.ip === item.ip) === index)
    .slice(0, 40);
}

// Read running systemd/init services on Linux from /proc
function readLinuxServices() {
  try {
    const result = run("systemctl", ["list-units", "--type=service", "--state=running", "--no-pager", "--no-legend"], { timeout: 2000 });
    if (result.ok) {
      return result.output
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 15)
        .map((line) => {
          const cols = line.split(/\s+/);
          return { pid: "-", status: cols[2] || "running", label: cols[0] || line, source: "systemctl" };
        });
    }
    // Fallback: read /proc dirs as a rough process list
    const pids = readdirSync("/proc").filter((d) => /^\d+$/.test(d)).slice(0, 15);
    return pids.map((pid) => ({ pid, status: "running", label: pid, source: "proc" }));
  } catch {
    return [];
  }
}

function readWorkspaceFiles(root = process.cwd()) {
  try {
    return readdirSync(root, { withFileTypes: true })
      .filter((entry) => !entry.name.startsWith(".") && entry.name !== "node_modules")
      .slice(0, 28)
      .map((entry) => {
        const path = join(root, entry.name);
        const stat = statSync(path);
        return {
          name: entry.name,
          kind: entry.isDirectory() ? "directory" : "file",
          size: entry.isDirectory() ? "" : bytes(stat.size),
          modified: stat.mtime.toISOString(),
          source: "workspace-fs",
        };
      })
      .sort((a, b) => b.modified.localeCompare(a.modified));
  } catch {
    return [];
  }
}

function collectProcesses() {
  const fallbackProcess = (result) => ({
    result,
    processes: [{
      pid: process.pid,
      user: process.env.USER || "unknown",
      state: "running",
      started: "",
      name: "node",
      command: process.argv.join(" ") || "node",
      cpu: 0,
      memory: 0,
      source: "node-process",
    }],
  });

  if (IS_LINUX) {
    const result = run("ps", ["-eo", "pid=,user=,stat=,lstart=,pcpu=,pmem=,args="]);
    if (!result.ok) return fallbackProcess(result);
    return {
      result,
      processes: result.ok ? parseProcesses(`PID USER STAT STARTED PCPU PMEM COMMAND\n${result.output}`) : [],
    };
  }
  const result = run("ps", ["-axo", "pid=,user=,stat=,lstart=,pcpu=,pmem=,command="]);
  if (!result.ok) return fallbackProcess(result);
  return {
    result,
    processes: result.ok ? parseProcesses(`PID USER STAT STARTED PCPU PMEM COMMAND\n${result.output}`) : [],
  };
}

function collectConnections() {
  if (IS_LINUX) {
    // Try ss first, fall back to netstat
    const ssResult = run("ss", ["-tan"]);
    if (ssResult.ok) return { result: ssResult, connections: parseSsConnections(ssResult.output) };
    const netstatResult = run("netstat", ["-an"]);
    return { result: netstatResult, connections: netstatResult.ok ? parseConnections(netstatResult.output) : [] };
  }
  const result = run("netstat", ["-an"]);
  return { result, connections: result.ok ? parseConnections(result.output) : [] };
}

function collectFirewall() {
  if (IS_LINUX) {
    // Try iptables, then nftables
    const ipt = run("iptables", ["-L", "-n", "--line-numbers"], { timeout: 2000 });
    if (ipt.ok) return { result: ipt, blockedIps: parseFirewallBlocklist(ipt.output) };
    const nft = run("nft", ["list", "ruleset"], { timeout: 2000 });
    return { result: nft, blockedIps: nft.ok ? parseFirewallBlocklist(nft.output) : [] };
  }
  // macOS: try pfctl directly, then non-interactive sudo as a fallback
  const direct = run("pfctl", ["-sr"], { timeout: 1200 });
  if (direct.ok) return { result: direct, blockedIps: parseFirewallBlocklist(direct.output) };
  const sudo = run("sudo", ["-n", "pfctl", "-sr"], { timeout: 1200 });
  if (sudo.ok) return { result: sudo, blockedIps: parseFirewallBlocklist(sudo.output) };
  // Both failed — surface whether it was a permission issue or pfctl missing
  const permDenied = (direct.stderr || direct.error || "").toLowerCase().includes("permission") ||
                     (sudo.stderr || sudo.error || "").toLowerCase().includes("password") ||
                     direct.status === 1;
  return {
    result: { ok: false, permissionDenied: permDenied, error: direct.error },
    blockedIps: [],
  };
}

function collectServices() {
  if (IS_LINUX) {
    const services = readLinuxServices();
    return { result: { ok: services.length > 0 }, services };
  }
  const result = run("launchctl", ["list"], { timeout: 1200 });
  const services = result.ok
    ? result.output.split(/\r?\n/).slice(1, 16).map((line) => {
        const [pid, status, ...label] = line.trim().split(/\s+/);
        return { pid, status, label: label.join(" "), source: "launchctl" };
      }).filter((item) => item.label)
    : [];
  return { result, services };
}

function buildSources({ processResult, netstatResult, diskResult, serviceResult, firewallResult, blockedIps, files, quarantineItems }) {
  const isLinux = IS_LINUX;
  const github = getGithubConnectorStatus().connector;
  const aws = getAwsConnectorStatus();
  return [
    { id: "system-processes", label: "System processes", status: processResult.ok ? "live" : "error", last_seen: now(), detail: processResult.ok ? "ps inventory" : processResult.error },
    { id: "network-sockets", label: "Network sockets", status: netstatResult.ok ? "live" : "error", last_seen: now(), detail: netstatResult.ok ? "socket snapshot" : netstatResult.error },
    { id: "disk-health", label: "Disk health", status: diskResult.ok ? "live" : "error", last_seen: now(), detail: diskResult.ok ? "df capacity" : diskResult.error },
    { id: "system-services", label: isLinux ? "systemd services" : "Launch services", status: serviceResult.ok ? "live" : "limited", last_seen: now(), detail: serviceResult.ok ? (isLinux ? "systemctl list" : "launchctl list") : (isLinux ? "systemctl unavailable" : "launchctl unavailable") },
    { id: "workspace-files", label: "Workspace files", status: files.length ? "live" : "limited", last_seen: now(), detail: `${files.length} visible entries` },
    { id: "quarantine-store", label: "Local quarantine store", status: "live", last_seen: now(), detail: `${quarantineItems.length} quarantined item${quarantineItems.length === 1 ? "" : "s"}` },
    { id: "firewall-blocklist", label: isLinux ? "Linux firewall rules" : "macOS firewall blocklist", status: firewallResult.ok ? "live" : firewallResult.permissionDenied ? "limited" : "unconfigured", last_seen: now(), detail: firewallResult.ok ? `${blockedIps.length} block entries found` : firewallResult.permissionDenied ? "pfctl needs elevated privileges — run with sudo for firewall visibility" : "Firewall rules unavailable or not enabled" },
    { id: "github", label: "GitHub connector", status: github.connected ? "live" : "unconfigured", last_seen: now(), detail: github.connected ? `${github.repository_count} repo${github.repository_count !== 1 ? "s" : ""} — ${github.username}` : "Connector slot ready" },
    { id: "aws", label: "AWS connector", status: aws.status === "connected" ? "live" : "unconfigured", last_seen: now(), detail: aws.status === "connected" ? `Region: ${aws.region || "auto"}` : "Connector slot ready" },
    { id: "siem-edr", label: "SIEM/EDR connector", status: "unconfigured", last_seen: now(), detail: "Connector slot ready" },
  ];
}

function severityForSystem({ memoryPercent, loadRatio, diskUsage }) {
  if (memoryPercent >= 92 || loadRatio >= 2.5 || diskUsage >= 94) return "critical";
  if (memoryPercent >= 82 || loadRatio >= 1.4 || diskUsage >= 86) return "high";
  if (memoryPercent >= 70 || loadRatio >= 0.9 || diskUsage >= 78) return "medium";
  return "low";
}

function buildLogEvents({ processCount, connectionCount, diskCount, sourceCount }) {
  return [
    { level: "INFO", message: `${processCount} system processes observed`, source: "system-processes", time: now() },
    { level: "INFO", message: `${connectionCount} network sockets sampled`, source: "network-sockets", time: now() },
    { level: "INFO", message: `${diskCount} mounted disk rows measured`, source: "disk-health", time: now() },
    { level: "INFO", message: `${sourceCount} telemetry sources registered`, source: "source-fabric", time: now() },
  ];
}

export async function collectLiveTelemetry() {
  return collectLiveTelemetrySync();
}

export function collectLiveTelemetrySync() {
  const stamp = now();

  const { result: processResult, processes } = collectProcesses();
  const { result: netstatResult, connections } = collectConnections();
  const diskResult = run("df", ["-h"]);
  const { result: serviceResult, services } = collectServices();
  const { result: firewallResult, blockedIps } = collectFirewall();

  const disks = diskResult.ok ? parseDisk(diskResult.output) : [];
  const files = readWorkspaceFiles();
  const quarantineItems = getQuarantineListSync("default");

  const memoryPercent = Math.round(((totalmem() - freemem()) / totalmem()) * 100);
  const load = loadavg();
  const loadRatio = cpus().length ? load[0] / cpus().length : 0;
  const diskUsage = Math.max(0, ...disks.map((disk) => disk.usage || 0));
  const severity = severityForSystem({ memoryPercent, loadRatio, diskUsage });
  const topCpu = [...processes].sort((a, b) => b.cpu - a.cpu).slice(0, 10);
  const topMemory = [...processes].sort((a, b) => b.memory - a.memory).slice(0, 10);
  const topDisks = [...disks].sort((a, b) => b.usage - a.usage).slice(0, 10);
  const sources = buildSources({ processResult, netstatResult, diskResult, serviceResult, firewallResult, blockedIps, files, quarantineItems });
  const liveSourceCount = sources.filter((source) => source.status === "live").length;
  const reviewItems = [
    memoryPercent >= 82 ? "Memory pressure is above the review threshold." : null,
    diskUsage >= 86 ? "Disk capacity is above the review threshold." : null,
    loadRatio >= 1.4 ? "CPU load is above the review threshold." : null,
    sources.some((source) => source.status === "error") ? "One or more local telemetry sources failed." : null,
  ].filter(Boolean);

  const metrics = [
    { label: "Live sources", value: `${liveSourceCount}/${sources.length}`, tone: liveSourceCount >= 3 ? "good" : "warn", source: "source-fabric" },
    { label: "Processes", value: processes.length, tone: "info", source: "system-processes" },
    { label: "Sockets", value: connections.length, tone: connections.length ? "info" : "muted", source: "network-sockets" },
    { label: "Review items", value: reviewItems.length, tone: reviewItems.length ? "warn" : "good", source: "policy-engine" },
  ];

  const firewallLabel = IS_LINUX ? "Linux firewall rules" : "macOS firewall blocklist";
  const firewallDetail = firewallResult.ok
    ? blockedIps.length
      ? `${blockedIps.length} block entries found.`
      : `Firewall is readable, but no blocked IP entries are present.`
    : firewallResult.permissionDenied
    ? "pfctl requires elevated privileges. No blocked IPs will be shown until Aria is run with sudo or NOPASSWD is configured."
    : "No readable local firewall ruleset is configured. ARIA will not invent blocked IPs.";

  return {
    simulated: false,
    generated_at: stamp,
    host: {
      hostname: hostname(),
      platform: platform(),
      release: release(),
      uptime_seconds: Math.round(safeUptime()),
      cpu_cores: cpus().length,
      memory_total: totalmem(),
      memory_free: freemem(),
      memory_percent: memoryPercent,
      load,
    },
    status: severity === "critical" || severity === "high" ? "elevated" : "monitoring",
    threat_level: severity.toUpperCase(),
    incident_count_24h: reviewItems.length,
    blocked_ip_count: blockedIps.length,
    quarantined_file_count: quarantineItems.length,
    summary: {
      headline: reviewItems.length
        ? `${reviewItems.length} live system condition${reviewItems.length === 1 ? "" : "s"} need review.`
        : "All configured live local sources are inside normal operating thresholds.",
      severity,
      sources,
      review_items: reviewItems,
    },
    panels: {
      overview: {
        metrics,
        source_fabric: sources,
        narrative: "ARIA is reading live local telemetry. External enterprise connectors are clearly marked until configured.",
      },
      "threat-overview": {
        severity,
        risk_score: Math.min(100, Math.round(memoryPercent * 0.35 + loadRatio * 25 + diskUsage * 0.35)),
        review_items: reviewItems,
        distribution: [
          { label: "critical", count: severity === "critical" ? 1 : 0 },
          { label: "high", count: severity === "high" ? 1 : 0 },
          { label: "medium", count: severity === "medium" ? 1 : 0 },
          { label: "low", count: severity === "low" ? 1 : 0 },
        ],
      },
      "threat-vectors": {
        vectors: [
          { label: "Memory", score: memoryPercent, source: "os-memory" },
          { label: "Load", score: Math.min(100, Math.round(loadRatio * 50)), source: "os-load" },
          { label: "Disk", score: diskUsage, source: "disk-health" },
          { label: "Network", score: Math.min(100, connections.length * 3), source: "network-sockets" },
          { label: "Files", score: Math.min(100, files.length * 3), source: "workspace-files" },
          { label: "Services", score: Math.min(100, services.length * 4), source: "system-services" },
        ],
      },
      "threat-timeline": {
        events: buildLogEvents({ processCount: processes.length, connectionCount: connections.length, diskCount: disks.length, sourceCount: sources.length }),
      },
      "incident-feed": {
        items: reviewItems.map((item, index) => ({
          id: `LIVE-${index + 1}`,
          severity: severity === "low" ? "medium" : severity,
          title: item,
          status: "review",
          source: "live-policy",
          time: stamp,
        })),
      },
      "live-logs": {
        events: buildLogEvents({ processCount: processes.length, connectionCount: connections.length, diskCount: disks.length, sourceCount: sources.length }),
      },
      "system-health": {
        memory_percent: memoryPercent,
        load,
        load_ratio: loadRatio,
        disks,
        top_disks: topDisks,
        processes,
        top_cpu: topCpu,
        top_memory: topMemory,
        services,
      },
      network: {
        connections,
        counts: connections.reduce((acc, item) => {
          acc[item.state] = (acc[item.state] || 0) + 1;
          return acc;
        }, {}),
      },
      "blocked-ips": {
        items: blockedIps,
        status: firewallDetail,
        connector: {
          id: "firewall-blocklist",
          label: firewallLabel,
          status: firewallResult.ok ? "live" : "unconfigured",
          detail: firewallResult.ok ? (IS_LINUX ? "iptables/nft rules" : "pfctl -sr") : "Firewall rules unavailable or not enabled",
        },
      },
      quarantine: {
        items: quarantineItems,
        files: quarantineItems,
        provider: {
          id: "local-file-store",
          label: "Local file quarantine",
          status: "live",
          detail: "Backed by the aria-quarantine store; release/delete actions update the store immediately.",
        },
        status: quarantineItems.length
          ? `${quarantineItems.length} quarantined item${quarantineItems.length === 1 ? "" : "s"} in the local containment vault.`
          : "Local quarantine provider is active. No files are currently contained.",
      },
      "aria-center": {
        available_actions: [
          { id: "refresh_live", label: "Refresh live telemetry", risk: "low", status: "available" },
          { id: "export_evidence", label: "Export current evidence", risk: "low", status: "available" },
          { id: "run_scan", label: "Run approved local scan", risk: "medium", status: "approval_required" },
          { id: "create_case_note", label: "Create analyst case note", risk: "low", status: "available" },
        ],
      },
      actions: {
        available: [
          { id: "refresh_live", label: "Refresh live telemetry", risk: "low", status: "available" },
          { id: "export_evidence", label: "Export current evidence", risk: "low", status: "available" },
          { id: "run_scan", label: "Run approved local scan", risk: "medium", status: "approval_required" },
          { id: "create_case_note", label: "Create analyst case note", risk: "low", status: "available" },
        ],
      },
    },
    feed: [
      `${stamp} source-fabric refreshed ${liveSourceCount}/${sources.length} live sources`,
      `${stamp} host-sensor sampled ${processes.length} processes and ${connections.length} sockets`,
    ],
  };
}

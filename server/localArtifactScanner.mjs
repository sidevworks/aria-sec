// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

const DEFAULT_MAX_DEPTH = 5;
const DEFAULT_MAX_ENTRIES = 4_000;

const SUSPICIOUS_RULES = [
  {
    id: "launch-agent",
    severity: "high",
    category: "persistence",
    match: (name, fullPath) =>
      name.endsWith(".plist") &&
      /(LaunchAgents|LaunchDaemons|StartupItems)/.test(fullPath),
    detail: "Persistence-linked macOS launch item",
  },
  {
    id: "profile-config",
    severity: "medium",
    category: "profile",
    match: (name) =>
      [
        ".zshrc",
        ".zprofile",
        ".bashrc",
        ".bash_profile",
        ".profile",
        ".npmrc",
        ".gitconfig",
        ".git-credentials",
        ".netrc",
      ].includes(name),
    detail: "Hidden profile or credential-bearing shell/config file",
  },
  {
    id: "ssh-material",
    severity: "high",
    category: "credentials",
    match: (name, fullPath) =>
      /(authorized_keys|id_rsa|id_ed25519|config|known_hosts)$/.test(name) &&
      fullPath.includes(`${path.sep}.ssh${path.sep}`),
    detail: "SSH trust or key material present",
  },
  {
    id: "mobile-profile",
    severity: "high",
    category: "configuration",
    match: (name) => name.endsWith(".mobileconfig"),
    detail: "Mobile or device configuration profile detected",
  },
  {
    id: "hidden-executable",
    severity: "high",
    category: "stealth",
    match: (name, fullPath, stat) =>
      name.startsWith(".") &&
      stat.isFile() &&
      Boolean(stat.mode & 0o111) &&
      !fullPath.includes(`${path.sep}.git${path.sep}`),
    detail: "Hidden executable file detected",
  },
  {
    id: "script-dropper",
    severity: "medium",
    category: "execution",
    match: (name) =>
      [".sh", ".command", ".py", ".ps1", ".bat", ".vbs", ".js"].some((ext) => name.endsWith(ext)),
    detail: "Script-capable file that may warrant review",
  },
];

function defaultRoots() {
  const home = os.homedir();
  return [
    home,
    path.join(home, "Library", "LaunchAgents"),
    "/Library/LaunchAgents",
    "/Library/LaunchDaemons",
    "/private/etc",
  ];
}

function normalizeRoots(roots = []) {
  const source = Array.isArray(roots) && roots.length ? roots : defaultRoots();
  return [...new Set(source.map((root) => path.resolve(String(root))))];
}

function buildFinding({ rule, fullPath, stat }) {
  return {
    severity: rule.severity,
    category: rule.category,
    path: fullPath,
    detail: rule.detail,
    size: stat.size,
    modifiedAt: stat.mtime.toISOString(),
  };
}

export async function scanLocalArtifacts({
  roots = [],
  maxDepth = DEFAULT_MAX_DEPTH,
  maxEntries = DEFAULT_MAX_ENTRIES,
} = {}) {
  const queue = normalizeRoots(roots).map((root) => ({ dir: root, depth: 0 }));
  const visited = new Set();
  const findings = [];
  const errors = [];
  let scannedEntries = 0;

  while (queue.length && scannedEntries < maxEntries) {
    const current = queue.shift();
    if (!current || visited.has(current.dir)) continue;
    visited.add(current.dir);

    let entries;
    try {
      entries = await fs.readdir(current.dir, { withFileTypes: true });
    } catch (error) {
      errors.push({ path: current.dir, message: error.message });
      continue;
    }

    for (const entry of entries) {
      if (scannedEntries >= maxEntries) break;
      scannedEntries += 1;
      const fullPath = path.join(current.dir, entry.name);

      let stat;
      try {
        stat = await fs.lstat(fullPath);
      } catch (error) {
        errors.push({ path: fullPath, message: error.message });
        continue;
      }

      for (const rule of SUSPICIOUS_RULES) {
        if (rule.match(entry.name, fullPath, stat)) {
          findings.push(buildFinding({ rule, fullPath, stat }));
          break;
        }
      }

      if (entry.isDirectory() && current.depth < maxDepth && !entry.isSymbolicLink()) {
        if (entry.name === "node_modules" || entry.name === ".git") continue;
        queue.push({ dir: fullPath, depth: current.depth + 1 });
      }
    }
  }

  const severityCounts = findings.reduce((acc, finding) => {
    acc[finding.severity] = (acc[finding.severity] || 0) + 1;
    return acc;
  }, {});

  return {
    startedAt: new Date().toISOString(),
    roots: normalizeRoots(roots),
    limits: { maxDepth, maxEntries },
    scannedEntries,
    findings,
    severityCounts,
    errors,
    truncated: scannedEntries >= maxEntries,
  };
}

export function buildHostIsolationPlan({
  hostLabel = os.hostname(),
  reason = "Operator-requested emergency containment",
} = {}) {
  return {
    hostLabel,
    reason,
    stagedAt: new Date().toISOString(),
    mode: "local-host-only",
    actions: [
      "Block all inbound and outbound network traffic on this host at the OS firewall layer.",
      "Disable active remote-access sessions and revoke local operator sessions tied to the incident scope.",
      "Unmount non-essential removable or network-backed volumes from this host only.",
      "Pause high-risk userland processes pending operator review.",
      "Record every staged step in the audit ledger before execution approval.",
    ],
    constraints: [
      "No remote device wipe or destruction.",
      "No propagation over Bluetooth, Wi-Fi, or LAN.",
      "No changes are executed by this plan without a separate approved enforcement layer.",
    ],
  };
}

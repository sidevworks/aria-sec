// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { persistencePath } from "./persistenceConfig.mjs";

const DECISIONS_PATH = () => persistencePath(["ai-spm-decisions.json"], { purpose: "AI-SPM decision persistence" });
const REPORT_DIR = () => persistencePath(["reports"], { purpose: "AI-SPM report persistence" });

function now() {
  return new Date().toISOString();
}

function ensureStore() {
  const reportDir = REPORT_DIR();
  const decisionsPath = DECISIONS_PATH();
  const root = persistencePath([], { purpose: "AI-SPM case persistence" });
  if (!existsSync(root)) mkdirSync(root, { recursive: true });
  if (!existsSync(reportDir)) mkdirSync(reportDir, { recursive: true });
  if (!existsSync(decisionsPath)) writeFileSync(decisionsPath, "{}\n");
}

function readJson(path, fallback) {
  ensureStore();
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(path, value) {
  ensureStore();
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function getAiSpmDecisions() {
  return readJson(DECISIONS_PATH(), {});
}

export function applyAiSpmDecisions(findings = []) {
  const decisions = getAiSpmDecisions();
  const visible = [];
  const suppressed = [];

  for (const finding of findings) {
    const decision = decisions[finding.id];
    const enriched = decision ? { ...finding, decision } : finding;
    if (decision?.status === "ignored" || decision?.status === "resolved") {
      suppressed.push(enriched);
    } else {
      visible.push(enriched);
    }
  }

  return { visible, suppressed, decisions };
}

export function recordAiSpmDecision({ findingId, action, note = "", actor = "operator" } = {}) {
  if (!findingId) throw new Error("Missing findingId");
  if (!["ignore", "resolve", "act", "reopen"].includes(action)) throw new Error("Unsupported AI-SPM action");

  const decisions = getAiSpmDecisions();
  const status = action === "ignore"
    ? "ignored"
    : action === "resolve"
    ? "resolved"
    : action === "act"
    ? "action_required"
    : "open";

  if (action === "reopen") {
    delete decisions[findingId];
  } else {
    decisions[findingId] = {
      finding_id: findingId,
      status,
      action,
      note: String(note || "").trim(),
      actor,
      updated_at: now(),
    };
  }

  writeJson(DECISIONS_PATH(), decisions);
  return decisions[findingId] || { finding_id: findingId, status: "open", action: "reopen", updated_at: now() };
}

function sectionList(items = []) {
  return items.length ? items.map((item) => `- ${item}`).join("\n") : "- None";
}

export function buildAiSpmReport({ summary = {}, inventory = {}, findings = [], suppressed = [], narrative = {} } = {}) {
  const repositories = (inventory.connectors || []).flatMap((connector) => connector.repositories || []);
  const lines = [
    "# Aria AI-SPM Report",
    "",
    `Generated: ${now()}`,
    "",
    "## Executive Summary",
    "",
    `Posture: ${(summary.posture || "unknown").toUpperCase()}`,
    `AI assets: ${summary.asset_count || 0}`,
    `Visible findings: ${summary.finding_count || findings.length || 0}`,
    `Suppressed findings: ${summary.suppressed_count || suppressed.length || 0}`,
    `Critical: ${summary.critical_count || 0}`,
    `High: ${summary.high_count || 0}`,
    "",
    "## Connected Repositories",
    "",
    repositories.length
      ? repositories.map((repo) => `- ${repo.repo}: ${repo.files_scanned} files scanned`).join("\n")
      : "- No repositories reported",
    "",
    "## Attack Narrative",
    "",
    narrative.summary || "No attack narrative generated.",
    "",
    narrative.likely_attack_path ? `Likely path: ${narrative.likely_attack_path}` : "Likely path: unavailable",
    "",
    narrative.blast_radius || "Blast radius unavailable.",
    "",
    "## Recommended Actions",
    "",
    sectionList(narrative.recommended_actions || []),
    "",
    "## Findings",
    "",
    findings.length
      ? findings.map((finding) => [
          `### ${finding.severity?.toUpperCase() || "REVIEW"} - ${finding.title}`,
          "",
          `ID: ${finding.id}`,
          `Repository: ${finding.repo}`,
          `Asset: ${finding.asset_name}`,
          `Status: ${finding.decision?.status || "open"}`,
          "",
          finding.rationale,
          "",
          "Evidence:",
          sectionList((finding.evidence || []).map((item) => `${item.path}:${item.line || 1} - ${item.signal}`)),
          "",
          "Recommendations:",
          sectionList(finding.recommendations || []),
        ].join("\n")).join("\n\n")
      : "No visible findings.",
    "",
    "## Suppressed Findings",
    "",
    suppressed.length
      ? suppressed.map((finding) => `- ${finding.title} (${finding.decision?.status}) - ${finding.id}`).join("\n")
      : "- None",
    "",
  ];

  return `${lines.join("\n")}\n`;
}

export function saveAiSpmReport(markdown) {
  ensureStore();
  const fileName = `ai-spm-report-${Date.now()}.md`;
  const path = join(REPORT_DIR(), fileName);
  writeFileSync(path, markdown);
  return { path, fileName };
}

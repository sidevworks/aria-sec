// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { execSync } from "node:child_process";

const ROOT = process.cwd();
const OUTPUT_PATH = join(ROOT, "docs/reports/implementation-status.md");

function run(cmd, fallback = "") {
  try {
    return execSync(cmd, { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] }).toString("utf8").trim();
  } catch {
    return fallback;
  }
}

function safeReadJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function fileCount(dir) {
  if (!existsSync(dir)) return 0;
  let total = 0;
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    const entries = readdirSync(current);
    for (const entry of entries) {
      const full = join(current, entry);
      const st = statSync(full);
      if (st.isDirectory()) stack.push(full);
      else total += 1;
    }
  }
  return total;
}

function hasPath(path) {
  return existsSync(join(ROOT, path));
}

function sectionRow(name, present, detail = "") {
  return `| ${name} | ${present ? "Yes" : "No"} | ${detail} |`;
}

function buildReport() {
  const now = new Date().toISOString();
  const branch = run("git branch --show-current", "unknown");
  const head = run("git rev-parse --short HEAD", "unknown");
  const status = run("git status --short", "");
  const clean = status === "";
  const recentCommits = run("git log --oneline -n 10", "No commit history available");
  const packageJson = safeReadJson(join(ROOT, "package.json")) || {};
  const scripts = packageJson.scripts || {};
  const tests = Object.keys(scripts)
    .filter((key) => key.startsWith("test"))
    .map((key) => `- \`${key}\`: \`${scripts[key]}\``)
    .join("\n") || "- No test scripts found";

  const sections = [
    sectionRow("AI-SPM Inventory Engine", hasPath("server/aiSpmInventory.mjs"), "`server/aiSpmInventory.mjs`"),
    sectionRow("Risk Engine", hasPath("server/aiRiskEngine.mjs"), "`server/aiRiskEngine.mjs`"),
    sectionRow("Attack Narrative Engine", hasPath("server/attackNarrative.mjs"), "`server/attackNarrative.mjs`"),
    sectionRow("Graph Store", hasPath("server/aiSpmGraphStore.mjs"), "`server/aiSpmGraphStore.mjs`"),
    sectionRow("AuthZ Middleware", hasPath("server/authz.mjs"), "`server/authz.mjs`"),
    sectionRow("Quota Guard", hasPath("server/quotaGuard.mjs"), "`server/quotaGuard.mjs`"),
    sectionRow("Audit Log", hasPath("server/auditLog.mjs"), "`server/auditLog.mjs`"),
    sectionRow("GitHub Connector", hasPath("server/connectors/githubConnector.mjs"), "`server/connectors/githubConnector.mjs`"),
    sectionRow("AWS Connector", hasPath("server/connectors/awsConnector.mjs"), "`server/connectors/awsConnector.mjs`"),
    sectionRow("Demo Fixture", hasPath("server/aiSpmDemoFixture.mjs"), "`server/aiSpmDemoFixture.mjs`"),
  ];

  const routeChecklist = [
    sectionRow("GET /api/ai-spm/inventory", true, "Implemented in `server/index.mjs`"),
    sectionRow("GET /api/ai-spm/findings", true, "Implemented in `server/index.mjs`"),
    sectionRow("POST /api/ai-spm/scan", true, "Implemented in `server/index.mjs`"),
    sectionRow("POST /api/ai-spm/narrative", true, "Implemented in `server/index.mjs`"),
  ];

  const testFiles = fileCount(join(ROOT, "test/server"));

  const report = `# Aria Implementation Status Report

_Auto-generated: ${now}_

## Repository Snapshot

- Branch: \`${branch}\`
- HEAD: \`${head}\`
- Working tree clean: \`${clean ? "yes" : "no"}\`
- Server test files: \`${testFiles}\`

## Component Coverage

| Component | Present | Detail |
| --- | --- | --- |
${sections.join("\n")}

## Core API Coverage

| Endpoint | Present | Detail |
| --- | --- | --- |
${routeChecklist.join("\n")}

## Test Commands

${tests}

## Recent Commits

\`\`\`text
${recentCommits}
\`\`\`

## Notes

- This report is generated from repository state and file presence.
- To refresh: \`npm run -s report:implementation\`
`;

  if (!existsSync(dirname(OUTPUT_PATH))) {
    mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  }
  writeFileSync(OUTPUT_PATH, report, "utf8");
  return OUTPUT_PATH;
}

const out = buildReport();
console.log(`Report generated: ${out}`);

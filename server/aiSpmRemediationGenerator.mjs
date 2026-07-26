// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

/**
 * aiSpmRemediationGenerator.mjs — Phase 2.2: produce concrete artifacts, not advice.
 *
 * For a given finding + blast radius, return:
 *   • policy artifact   — JSON IAM/API policy document
 *   • code-diff artifact — unified diff patching the offending file
 *   • config artifact    — YAML/JSON config (tool allowlist, env vars, etc.)
 *
 * Each artifact is { type, language, filename, body, summary, applyMethod }.
 * The actionRunner consumes these to either open a PR (code/config) or stage
 * a file for manual application (policy).
 */

// ── Scoped-down IAM policy for AWS findings ──────────────────────────────────

function scopedIamPolicy({ finding, blastRadius }) {
  const isWildcard = (finding.code || "").includes("wildcard") || (finding.code || "").includes("iam");
  const allowedActions = isWildcard
    ? ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"]
    : ["bedrock:InvokeModel"];
  const allowedResources = blastRadius?.dataReach?.length
    ? blastRadius.dataReach.filter(s => s.startsWith("s3://")).map(s => `arn:aws:s3:::${s.replace(/^s3:\/\//, "")}`)
    : ["arn:aws:bedrock:*::foundation-model/anthropic.claude-3-sonnet-*"];

  const body = {
    Version: "2012-10-17",
    Statement: [
      {
        Sid: "ARIAScopedBedrockAccess",
        Effect: "Allow",
        Action: allowedActions,
        Resource: allowedResources.length ? allowedResources : "*",
        Condition: {
          StringEquals: { "aws:RequestedRegion": ["us-east-1", "us-west-2"] },
          DateGreaterThan: { "aws:CurrentTime": new Date().toISOString() },
        },
      },
      {
        Sid: "DenyOverbroadActions",
        Effect: "Deny",
        Action: ["iam:*", "s3:*", "secretsmanager:GetSecretValue"],
        Resource: "*",
        Condition: {
          StringNotEquals: { "aws:PrincipalTag/aria-approved": "true" },
        },
      },
    ],
  };

  return {
    type: "policy",
    language: "json",
    filename: `iam/${(finding.asset_name || "role").replace(/[^a-zA-Z0-9-]/g, "-")}-scoped.json`,
    body: JSON.stringify(body, null, 2),
    summary: `Least-privilege IAM policy replacing wildcard access — ${allowedActions.length} actions, ${allowedResources.length || 1} resource(s)`,
    applyMethod: "stage-file",
  };
}

// ── Code diff for secrets / hardcoded keys ───────────────────────────────────

function codeFixDiff({ finding, blastRadius }) {
  const repo = finding.repo || blastRadius?.repo || "unknown-repo";
  const credKey = blastRadius?.credentialReach?.[0] || "API_KEY";
  const filename = (finding.asset_id || "").includes("/")
    ? finding.asset_id.split(":").pop()
    : "src/config.js";

  // Generic safe-secret pattern diff
  const diff = `--- a/${filename}
+++ b/${filename}
@@ -1,10 +1,18 @@
-const apiKey = "${credKey === "API_KEY" ? "sk-hardcoded-redacted" : credKey + "_value"}";
-const client = new Client({ apiKey, timeout: 0 });
+// ARIA: secret moved to environment; timeout pinned; output validated
+const apiKey = process.env.${credKey};
+if (!apiKey) throw new Error("${credKey} env var is required");
+
+const client = new Client({
+  apiKey,
+  timeout: 30_000,
+  maxRetries: 2,
+});

 export async function callModel(prompt) {
-  return client.complete({ prompt });
+  const result = await client.complete({ prompt, model: "claude-sonnet-4-6" });
+  return validateOutput(result);
 }
`;

  return {
    type: "code-diff",
    language: "diff",
    filename: `${filename}.patch`,
    body: diff,
    summary: `Move ${credKey} to env var, pin model, add timeout + output validation`,
    applyMethod: "github-pr",
    repo,
    targetFile: filename,
  };
}

// ── Config change (agent tool allowlist) ─────────────────────────────────────

function toolAllowlistConfig({ finding, blastRadius }) {
  const allowedTools = (blastRadius?.toolReach || [])
    .filter(t => t.tier === "low" || t.tier === "medium")
    .map(t => t.name);

  const config = {
    agentName: finding.asset_name || "agent",
    allowedTools: allowedTools.length ? allowedTools : ["search", "retrieval"],
    blockedTools: (blastRadius?.toolReach || [])
      .filter(t => t.tier === "critical" || t.tier === "high")
      .map(t => t.name),
    requireApprovalFor: ["shell", "filesystem", "network"],
    rateLimit: { perMinute: 30, burst: 5 },
    audit: { logAllToolCalls: true, retainDays: 90 },
  };

  return {
    type: "config",
    language: "json",
    filename: `agents/${(finding.asset_name || "agent").replace(/[^a-zA-Z0-9-]/g, "-")}-allowlist.json`,
    body: JSON.stringify(config, null, 2),
    summary: `Tool allowlist: ${config.allowedTools.length} permitted, ${config.blockedTools.length} blocked, approval-gated tools defined`,
    applyMethod: "stage-file",
  };
}

// ── Bedrock guardrail config ─────────────────────────────────────────────────

function bedrockGuardrailConfig({ finding }) {
  const config = {
    name: `aria-guardrail-${(finding.asset_name || "agent").replace(/[^a-zA-Z0-9-]/g, "-")}`,
    description: "ARIA-generated guardrail for Bedrock agent",
    contentPolicy: {
      filters: [
        { type: "PROMPT_ATTACK", inputStrength: "HIGH", outputStrength: "NONE" },
        { type: "HATE",          inputStrength: "HIGH", outputStrength: "HIGH" },
        { type: "INSULTS",       inputStrength: "MEDIUM", outputStrength: "MEDIUM" },
        { type: "SEXUAL",        inputStrength: "HIGH", outputStrength: "HIGH" },
        { type: "VIOLENCE",      inputStrength: "HIGH", outputStrength: "HIGH" },
      ],
    },
    sensitiveInformationPolicy: {
      piiEntities: [
        { type: "EMAIL",       action: "ANONYMIZE" },
        { type: "PHONE",       action: "ANONYMIZE" },
        { type: "CREDIT_DEBIT_CARD_NUMBER", action: "BLOCK" },
        { type: "PASSWORD",    action: "BLOCK" },
      ],
    },
    topicPolicy: {
      topics: [{ name: "Financial Advice", definition: "Direct investment/financial advice", type: "DENY" }],
    },
  };

  return {
    type: "config",
    language: "json",
    filename: `bedrock/${config.name}.json`,
    body: JSON.stringify(config, null, 2),
    summary: "Bedrock Guardrail: prompt-injection filter HIGH, PII anonymization, blocked topics",
    applyMethod: "stage-file",
  };
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

export function generateRemediationArtifacts(finding = {}, { blastRadius = null } = {}) {
  const code = String(finding.code || "");
  const artifacts = [];

  // IAM wildcard / role issues → policy
  if (code.includes("iam") || code.includes("wildcard") || code.includes("role")) {
    artifacts.push(scopedIamPolicy({ finding, blastRadius }));
  }

  // Secrets / credentials in source → code diff
  if (code.includes("secret") || code.includes("ai-secret") || code.includes("credential")) {
    artifacts.push(codeFixDiff({ finding, blastRadius }));
  }

  // Bedrock agent → guardrail config + (if action groups) allowlist
  if (code.includes("bedrock-agent") || code.includes("agent-broad")) {
    artifacts.push(bedrockGuardrailConfig({ finding }));
    artifacts.push(toolAllowlistConfig({ finding, blastRadius }));
  }

  // Workflow issues → code diff for workflow YAML
  if (code.includes("workflow") || code.includes("github-")) {
    artifacts.push({
      type: "code-diff",
      language: "diff",
      filename: ".github/workflows/secure.yml.patch",
      body: `--- a/.github/workflows/main.yml
+++ b/.github/workflows/main.yml
@@ -1,8 +1,12 @@
 name: CI
-on: pull_request_target
+on:
+  pull_request:
+    types: [opened, synchronize]

+permissions:
+  contents: read
+  id-token: none
+
 jobs:
   build:
     runs-on: ubuntu-latest
`,
      summary: "Replace pull_request_target with pull_request, scope token permissions, disable id-token",
      applyMethod: "github-pr",
      repo: finding.repo,
      targetFile: ".github/workflows/main.yml",
    });
  }

  // Default fallback runbook if nothing specific
  if (artifacts.length === 0) {
    artifacts.push({
      type: "runbook",
      language: "markdown",
      filename: `runbooks/${finding.id || "finding"}.md`,
      body: `# Remediation Runbook: ${finding.title || "Finding"}\n\n` +
            `**Severity:** ${finding.severity}\n\n` +
            `**Rationale:** ${finding.rationale || "—"}\n\n` +
            `## Recommended Actions\n\n` +
            (finding.recommendations || []).map(r => `1. ${r}`).join("\n") +
            `\n\n## Blast Radius\n\n` +
            `- Credentials affected: ${(blastRadius?.credentialReach || []).slice(0, 5).join(", ") || "none"}\n` +
            `- Data assets affected: ${(blastRadius?.dataReach || []).slice(0, 5).join(", ") || "none"}\n` +
            `- Tool reach: ${(blastRadius?.toolReach || []).map(t => `${t.name}(${t.tier})`).join(", ") || "none"}\n` +
            `- Egress endpoints: ${(blastRadius?.egressReach || []).slice(0, 5).join(", ") || "none"}\n`,
      summary: "Manual remediation runbook with blast-radius context",
      applyMethod: "stage-file",
    });
  }

  return artifacts;
}

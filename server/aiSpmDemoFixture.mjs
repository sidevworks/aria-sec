// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

export const DEMO_SCAN_TIMESTAMP = "2026-05-01T09:00:00.000Z";

// Deterministic sample inventory for demo builds and sales/eval. Asset shapes are
// chosen to exercise the real risk rules in aiRiskEngine.mjs so the demo shows a
// realistic spread of findings (critical → medium) across the GitHub and AWS
// connectors, plus a cross-connector attack chain: an OpenAI key leaked in a repo,
// a wildcard AWS IAM role, and a Bedrock data plane it can reach.
export function buildDemoInventory() {
  return {
    generated_at: DEMO_SCAN_TIMESTAMP,
    connectors: [
      {
        id: "github",
        status: "demo",
        mode: "demo-fixture",
        scanned_at: DEMO_SCAN_TIMESTAMP,
        files_scanned: 412,
        repositories: [
          { repo: "orbital/acme-customer-assist", files_scanned: 188 },
          { repo: "orbital/finops-ai-agent", files_scanned: 137 },
          { repo: "orbital/partner-support-copilot", files_scanned: 87 },
        ],
      },
      {
        id: "aws",
        status: "demo",
        mode: "demo-fixture",
        scanned_at: DEMO_SCAN_TIMESTAMP,
        region: "us-east-1",
        counts: { bedrockAgents: 1, knowledgeBases: 1, iamRoles: 1 },
      },
    ],
    assets: [
      // ── orbital/finops-ai-agent — the chain origin ──────────────────────────
      {
        id: "asset:finops-agent-runtime",
        type: "ai_system",
        name: "FinOps Payout Review AI Agent",
        repo: "orbital/finops-ai-agent",
        files: ["workers/payout-review.mjs"],
        evidence: [{ path: "workers/payout-review.mjs", line: 9, signal: "OpenAI chat-completions client driving automated payout approvals" }],
      },
      {
        id: "asset:finops-credential",
        type: "secret",
        name: "OpenAI API key in FinOps worker",
        repo: "orbital/finops-ai-agent",
        files: ["workers/payout-review.mjs"],
        evidence: [{ path: "workers/payout-review.mjs", line: 14, signal: "OpenAI live secret pattern", snippet: "sk-live-...redacted" }],
      },

      // ── orbital/acme-customer-assist — broad-capability agent ───────────────
      {
        id: "asset:acme-support-agent",
        type: "agent",
        name: "ACME Customer Assist Copilot",
        repo: "orbital/acme-customer-assist",
        capabilities: ["filesystem", "network", "http_request"],
        files: ["src/agent/runtime.ts"],
        evidence: [{ path: "src/agent/runtime.ts", line: 22, signal: "Agent configured with filesystem, network, and HTTP tool access; no approval gate" }],
      },

      // ── orbital/partner-support-copilot — prompt artifact in source ─────────
      {
        id: "asset:support-copilot-system-prompt",
        type: "prompt",
        name: "Support copilot production system prompt",
        repo: "orbital/partner-support-copilot",
        exposure: "source-code",
        files: ["prompts/prod/system.txt"],
        evidence: [{ path: "prompts/prod/system.txt", line: 3, signal: "Production system prompt with escalation/approval behaviour committed to the repo" }],
      },

      // ── AWS us-east-1 — the cloud plane the leaked key can reach ─────────────
      {
        id: "asset:aws-bedrock-service-role",
        type: "iam_role",
        name: "bedrock-finops-execution-role",
        repo: "aws/us-east-1",
        hasWildcardAccess: true,
        hasDataPlaneCombo: true,
        wildcardServiceAccess: true,
        evidence: [{ path: "iam://role/bedrock-finops-execution-role", line: 0, signal: "Policy grants bedrock:*, secretsmanager:GetSecretValue and s3:GetObject on wildcard resources" }],
      },
      {
        id: "asset:aws-bedrock-payout-agent",
        type: "agent",
        subtype: "bedrock-agent",
        name: "Bedrock payout-assistant agent",
        repo: "aws/us-east-1",
        capabilities: ["action_groups"],
        evidence: [{ path: "bedrock://agent/payout-assistant", line: 0, signal: "Agent has action groups invoking Lambda; no Bedrock Guardrail attached" }],
      },
      {
        id: "asset:aws-bedrock-kb-contracts",
        type: "vector_store",
        subtype: "bedrock-knowledge-base",
        name: "Customer contracts knowledge base",
        repo: "aws/us-east-1",
        evidence: [{ path: "bedrock://knowledge-base/customer-contracts", line: 0, signal: "RAG knowledge base serving customer contract documents to the model" }],
      },
    ],
  };
}

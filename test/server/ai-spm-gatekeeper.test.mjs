// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { evaluateAiSpmRisks } from "../../server/aiRiskEngine.mjs";
import {
  getAiSpmGraphStorePath,
  loadAiSpmGraph,
  persistAiSpmGraphFromState,
} from "../../server/aiSpmGraphStore.mjs";
import { getAiSpmScanHistory, scanAiSpm } from "../../server/aiSpmInventory.mjs";

function withTempCwd(fn) {
  const previous = process.cwd();
  const root = mkdtempSync(join(tmpdir(), "ai-spm-gatekeeper-"));
  process.chdir(root);
  try {
    return fn(root);
  } finally {
    process.chdir(previous);
    rmSync(root, { recursive: true, force: true });
  }
}

test("perf safety: scan history stays bounded at 60 entries under repeated scans", async () => {
  await withTempCwd(async () => {
    for (let i = 0; i < 75; i++) {
      await scanAiSpm({ demo: true });
    }
    const history = getAiSpmScanHistory();
    assert.ok(Array.isArray(history.scans));
    assert.equal(history.scans.length, 60);
    assert.equal(typeof history.scans[0].generated_at, "string");
    assert.equal(typeof history.scans[history.scans.length - 1].generated_at, "string");
  });
});

test("graph defaults are non-destructive without explicit TTL/pruning options", () => {
  withTempCwd(() => {
    rmSync(getAiSpmGraphStorePath(), { force: true });

    persistAiSpmGraphFromState({
      inventory: {
        assets: [
          { id: "asset:first", type: "ai_system", name: "First System", repo: "demo/repo", evidence: [{ path: "a.js", line: 1 }] },
        ],
      },
      findings: [
        {
          id: "finding:first",
          code: "ai-secret-in-source",
          title: "First finding",
          severity: "critical",
          repo: "demo/repo",
          evidence: [{ source_asset: "asset:first" }],
        },
      ],
    });

    const initial = loadAiSpmGraph();
    const initialNodeCount = Object.keys(initial.nodes).length;
    assert.ok(initial.nodes["asset:first"]);

    persistAiSpmGraphFromState({
      inventory: {
        assets: [
          { id: "asset:second", type: "secret", name: "Second Asset", repo: "demo/repo", evidence: [{ path: "b.js", line: 2 }] },
        ],
      },
      findings: [],
    });

    const updated = loadAiSpmGraph();
    assert.ok(updated.nodes["asset:first"]);
    assert.ok(updated.nodes["asset:second"]);
    assert.ok(Object.keys(updated.nodes).length >= initialNodeCount);
  });
});

test("AWS direct-enumeration style evidence integrates into AI-SPM risk findings", () => {
  const inventory = {
    connectors: [{ id: "aws", status: "live", mode: "aws-api", region: "us-east-1", account: "111111111111" }],
    assets: [
      {
        id: "aws:iam-role:ai-workflow-role",
        type: "iam_role",
        subtype: "aws-iam-role",
        source: "aws-iam",
        name: "ai-workflow-role",
        repo: "aws/us-east-1",
        hasWildcardAccess: true,
        wildcardServiceAccess: true,
        hasDataPlaneCombo: true,
        evidence: [{ file: "iam/roles/ai-workflow-role", snippet: "Wildcard with Bedrock+S3+Secrets access" }],
      },
      {
        id: "aws:workflow:lambda-ai-pipeline",
        type: "ai_workflow",
        subtype: "aws-lambda-ai-workflow",
        source: "aws-lambda",
        name: "lambda-ai-pipeline",
        repo: "aws/us-east-1",
        capabilities: ["lambda", "bedrock", "secretsmanager"],
        evidence: [{ file: "lambda/functions/lambda-ai-pipeline", snippet: "InvokeModel + secret env vars" }],
      },
      {
        id: "aws:dataset:rag-bucket",
        type: "dataset",
        subtype: "s3-rag-bucket",
        source: "aws-s3",
        name: "rag-bucket",
        repo: "aws/us-east-1",
        evidence: [{ file: "s3/buckets/rag-bucket", snippet: "Linked to Bedrock KB" }],
      },
    ],
  };

  const findings = evaluateAiSpmRisks(inventory);
  const findingCodes = new Set(findings.map((item) => item.code));
  assert.ok(findingCodes.has("iam-ai-role-wildcard"));
  assert.ok(findingCodes.has("iam-bedrock-secrets-s3-combo"));
  assert.ok(findingCodes.has("lambda-ai-workflow-privilege-review"));
  assert.ok(findingCodes.has("rag-sensitive-s3-dataset"));

  for (const finding of findings) {
    assert.ok(Array.isArray(finding.evidence));
  }
});

// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import assert from "node:assert/strict";
import test from "node:test";
import {
  correlateSecretsManagerUsage,
  detectLambdaAiSignal,
  extractCloudTrailModelInvocations,
  mapRagBucketsFromS3Buckets,
} from "../../server/connectors/awsConnector.mjs";

test("CloudTrail model invocation extraction detects AI invocations", () => {
  const events = [
    {
      EventId: "evt-1",
      EventName: "InvokeModel",
      EventSource: "bedrock.amazonaws.com",
      EventTime: "2026-01-01T00:00:00Z",
      CloudTrailEvent: JSON.stringify({
        userIdentity: { arn: "arn:aws:iam::111:user/dev" },
        requestParameters: { modelId: "anthropic.claude-3-5-sonnet" },
        sourceIPAddress: "10.0.0.8",
      }),
    },
    {
      EventId: "evt-2",
      EventName: "PutObject",
      EventSource: "s3.amazonaws.com",
      EventTime: "2026-01-01T00:01:00Z",
      CloudTrailEvent: "{}",
    },
  ];

  const extracted = extractCloudTrailModelInvocations(events);
  assert.equal(extracted.length, 1);
  assert.equal(extracted[0].eventId, "evt-1");
  assert.equal(extracted[0].modelRef, "anthropic.claude-3-5-sonnet");
});

test("Lambda AI/API call detection identifies provider/model hints", () => {
  const lambdaFn = {
    FunctionName: "customer-support-llm-handler",
    Description: "Routes requests to OpenAI and Bedrock",
    Runtime: "nodejs22.x",
    Role: "arn:aws:iam::111:role/ai-support-lambda",
    Environment: { Variables: { OPENAI_API_KEY_SECRET_ARN: "arn:aws:secretsmanager:..." } },
  };
  const signal = detectLambdaAiSignal(lambdaFn);
  assert.equal(signal.detected, true);
  assert.ok(signal.capabilities.includes("external_model_api"));
});

test("S3 RAG/document mapping infers candidate buckets", () => {
  const buckets = [
    { Name: "company-rag-documents-prod" },
    { Name: "static-assets-cdn" },
  ];
  const mapped = mapRagBucketsFromS3Buckets(buckets, "eu-north-1");
  assert.equal(mapped.length, 1);
  assert.equal(mapped[0].type, "dataset");
  assert.equal(mapped[0].subtype, "s3-rag-bucket-inferred");
});

test("Secrets Manager usage correlation marks AI-related secrets", () => {
  const roles = [{ name: "ai-support-role" }];
  const workflows = [{ roleName: "ai-support-role" }];
  const secrets = [
    { id: "s1", name: "OPENAI_API_KEY_PROD", secretName: "OPENAI_API_KEY_PROD" },
    { id: "s2", name: "PAYMENTS_DB_PASSWORD", secretName: "PAYMENTS_DB_PASSWORD" },
  ];

  const correlated = correlateSecretsManagerUsage(roles, secrets, workflows);
  assert.equal(correlated.length, 1);
  assert.equal(correlated[0].subtype, "secretsmanager-ai-secret");
  assert.equal(correlated[0].lambdaWorkflowLinked, true);
});

// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

/**
 * AWS AI-SPM Connector
 * Discovers AI assets from AWS Bedrock, IAM roles, and related services.
 * Requires: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION (defaults to us-east-1)
 * Optionally: AWS_SESSION_TOKEN for assumed roles
 */

// Bedrock, IAM, and STS clients are loaded lazily (dynamic import) to avoid
// startup cost when AWS credentials are absent.
// CloudTrail, Lambda, S3, and Secrets Manager were already dynamically imported.
import { getStoredAwsCredentials, getAwsConnectorStatus } from "./awsAuthStore.mjs";

function getRegion() {
  // Env var wins if explicitly set externally
  if (process.env.AWS_REGION && process.env.AWS_REGION !== "us-east-1") {
    return process.env.AWS_REGION;
  }
  // Check stored region (set by UI connect flow — most reliable source)
  const stored = getAwsConnectorStatus()?.connector;
  if (stored?.region) return stored.region;
  return process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-east-1";
}

function makeCredentials() {
  // 1. Env vars (set externally or injected by awsAuthStore after connect)
  const key = process.env.AWS_ACCESS_KEY_ID;
  const secret = process.env.AWS_SECRET_ACCESS_KEY;
  const session = process.env.AWS_SESSION_TOKEN;
  if (key && secret) {
    return session
      ? { accessKeyId: key, secretAccessKey: secret, sessionToken: session }
      : { accessKeyId: key, secretAccessKey: secret };
  }
  // 2. Stored credentials (from awsAuthStore — set via UI connect flow)
  const stored = getStoredAwsCredentials();
  return stored ? { accessKeyId: stored.accessKeyId, secretAccessKey: stored.secretAccessKey, sessionToken: stored.sessionToken } : undefined;
}

function clientConfig(regionOverride) {
  const region = regionOverride || getRegion();
  const creds = makeCredentials();
  return creds ? { region, credentials: creds } : { region };
}

// AWS-008: resolve scan regions from env var or default list
function getScanRegions() {
  const envRegions = process.env.ARIA_AWS_SCAN_REGIONS;
  if (envRegions) {
    return envRegions.split(",").map((r) => r.trim()).filter(Boolean);
  }
  return ["us-east-1", "us-west-2", "eu-west-1"];
}

// AWS-003/AI-005: assume a role if credential has role_arn configured
async function resolveCredentialsWithRole(storedCred) {
  if (!storedCred?.role_arn) return null; // no role to assume
  try {
    const { STSClient, AssumeRoleCommand } = await import("@aws-sdk/client-sts");
    const baseCfg = clientConfig();
    const sts = new STSClient(baseCfg);
    const result = await sts.send(new AssumeRoleCommand({
      RoleArn: storedCred.role_arn,
      RoleSessionName: "aria-scan",
    }));
    const creds = result.Credentials;
    return {
      accessKeyId: creds.AccessKeyId,
      secretAccessKey: creds.SecretAccessKey,
      sessionToken: creds.SessionToken,
    };
  } catch (err) {
    console.warn("[AWS] STS AssumeRole failed:", err.message);
    return null;
  }
}

function clientConfigWithCreds(region, temporaryCreds) {
  if (temporaryCreds) {
    return { region, credentials: temporaryCreds };
  }
  return clientConfig(region);
}

// ─── Asset builder helpers ────────────────────────────────────────────────────

let _assetSeq = 0;
function assetId(type, name) {
  return `aws:${type}:${(name || `item${++_assetSeq}`).replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 64)}`;
}

function now() {
  return new Date().toISOString();
}

// AWS-009: extended CloudTrail lookback to 90 days
const CLOUDTRAIL_LOOKBACK_DAYS = 90;
const CLOUDTRAIL_MAX_EVENTS = 30;
const LAMBDA_MAX_FUNCTIONS = 60;
const S3_MAX_BUCKETS = 80;
const SECRETS_MAX_ITEMS = 80;

const AI_PROVIDER_HINT = /\b(openai|anthropic|claude|gemini|bedrock|llm|model|invoke)\b/i;
const RAG_BUCKET_HINT = /\b(rag|doc|docs|knowledge|kb|vector|embedding|llm)\b/i;
const AI_SECRET_HINT = /(openai|anthropic|gemini|bedrock|ai|llm|model)/i;

export function detectLambdaAiSignal(fn = {}) {
  const env = fn.Environment?.Variables || {};
  const envKeys = Object.keys(env);
  const evidence = [];
  const textBlob = [
    fn.FunctionName || "",
    fn.Description || "",
    fn.Runtime || "",
    ...envKeys,
    ...(fn.Layers || []).map((l) => l.Arn || ""),
  ].join(" ");

  if (AI_PROVIDER_HINT.test(textBlob)) {
    evidence.push(`AI provider/model hints in function metadata (${fn.FunctionName || "lambda"})`);
  }
  if (envKeys.some((k) => /\b(OPENAI|ANTHROPIC|GEMINI|BEDROCK|MODEL|LLM)\b/i.test(k))) {
    evidence.push("AI-related environment variables detected");
  }
  return {
    detected: evidence.length > 0,
    evidence,
    capabilities: [
      /\b(bedrock)\b/i.test(textBlob) ? "bedrock_api" : null,
      /\b(openai|anthropic|gemini)\b/i.test(textBlob) ? "external_model_api" : null,
    ].filter(Boolean),
  };
}

export function extractCloudTrailModelInvocations(events = []) {
  const invocations = [];
  for (const event of events) {
    const raw = event.CloudTrailEvent || "";
    const eventName = String(event.EventName || "");
    const source = String(event.EventSource || "");
    if (!/bedrock|sagemaker/i.test(source) && !/invoke|model/i.test(eventName)) continue;
    if (!/InvokeModel|InvokeAgent|Converse|InvokeEndpoint/i.test(eventName)) continue;
    let payload = {};
    try {
      payload = raw ? JSON.parse(raw) : {};
    } catch {
      payload = {};
    }
    invocations.push({
      eventId: event.EventId,
      eventName,
      eventSource: source,
      eventTime: event.EventTime,
      principal: payload?.userIdentity?.arn || payload?.userIdentity?.principalId || "unknown",
      modelRef: payload?.requestParameters?.modelId || payload?.requestParameters?.agentId || "unknown",
      sourceIp: payload?.sourceIPAddress || "unknown",
    });
  }
  return invocations;
}

export function mapRagBucketsFromS3Buckets(buckets = [], region) {
  return buckets
    .filter((b) => RAG_BUCKET_HINT.test(String(b.Name || "")))
    .slice(0, S3_MAX_BUCKETS)
    .map((b) => ({
      id: assetId("dataset-bucket", b.Name),
      name: `Potential RAG/document bucket ${b.Name}`,
      type: "dataset",
      subtype: "s3-rag-bucket-inferred",
      source: "aws-s3",
      repo: `aws/${region}`,
      provider: "AWS S3",
      bucketName: b.Name,
      capabilities: ["document_store", "rag_source"],
      evidence: [{ file: `s3/buckets/${b.Name}`, snippet: "Bucket name pattern suggests RAG/document source usage" }],
      sensitivity: "unknown",
      discovered_at: now(),
    }));
}

export function correlateSecretsManagerUsage(roles = [], secrets = [], lambdaWorkflows = []) {
  const roleNames = new Set(roles.map((r) => r.name).filter(Boolean));
  const lambdaRoles = new Set(lambdaWorkflows.map((wf) => wf.roleName).filter(Boolean));
  return secrets
    .filter((s) => AI_SECRET_HINT.test(String(s.name || s.secretName || "")))
    .map((s) => {
      const roleMatchCount = [...roleNames].filter((r) => AI_SECRET_HINT.test(r)).length;
      const lambdaLinked = [...lambdaRoles].some((r) => AI_SECRET_HINT.test(r));
      return {
        ...s,
        subtype: "secretsmanager-ai-secret",
        correlatedRoleHints: roleMatchCount,
        lambdaWorkflowLinked: lambdaLinked,
      };
    });
}

// ─── Bedrock foundation models ────────────────────────────────────────────────

async function scanBedrockModels(client, region) {
  const { ListFoundationModelsCommand } = await import("@aws-sdk/client-bedrock");
  const assets = [];
  try {
    const resp = await client.send(new ListFoundationModelsCommand({ byOutputModality: "TEXT" }));
    const models = resp.modelSummaries || [];
    for (const m of models) {
      assets.push({
        id: assetId("model", m.modelId),
        name: m.modelName || m.modelId,
        type: "ai_model",
        subtype: "bedrock-foundation-model",
        source: "aws-bedrock",
        repo: `aws/${region}`,
        provider: m.providerName || "AWS",
        modelId: m.modelId,
        status: m.modelLifecycle?.status || "ACTIVE",
        capabilities: (m.outputModalities || []).map(s => s.toLowerCase()),
        evidence: [
          { file: `bedrock/foundation-models/${m.modelId}`, snippet: `Provider: ${m.providerName} | Status: ${m.modelLifecycle?.status}` },
        ],
        sensitivity: "sensitive",
        discovered_at: now(),
      });
    }
  } catch (err) {
    console.warn("[AWS] Bedrock list-foundation-models failed:", err.message);
  }
  return assets;
}

// ─── Bedrock Agents ───────────────────────────────────────────────────────────

async function scanBedrockAgents(agentClient, region) {
  const { ListAgentsCommand, GetAgentCommand } = await import("@aws-sdk/client-bedrock-agent");
  const assets = [];
  try {
    const resp = await agentClient.send(new ListAgentsCommand({}));
    const agents = resp.agentSummaries || [];
    for (const a of agents) {
      let details = null;
      try {
        const detail = await agentClient.send(new GetAgentCommand({ agentId: a.agentId }));
        details = detail.agent;
      } catch {
        // detail fetch optional
      }

      const capabilities = ["tool_use"];
      if (details?.actionGroups?.length) capabilities.push("action_groups");
      if (details?.knowledgeBases?.length) capabilities.push("knowledge_base");

      assets.push({
        id: assetId("agent", a.agentId),
        name: a.agentName || a.agentId,
        type: "agent",
        subtype: "bedrock-agent",
        source: "aws-bedrock",
        repo: `aws/${region}`,
        provider: "AWS Bedrock",
        agentId: a.agentId,
        status: a.agentStatus,
        capabilities,
        foundationModel: details?.foundationModel,
        iamRoleArn: details?.agentResourceRoleArn,
        evidence: [
          { file: `bedrock/agents/${a.agentId}`, snippet: `Model: ${details?.foundationModel || "unknown"} | Status: ${a.agentStatus}` },
        ],
        sensitivity: "sensitive",
        discovered_at: now(),
      });
    }
  } catch (err) {
    console.warn("[AWS] Bedrock list-agents failed:", err.name, err.message);
  }
  return assets;
}

// ─── Bedrock Knowledge Bases ──────────────────────────────────────────────────

async function scanKnowledgeBases(agentClient, region) {
  const { ListKnowledgeBasesCommand } = await import("@aws-sdk/client-bedrock-agent");
  const assets = [];
  try {
    const resp = await agentClient.send(new ListKnowledgeBasesCommand({}));
    const kbs = resp.knowledgeBaseSummaries || [];
    for (const kb of kbs) {
      assets.push({
        id: assetId("kb", kb.knowledgeBaseId),
        name: kb.name || kb.knowledgeBaseId,
        type: "vector_store",
        subtype: "bedrock-knowledge-base",
        source: "aws-bedrock",
        repo: `aws/${region}`,
        provider: "AWS Bedrock",
        kbId: kb.knowledgeBaseId,
        status: kb.status,
        evidence: [
          { file: `bedrock/knowledge-bases/${kb.knowledgeBaseId}`, snippet: `Status: ${kb.status}` },
        ],
        sensitivity: "sensitive",
        discovered_at: now(),
      });
    }
  } catch (err) {
    console.warn("[AWS] Bedrock list-knowledge-bases failed:", err.message);
  }
  return assets;
}

// ─── SageMaker endpoints and models (AWS-004) ─────────────────────────────────

async function scanSageMaker(cfg, region) {
  const assets = [];
  try {
    const smMod = await import("@aws-sdk/client-sagemaker").catch(() => null);
    if (!smMod) {
      console.warn("[AWS] @aws-sdk/client-sagemaker not installed — skipping SageMaker scan");
      return assets;
    }
    const smClient = new smMod.SageMakerClient(cfg);

    // List endpoints
    try {
      const resp = await smClient.send(new smMod.ListEndpointsCommand({ MaxResults: 50 }));
      for (const ep of (resp.Endpoints || [])) {
        assets.push({
          id: assetId("sagemaker-endpoint", ep.EndpointName),
          name: ep.EndpointName,
          type: "ai_model",
          subtype: "sagemaker-endpoint",
          source: "aws-sagemaker",
          repo: `aws/${region}`,
          provider: "AWS SageMaker",
          status: ep.EndpointStatus,
          capabilities: ["model-serving"],
          evidence: [{ file: `sagemaker/endpoints/${ep.EndpointName}`, snippet: `Status: ${ep.EndpointStatus}` }],
          sensitivity: "sensitive",
          discovered_at: now(),
        });
      }
    } catch (err) {
      console.warn("[AWS] SageMaker list-endpoints failed:", err.message);
    }

    // List models
    try {
      const resp = await smClient.send(new smMod.ListModelsCommand({ MaxResults: 50 }));
      for (const m of (resp.Models || [])) {
        assets.push({
          id: assetId("sagemaker-model", m.ModelName),
          name: m.ModelName,
          type: "ai_model",
          subtype: "sagemaker-model",
          source: "aws-sagemaker",
          repo: `aws/${region}`,
          provider: "AWS SageMaker",
          capabilities: ["inference"],
          evidence: [{ file: `sagemaker/models/${m.ModelName}`, snippet: `Created: ${m.CreationTime}` }],
          sensitivity: "sensitive",
          discovered_at: now(),
        });
      }
    } catch (err) {
      console.warn("[AWS] SageMaker list-models failed:", err.message);
    }
  } catch (err) {
    console.warn("[AWS] SageMaker scan failed:", err.message);
  }
  return assets;
}

// ─── IAM roles with AI/Bedrock access ────────────────────────────────────────

const AI_POLICY_PATTERNS = [
  /bedrock/i,
  /sagemaker/i,
  /comprehend/i,
  /rekognition/i,
  /lex/i,
  /transcribe/i,
  /polly/i,
];

function policyTouchesAi(policyDoc) {
  try {
    const text = typeof policyDoc === "string" ? policyDoc : JSON.stringify(policyDoc);
    return AI_POLICY_PATTERNS.some((p) => p.test(text));
  } catch {
    return false;
  }
}

function hasWildcardActions(policyDoc) {
  try {
    const text = typeof policyDoc === "string" ? policyDoc : JSON.stringify(policyDoc);
    const doc = JSON.parse(typeof policyDoc === "string" ? policyDoc : JSON.stringify(policyDoc));
    const stmts = doc?.Statement || [];
    return stmts.some((s) => {
      const actions = [].concat(s.Action || []);
      return actions.some((a) => a === "*" || a.endsWith(":*"));
    });
  } catch {
    return false;
  }
}

async function scanIamRoles(iamClient, region) {
  const { ListRolesCommand, ListRolePoliciesCommand, GetRolePolicyCommand, ListAttachedRolePoliciesCommand } = await import("@aws-sdk/client-iam");
  const assets = [];
  try {
    let marker;
    let pageCount = 0;
    const MAX_PAGES = 5;

    do {
      const resp = await iamClient.send(new ListRolesCommand({ Marker: marker, MaxItems: 100 }));
      const roles = resp.Roles || [];

      for (const role of roles) {
        // Quick filter: only inspect roles whose assume-role policy mentions AI services
        // or whose name hints at AI workloads
        const nameHint = AI_POLICY_PATTERNS.some((p) => p.test(role.RoleName));
        const trustHint = policyTouchesAi(decodeURIComponent(role.AssumeRolePolicyDocument || ""));
        if (!nameHint && !trustHint) continue;

        // Fetch inline policies
        let hasWildcard = false;
        let policies = [];
        try {
          const inlineResp = await iamClient.send(new ListRolePoliciesCommand({ RoleName: role.RoleName }));
          policies = inlineResp.PolicyNames || [];
          for (const pName of policies.slice(0, 3)) {
            const pResp = await iamClient.send(new GetRolePolicyCommand({ RoleName: role.RoleName, PolicyName: pName }));
            const doc = decodeURIComponent(pResp.PolicyDocument || "{}");
            if (hasWildcardActions(doc)) { hasWildcard = true; break; }
          }
        } catch {
          // non-fatal
        }

        // Attached managed policies
        let attachedPolicies = [];
        try {
          const attResp = await iamClient.send(new ListAttachedRolePoliciesCommand({ RoleName: role.RoleName }));
          attachedPolicies = (attResp.AttachedPolicies || []).map((p) => p.PolicyName);
          if (attachedPolicies.some((n) => /AdministratorAccess|FullAccess/i.test(n))) {
            hasWildcard = true;
          }
        } catch {
          // non-fatal
        }

        assets.push({
          id: assetId("iam-role", role.RoleName),
          name: role.RoleName,
          type: "iam_role",
          subtype: "aws-iam-role",
          source: "aws-iam",
          repo: `aws/${region}`,
          provider: "AWS IAM",
          arn: role.Arn,
          hasWildcardAccess: hasWildcard,
          inlinePolicies: policies,
          attachedPolicies,
          evidence: [
            { file: `iam/roles/${role.RoleName}`, snippet: `ARN: ${role.Arn}${hasWildcard ? " | ⚠ wildcard actions detected" : ""}` },
          ],
          sensitivity: hasWildcard ? "sensitive" : "normal",
          discovered_at: now(),
        });
      }

      marker = resp.IsTruncated ? resp.Marker : undefined;
      pageCount++;
    } while (marker && pageCount < MAX_PAGES);
  } catch (err) {
    console.warn("[AWS] IAM list-roles failed:", err.message);
  }
  return assets;
}

async function scanCloudTrailInvocations(cfg, region) {
  const assets = [];
  try {
    const cloudtrailMod = await import("@aws-sdk/client-cloudtrail");
    const cloudTrail = new cloudtrailMod.CloudTrailClient(cfg);
    const startTime = new Date(Date.now() - CLOUDTRAIL_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
    const resp = await cloudTrail.send(new cloudtrailMod.LookupEventsCommand({
      MaxResults: CLOUDTRAIL_MAX_EVENTS,
      StartTime: startTime,
    }));
    const events = extractCloudTrailModelInvocations(resp.Events || []);
    for (const e of events.slice(0, CLOUDTRAIL_MAX_EVENTS)) {
      assets.push({
        id: assetId("event", e.eventId || `${e.eventName}-${e.eventTime}`),
        name: `Model invocation event ${e.eventName}`,
        type: "event",
        subtype: "cloudtrail-model-invocation",
        source: "aws-cloudtrail",
        repo: `aws/${region}`,
        provider: "AWS CloudTrail",
        eventName: e.eventName,
        eventTime: e.eventTime,
        principal: e.principal,
        modelRef: e.modelRef,
        sourceIp: e.sourceIp,
        evidence: [
          { file: `cloudtrail/events/${e.eventId}`, snippet: `${e.eventName} by ${e.principal} model=${e.modelRef}` },
        ],
        sensitivity: "sensitive",
        discovered_at: now(),
      });
    }
  } catch (err) {
    console.warn("[AWS] CloudTrail lookup-events failed:", err.message);
  }
  return assets;
}

async function scanLambdaAiWorkflows(cfg, region) {
  const assets = [];
  try {
    const lambdaMod = await import("@aws-sdk/client-lambda");
    const lambdaClient = new lambdaMod.LambdaClient(cfg);
    const resp = await lambdaClient.send(new lambdaMod.ListFunctionsCommand({ MaxItems: LAMBDA_MAX_FUNCTIONS }));
    for (const fn of (resp.Functions || []).slice(0, LAMBDA_MAX_FUNCTIONS)) {
      const signal = detectLambdaAiSignal(fn);
      if (!signal.detected) continue;
      assets.push({
        id: assetId("workflow", fn.FunctionArn || fn.FunctionName),
        name: `Lambda AI workflow ${fn.FunctionName}`,
        type: "ai_workflow",
        subtype: "aws-lambda-ai-workflow",
        source: "aws-lambda",
        repo: `aws/${region}`,
        provider: "AWS Lambda",
        arn: fn.FunctionArn,
        roleArn: fn.Role,
        roleName: String(fn.Role || "").split("/").pop() || undefined,
        runtime: fn.Runtime,
        capabilities: ["lambda", ...signal.capabilities],
        evidence: [
          { file: `lambda/functions/${fn.FunctionName}`, snippet: signal.evidence.join(" | ") || "AI signal detected in Lambda metadata" },
        ],
        sensitivity: "sensitive",
        discovered_at: now(),
      });
    }
  } catch (err) {
    console.warn("[AWS] Lambda list-functions failed:", err.message);
  }
  return assets;
}

async function scanS3RagBuckets(cfg, region) {
  try {
    const s3Mod = await import("@aws-sdk/client-s3");
    const s3Client = new s3Mod.S3Client({ ...cfg, region: "us-east-1" });
    const resp = await s3Client.send(new s3Mod.ListBucketsCommand({}));
    return mapRagBucketsFromS3Buckets(resp.Buckets || [], region);
  } catch (err) {
    console.warn("[AWS] S3 list-buckets failed:", err.message);
    return [];
  }
}

async function scanSecretsManager(cfg, region) {
  const assets = [];
  try {
    const smMod = await import("@aws-sdk/client-secrets-manager");
    const smClient = new smMod.SecretsManagerClient(cfg);
    const resp = await smClient.send(new smMod.ListSecretsCommand({ MaxResults: SECRETS_MAX_ITEMS }));
    const secrets = (resp.SecretList || []).slice(0, SECRETS_MAX_ITEMS);
    for (const sec of secrets) {
      assets.push({
        id: assetId("secret-ref", sec.ARN || sec.Name),
        name: sec.Name || sec.ARN,
        type: "secret_ref",
        subtype: "secretsmanager-secret",
        source: "aws-secretsmanager",
        repo: `aws/${region}`,
        provider: "AWS Secrets Manager",
        secretArn: sec.ARN,
        secretName: sec.Name,
        evidence: [
          { file: `secretsmanager/secrets/${sec.Name || sec.ARN}`, snippet: "Secret discovered in account metadata" },
        ],
        sensitivity: "sensitive",
        discovered_at: now(),
      });
    }
  } catch (err) {
    console.warn("[AWS] Secrets Manager list-secrets failed:", err.message);
  }
  return assets;
}

// ─── Identity check ───────────────────────────────────────────────────────────

async function getCallerIdentity() {
  try {
    const { STSClient, GetCallerIdentityCommand } = await import("@aws-sdk/client-sts");
    const sts = new STSClient(clientConfig());
    const resp = await sts.send(new GetCallerIdentityCommand({}));
    return { account: resp.Account, arn: resp.Arn, userId: resp.UserId };
  } catch (err) {
    return null;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function awsCredentialsPresent() {
  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) return true;
  const stored = getStoredAwsCredentials();
  return Boolean(stored?.accessKeyId && stored?.secretAccessKey);
}

export async function checkAwsConnectorStatus() {
  if (!awsCredentialsPresent()) {
    return { status: "not_configured", message: "No AWS credentials configured. Connect via the AI-SPM panel." };
  }
  const identity = await getCallerIdentity();
  if (!identity) {
    return { status: "error", message: "Credentials present but STS GetCallerIdentity failed — check key permissions or network access." };
  }
  return {
    status: "live",
    account: identity.account,
    arn: identity.arn,
    region: getRegion(),
  };
}

// ─── Single-region scan helper ────────────────────────────────────────────────

async function scanRegion(region, temporaryCreds) {
  const cfg = clientConfigWithCreds(region, temporaryCreds);
  console.log(`[AWS] Scanning region: ${region}`);

  const [{ BedrockClient }, { BedrockAgentClient }, { IAMClient }] = await Promise.all([
    import("@aws-sdk/client-bedrock"),
    import("@aws-sdk/client-bedrock-agent"),
    import("@aws-sdk/client-iam"),
  ]);
  const bedrockClient = new BedrockClient(cfg);
  const agentClient = new BedrockAgentClient(cfg);
  // IAM is a global service — always us-east-1
  const iamCfg = clientConfigWithCreds("us-east-1", temporaryCreds);
  const iamClient = new IAMClient(iamCfg);

  const [models, agents, knowledgeBases, sageMakerAssets, iamRoles, cloudTrailEvents, lambdaWorkflows, s3RagBuckets, secretRefs] = await Promise.all([
    scanBedrockModels(bedrockClient, region),
    scanBedrockAgents(agentClient, region),
    scanKnowledgeBases(agentClient, region),
    scanSageMaker(cfg, region),
    scanIamRoles(iamClient, region),
    scanCloudTrailInvocations(cfg, region),
    scanLambdaAiWorkflows(cfg, region),
    scanS3RagBuckets(cfg, region),
    scanSecretsManager(cfg, region),
  ]);

  const correlatedSecrets = correlateSecretsManagerUsage(iamRoles, secretRefs, lambdaWorkflows);
  return {
    region,
    models,
    agents,
    knowledgeBases,
    sageMakerAssets,
    iamRoles,
    cloudTrailEvents,
    lambdaWorkflows,
    s3RagBuckets,
    correlatedSecrets,
  };
}

export async function discoverAwsAiAssets(options = {}) {
  if (!awsCredentialsPresent()) {
    return {
      connector: "aws",
      mode: "not_configured",
      scanned_at: now(),
      region: getRegion(),
      assets: [],
      message: "AWS credentials not configured. Connect via the AI-SPM panel.",
    };
  }

  // AWS-003/AI-005: assume role if configured
  const storedCred = getStoredAwsCredentials();
  const temporaryCreds = await resolveCredentialsWithRole(storedCred);

  // AWS-008: multi-region scanning
  const regions = options.regions || getScanRegions();
  const identity = await getCallerIdentity();

  const regionResults = await Promise.all(regions.map((r) => scanRegion(r, temporaryCreds)));

  // Aggregate across regions — deduplicate IAM roles (global) by id
  const allAssets = [];
  const seenIamIds = new Set();
  for (const r of regionResults) {
    allAssets.push(...r.models, ...r.agents, ...r.knowledgeBases, ...r.sageMakerAssets);
    for (const role of r.iamRoles) {
      if (!seenIamIds.has(role.id)) {
        seenIamIds.add(role.id);
        allAssets.push(role);
      }
    }
    allAssets.push(...r.cloudTrailEvents, ...r.lambdaWorkflows, ...r.s3RagBuckets, ...r.correlatedSecrets);
  }

  const counts = regionResults.reduce((acc, r) => ({
    models: (acc.models || 0) + r.models.length,
    agents: (acc.agents || 0) + r.agents.length,
    knowledgeBases: (acc.knowledgeBases || 0) + r.knowledgeBases.length,
    sageMakerAssets: (acc.sageMakerAssets || 0) + r.sageMakerAssets.length,
    iamRoles: seenIamIds.size,
    cloudTrailEvents: (acc.cloudTrailEvents || 0) + r.cloudTrailEvents.length,
    lambdaWorkflows: (acc.lambdaWorkflows || 0) + r.lambdaWorkflows.length,
    ragBuckets: (acc.ragBuckets || 0) + r.s3RagBuckets.length,
    secretRefs: (acc.secretRefs || 0) + r.correlatedSecrets.length,
  }), {});

  return {
    connector: "aws",
    mode: "aws-api",
    scanned_at: now(),
    regions,
    region: regions[0],
    account: identity?.account,
    assets: allAssets,
    counts,
  };
}

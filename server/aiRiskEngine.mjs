// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

const SEVERITY_SCORE = {
  critical: 95,
  high: 78,
  medium: 52,
  low: 24,
};

function findingId(asset, code) {
  return `ai-spm:${code}:${asset.id}`.replace(/[^a-zA-Z0-9:._-]/g, "-");
}

function finding({ asset, code, severity, title, rationale, attack_path = [], recommendations = [] }) {
  return {
    id: findingId(asset, code),
    code,
    severity,
    score: SEVERITY_SCORE[severity] || 0,
    title,
    asset_id: asset.id,
    asset_name: asset.name,
    asset_type: asset.type,
    repo: asset.repo,
    evidence: asset.evidence || [],
    rationale,
    attack_path,
    recommendations,
  };
}

export function evaluateAiSpmRisks(inventory = {}) {
  const assets = inventory.assets || [];
  const findings = [];
  const secretsByRepo = new Map();
  const systemsByRepo = new Map();
  const vectorsByRepo = new Map();
  const aiSystemsByRepo = new Map();
  const workflowsByRepo = new Map();
  const wildcardRoles = [];

  for (const asset of assets) {
    const map = asset.type === "secret"
      ? secretsByRepo
      : asset.type === "ai_system" || asset.type === "agent"
      ? systemsByRepo
      : asset.type === "vector_store"
      ? vectorsByRepo
      : asset.type === "ci_workflow"
      ? workflowsByRepo
      : null;
    if (!map) continue;
    map.set(asset.repo, [...(map.get(asset.repo) || []), asset]);
    if (asset.type === "ai_system") {
      aiSystemsByRepo.set(asset.repo, [...(aiSystemsByRepo.get(asset.repo) || []), asset]);
    }
    if (asset.type === "iam_role" && asset.hasWildcardAccess) {
      wildcardRoles.push(asset);
    }
  }

  for (const asset of assets) {
    if (asset.type === "secret") {
      findings.push(finding({
        asset,
        code: "ai-secret-in-source",
        severity: "critical",
        title: "AI or cloud credential material appears in source",
        rationale: "Credential-like material in code can give an attacker direct model, cloud, or data-plane access.",
        attack_path: ["source disclosure", "credential theft", "model or cloud API access"],
        recommendations: [
          "Revoke and rotate the credential",
          "Move secrets to a managed vault",
          "Add pre-commit and CI secrets scanning",
        ],
      }));
    }

    if (asset.type === "agent" && (asset.capabilities || []).length >= 2) {
      findings.push(finding({
        asset,
        code: "agent-broad-tool-surface",
        severity: asset.sensitivity === "sensitive" ? "critical" : "high",
        title: "Agent has broad tool-use capability",
        rationale: "Agents with filesystem, shell, browser, or network tools need runtime policy controls and audit logging.",
        attack_path: ["prompt injection", "tool misuse", "unauthorized file or network action"],
        recommendations: [
          "Require human approval for shell and filesystem actions",
          "Sandbox the agent runtime",
          "Log prompts, tool calls, files touched, and network destinations",
        ],
      }));
    }

    if (asset.type === "prompt" && asset.exposure === "source-code") {
      findings.push(finding({
        asset,
        code: "prompt-artifact-in-repository",
        severity: "medium",
        title: "Prompt artifact is stored in repository code",
        rationale: "Prompt files are operational policy for AI systems and should be reviewed, versioned, and tested like detection logic.",
        attack_path: ["prompt disclosure", "guardrail bypass research", "targeted prompt injection"],
        recommendations: [
          "Add prompt ownership and review metadata",
          "Test prompts against injection and data leakage cases",
          "Keep sensitive system instructions out of public repositories",
        ],
      }));
    }

    if (asset.type === "vector_store" && asset.sensitivity === "sensitive") {
      findings.push(finding({
        asset,
        code: "sensitive-rag-data-plane",
        severity: "high",
        title: "Vector store appears connected to sensitive data",
        rationale: "RAG systems can leak regulated or confidential source material if retrieval and output policies are weak.",
        attack_path: ["indirect prompt injection", "sensitive retrieval", "model output leakage"],
        recommendations: [
          "Add document-level access checks before retrieval",
          "Filter model outputs for sensitive data",
          "Log retrieved document IDs for every answer",
        ],
      }));
    }

    if (asset.type === "ci_workflow" && asset.subtype === "ai-provider-key-usage") {
      findings.push(finding({
        asset,
        code: "github-workflow-ai-key-usage",
        severity: "medium",
        title: "GitHub workflow references AI provider key material",
        rationale: "AI provider credentials in CI/CD pipelines widen exposure through logs, artifacts, and pull request execution paths.",
        attack_path: ["workflow trigger", "secret material exposure", "unauthorized model access"],
        recommendations: [
          "Scope secret use to trusted branches and protected environments",
          "Mask and restrict all AI provider secrets in workflow logs",
          "Use short-lived credentials where possible",
        ],
      }));
    }

    if (asset.type === "ci_workflow" && asset.subtype === "dangerous-secret-handling") {
      findings.push(finding({
        asset,
        code: "github-workflow-secret-handling",
        severity: "high",
        title: "Workflow contains risky secret handling patterns",
        rationale: "Printing environments, echoing secret contexts, or artifacting broad runtime output can leak credentials from CI.",
        attack_path: ["workflow execution", "secret leak to logs/artifacts", "credential reuse"],
        recommendations: [
          "Remove secret-bearing env dumps and direct secret echo commands",
          "Sanitize artifact contents and restrict upload scopes",
          "Add CI linting rules for dangerous secret handling patterns",
        ],
      }));
    }

    if (asset.type === "ci_workflow" && asset.subtype === "untrusted-pr-execution") {
      findings.push(finding({
        asset,
        code: "github-untrusted-pr-execution",
        severity: "critical",
        title: "Workflow may execute privileged steps for untrusted PR context",
        rationale: "Using pull_request_target with checkout/run steps can run attacker-controlled code with elevated token or secret access.",
        attack_path: ["attacker PR", "privileged workflow run", "token or secret exfiltration"],
        recommendations: [
          "Avoid running untrusted PR code under pull_request_target",
          "Split trusted and untrusted workflows with explicit permission boundaries",
          "Use read-only tokens and never expose deployment secrets to PR jobs",
        ],
      }));
    }

    if (asset.type === "ci_workflow" && asset.subtype === "token-permission-overreach") {
      findings.push(finding({
        asset,
        code: "github-token-permission-overreach",
        severity: "high",
        title: "Workflow token permissions appear broader than required",
        rationale: "Over-broad GITHUB_TOKEN scopes increase repository blast radius if workflow execution is compromised.",
        attack_path: ["workflow compromise", "repo write abuse", "supply-chain tampering"],
        recommendations: [
          "Define minimal permissions at workflow and job level",
          "Default to read-only and grant explicit writes per job",
          "Review and deny unnecessary actions, contents, and id-token writes",
        ],
      }));
    }

    if (asset.type === "ci_workflow" && asset.subtype === "oidc-pr-target-combo") {
      findings.push(finding({
        asset,
        code: "github-oidc-pr-target-combo",
        severity: "critical",
        title: "Workflow combines pull_request_target with OIDC token minting",
        rationale: "Untrusted PR event handling plus id-token write can expose federated cloud credentials if conditions are weak.",
        attack_path: ["attacker PR event", "OIDC token issuance", "cloud role abuse"],
        recommendations: [
          "Disallow id-token write for untrusted PR-triggered jobs",
          "Constrain cloud role trust policies with strict claims and repo refs",
          "Require environment approvals for cloud-deploy jobs",
        ],
      }));
    }

    if (asset.type === "ci_workflow" && asset.subtype === "agentic-tool-surface") {
      findings.push(finding({
        asset,
        code: "github-agentic-workflow-surface",
        severity: "medium",
        title: "Workflow exposes agentic or external tool execution surface",
        rationale: "Workflows that bootstrap external scripts or AI agents increase supply-chain and command execution risk.",
        attack_path: ["workflow trigger", "external tool/script execution", "runner compromise or secret access"],
        recommendations: [
          "Pin third-party actions and verify script integrity before execution",
          "Run high-risk jobs in isolated runners with minimal secrets",
          "Require approvals for workflows that invoke coding agents or remote scripts",
        ],
      }));
    }
  }

  // ── AWS-specific risk rules ────────────────────────────────────────────────

  for (const asset of assets) {
    // Bedrock agent with broad capabilities but no guardrail hint
    if (asset.type === "agent" && asset.subtype === "bedrock-agent") {
      const caps = asset.capabilities || [];
      if (caps.includes("action_groups")) {
        findings.push(finding({
          asset,
          code: "bedrock-agent-action-groups",
          severity: "high",
          title: "Bedrock Agent has action groups — runtime controls required",
          rationale: "Bedrock Agents with action groups can invoke Lambda functions and external APIs. Without guardrails and human approval loops, prompt injection can trigger unintended actions.",
          attack_path: ["prompt injection", "action group invocation", "unauthorized Lambda or API call"],
          recommendations: [
            "Attach a Bedrock Guardrail to the agent",
            "Restrict action group Lambda permissions to least privilege",
            "Enable session isolation and prompt attack filters",
            "Add CloudTrail logging for all InvokeAgent calls",
          ],
        }));
      }

      if (!caps.includes("action_groups") && !caps.includes("knowledge_base")) {
        findings.push(finding({
          asset,
          code: "bedrock-agent-no-controls",
          severity: "medium",
          title: "Bedrock Agent deployed without action groups or knowledge bases",
          rationale: "Idle or minimal Bedrock Agents still consume IAM permissions and may be re-configured. Inventory all deployed agents.",
          attack_path: ["IAM role abuse", "agent re-configuration", "data exfiltration"],
          recommendations: [
            "Remove or archive agents not actively used",
            "Attach Bedrock Guardrails even to minimal agents",
            "Review and tighten agentResourceRoleArn permissions",
          ],
        }));
      }
    }

    // IAM role with wildcard AI access
    if (asset.type === "iam_role" && asset.hasWildcardAccess) {
      findings.push(finding({
        asset,
        code: "iam-ai-role-wildcard",
        severity: "high",
        title: "IAM role with AI service access uses wildcard actions",
        rationale: "Wildcard actions on AI services (Bedrock, SageMaker) grant more permission than needed. If the role is assumed by a compromised workload, attackers gain full AI plane access.",
        attack_path: ["role assumption", "wildcard AI API access", "model invocation or data exfiltration"],
        recommendations: [
          "Replace wildcard actions with least-privilege action lists",
          "Scope resource ARNs to specific models and agents",
          "Enable IAM Access Analyzer to detect unused permissions",
          "Rotate credentials attached to this role",
        ],
      }));
    }

    if (asset.type === "iam_role" && asset.hasDataPlaneCombo && (asset.wildcardServiceAccess || asset.hasWildcardAccess)) {
      findings.push(finding({
        asset,
        code: "iam-bedrock-secrets-s3-combo",
        severity: "critical",
        title: "Service role has Bedrock + Secrets Manager + S3 with wildcard-capable access",
        rationale: "This permission combination enables model invocation, document-plane access, and secret retrieval from one role. A compromised AI workflow can pivot quickly.",
        attack_path: ["role compromise", "bedrock model invocation", "s3 sensitive retrieval", "secrets exfiltration"],
        recommendations: [
          "Split Bedrock, S3, and Secrets Manager permissions into separate least-privilege roles",
          "Deny wildcard actions and scope resources to explicit ARNs",
          "Require short session duration and MFA for high-privilege role assumptions",
        ],
      }));
    }

    if (asset.type === "ai_workflow" && (asset.capabilities || []).includes("lambda") && (asset.capabilities || []).includes("bedrock")) {
      findings.push(finding({
        asset,
        code: "lambda-ai-workflow-privilege-review",
        severity: "high",
        title: "Lambda-driven AI workflow detected — permission boundary review required",
        rationale: "Lambda execution paths that can invoke AI services and data planes must enforce least privilege and strong runtime controls.",
        attack_path: ["workflow trigger abuse", "lambda execution", "ai/data-plane misuse"],
        recommendations: [
          "Scope Lambda role permissions by function and environment",
          "Add CloudWatch alarms for anomalous Lambda invoke and error spikes",
          "Require code signing and deployment approvals for workflow functions",
        ],
      }));
    }

    // Bedrock knowledge base (RAG vector store)
    if (asset.type === "vector_store" && asset.subtype === "bedrock-knowledge-base") {
      findings.push(finding({
        asset,
        code: "bedrock-knowledge-base-rag",
        severity: "medium",
        title: "Bedrock Knowledge Base (RAG) requires retrieval authorization review",
        rationale: "Knowledge bases ingest and serve documents to LLMs. Without document-level access controls, sensitive material can leak into model responses.",
        attack_path: ["malicious document ingestion", "indirect prompt injection via retrieved chunks", "sensitive data in model output"],
        recommendations: [
          "Enable metadata filtering to restrict retrieval by user/role",
          "Audit data source S3 bucket permissions",
          "Add output guardrails to filter sensitive content from responses",
          "Log every retrieval query and retrieved document ID",
        ],
      }));
    }

    if (asset.type === "dataset" && asset.subtype === "s3-rag-bucket") {
      findings.push(finding({
        asset,
        code: "rag-sensitive-s3-dataset",
        severity: "high",
        title: "RAG dataset bucket linked to Bedrock knowledge base requires strict access review",
        rationale: "S3 document stores connected to RAG can leak sensitive material through retrieval if bucket policy, ingestion rules, or output filtering are weak.",
        attack_path: ["bucket overexposure", "malicious/poisoned documents", "sensitive retrieval", "LLM output leakage"],
        recommendations: [
          "Restrict S3 bucket policies to the knowledge base role and approved pipelines",
          "Enable object-level logging and versioning for auditability",
          "Tag and filter sensitive documents before ingestion",
        ],
      }));

    }

    // Bedrock foundation model — flag very capable models
    if (asset.type === "ai_model" && asset.subtype === "bedrock-foundation-model") {
      const isToplevel = /claude-3|nova-pro|llama-3|titan-premier/i.test(asset.modelId || "");
      if (isToplevel) {
        findings.push(finding({
          asset,
          code: "bedrock-powerful-model-access",
          severity: "low",
          title: "High-capability Bedrock foundation model available in account",
          rationale: "Access to frontier models should be logged and scoped. Unrestricted InvokeModel access allows data exfiltration via model outputs.",
          attack_path: ["credential compromise", "unrestricted InvokeModel", "data exfiltration via LLM output"],
          recommendations: [
            "Use resource-based IAM policies to restrict which roles can invoke this model",
            "Enable model invocation logging in Bedrock settings",
            "Review Bedrock service quotas to limit blast radius",
          ],
        }));
      }
    }

  }

  // Bedrock foundation models — one account-level finding covering all high-capability models
  const powerfulBedrockModels = assets.filter(
    (a) => a.type === "ai_model" && a.subtype === "bedrock-foundation-model" &&
      /claude|nova-pro|llama-3|titan-premier|mistral|gpt|kimi|nvidia/i.test(a.modelId || a.name || "")
  );
  if (powerfulBedrockModels.length > 0) {
    const topNames = powerfulBedrockModels.slice(0, 5).map((m) => m.name || m.modelId || m.id).join(", ");
    const remainder = powerfulBedrockModels.length > 5 ? ` +${powerfulBedrockModels.length - 5} more` : "";
    const syntheticAsset = {
      id: "aws:bedrock:account:high-capability-models",
      name: "Bedrock Account",
      type: "ai_model",
      repo: powerfulBedrockModels[0]?.repo || "aws/us-east-1",
      evidence: [],
    };
    findings.push(finding({
      asset: syntheticAsset,
      code: "bedrock-powerful-model-access",
      severity: "low",
      title: `${powerfulBedrockModels.length} high-capability Bedrock model${powerfulBedrockModels.length > 1 ? "s" : ""} available in account`,
      rationale: `Unrestricted InvokeModel access to frontier models (${topNames}${remainder}) allows data exfiltration via model outputs. Access should be logged and scoped to least-privilege roles.`,
      attack_path: ["credential compromise", "unrestricted InvokeModel", "data exfiltration via LLM output"],
      recommendations: [
        "Use resource-based IAM policies to restrict which roles can invoke these models",
        "Enable model invocation logging in Bedrock settings",
        "Review Bedrock service quotas to limit blast radius",
      ],
    }));
  }

  for (const [repo, systems] of systemsByRepo) {
    const secrets = secretsByRepo.get(repo) || [];
    const vectorStores = vectorsByRepo.get(repo) || [];
    const workflows = workflowsByRepo.get(repo) || [];
    if (systems.length > 0 && secrets.length > 0) {
      findings.push(finding({
        asset: systems[0],
        code: "ai-system-near-secret",
        severity: "critical",
        title: "AI system code is colocated with credential material",
        rationale: "AI application code and exposed credentials in the same repository create a short path from source compromise to AI or cloud abuse.",
        attack_path: ["repository access", "credential extraction", "model/tool abuse"],
        recommendations: [
          "Rotate exposed credentials",
          "Split runtime secrets from source repositories",
          "Add repository branch protection and mandatory secret scanning",
        ],
      }));
    }

    if (systems.length > 0 && vectorStores.length > 0) {
      findings.push(finding({
        asset: systems[0],
        code: "rag-application-detected",
        severity: "medium",
        title: "AI system appears connected to retrieval infrastructure",
        rationale: "RAG pipelines need retrieval authorization, source trust checks, and indirect prompt injection defenses.",
        attack_path: ["malicious document ingestion", "retrieval poisoning", "unsafe answer generation"],
        recommendations: [
          "Validate and label retrieved documents by trust level",
          "Add indirect prompt injection detection before documents enter context",
          "Track citations and retrieved source IDs in audit logs",
        ],
      }));
    }

    if (systems.length > 0 && workflows.length > 0) {
      findings.push(finding({
        asset: systems[0],
        code: "ai-system-cicd-workflow-coupling",
        severity: "high",
        title: "AI system is coupled to risky CI/CD workflow behavior",
        rationale: "When AI systems and risky workflow patterns coexist, compromise paths from CI to model/runtime access become shorter.",
        attack_path: ["workflow abuse", "token or secret access", "AI system misuse"],
        recommendations: [
          "Isolate deployment credentials from build/test jobs",
          "Apply branch protection and mandatory workflow reviews",
          "Add runtime policy and audit controls for downstream AI systems",
        ],
      }));
    }
  }

  // Cross-connector correlations
  for (const [repo, systems] of aiSystemsByRepo) {
    const secrets = secretsByRepo.get(repo) || [];
    if (secrets.length > 0 && wildcardRoles.length > 0) {
      const asset = systems[0];
      findings.push(finding({
        asset,
        code: "cross-connector-secret-plus-wildcard-iam",
        severity: "critical",
        title: "Repository secret exposure plus wildcard AWS IAM role detected",
        rationale: "A secret discovered in repository code combined with wildcard IAM roles creates a short cross-system attack chain from source leak to broad cloud control.",
        attack_path: ["repository credential exposure", "credential reuse or theft", "assume wildcard IAM role", "broad AWS AI-plane access"],
        recommendations: [
          "Rotate discovered credentials immediately",
          "Replace wildcard IAM permissions with least privilege",
          "Require MFA and session constraints for role assumptions",
          "Enable and monitor AWS CloudTrail + GitHub audit signals together",
        ],
      }));
    }
  }

  // ── Azure AD identity risk rules ─────────────────────────────────────────
  for (const asset of assets) {
    if (asset.type === "identity" && asset.subtype === "azuread-user" && asset.accountEnabled === false) {
      findings.push(finding({
        asset,
        code: "azuread-disabled-account",
        severity: "medium",
        title: "Disabled Azure AD account — verify app assignments",
        rationale: "Disabled user accounts may retain active app role assignments or delegated permissions, creating a dormant privilege path.",
        attack_path: ["stale account", "retained role assignment", "unauthorized access"],
        recommendations: [
          "Audit app role assignments for this account",
          "Remove or revoke any remaining delegated permissions",
          "Delete the account if permanently deprovisioned",
        ],
      }));
    }

    if (asset.type === "application" && asset.subtype === "azuread-application" &&
        asset.signInAudience === "AzureADandPersonalMicrosoftAccount") {
      findings.push(finding({
        asset,
        code: "azuread-overpermissive-app",
        severity: "medium",
        title: "App registration allows personal Microsoft accounts",
        rationale: "Apps with AzureADandPersonalMicrosoftAccount audience accept tokens from external personal accounts, widening the attack surface beyond the tenant.",
        attack_path: ["external account sign-in", "token acquisition", "API or data access"],
        recommendations: [
          "Change signInAudience to AzureADMyOrg unless multi-tenant access is explicitly required",
          "Add Conditional Access policies scoping this app to known users",
        ],
      }));
    }

    if (asset.type === "service_principal" && asset.subtype === "azuread-service-principal") {
      findings.push(finding({
        asset,
        code: "azuread-service-principal-audit",
        severity: "low",
        title: "Service principal — verify recent sign-in activity",
        rationale: "Stale or unused service principals with active credentials represent a persistent attack surface if not regularly audited.",
        attack_path: ["stale credential", "service principal impersonation", "tenant access"],
        recommendations: [
          "Review last sign-in date and remove if inactive",
          "Rotate client secrets and certificates regularly",
          "Apply least-privilege API permissions",
        ],
      }));
    }
  }

  // Azure AD: no Conditional Access policies — check via connector entry
  const azureadConnector = (inventory.connectors || []).find((c) => c.id === "azuread");
  if (azureadConnector?.status === "live" && (azureadConnector?.counts?.conditionalAccessPolicies ?? -1) === 0) {
    findings.push(finding({
      asset: { id: "azuread:tenant", name: "Azure AD Tenant", type: "identity_provider", repo: "azure-ad" },
      code: "azuread-no-conditional-access",
      severity: "high",
      title: "No Conditional Access policies configured",
      rationale: "Without Conditional Access, all users can authenticate from any location, device, or network with no additional controls.",
      attack_path: ["credential theft", "unrestricted sign-in", "full tenant access"],
      recommendations: [
        "Create a baseline CA policy requiring MFA for all users",
        "Block sign-ins from high-risk locations",
        "Enforce compliant device requirements for sensitive apps",
      ],
    }));
  }

  return findings.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
}

export function summarizeAiSpmPosture({ inventory = {}, findings = [] } = {}) {
  const assets = inventory.assets || [];
  const critical = findings.filter((item) => item.severity === "critical").length;
  const high = findings.filter((item) => item.severity === "high").length;
  const aiSystems = assets.filter((asset) => asset.type === "ai_system").length;
  const agents = assets.filter((asset) => asset.type === "agent").length;
  const secrets = assets.filter((asset) => asset.type === "secret").length;
  const bedrockModels = assets.filter((a) => a.subtype === "bedrock-foundation-model").length;
  const bedrockAgents = assets.filter((a) => a.subtype === "bedrock-agent").length;
  const knowledgeBases = assets.filter((a) => a.subtype === "bedrock-knowledge-base").length;
  const ragDatasets = assets.filter((a) => a.subtype === "s3-rag-bucket").length;
  const aiWorkflows = assets.filter((a) => a.type === "ai_workflow").length;
  const iamRoles = assets.filter((a) => a.type === "iam_role").length;
  const awsAssets = assets.filter((a) => (a.source || "").startsWith("aws-")).length;

  // Azure AD counts
  const azureadConnector = (inventory.connectors || []).find((c) => c.id === "azuread");
  const azureadAssets = assets.filter((a) => a.source === "azure-ad").length;
  const azureadUsers = assets.filter((a) => a.subtype === "azuread-user").length;
  const azureadApps = assets.filter((a) => a.subtype === "azuread-application").length;
  const azureadSPs = assets.filter((a) => a.subtype === "azuread-service-principal").length;

  // Connector status from inventory
  const awsConnector = (inventory.connectors || []).find((c) => c.id === "aws");

  return {
    generated_at: new Date().toISOString(),
    asset_count: assets.length,
    ai_system_count: aiSystems,
    agent_count: agents + bedrockAgents,
    secret_count: secrets,
    finding_count: findings.length,
    critical_count: critical,
    high_count: high,
    posture: critical > 0 ? "critical" : high > 0 ? "elevated" : findings.length > 0 ? "review" : "clear",
    // AWS-specific counts
    aws: {
      connected: awsConnector?.status === "live",
      account: awsConnector?.account,
      region: awsConnector?.region,
      asset_count: awsAssets,
      bedrock_models: bedrockModels,
      bedrock_agents: bedrockAgents,
      knowledge_bases: knowledgeBases,
      rag_datasets: ragDatasets,
      ai_workflows: aiWorkflows,
      iam_roles: iamRoles,
    },
    // Azure AD counts
    azuread: {
      connected: azureadConnector?.status === "live",
      tenant_id: azureadConnector?.tenant_id,
      asset_count: azureadAssets,
      users: azureadUsers,
      apps: azureadApps,
      service_principals: azureadSPs,
      ca_policies: azureadConnector?.counts?.conditionalAccessPolicies ?? null,
    },
  };
}

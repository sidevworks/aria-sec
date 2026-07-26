// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import { useState } from "react";

const CONNECTOR_ONBOARDING_SOURCES = [
  {
    id: "github",
    label: "GitHub",
    accent: "#2dd4bf",
    description: "Scan selected repositories for AI assets, secrets, agent workflows, and risky tool access.",
    auth: "Use an active gh CLI session, GitHub device login, or a fine-grained token plus selected repositories.",
    firstScan: "Runs the live AI-SPM source scan for connected GitHub repositories.",
    evidence: "AI asset and code evidence records from repository contents.",
  },
  {
    id: "aws",
    label: "AWS",
    accent: "#ff9933",
    description: "Discover Bedrock models, agents, knowledge bases, AI IAM roles, Lambda workflows, and data stores.",
    auth: "Provide AWS access key credentials with read permissions and an optional session token.",
    firstScan: "Runs the live AI-SPM source scan for AWS when credentials are available.",
    evidence: "AWS inventory evidence and exposure recommendations.",
  },
  {
    id: "okta",
    label: "Okta",
    accent: "#3b82f6",
    description: "Find MFA enrollment gaps, weak password policies, and apps missing sign-on controls.",
    auth: "Provide an Okta domain and read-only API token.",
    firstScan: "Calls the Okta scan route and returns users, apps, groups, policies, and findings.",
    evidence: "Identity control findings with affected users, apps, or policies.",
  },
  {
    id: "snyk",
    label: "Snyk",
    accent: "#a855f7",
    description: "Surface critical/high project vulnerabilities and stale dependency scans.",
    auth: "Provide a Snyk API token and optionally an org ID.",
    firstScan: "Calls the Snyk scan route and samples project issues for first findings.",
    evidence: "Project vulnerability findings and remediation priority.",
  },
  {
    id: "azuread",
    label: "Azure AD",
    accent: "#0078d4",
    description: "Discover users, app registrations, service principals, and Conditional Access gaps.",
    auth: "Provide tenant ID, app registration client ID, and client secret with Graph read permissions.",
    firstScan: "Calls the Azure AD Graph scan route.",
    evidence: "Directory assets and Conditional Access decision inputs.",
  },
  {
    id: "virustotal",
    label: "VirusTotal",
    accent: "#ef4444",
    description: "Enrich IOCs with threat intelligence verdicts from VirusTotal.",
    auth: "Provide a VirusTotal API key.",
    firstScan: "Enriches the IOCs entered in the wizard. No inventory scan is available for this connector.",
    evidence: "Threat intel enrichment findings for malicious or suspicious IOCs.",
  },
  {
    id: "elastic",
    label: "Elastic",
    accent: "#f59e0b",
    description: "Review Elastic cluster health, recent security alerts, detection rules, and security indices.",
    auth: "Provide Elastic URL, API key, and optional Kibana URL.",
    firstScan: "Calls the Elastic Security scan route.",
    evidence: "SIEM health, alert, disabled-rule, and ingestion findings.",
  },
];

const s = {
  dashCard: {
    background: "linear-gradient(180deg, rgba(255,255,255,0.075), rgba(255,255,255,0.032)), rgba(13, 12, 22, 0.66)",
    border: "1px solid rgba(255,255,255,0.085)",
    borderRadius: 18,
    padding: "14px 16px",
    boxShadow: "0 18px 52px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.05)",
    backdropFilter: "blur(24px)",
  },
  dashCardLabel: {
    fontSize: 10,
    letterSpacing: "0.24em",
    textTransform: "uppercase",
    color: "rgba(236,218,255,0.62)",
    marginBottom: 2,
  },
  feedLine: {
    fontSize: 12,
    lineHeight: 1.3,
    color: "rgba(220, 237, 255, 0.88)",
    padding: "6px 8px",
    borderRadius: 8,
    border: "1px solid rgba(140, 178, 255, 0.18)",
    background: "rgba(15, 26, 50, 0.45)",
  },
  miniActionButton: {
    border: "1px solid rgba(160, 205, 255, 0.22)",
    borderRadius: 999,
    background: "rgba(22, 135, 255, 0.12)",
    color: "rgba(234,247,255,0.86)",
    padding: "6px 10px",
    fontSize: 10,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    cursor: "pointer",
  },
  commandInput: {
    width: "100%",
    border: "1px solid rgba(160, 205, 255, 0.25)",
    borderRadius: 6,
    background: "rgba(5, 10, 21, 0.95)",
    color: "#eaf7ff",
    padding: "12px 14px",
    fontSize: 14,
    outline: "none",
  },
};

function connectionLabel(connector) {
  if (!connector) return "Not loaded";
  if (connector.connected || connector.status === "live" || connector.status === "connected") return "Connected";
  if (connector.status === "error") return "Error";
  return "Not connected";
}

function resultFindings(result) {
  return Array.isArray(result?.findings) ? result.findings : [];
}

function resultAssets(result) {
  return Array.isArray(result?.assets) ? result.assets : [];
}

function makeEvidencePreview(source, result, health) {
  const findings = resultFindings(result);
  const assets = resultAssets(result);
  const topFinding = findings[0];
  const severity = topFinding?.severity || (findings.length ? "review" : "low");
  const status = result?.mode === "not_configured" || health?.status === "unconfigured" ? "blocked" : findings.length ? "review" : "observed";
  const action = status === "blocked"
    ? "Complete connector configuration, then test again."
    : findings.length
      ? `Open ${topFinding.title || topFinding.id || source.label} and stage governed review.`
      : "Record baseline evidence and keep connector in monitored mode.";

  return {
    id: `onboarding-${source.id}-${Date.now().toString(36)}`,
    source: source.label,
    status,
    severity,
    findings: findings.length,
    assets: assets.length,
    timestamp: result?.scanned_at || new Date().toISOString(),
    summary: result?.message || topFinding?.description || `${source.label} first scan completed with ${findings.length} finding(s) and ${assets.length} discovered asset(s).`,
    recommendedAction: action,
  };
}

function Field({ label, children }) {
  return (
    <label style={{ display: "grid", gap: 7, minWidth: 0 }}>
      <span style={s.dashCardLabel}>{label}</span>
      {children}
    </label>
  );
}

function ConnectorOnboardingAuthForm({ sourceId, values, onChange, onSubmit, busy }) {
  const setValue = (key, value) => onChange({ ...values, [key]: value });
  const inputStyle = { ...s.commandInput, padding: "10px 12px", fontSize: 12, boxSizing: "border-box" };
  const password = (key, placeholder) => (
    <input type="password" value={values[key] || ""} onChange={(event) => setValue(key, event.target.value)} placeholder={placeholder} style={inputStyle} />
  );
  const text = (key, placeholder) => (
    <input value={values[key] || ""} onChange={(event) => setValue(key, event.target.value)} placeholder={placeholder} style={inputStyle} />
  );

  if (sourceId === "github") {
    return (
      <div style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          <Field label="TOKEN OR GH CLI">{password("token", "__gh_cli__ or GitHub token")}</Field>
          <Field label="REPOSITORIES">{text("repositories", "owner/repo, owner/another")}</Field>
        </div>
        <button style={s.miniActionButton} onClick={() => onSubmit("github")} disabled={busy}>Authenticate GitHub</button>
      </div>
    );
  }

  if (sourceId === "aws") {
    return (
      <div style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          <Field label="ACCESS KEY ID">{password("accessKeyId", "AKIA... or ASIA...")}</Field>
          <Field label="SECRET ACCESS KEY">{password("secretAccessKey", "Secret access key")}</Field>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="REGION">{text("region", "us-east-1")}</Field>
          <Field label="SESSION TOKEN">{password("sessionToken", "Optional")}</Field>
        </div>
        <button style={s.miniActionButton} onClick={() => onSubmit("aws")} disabled={busy}>Authenticate AWS</button>
      </div>
    );
  }

  if (sourceId === "okta") {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, alignItems: "end" }}>
        <Field label="OKTA DOMAIN">{text("domain", "yourorg.okta.com")}</Field>
        <Field label="API TOKEN">{password("apiToken", "SSWS token")}</Field>
        <button style={s.miniActionButton} onClick={() => onSubmit("okta")} disabled={busy}>Authenticate</button>
      </div>
    );
  }

  if (sourceId === "snyk") {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, alignItems: "end" }}>
        <Field label="API TOKEN">{password("apiToken", "Snyk API token")}</Field>
        <Field label="ORG ID">{text("orgId", "Optional")}</Field>
        <button style={s.miniActionButton} onClick={() => onSubmit("snyk")} disabled={busy}>Authenticate</button>
      </div>
    );
  }

  if (sourceId === "azuread") {
    return (
      <div style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          <Field label="TENANT ID">{text("tenantId", "Tenant ID")}</Field>
          <Field label="CLIENT ID">{text("clientId", "App registration client ID")}</Field>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, alignItems: "end" }}>
          <Field label="CLIENT SECRET">{password("clientSecret", "Client secret")}</Field>
          <button style={s.miniActionButton} onClick={() => onSubmit("azuread")} disabled={busy}>Authenticate</button>
        </div>
      </div>
    );
  }

  if (sourceId === "virustotal") {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, alignItems: "end" }}>
        <Field label="API KEY">{password("apiKey", "VirusTotal API key")}</Field>
        <button style={s.miniActionButton} onClick={() => onSubmit("virustotal")} disabled={busy}>Authenticate</button>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
        <Field label="ELASTIC URL">{text("url", "https://your-cluster:9200")}</Field>
        <Field label="API KEY">{password("apiKey", "Base64 API key")}</Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, alignItems: "end" }}>
        <Field label="KIBANA URL">{text("kibanaUrl", "Optional")}</Field>
        <button style={s.miniActionButton} onClick={() => onSubmit("elastic")} disabled={busy}>Authenticate</button>
      </div>
    </div>
  );
}

export function ConnectorOnboardingWizard({
  connectors = {},
  messages = {},
  scanResults = {},
  connectGithubWithToken,
  connectAws,
  connectOkta,
  connectSnyk,
  connectAzureAd,
  connectVirusTotal,
  connectElastic,
  testConnector,
  runFirstScan,
}) {
  const [activeId, setActiveId] = useState("github");
  const [step, setStep] = useState("source");
  const [values, setValues] = useState({ region: "us-east-1", iocs: "8.8.8.8" });
  const [busy, setBusy] = useState(false);
  const [health, setHealth] = useState(null);
  const [scan, setScan] = useState(null);
  const [evidence, setEvidence] = useState(null);
  const source = CONNECTOR_ONBOARDING_SOURCES.find((item) => item.id === activeId) || CONNECTOR_ONBOARDING_SOURCES[0];
  const connector = connectors[activeId] || null;
  const connected = Boolean(connector?.connected || connector?.status === "live" || connector?.status === "connected");
  const accent = source.accent;

  const selectSource = (id) => {
    setActiveId(id);
    setStep("auth");
    setHealth(null);
    setScan(null);
    setEvidence(null);
  };

  const authenticate = async (id) => {
    setBusy(true);
    try {
      if (id === "github") await connectGithubWithToken(values.token || "__gh_cli__", values.repositories || "");
      if (id === "aws") await connectAws({ accessKeyId: values.accessKeyId, secretAccessKey: values.secretAccessKey, sessionToken: values.sessionToken || undefined, region: values.region || "us-east-1" });
      if (id === "okta") await connectOkta({ apiToken: values.apiToken, domain: values.domain });
      if (id === "snyk") await connectSnyk({ apiToken: values.apiToken, orgId: values.orgId || undefined });
      if (id === "azuread") await connectAzureAd({ clientId: values.clientId, clientSecret: values.clientSecret, tenantId: values.tenantId });
      if (id === "virustotal") await connectVirusTotal({ apiKey: values.apiKey });
      if (id === "elastic") await connectElastic({ url: values.url, apiKey: values.apiKey, kibanaUrl: values.kibanaUrl || undefined });
      setStep("test");
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    if (!testConnector) return;
    setBusy(true);
    try {
      const result = await testConnector(activeId);
      setHealth(result || { status: connected ? "connected" : "unconfigured" });
      setStep("scan");
    } finally {
      setBusy(false);
    }
  };

  const firstScan = async () => {
    setBusy(true);
    try {
      const iocs = String(values.iocs || "").split(/[\n,]+/).map((item) => item.trim()).filter(Boolean);
      const result = await runFirstScan(activeId, { iocs });
      const resolved = result || scanResults[activeId] || { connector: activeId, mode: connected ? "complete" : "not_configured", findings: [] };
      setScan(resolved);
      setEvidence(makeEvidencePreview(source, resolved, health));
      setStep("evidence");
    } finally {
      setBusy(false);
    }
  };

  const steps = [
    { id: "source", label: "Choose source" },
    { id: "auth", label: "Authenticate" },
    { id: "test", label: "Test" },
    { id: "scan", label: "First scan" },
    { id: "evidence", label: "Evidence" },
  ];

  return (
    <div style={{ ...s.dashCard, marginBottom: 12, borderColor: "rgba(99,245,255,0.22)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
        <div>
          <div style={s.dashCardLabel}>CONNECTOR ONBOARDING</div>
          <div style={{ marginTop: 7, fontSize: 15, color: "rgba(232,241,252,0.95)", lineHeight: 1.45 }}>
            Connect an environment source, prove credentials, run the first supported scan, then hand ARIA an evidence-ready object.
          </div>
        </div>
        <span style={{ fontSize: 10, color: accent, letterSpacing: "0.12em", textTransform: "uppercase", flexShrink: 0 }}>
          {source.label}
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(96px, 1fr))", gap: 6, marginTop: 13 }}>
        {steps.map((item) => (
          <button
            key={item.id}
            onClick={() => setStep(item.id)}
            style={{
              ...s.miniActionButton,
              borderRadius: 6,
              borderColor: step === item.id ? accent : "rgba(160,205,255,0.16)",
              color: step === item.id ? accent : "rgba(234,247,255,0.72)",
              background: step === item.id ? "rgba(99,245,255,0.08)" : "rgba(4,8,20,0.35)",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      {step === "source" ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8, marginTop: 13 }}>
          {CONNECTOR_ONBOARDING_SOURCES.map((item) => {
            const itemConnector = connectors[item.id] || null;
            const itemConnected = Boolean(itemConnector?.connected || itemConnector?.status === "live" || itemConnector?.status === "connected");
            return (
              <button
                key={item.id}
                onClick={() => selectSource(item.id)}
                style={{
                  textAlign: "left",
                  border: `1px solid ${activeId === item.id ? item.accent : "rgba(140,178,255,0.16)"}`,
                  borderRadius: 8,
                  background: activeId === item.id ? "rgba(99,245,255,0.08)" : "rgba(5,10,21,0.62)",
                  padding: "10px 12px",
                  cursor: "pointer",
                  minWidth: 0,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontSize: 13, color: "rgba(232,241,252,0.94)" }}>{item.label}</span>
                  <span style={{ fontSize: 9, color: itemConnected ? item.accent : "rgba(171,200,230,0.38)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                    {itemConnected ? "READY" : "SETUP"}
                  </span>
                </div>
                <div style={{ marginTop: 5, fontSize: 11, color: "rgba(215,235,255,0.6)", lineHeight: 1.4 }}>{item.description}</div>
              </button>
            );
          })}
        </div>
      ) : null}

      {step !== "source" ? (
        <div style={{ marginTop: 13, display: "grid", gap: 10 }}>
          <div style={{ ...s.feedLine, borderColor: `${accent}55`, background: "rgba(4,8,20,0.55)" }}>
            <strong style={{ color: accent }}>{source.label}</strong>{" "}
            <span style={{ color: "rgba(215,235,255,0.76)" }}>{source.description}</span>
            <div style={{ marginTop: 5, color: "rgba(171,224,255,0.55)" }}>Status: {connectionLabel(connector)} · {source.auth}</div>
          </div>

          {step === "auth" ? (
            <ConnectorOnboardingAuthForm sourceId={activeId} values={values} onChange={setValues} onSubmit={authenticate} busy={busy} />
          ) : null}

          {step === "test" ? (
            <div style={{ display: "grid", gap: 9 }}>
              <div style={{ fontSize: 12, color: "rgba(215,235,255,0.72)", lineHeight: 1.5 }}>
                Test calls <span style={{ fontFamily: "monospace" }}>/api/connectors/{activeId}/health</span> where supported and reports unconfigured/error states directly.
              </div>
              <button style={{ ...s.miniActionButton, borderColor: accent, color: accent, justifySelf: "start" }} onClick={test} disabled={busy}>Test Connection</button>
              {health ? <div style={s.feedLine}>Health: {health.status || health.mode || "checked"} {health.message ? `- ${health.message}` : ""}</div> : null}
            </div>
          ) : null}

          {step === "scan" ? (
            <div style={{ display: "grid", gap: 9 }}>
              {activeId === "virustotal" ? (
                <Field label="IOCS TO ENRICH">
                  <textarea
                    value={values.iocs || ""}
                    onChange={(event) => setValues({ ...values, iocs: event.target.value })}
                    rows={3}
                    placeholder={"8.8.8.8\nevil.example.com"}
                    style={{ ...s.commandInput, resize: "vertical", fontFamily: "ui-monospace,monospace", fontSize: 12 }}
                  />
                </Field>
              ) : null}
              <div style={{ fontSize: 12, color: "rgba(215,235,255,0.72)", lineHeight: 1.5 }}>{source.firstScan}</div>
              <button style={{ ...s.miniActionButton, borderColor: accent, color: accent, justifySelf: "start" }} onClick={firstScan} disabled={busy}>Run First Scan</button>
              {scan?.message ? <div style={s.feedLine}>{scan.message}</div> : null}
            </div>
          ) : null}

          {step === "evidence" ? (
            <div style={{ display: "grid", gap: 9 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(96px, 1fr))", gap: 8 }}>
                {[
                  ["Status", evidence?.status || "pending"],
                  ["Findings", evidence?.findings ?? resultFindings(scan).length],
                  ["Assets", evidence?.assets ?? resultAssets(scan).length],
                  ["Severity", evidence?.severity || "review"],
                ].map(([label, value]) => (
                  <div key={label} style={{ border: `1px solid ${accent}33`, borderRadius: 6, padding: "8px 10px", background: "rgba(4,8,20,0.48)" }}>
                    <div style={{ fontSize: 9, color: "rgba(171,224,255,0.45)", letterSpacing: "0.12em", textTransform: "uppercase" }}>{label}</div>
                    <div style={{ marginTop: 3, color: accent, fontSize: 14, fontWeight: 700, overflowWrap: "anywhere" }}>{String(value).toUpperCase()}</div>
                  </div>
                ))}
              </div>
              <div style={{ ...s.feedLine, lineHeight: 1.55 }}>
                <div style={{ color: "rgba(232,241,252,0.92)" }}>{evidence?.summary || source.evidence}</div>
                <div style={{ marginTop: 6, color: "rgba(171,224,255,0.62)" }}>Recommended decision: {evidence?.recommendedAction || "Run a scan to generate evidence."}</div>
                <div style={{ marginTop: 6, color: "rgba(171,224,255,0.42)", fontFamily: "ui-monospace,monospace", fontSize: 11 }}>
                  {evidence ? JSON.stringify(evidence) : "No evidence preview yet."}
                </div>
              </div>
            </div>
          ) : null}

          {messages[activeId] ? <ConnectorMessage message={messages[activeId]} accentDim={accent} /> : null}
        </div>
      ) : null}
    </div>
  );
}

export function GitHubConnectorPanel({
  connector,
  repositories = [],
  device,
  message,
  connectGithubWithToken,
  startGithubDeviceAuth,
  pollGithubDeviceAuth,
  loadGithubRepositories,
  saveGithubRepositories,
  disconnectGithub,
  scanGithub,
}) {
  const [token, setToken] = useState("");
  const [manualRepos, setManualRepos] = useState("");
  const [selectedRepos, setSelectedRepos] = useState(connector?.repositories || []);
  const connected = Boolean(connector?.connected);

  const toggleRepo = (repo) => {
    setSelectedRepos((prev) => (
      prev.includes(repo)
        ? prev.filter((item) => item !== repo)
        : [...prev, repo]
    ));
  };

  const repoOptions = repositories.slice(0, 20);
  const selectedCount = selectedRepos.length;

  return (
    <div style={{ ...s.dashCard, marginBottom: 12, borderColor: "rgba(45,212,191,0.3)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
        <div>
          <div style={s.dashCardLabel}>GITHUB CONNECTOR</div>
          <div style={{ marginTop: 7, fontSize: 13, color: "rgba(232,241,252,0.9)", lineHeight: 1.5 }}>
            {connected
              ? `Connected as ${connector.username || "GitHub user"}. ${selectedCount} repos selected for AI-SPM scans.`
              : "Connect GitHub so Aria can scan selected repositories directly from the platform."}
          </div>
        </div>
        <span style={{ fontSize: 10, color: connected ? "#2dd4bf" : "#ffc857", letterSpacing: "0.12em", textTransform: "uppercase", flexShrink: 0 }}>
          {connected ? "CONNECTED" : "NOT CONNECTED"}
        </span>
      </div>

      {message ? (
        <div style={{ ...s.feedLine, marginTop: 10, borderColor: "rgba(45,212,191,0.24)", color: "#2dd4bf" }}>{message}</div>
      ) : null}

      {!connected ? (
        <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
          <div style={{ display: "grid", gap: 7 }}>
            <div style={s.dashCardLabel}>GH CLI (recommended)</div>
            <button
              style={{ ...s.miniActionButton, background: "rgba(45,212,191,0.1)", borderColor: "rgba(45,212,191,0.4)", color: "#2dd4bf" }}
              onClick={() => void connectGithubWithToken("__gh_cli__", "")}
            >
              Use gh auth login session
            </button>
            <div style={{ fontSize: 11, color: "rgba(171,224,255,0.45)" }}>
              Already logged in via <span style={{ fontFamily: "monospace" }}>gh auth login</span>? One click connects.
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div style={{ display: "grid", gap: 8 }}>
            <div style={s.dashCardLabel}>DEVICE LOGIN</div>
            <button style={s.miniActionButton} onClick={() => void startGithubDeviceAuth()}>Start GitHub Login</button>
            {device?.user_code ? (
              <div style={{ ...s.feedLine, display: "grid", gap: 7 }}>
                <span>Code: <strong style={{ color: "#f6fbff", letterSpacing: "0.12em" }}>{device.user_code}</strong></span>
                <button style={s.miniActionButton} onClick={() => window.open(device.verification_uri, "_blank", "noopener,noreferrer")}>Open GitHub</button>
                <button style={s.miniActionButton} onClick={() => void pollGithubDeviceAuth(device.device_code)}>I've Authorized</button>
              </div>
            ) : null}
            {!connector?.oauth_device_configured ? (
              <div style={{ fontSize: 11, color: "rgba(255,200,87,0.84)", lineHeight: 1.45 }}>
                Add GITHUB_OAUTH_CLIENT_ID to enable device login.
              </div>
            ) : null}
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            <div style={s.dashCardLabel}>TOKEN FALLBACK</div>
            <input
              type="password"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="Paste fine-grained GitHub token"
              style={{ ...s.commandInput, padding: "10px 12px", fontSize: 12 }}
            />
            <input
              value={manualRepos}
              onChange={(event) => setManualRepos(event.target.value)}
              placeholder="owner/repo, owner/another"
              style={{ ...s.commandInput, padding: "10px 12px", fontSize: 12 }}
            />
            <button
              style={s.miniActionButton}
              onClick={() => {
                void connectGithubWithToken(token, manualRepos);
                setToken("");
              }}
            >
              Connect Token
            </button>
          </div>
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button style={s.miniActionButton} onClick={() => void loadGithubRepositories()}>Load Repos</button>
            <button style={s.miniActionButton} onClick={() => void saveGithubRepositories(selectedRepos)}>Save Selection</button>
            <button style={{ ...s.miniActionButton, borderColor: "rgba(45,212,191,0.4)", color: "#2dd4bf" }} onClick={() => void scanGithub()}>Run Scan</button>
            <button style={s.miniActionButton} onClick={() => void disconnectGithub()}>Disconnect</button>
          </div>
          {repoOptions.length ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 7, maxHeight: 190, overflowY: "auto", paddingRight: 4 }}>
              {repoOptions.map((repo) => (
                <label key={repo.full_name} style={{ ...s.feedLine, display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
                  <input type="checkbox" checked={selectedRepos.includes(repo.full_name)} onChange={() => toggleRepo(repo.full_name)} />
                  <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{repo.full_name}</span>
                </label>
              ))}
            </div>
          ) : (
            <div style={s.feedLine}>Load repositories, then choose the repos Aria is allowed to scan.</div>
          )}
        </div>
      )}
    </div>
  );
}

export function AwsConnectorPanel({ connector, connectAws, disconnectAws, message }) {
  const [keyId, setKeyId] = useState("");
  const [secret, setSecret] = useState("");
  const [region, setRegion] = useState("us-east-1");
  const [sessionToken, setSessionToken] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const connected = connector?.connected;
  const status = connector?.status || "not_configured";
  const ORANGE = "#ff9933";
  const ORANGE_DIM = "rgba(255,153,51,0.6)";
  const BORDER_ON = "rgba(255,153,51,0.35)";
  const BORDER_OFF = "rgba(120,140,160,0.2)";

  const statItems = [
    { label: "Bedrock Models",  val: connector?.bedrock_models  ?? "—" },
    { label: "Bedrock Agents",  val: connector?.bedrock_agents  ?? "—" },
    { label: "Knowledge Bases", val: connector?.knowledge_bases ?? "—" },
    { label: "IAM Roles (AI)", val: connector?.iam_roles       ?? "—" },
  ];

  const handleConnect = () => {
    if (!keyId.trim() || !secret.trim()) return;
    void connectAws({ accessKeyId: keyId.trim(), secretAccessKey: secret.trim(), region: region.trim() || "us-east-1", sessionToken: sessionToken.trim() || undefined });
    setKeyId(""); setSecret(""); setSessionToken("");
  };

  return (
    <div style={{ ...s.dashCard, marginBottom: 0, borderColor: connected ? BORDER_ON : BORDER_OFF }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
        <div>
          <div style={{ ...s.dashCardLabel, color: ORANGE_DIM }}>AWS CONNECTOR</div>
          <div style={{ marginTop: 6, fontSize: 13, color: "rgba(232,241,252,0.85)", lineHeight: 1.5 }}>
            {connected
              ? `Account ${connector.account || "—"} · ${connector.region || "us-east-1"} · ${connector.key_hint || ""}`
              : "Connect AWS to scan Bedrock agents, models, knowledge bases and IAM roles for AI exposure."}
          </div>
        </div>
        <span style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", flexShrink: 0,
          color: connected ? ORANGE : status === "error" ? "#ff4060" : "rgba(171,200,230,0.35)" }}>
          {connected ? "CONNECTED" : status === "error" ? "ERROR" : "NOT CONNECTED"}
        </span>
      </div>

      {message ? (
        <div style={{ ...s.feedLine, marginTop: 10, borderColor: "rgba(255,153,51,0.24)", color: ORANGE_DIM }}>{message}</div>
      ) : null}

      {connected ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginTop: 14 }}>
            {statItems.map(({ label, val }) => (
              <div key={label} style={{ background: "rgba(255,153,51,0.06)", border: "1px solid rgba(255,153,51,0.12)", borderRadius: 6, padding: "8px 10px", textAlign: "center" }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: ORANGE, fontFamily: "ui-monospace,monospace", letterSpacing: "-0.02em" }}>{val}</div>
                <div style={{ fontSize: 9, color: "rgba(171,200,230,0.45)", letterSpacing: "0.1em", textTransform: "uppercase", marginTop: 3 }}>{label}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 10 }}>
            <button style={s.miniActionButton} onClick={() => void disconnectAws()}>Disconnect</button>
          </div>
        </>
      ) : (
        <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div style={{ display: "grid", gap: 7 }}>
              <div style={s.dashCardLabel}>ACCESS KEY ID</div>
              <input
                type="password"
                value={keyId}
                onChange={(e) => setKeyId(e.target.value)}
                placeholder="AKIA… or ASIA…"
                style={{ ...s.commandInput, padding: "10px 12px", fontSize: 12 }}
              />
            </div>
            <div style={{ display: "grid", gap: 7 }}>
              <div style={s.dashCardLabel}>SECRET ACCESS KEY</div>
              <input
                type="password"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder="Secret access key"
                style={{ ...s.commandInput, padding: "10px 12px", fontSize: 12 }}
              />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "end" }}>
            <div style={{ display: "grid", gap: 7 }}>
              <div style={s.dashCardLabel}>REGION</div>
              <input
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                placeholder="us-east-1"
                style={{ ...s.commandInput, padding: "10px 12px", fontSize: 12 }}
              />
            </div>
            <button
              style={{ ...s.miniActionButton, padding: "10px 20px", background: keyId && secret ? "rgba(255,153,51,0.12)" : undefined, borderColor: keyId && secret ? ORANGE_DIM : undefined, color: keyId && secret ? ORANGE : undefined }}
              onClick={handleConnect}
              disabled={!keyId.trim() || !secret.trim()}
            >
              Connect AWS
            </button>
          </div>

          <div>
            <button
              style={{ background: "none", border: "none", color: "rgba(171,200,230,0.4)", fontSize: 11, cursor: "pointer", letterSpacing: "0.06em", padding: 0 }}
              onClick={() => setShowAdvanced((v) => !v)}
            >
              {showAdvanced ? "▲ Hide" : "▼ Advanced"} (session token / assumed role)
            </button>
            {showAdvanced ? (
              <input
                type="password"
                value={sessionToken}
                onChange={(e) => setSessionToken(e.target.value)}
                placeholder="AWS_SESSION_TOKEN (optional — for assumed roles / SSO)"
                style={{ ...s.commandInput, padding: "10px 12px", fontSize: 12, marginTop: 8, width: "100%", boxSizing: "border-box" }}
              />
            ) : null}
          </div>

          <div style={{ fontSize: 11, color: "rgba(171,200,230,0.45)", lineHeight: 1.6 }}>
            Credentials are validated live via AWS STS and stored locally in{" "}
            <span style={{ fontFamily: "monospace", color: ORANGE_DIM }}>aria-memory/connectors/aws.json</span> (owner read-only).
            Required IAM: <span style={{ fontFamily: "monospace" }}>bedrock:List*, bedrock-agent:List*, iam:ListRoles, sts:GetCallerIdentity</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function ConnectorHeader({ label, description, connected, accentColor, accentDim }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
      <div>
        <div style={{ ...s.dashCardLabel, color: accentDim }}>{label}</div>
        <div style={{ marginTop: 6, fontSize: 13, color: "rgba(232,241,252,0.85)", lineHeight: 1.5 }}>{description}</div>
      </div>
      <span style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", flexShrink: 0, color: connected ? accentColor : "rgba(171,200,230,0.35)" }}>
        {connected ? "CONNECTED" : "NOT CONNECTED"}
      </span>
    </div>
  );
}

function ConnectorMessage({ message, accentDim }) {
  if (!message) return null;
  return <div style={{ ...s.feedLine, marginTop: 10, borderColor: `${accentDim}55`, color: accentDim }}>{message}</div>;
}

function ConnectorNote({ children }) {
  return <div style={{ fontSize: 11, color: "rgba(171,200,230,0.45)", lineHeight: 1.6, marginTop: 4 }}>{children}</div>;
}

function ScanResultBadge({ findings = [] }) {
  if (!findings.length) return null;
  const critical = findings.filter((f) => f.severity === "critical").length;
  const high = findings.filter((f) => f.severity === "high").length;
  const med = findings.filter((f) => f.severity === "medium").length;
  const low = findings.filter((f) => !["critical", "high", "medium"].includes(f.severity)).length;
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
      {critical > 0 && <span style={{ fontSize: 10, background: "rgba(255,40,70,0.12)", border: "1px solid rgba(255,40,70,0.35)", borderRadius: 4, padding: "2px 7px", color: "#ff4060" }}>{critical} CRITICAL</span>}
      {high > 0 && <span style={{ fontSize: 10, background: "rgba(255,153,51,0.12)", border: "1px solid rgba(255,153,51,0.35)", borderRadius: 4, padding: "2px 7px", color: "#ff9933" }}>{high} HIGH</span>}
      {med > 0 && <span style={{ fontSize: 10, background: "rgba(255,200,87,0.12)", border: "1px solid rgba(255,200,87,0.35)", borderRadius: 4, padding: "2px 7px", color: "#ffc857" }}>{med} MEDIUM</span>}
      {low > 0 && <span style={{ fontSize: 10, background: "rgba(120,180,255,0.1)", border: "1px solid rgba(120,180,255,0.25)", borderRadius: 4, padding: "2px 7px", color: "rgba(171,200,230,0.6)" }}>{low} LOW</span>}
    </div>
  );
}

// ── Okta connector ────────────────────────────────────────────────────────────

export function OktaConnectorPanel({ connector, connectOkta, disconnectOkta, scanOkta, message, scanResult }) {
  const [apiToken, setApiToken] = useState("");
  const [domain, setDomain] = useState("");
  const connected = connector?.connected;
  const BLUE = "#3b82f6";
  const BLUE_DIM = "rgba(59,130,246,0.6)";
  const BORDER = connected ? "rgba(59,130,246,0.3)" : "rgba(120,140,160,0.2)";

  const handleConnect = () => {
    if (!apiToken.trim() || !domain.trim()) return;
    void connectOkta({ apiToken: apiToken.trim(), domain: domain.trim() });
    setApiToken(""); setDomain("");
  };

  return (
    <div style={{ ...s.dashCard, marginBottom: 12, borderColor: BORDER }}>
      <ConnectorHeader
        label="OKTA CONNECTOR"
        description={connected
          ? `${connector.domain || "Okta"} · ${connector.token_hint || ""}`
          : "Connect Okta to scan for MFA gaps, weak password policies, and apps without sign-on controls."}
        connected={connected}
        accentColor={BLUE}
        accentDim={BLUE_DIM}
      />
      <ConnectorMessage message={message} accentDim={BLUE_DIM} />

      {connected ? (
        <>
          {scanResult?.counts && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginTop: 14 }}>
              {[
                { label: "Users", val: scanResult.counts.users ?? "—" },
                { label: "Apps", val: scanResult.counts.apps ?? "—" },
                { label: "Groups", val: scanResult.counts.groups ?? "—" },
                { label: "Policies", val: scanResult.counts.policies ?? "—" },
              ].map(({ label, val }) => (
                <div key={label} style={{ background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.14)", borderRadius: 6, padding: "8px 10px", textAlign: "center" }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: BLUE, fontFamily: "ui-monospace,monospace" }}>{val}</div>
                  <div style={{ fontSize: 9, color: "rgba(171,200,230,0.45)", letterSpacing: "0.1em", textTransform: "uppercase", marginTop: 3 }}>{label}</div>
                </div>
              ))}
            </div>
          )}
          {scanResult?.findings && <ScanResultBadge findings={scanResult.findings} />}
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <button style={{ ...s.miniActionButton, borderColor: BLUE_DIM, color: BLUE }} onClick={() => void scanOkta()}>Run Scan</button>
            <button style={s.miniActionButton} onClick={() => void disconnectOkta()}>Disconnect</button>
          </div>
        </>
      ) : (
        <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div style={{ display: "grid", gap: 7 }}>
              <div style={s.dashCardLabel}>OKTA DOMAIN</div>
              <input
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="yourorg.okta.com"
                style={{ ...s.commandInput, padding: "10px 12px", fontSize: 12 }}
              />
            </div>
            <div style={{ display: "grid", gap: 7 }}>
              <div style={s.dashCardLabel}>API TOKEN</div>
              <input
                type="password"
                value={apiToken}
                onChange={(e) => setApiToken(e.target.value)}
                placeholder="SSWS …"
                style={{ ...s.commandInput, padding: "10px 12px", fontSize: 12 }}
              />
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button
              style={{ ...s.miniActionButton, background: apiToken && domain ? "rgba(59,130,246,0.12)" : undefined, borderColor: apiToken && domain ? BLUE_DIM : undefined, color: apiToken && domain ? BLUE : undefined }}
              onClick={handleConnect}
              disabled={!apiToken.trim() || !domain.trim()}
            >
              Connect Okta
            </button>
          </div>
          <ConnectorNote>
            Create a read-only API token in Okta Admin → Security → API → Tokens.
            Required scopes: <span style={{ fontFamily: "monospace" }}>okta.users.read, okta.apps.read, okta.policies.read</span>
          </ConnectorNote>
        </div>
      )}
    </div>
  );
}

// ── Snyk connector ────────────────────────────────────────────────────────────

export function SnykConnectorPanel({ connector, connectSnyk, disconnectSnyk, scanSnyk, message, scanResult }) {
  const [apiToken, setApiToken] = useState("");
  const [orgId, setOrgId] = useState("");
  const connected = connector?.connected;
  const PURPLE = "#a855f7";
  const PURPLE_DIM = "rgba(168,85,247,0.6)";
  const BORDER = connected ? "rgba(168,85,247,0.3)" : "rgba(120,140,160,0.2)";

  const handleConnect = () => {
    if (!apiToken.trim()) return;
    void connectSnyk({ apiToken: apiToken.trim(), orgId: orgId.trim() || undefined });
    setApiToken(""); setOrgId("");
  };

  return (
    <div style={{ ...s.dashCard, marginBottom: 12, borderColor: BORDER }}>
      <ConnectorHeader
        label="SNYK CONNECTOR"
        description={connected
          ? `${connector.org_id ? `Org ${connector.org_id}` : "Snyk"} · ${connector.token_hint || ""}`
          : "Connect Snyk to surface critical and high CVEs across your projects and detect stale dependency scans."}
        connected={connected}
        accentColor={PURPLE}
        accentDim={PURPLE_DIM}
      />
      <ConnectorMessage message={message} accentDim={PURPLE_DIM} />

      {connected ? (
        <>
          {scanResult?.counts && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginTop: 14 }}>
              {[
                { label: "Projects", val: scanResult.counts.projects ?? "—" },
                { label: "Critical", val: scanResult.counts.critical_vulns ?? "—" },
                { label: "High", val: scanResult.counts.high_vulns ?? "—" },
                { label: "Stale", val: scanResult.counts.stale_projects ?? "—" },
              ].map(({ label, val }) => (
                <div key={label} style={{ background: "rgba(168,85,247,0.06)", border: "1px solid rgba(168,85,247,0.14)", borderRadius: 6, padding: "8px 10px", textAlign: "center" }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: PURPLE, fontFamily: "ui-monospace,monospace" }}>{val}</div>
                  <div style={{ fontSize: 9, color: "rgba(171,200,230,0.45)", letterSpacing: "0.1em", textTransform: "uppercase", marginTop: 3 }}>{label}</div>
                </div>
              ))}
            </div>
          )}
          {scanResult?.findings && <ScanResultBadge findings={scanResult.findings} />}
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <button style={{ ...s.miniActionButton, borderColor: PURPLE_DIM, color: PURPLE }} onClick={() => void scanSnyk()}>Run Scan</button>
            <button style={s.miniActionButton} onClick={() => void disconnectSnyk()}>Disconnect</button>
          </div>
        </>
      ) : (
        <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div style={{ display: "grid", gap: 7 }}>
              <div style={s.dashCardLabel}>API TOKEN</div>
              <input
                type="password"
                value={apiToken}
                onChange={(e) => setApiToken(e.target.value)}
                placeholder="Snyk API token"
                style={{ ...s.commandInput, padding: "10px 12px", fontSize: 12 }}
              />
            </div>
            <div style={{ display: "grid", gap: 7 }}>
              <div style={s.dashCardLabel}>ORG ID (optional)</div>
              <input
                value={orgId}
                onChange={(e) => setOrgId(e.target.value)}
                placeholder="Leave blank to auto-detect"
                style={{ ...s.commandInput, padding: "10px 12px", fontSize: 12 }}
              />
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button
              style={{ ...s.miniActionButton, background: apiToken ? "rgba(168,85,247,0.12)" : undefined, borderColor: apiToken ? PURPLE_DIM : undefined, color: apiToken ? PURPLE : undefined }}
              onClick={handleConnect}
              disabled={!apiToken.trim()}
            >
              Connect Snyk
            </button>
          </div>
          <ConnectorNote>
            Generate a token at <span style={{ fontFamily: "monospace" }}>app.snyk.io → Account Settings → API Token</span>.
            The Org ID is optional — Aria will detect it from the first accessible org.
          </ConnectorNote>
        </div>
      )}
    </div>
  );
}

// ── Azure AD connector ────────────────────────────────────────────────────────

export function AzureAdConnectorPanel({ connector, connectAzureAd, disconnectAzureAd, scanAzureAd, message, scanResult }) {
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [tenantId, setTenantId] = useState("");
  const connected = connector?.connected;
  const MSBLUE = "#0078d4";
  const MSBLUE_DIM = "rgba(0,120,212,0.6)";
  const BORDER = connected ? "rgba(0,120,212,0.3)" : "rgba(120,140,160,0.2)";

  const handleConnect = () => {
    if (!clientId.trim() || !clientSecret.trim() || !tenantId.trim()) return;
    void connectAzureAd({ clientId: clientId.trim(), clientSecret: clientSecret.trim(), tenantId: tenantId.trim() });
    setClientId(""); setClientSecret(""); setTenantId("");
  };

  return (
    <div style={{ ...s.dashCard, marginBottom: 12, borderColor: BORDER }}>
      <ConnectorHeader
        label="AZURE AD CONNECTOR"
        description={connected
          ? `Tenant ${connector.tenant_id || "—"} · ${connector.client_hint || ""}`
          : "Connect Azure AD to scan users, app registrations, service principals, and Conditional Access policy gaps."}
        connected={connected}
        accentColor={MSBLUE}
        accentDim={MSBLUE_DIM}
      />
      <ConnectorMessage message={message} accentDim={MSBLUE_DIM} />

      {connected ? (
        <>
          {scanResult?.counts && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginTop: 14 }}>
              {[
                { label: "Users", val: scanResult.counts.users ?? "—" },
                { label: "Apps", val: scanResult.counts.apps ?? "—" },
                { label: "Svc Principals", val: scanResult.counts.servicePrincipals ?? "—" },
                { label: "CA Policies", val: scanResult.counts.conditionalAccessPolicies ?? "—" },
              ].map(({ label, val }) => (
                <div key={label} style={{ background: "rgba(0,120,212,0.06)", border: "1px solid rgba(0,120,212,0.14)", borderRadius: 6, padding: "8px 10px", textAlign: "center" }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: MSBLUE, fontFamily: "ui-monospace,monospace" }}>{val}</div>
                  <div style={{ fontSize: 9, color: "rgba(171,200,230,0.45)", letterSpacing: "0.1em", textTransform: "uppercase", marginTop: 3 }}>{label}</div>
                </div>
              ))}
            </div>
          )}
          {scanResult?.findings && <ScanResultBadge findings={scanResult.findings} />}
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <button style={{ ...s.miniActionButton, borderColor: MSBLUE_DIM, color: MSBLUE }} onClick={() => void scanAzureAd()}>Run Scan</button>
            <button style={s.miniActionButton} onClick={() => void disconnectAzureAd()}>Disconnect</button>
          </div>
        </>
      ) : (
        <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div style={{ display: "grid", gap: 7 }}>
              <div style={s.dashCardLabel}>TENANT ID</div>
              <input
                value={tenantId}
                onChange={(e) => setTenantId(e.target.value)}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                style={{ ...s.commandInput, padding: "10px 12px", fontSize: 12 }}
              />
            </div>
            <div style={{ display: "grid", gap: 7 }}>
              <div style={s.dashCardLabel}>CLIENT ID (App ID)</div>
              <input
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder="App registration client ID"
                style={{ ...s.commandInput, padding: "10px 12px", fontSize: 12 }}
              />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "end" }}>
            <div style={{ display: "grid", gap: 7 }}>
              <div style={s.dashCardLabel}>CLIENT SECRET</div>
              <input
                type="password"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                placeholder="App registration client secret"
                style={{ ...s.commandInput, padding: "10px 12px", fontSize: 12 }}
              />
            </div>
            <button
              style={{ ...s.miniActionButton, background: clientId && clientSecret && tenantId ? "rgba(0,120,212,0.12)" : undefined, borderColor: clientId && clientSecret && tenantId ? MSBLUE_DIM : undefined, color: clientId && clientSecret && tenantId ? MSBLUE : undefined }}
              onClick={handleConnect}
              disabled={!clientId.trim() || !clientSecret.trim() || !tenantId.trim()}
            >
              Connect Azure AD
            </button>
          </div>
          <ConnectorNote>
            Create an App Registration in Azure Portal → App registrations. Grant API permissions:
            <span style={{ fontFamily: "monospace" }}> User.Read.All, Application.Read.All, Policy.Read.All</span> (Application type).
          </ConnectorNote>
        </div>
      )}
    </div>
  );
}

// ── VirusTotal connector ──────────────────────────────────────────────────────

export function VirusTotalConnectorPanel({ connector, connectVirusTotal, disconnectVirusTotal, enrichIocs, message, scanResult }) {
  const [apiKey, setApiKey] = useState("");
  const [iocInput, setIocInput] = useState("");
  const connected = connector?.connected;
  const RED = "#ef4444";
  const RED_DIM = "rgba(239,68,68,0.6)";
  const BORDER = connected ? "rgba(239,68,68,0.3)" : "rgba(120,140,160,0.2)";

  const handleConnect = () => {
    if (!apiKey.trim()) return;
    void connectVirusTotal({ apiKey: apiKey.trim() });
    setApiKey("");
  };

  const handleEnrich = () => {
    const iocs = iocInput.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
    if (!iocs.length) return;
    void enrichIocs(iocs);
    setIocInput("");
  };

  return (
    <div style={{ ...s.dashCard, marginBottom: 12, borderColor: BORDER }}>
      <ConnectorHeader
        label="VIRUSTOTAL CONNECTOR"
        description={connected
          ? `Threat intel enrichment active · ${connector.key_hint || ""}`
          : "Connect VirusTotal to enrich IOCs (IPs, domains, file hashes, URLs) with threat intelligence from 70+ engines."}
        connected={connected}
        accentColor={RED}
        accentDim={RED_DIM}
      />
      <ConnectorMessage message={message} accentDim={RED_DIM} />

      {connected ? (
        <>
          {scanResult?.findings && <ScanResultBadge findings={scanResult.findings} />}
          {scanResult?.enriched && scanResult.enriched.length > 0 && (
            <div style={{ marginTop: 10, display: "grid", gap: 5, maxHeight: 120, overflowY: "auto" }}>
              {scanResult.enriched.map((r) => (
                <div key={r.ioc} style={{ ...s.feedLine, display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontFamily: "monospace", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.ioc}</span>
                  <span style={{ fontSize: 10, flexShrink: 0, color: r.threat_verdict === "malicious" ? RED : r.threat_verdict === "suspicious" ? "#ffc857" : "#2dd4bf", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                    {r.enriched ? r.threat_verdict : r.reason || "—"}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
            <div style={s.dashCardLabel}>ENRICH IOCs</div>
            <textarea
              value={iocInput}
              onChange={(e) => setIocInput(e.target.value)}
              placeholder={"8.8.8.8\nevil.domain.com\nabc123def456…"}
              rows={3}
              style={{ ...s.commandInput, resize: "vertical", fontFamily: "ui-monospace,monospace", fontSize: 12 }}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button style={{ ...s.miniActionButton, borderColor: RED_DIM, color: RED }} onClick={handleEnrich} disabled={!iocInput.trim()}>Enrich IOCs</button>
              <button style={s.miniActionButton} onClick={() => void disconnectVirusTotal()}>Disconnect</button>
            </div>
          </div>
        </>
      ) : (
        <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
          <div style={{ display: "grid", gap: 7 }}>
            <div style={s.dashCardLabel}>API KEY</div>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="VirusTotal API key (64 hex chars)"
              style={{ ...s.commandInput, padding: "10px 12px", fontSize: 12 }}
            />
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button
              style={{ ...s.miniActionButton, background: apiKey ? "rgba(239,68,68,0.1)" : undefined, borderColor: apiKey ? RED_DIM : undefined, color: apiKey ? RED : undefined }}
              onClick={handleConnect}
              disabled={!apiKey.trim()}
            >
              Connect VirusTotal
            </button>
          </div>
          <ConnectorNote>
            Free tier: 500 lookups/day. Get your key at{" "}
            <span style={{ fontFamily: "monospace" }}>virustotal.com → Profile → API Key</span>.
          </ConnectorNote>
        </div>
      )}
    </div>
  );
}

// ── Elastic Security connector ────────────────────────────────────────────────

export function ElasticConnectorPanel({ connector, connectElastic, disconnectElastic, scanElastic, message, scanResult }) {
  const [url, setUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [kibanaUrl, setKibanaUrl] = useState("");
  const [showKibana, setShowKibana] = useState(false);
  const connected = connector?.connected;
  const GOLD = "#f59e0b";
  const GOLD_DIM = "rgba(245,158,11,0.6)";
  const BORDER = connected ? "rgba(245,158,11,0.3)" : "rgba(120,140,160,0.2)";

  const clusterStatusColor = (st) => st === "green" ? "#2dd4bf" : st === "yellow" ? "#ffc857" : st === "red" ? "#ff4060" : "rgba(171,200,230,0.4)";

  const handleConnect = () => {
    if (!url.trim() || !apiKey.trim()) return;
    void connectElastic({ url: url.trim(), apiKey: apiKey.trim(), kibanaUrl: kibanaUrl.trim() || undefined });
    setUrl(""); setApiKey(""); setKibanaUrl("");
  };

  return (
    <div style={{ ...s.dashCard, marginBottom: 12, borderColor: BORDER }}>
      <ConnectorHeader
        label="ELASTIC SECURITY"
        description={connected
          ? `${connector.cluster_name || connector.url_hint || "Elastic"} · cluster ${connector.cluster_status || "—"}`
          : "Connect Elastic Security to monitor cluster health, detection alerts, and disabled SIEM rules."}
        connected={connected}
        accentColor={GOLD}
        accentDim={GOLD_DIM}
      />
      <ConnectorMessage message={message} accentDim={GOLD_DIM} />

      {connected ? (
        <>
          {scanResult && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginTop: 14 }}>
              {[
                { label: "Alerts (7d)", val: scanResult.alert_count ?? "—" },
                { label: "Rules", val: scanResult.rule_count ?? "—" },
                { label: "Rules On", val: scanResult.rules_enabled ?? "—" },
                { label: "Sec Indices", val: scanResult.security_indices ?? "—" },
              ].map(({ label, val }) => (
                <div key={label} style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.14)", borderRadius: 6, padding: "8px 10px", textAlign: "center" }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: GOLD, fontFamily: "ui-monospace,monospace" }}>{val}</div>
                  <div style={{ fontSize: 9, color: "rgba(171,200,230,0.45)", letterSpacing: "0.1em", textTransform: "uppercase", marginTop: 3 }}>{label}</div>
                </div>
              ))}
            </div>
          )}
          {connector.cluster_status && (
            <div style={{ marginTop: 8, fontSize: 11, color: "rgba(171,200,230,0.55)" }}>
              Cluster status:{" "}
              <span style={{ color: clusterStatusColor(connector.cluster_status), fontWeight: 600, textTransform: "uppercase" }}>
                {connector.cluster_status}
              </span>
            </div>
          )}
          {scanResult?.findings && <ScanResultBadge findings={scanResult.findings} />}
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <button style={{ ...s.miniActionButton, borderColor: GOLD_DIM, color: GOLD }} onClick={() => void scanElastic()}>Run Scan</button>
            <button style={s.miniActionButton} onClick={() => void disconnectElastic()}>Disconnect</button>
          </div>
        </>
      ) : (
        <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
          <div style={{ display: "grid", gap: 7 }}>
            <div style={s.dashCardLabel}>ELASTIC URL</div>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://your-cluster:9200"
              style={{ ...s.commandInput, padding: "10px 12px", fontSize: 12 }}
            />
          </div>
          <div style={{ display: "grid", gap: 7 }}>
            <div style={s.dashCardLabel}>API KEY</div>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Base64 API key"
              style={{ ...s.commandInput, padding: "10px 12px", fontSize: 12 }}
            />
          </div>
          <div>
            <button
              style={{ background: "none", border: "none", color: "rgba(171,200,230,0.4)", fontSize: 11, cursor: "pointer", letterSpacing: "0.06em", padding: 0 }}
              onClick={() => setShowKibana((v) => !v)}
            >
              {showKibana ? "▲ Hide" : "▼ Kibana URL"} (if different from Elastic URL)
            </button>
            {showKibana && (
              <input
                value={kibanaUrl}
                onChange={(e) => setKibanaUrl(e.target.value)}
                placeholder="https://your-kibana:5601"
                style={{ ...s.commandInput, padding: "10px 12px", fontSize: 12, marginTop: 8, boxSizing: "border-box" }}
              />
            )}
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button
              style={{ ...s.miniActionButton, background: url && apiKey ? "rgba(245,158,11,0.1)" : undefined, borderColor: url && apiKey ? GOLD_DIM : undefined, color: url && apiKey ? GOLD : undefined }}
              onClick={handleConnect}
              disabled={!url.trim() || !apiKey.trim()}
            >
              Connect Elastic
            </button>
          </div>
          <ConnectorNote>
            Requires an API key with{" "}
            <span style={{ fontFamily: "monospace" }}>cluster:monitor/health, indices:monitor/stats</span>{" "}
            and Kibana detection engine read access for alert/rule scanning.
          </ConnectorNote>
        </div>
      )}
    </div>
  );
}

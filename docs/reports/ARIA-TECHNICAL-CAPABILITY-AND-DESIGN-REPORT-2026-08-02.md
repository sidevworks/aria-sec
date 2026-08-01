# ARIA Technical Capability and Design Report

**Product:** ARIA - Autonomous Resilience Intelligence Architecture

**Repository baseline:** `0410835` on `main`

**Assessment date:** 2 August 2026

**Assessment type:** Source-backed technical capability, architecture and product design review

**Primary deployment:** Single-operator Electron desktop application with a local Node.js service

**License:** Business Source License 1.1

## 1. Purpose and scope

This report describes what ARIA is, how it is designed, what it can currently do, how its principal subsystems interact, and where implementation maturity does not yet match the intended product direction.

The report is based on the current repository rather than presentation material. It covers:

- Product and interaction design
- Desktop, renderer and server architecture
- Artificial intelligence and voice execution paths
- Governed autonomy and the Trust Ladder
- Security operations, AI-SPM, identity, network and Bluetooth capabilities
- Connectors, data handling, persistence, authentication and auditability
- Deployment, testing, release engineering and operational limitations
- A prioritized route from the current working platform to a pilot-ready security product

This is not a penetration test, compliance certification or verification of cloud resources outside the repository. Live connector behavior still depends on valid credentials, reachable external services and the permissions granted to those integrations.

## 2. Evidence and maturity language

The following labels are used throughout the report.

| Label | Meaning |
|---|---|
| Implemented | The repository contains an executable path, UI or API integration and supporting logic. |
| Live when configured | The implementation calls a real external API or local service but requires credentials, infrastructure or a reachable provider. |
| Approval-gated | The system can prepare or execute the operation only through its governance path. |
| Partial | A meaningful implementation exists, but important coverage, durability or enforcement is incomplete. |
| Demo or sample | The path intentionally uses deterministic fixtures or presentation data and should not be described as live detection. |
| Staged only | ARIA produces a proposal, plan, file or pull request but does not enforce the final change itself. |
| Planned | The intended product direction is documented but the production path is not implemented. |

Important source documents used in the assessment include the [README](../../README.md), [published engineering audit](../../ROADMAP_AND_LIMITATIONS.md), [capability inventory](../ARIA-CAPABILITIES-FOR-LANDING-PAGE.md), [function reference](./ARIA-FUNCTION-REFERENCE.md) and [feature scope master](./aria-feature-scope-master.md). Where older documents conflict with current code, current code is treated as authoritative.

## 3. Executive technical summary

ARIA is a local-first security operations cockpit built around three connected ideas:

1. Security data should be explorable as a connected operational environment rather than as disconnected dashboards.
2. AI should explain, propose and coordinate work, but authority must be bounded by explicit policy and evidence.
3. Regulated operators should be able to run the reasoning path locally without silently sending security context to a cloud model.

The present system is a substantial working prototype. It includes a React 19 and Three.js spatial interface, an Electron desktop shell, a Node.js orchestration service, live connector implementations, local network and BLE discovery, identity analytics, an AI security posture management pipeline, approval queues, an action runner, per-capability trust scores, audit events and both cloud and local model routes.

The strongest engineering differentiator is the Trust Ladder. Trust is scoped to four capabilities rather than assigned globally. The model can read its current authority but cannot promote itself. Promotion requires threshold evidence and an explicit human decision. Failure can automatically demote a capability.

The strongest product differentiator is the combination of this governance system with a voice-native, spatial cockpit and a sovereign local-model path.

The system is not yet a hardened enterprise SOC platform. Its main limitations are:

- The general threat-scan narrative still contains simulated findings and queued or staged actions.
- Several response actions stop at planning, incident creation or connector handoff rather than enforcement.
- The voice loop is turn-based local STT, model inference and streamed TTS, not a single low-latency full-duplex speech session.
- File persistence remains important even though Postgres governance tables now exist.
- Release quality is not clean: the production frontend build passes, but lint and the all-tests-concurrently run do not.
- There is no checked-in continuous integration workflow, external service monitoring configuration or complete enterprise compliance pack.

The correct near-term description is: **working source-available, single-operator security operations software with real governance and discovery foundations, plus explicitly bounded demo-grade detection and response areas.**

## 4. Product design principles

### 4.1 Governed autonomy before unrestricted autonomy

ARIA treats autonomy as a capability-specific permission earned from outcomes. It does not give a model a single master switch. The operator remains the authority that approves promotion, defines policy and can reverse a trust decision.

### 4.2 Evidence before action

The desired operational chain is:

```text
Signal -> observation -> hypothesis -> evidence -> blast radius
       -> proposed action -> approval or policy gate -> execution
       -> verification -> audit event -> trust outcome
```

This chain appears across the reasoning engine, decision records, evidence store, action runner, approval queue, audit log and Trust Ladder.

### 4.3 Sovereignty as an architectural property

Local reasoning uses an OpenAI-compatible endpoint and rejects public hosts unless an operator explicitly permits remote use. Local mode does not silently fall back to a cloud provider. That makes the data-boundary claim enforceable at the model-routing layer.

Sovereignty is not yet complete for every optional experience. ElevenLabs text-to-speech is a cloud call, and cloud connectors naturally communicate with their configured providers. A fully disconnected deployment therefore needs local text-to-speech and only local data sources.

### 4.4 Honest source state

The interface and APIs distinguish live, stale, unavailable, sample and demo data in several areas. This should remain a formal design requirement: an impressive visualization must never erase the provenance of the data behind it.

### 4.5 One cockpit, multiple interaction modes

The platform is intended to support equivalent navigation and control through:

- Spatial point-and-click navigation
- Typed commands
- Spoken commands and questions
- Automatic routing when important events occur

This reduces context switching while allowing an operator to choose the fastest interaction for the situation.

## 5. System context

```text
Operator
  -> Electron desktop window or local browser
      -> React and Three.js renderer
          -> authenticated HTTP requests, SSE and WebSocket data
              -> local Node.js ARIA service on loopback
                  -> governance, memory, audit and persistence
                  -> local host, network and BLE observations
                  -> optional Postgres or KV durability
                  -> optional local LLM
                  -> configured cloud AI and security connectors

Public visitor
  -> static landing experience
      -> separate trial form API on AWS when configured
```

The platform server binds to loopback by default. The normal product is not an internet-facing SaaS backend. Docker publishes the server only on `127.0.0.1:5000` at the host boundary.

## 6. Technology stack and repository shape

| Layer | Current implementation |
|---|---|
| Desktop runtime | Electron 42, hardened runtime configuration, macOS DMG packaging |
| User interface | React 19, React DOM 19, Vite 7 |
| Spatial rendering | Three.js, React Three Fiber, Drei, postprocessing, GSAP |
| Local service | Node.js 22 HTTP and WebSocket service |
| Database option | PostgreSQL 16 via `pg` |
| Lightweight persistence | Tenant-scoped JSON, legacy JSON stores and optional REST KV |
| Local speech recognition | Quantized Whisper Small through `@xenova/transformers` |
| Cloud speech output | ElevenLabs streaming text-to-speech |
| Cloud reasoning | Anthropic and Google model routes |
| Local reasoning | Ollama, vLLM, LM Studio, llama.cpp or another OpenAI-compatible service |
| AWS discovery | Bedrock, Bedrock Agent, CloudTrail, IAM, Lambda, S3, Secrets Manager and STS SDK clients |
| Testing | Node built-in test runner plus source and component contract tests |
| Licensing | BSL 1.1, source-available rather than OSI open source |

At the assessed revision the repository contains 76 server-side `.mjs` modules, 91 files under `src`, 42 test files and approximately 172 distinct API path literals. The principal implementation files are large: [server/index.mjs](../../server/index.mjs) is 4,485 lines and [src/App.jsx](../../src/App.jsx) is 12,516 lines. These sizes now create maintenance and review risk even though feature modules have started moving into dedicated files.

## 7. Runtime architecture

### 7.1 Electron main process

The [Electron main process](../../electron/main.js) owns native and privileged behavior:

- Starts and monitors the local Node service
- Uses a writable application data directory in packaged builds
- Generates a unique 32-byte credential-encryption key per installation when none is provided
- Stores that key with mode `0600` where the platform permits it
- Polls server health and updates application state
- Provides tray actions and native notifications
- Uses a secure custom `app://` scheme so microphone access works in the packaged renderer
- Supports Touch ID through Electron system APIs where available
- Restricts externally opened links
- Configures a hardened macOS runtime and microphone/Bluetooth entitlements

The [preload bridge](../../electron/preload.js) exposes a small IPC surface for notifications, server status, tray actions, threat-state updates and safe external links. It does not expose raw filesystem or arbitrary Node execution to the renderer.

### 7.2 Renderer

The renderer has three broad surfaces:

- Public cinematic landing page
- Demo/evaluation application path
- Full platform path with authentication and first-run setup

[PlatformRoot](../../src/PlatformRoot.jsx) controls the initial gate. [App](../../src/App.jsx) contains the primary cockpit and lazy-loads major functional panels. A shared API wrapper handles authentication, retries, timeouts, request deduplication, quota responses and global logout behavior.

### 7.3 Local service

[server/index.mjs](../../server/index.mjs) is the composition root. It owns the core HTTP routing and ties together:

- Authentication and authorization
- Live telemetry streams
- Model selection and model calls
- TTS streaming
- Scan scheduling and records
- AI-SPM requests
- Trust, approval, policy and audit APIs
- Connectors
- Incident and response operations
- Identity, network and Bluetooth route modules

Dedicated route modules now isolate authentication, commands, identity, policy, incident, quarantine, network, Bluetooth and local voice concerns. Continued extraction from `index.mjs` remains advisable.

### 7.4 Data and event movement

The renderer fetches snapshots for panels and uses server-sent events or WebSockets for live state. The service emits domain events through an in-process event bus. Reasoning, response and audit components subscribe to or publish those events. Durable stores capture selected decisions, approvals, actions, trust outcomes and scan artifacts.

The service is best understood as a modular monolith. This is appropriate for a local desktop product and a solo development team. Splitting it into network services would increase operational cost without fixing the current product risks.

## 8. Interaction and visual design

### 8.1 Galaxy navigation model

ARIA represents security domains as sectors and functional destinations as nodes. This establishes a spatial memory for the operator: identity, network, threat intelligence, response and AI security are locations within the same environment.

The navigation system supports a high-level posture view and focused rooms or panels. The design makes relationships and urgency visible without requiring the operator to remember a menu hierarchy.

### 8.2 Visual language

The cockpit uses a dark spatial canvas, luminous telemetry, motion and a consistent state palette:

- Cool blue or cyan for nominal and informational states
- Amber for review, uncertainty or elevated risk
- Red or magenta for critical conditions and active threats
- Muted states for unavailable, disconnected or stale sources

Dedicated visual instruments include firewall flow, particle diffusion, log vortex, orbital telemetry, neural node graphs, event-horizon timelines, perimeter views, quarantine vaults and identity galaxies. The most valuable design rule is that visual drama must remain attached to interpretable evidence and a data-mode label.

### 8.3 Functional panels

The cockpit includes dedicated functional surfaces for:

- Unified posture and overview
- Threat vectors, timeline, logs, incidents and perimeter
- Identity galaxies, behavior, privilege drift, sessions and policy gates
- Network discovery and Bluetooth/BLE analysis
- AI-SPM inventory, findings, evidence and remediation
- Command center and approvals
- Decision engine and attack paths
- Trust Ladder control
- Security administration and policy changes
- Connector onboarding and connector-specific state

### 8.4 Evidence design

Evidence drawers and narrative controls are intended to answer four questions:

1. What happened?
2. Why does ARIA think it matters?
3. What data supports that judgment?
4. What can safely be done next?

This is more important than the visualization itself. The cockpit should continue moving toward a consistent evidence contract shared by all panels.

### 8.5 Current user-experience constraints

- The primary layout is optimized for a large analyst workstation and Electron window.
- Several 3D and canvas experiences do not have equivalent keyboard or screen-reader paths.
- Loading, empty, disconnected and stale states are inconsistent between panels.
- `App.jsx` has accumulated too many responsibilities, which increases the chance that apparently small voice or panel changes affect unrelated behavior.
- The largest frontend bundles remain heavy. The build reports a 751 kB Three.js chunk and a 508 kB landing chunk before gzip.

## 9. AI architecture

### 9.1 Intelligence modes

ARIA exposes four operating choices:

| Mode | Reasoning path | Boundary behavior |
|---|---|---|
| Cloud | Anthropic | Sends selected prompt context to the configured Anthropic service. |
| Gemini | Google Gemini | Sends selected prompt context to the configured Google service. |
| Local | OpenAI-compatible local endpoint | Rejects public endpoint hosts unless remote use is explicitly enabled. Never silently falls back to cloud. |
| Hybrid | Cloud with local failover | Uses cloud while available and local as a defined fallback. |

The model status endpoint reports which engines are actually available. The interface is designed to disable unavailable modes rather than pretend a model is active.

### 9.2 Local model enforcement

[localLlm.mjs](../../server/localLlm.mjs) accepts loopback, RFC1918, carrier-grade NAT, link-local, private IPv6 and selected local domain names. A public host is rejected unless `ARIA_LOCAL_LLM_ALLOW_REMOTE` is explicitly enabled.

The client probes `/models`, selects an explicitly configured model or the first available model, and calls `/chat/completions`. It implements timeouts, bearer-token support and cache invalidation when a completion fails.

### 9.3 Conversational intelligence

[ariaIntelligence.mjs](../../server/ariaIntelligence.mjs) combines a deterministic navigation router with model-generated answers grounded in a compact live platform context. The prompt instructs the model to:

- Treat the current platform context as ground truth
- Use organizational memory when relevant
- Identify deviations from learned baselines
- Label stale, unavailable and demo data
- Avoid inventing observations
- Keep live voice answers short enough to be useful

If the model is absent or returns an unusable answer, a deterministic fallback summarizes the current panel and source health.

### 9.4 Decision orchestration

[ariaOrchestrator.mjs](../../server/ariaOrchestrator.mjs) defines structured decisions made from observations, reasoning, confidence, evidence, attack paths and proposed actions. The orchestration path uses safety-focused instructions and persists decision and evidence records.

The [reasoning engine](../../server/reasoningEngine.mjs) runs a recurring correlation cycle over a rolling signal buffer. It evaluates correlation rules, creates deduplicated hypotheses, calculates confidence from evidence and broadcasts updates.

### 9.5 Model authority boundary

The model is an analyst and proposal engine, not the final authority. It cannot:

- Promote its own Trust Ladder capability
- Bypass role authorization
- Skip a required approval
- Directly write the platform's trust score
- Convert unavailable telemetry into verified evidence
- Make Local mode silently egress to a cloud provider

The main architectural objective is to keep this boundary in deterministic code rather than in prompt instructions alone.

## 10. Voice architecture

### 10.1 Current speech pipeline

The implemented conversational path is:

```text
Microphone audio
  -> renderer capture and PCM conversion
  -> local `/api/voice/stt`
  -> quantized Whisper transcription
  -> ARIA intelligence request with live context
  -> model or deterministic response
  -> `/api/tts`
  -> ElevenLabs streaming audio
  -> playback and visual speaking state
```

Speech recognition is local. The default model is `Xenova/whisper-small`, loaded lazily and cached under the persistence directory. Its first use can download roughly 150 MB and creates a cold-start delay unless the voice pipeline is warmed or the model is pre-cached.

Text-to-speech uses ElevenLabs. Interactive and general output default to `eleven_flash_v2_5`; `eleven_v3` is reserved for explicitly expressive, non-interactive output. Audio begins from the streaming response rather than waiting for the complete file.

### 10.2 What "real-time" means in the current build

The present voice experience is a rapid turn-based loop. It is not one continuous, full-duplex speech-to-speech connection. The user finishes a captured utterance, Whisper transcribes it, a text model responds and ElevenLabs streams the answer.

This distinction explains why total latency can still be noticeable even with a fast TTS model. Latency is the sum of utterance detection, audio flushing, local transcription, context assembly, model inference, ElevenLabs time-to-first-byte, browser decoding and playback.

### 10.3 Voice strengths

- Voice input remains local.
- TTS model choice separates low-latency conversation from expressive narration.
- Navigation can be deterministic and does not require model inference.
- The conversation receives current panel and platform context.
- The platform exposes provider availability instead of silently failing.

### 10.4 Voice limitations and recommended design

- Warm Whisper during application startup when voice is enabled.
- Pre-cache the model as part of installation or first-run setup.
- Stream partial transcripts if the selected local STT runtime supports them.
- Keep deterministic navigation outside the LLM path.
- Record stage timings for capture, STT, model and TTS so delays are attributable.
- Add a local TTS provider before describing an installation as fully air-gapped with voice output.
- If genuine overlapping speech and interruption are required, introduce a full-duplex voice session with explicit barge-in and cancellation semantics rather than describing the current loop as full duplex.

## 11. Trust Ladder and governed autonomy

### 11.1 Capability scope

Trust is independently stored for:

- `threat_analysis`
- `remediation`
- `containment`
- `identity_actions`

Success in threat analysis therefore does not automatically grant containment authority.

### 11.2 Modes

| Rung | Mode | Intended behavior |
|---|---|---|
| 1 | `approval` | ARIA proposes and a person approves actions. |
| 2 | `assisted` | Low-risk work may proceed while higher-risk work is escalated. |
| 3 | `auto` | Most work may proceed except actions restricted by risk or policy. |
| 4 | `full_auto` | The capability acts within its policy envelope and reports the outcome. |

### 11.3 Trust calculation

The current trust score is:

```text
trust = successes / (successes + failures + overrides * 0.5)
```

The value is rounded to three decimal places. If no success or failure samples exist, trust is zero. The 20 most recent outcomes are retained as recent history, while aggregate counters remain available.

### 11.4 Promotion gates

| Transition | Minimum trust | Minimum success/failure samples | Maximum overrides |
|---|---:|---:|---:|
| Approval to assisted | 0.80 | 10 | 3 |
| Assisted to auto | 0.90 | 30 | 2 |
| Auto to full auto | 0.97 | 80 | 1 |

Passing a gate does not cause automatic promotion. An operator must promote the capability and provide a written reason. The transition is audited.

### 11.5 Demotion behavior

Failures and excess overrides can automatically move a non-approval capability down one rung. This asymmetry is deliberate: authority is granted manually but can be removed automatically when the evidence worsens.

### 11.6 Persistence and tenancy

Trust is tenant-scoped in current code. It can be stored in tenant-specific files or in the Postgres `trust_scores` table. Postgres updates use transactions and per-tenant, per-capability rows.

### 11.7 Current scoring limitations

The mechanism is coherent but the score is still a first-generation model:

- It does not weight outcomes by action severity or blast radius.
- An easy low-risk success contributes like a difficult high-risk success.
- Aggregate failures remain permanently influential while recent history is capped.
- Auto-demotion currently checks the cumulative failure count rather than only failures since the latest promotion. Once a capability has any recorded failure, a later outcome can demote it again after manual promotion. That behavior is safer than accidental escalation, but it needs an explicit recovery or evaluation-window design.
- There is no time decay, environment-change reset or confidence interval.
- Operator acceptance and technically verified success are not yet represented as separate dimensions.
- A promotion threshold can demonstrate consistency, but not necessarily competence on a new class of action.

Before enterprise use, trust should be calculated per capability and action class, with risk-weighted outcomes, verification quality, operator acceptance, recency and minimum exposure to representative failure cases.

## 12. Approval and action execution design

### 12.1 Unified action lifecycle

[actionRunner.mjs](../../server/actionRunner.mjs) is designed as the single execution route for automated and operator-triggered actions:

1. Capture pre-action state.
2. Check risk tier, actor and approval requirements.
3. Execute the registered handler.
4. Re-observe and verify the expected result.
5. Persist an execution record.
6. Emit one compliance-oriented audit event.

The registry requires every action to declare a risk tier and reversibility.

### 12.2 Registered actions

The current registry includes 15 actions:

| Action | Tier | Current effect |
|---|---|---|
| Collect evidence | Low | Produces an evidence snapshot result. |
| Geo lookup | Low | Records a lookup result but is not a full enrichment integration. |
| Run scan | Low | Queues a scan state. |
| Deep scan | Low | Queues a scan state. |
| Block IP | Medium | Writes to the tenant block list and verifies presence. |
| Kill process | Medium | Sends a constrained process signal and verifies process absence. |
| Revoke session | Medium | Calls the session revocation path. |
| Isolate process | Medium | Creates an isolation incident rather than enforcing OS containment. |
| Isolate host | Critical | Queues network-layer isolation and requires an enforcement layer. |
| Stage host isolation | Critical | Builds a local isolation plan. |
| Scan local artifacts | Medium | Runs a bounded local filesystem artifact scan. |
| Quarantine bulk | Critical | Moves selected items through the quarantine store. |
| Policy change | Critical | Stages a policy change for review. |
| AI-SPM apply remediation | Medium | Opens a GitHub pull request or stages an artifact. |
| AI-SPM rescan | Low | Re-scans to evaluate remediation state. |

This table is central to product honesty. "Action available" does not always mean "enforcement completed." Several actions intentionally create plans, incidents, queue entries or reviewable pull requests.

### 12.3 Approval memory

The approval subsystem stores pending requests with an expiry, resolves individual or bulk decisions, records operator interventions and can turn approved examples into recallable organizational memory. Existing history demonstrates approvals for scans, reports and threat-isolation proposals.

## 13. Security operations capabilities

### 13.1 Unified posture

ARIA combines source health, findings, incidents, telemetry, trust and connector state into an overview. It can present risk counts, source availability, review items and recent changes. Accuracy depends on each source being correctly labelled as live, cached, sample or unavailable.

### 13.2 Threat intelligence and timeline

The platform contains live-event, incident, threat-vector, timeline and log views. Correlation rules feed hypotheses and the decision engine can connect evidence into attack-path narratives.

The generic simulated scan engine remains a major boundary. It should not be described as an independent production detection engine. Real findings come from local artifact inspection, network observation, identity signals, AI-SPM rules and configured connectors.

### 13.3 Incident operations

Incidents can be created, listed, acknowledged, escalated, suppressed and archived. Automated response logic can create incidents from high-rate or coordinated activity. The current real-time detector uses in-memory sliding windows, so its immediate detection state is not fully replayable after restart.

### 13.4 Response

The platform supports blocked-IP and quarantine stores, bulk operations, release and deletion, process actions, session revocation, incident creation, staged isolation and GitHub remediation pull requests. External enforcement is only as real as the connector or operating-system action beneath the registered handler.

## 14. AI Security Posture Management

### 14.1 Inventory pipeline

[aiSpmInventory.mjs](../../server/aiSpmInventory.mjs) coordinates source preflight, asset discovery, normalization, deduplication, finding generation, fingerprint deduplication, suppression, graph persistence and scan history.

The inventory can represent:

- Model providers and endpoints
- Bedrock models, agents and knowledge bases
- SageMaker and AI-related AWS resources
- Repositories and workflows using AI providers
- Hardcoded-secret indicators with redacted evidence
- AI-related IAM roles and wildcard permissions
- Lambda AI workflows
- S3 resources associated with retrieval workflows
- Identity and vulnerability signals from connected services

### 14.2 Risk and blast radius

The rule engine converts inventory into severity-scored findings with rationale, attack-path information and recommendations. Blast-radius logic estimates reach from an exposed or misconfigured asset to sensitive resources. A relationship graph supports neighborhood queries and bounded breadth-first attack-path candidate discovery.

### 14.3 Evidence and cases

Operators can open a finding-specific evidence sandbox, generate a narrative, record act/resolve/ignore/reopen decisions, and generate a Markdown posture report. These are investigation and case-management capabilities. They are not a universal malware detonation sandbox.

### 14.4 Remediation

Remediation artifacts are currently template-driven. They can include scoped IAM policies, code diffs, tool allowlists and Bedrock guardrail configurations. ARIA can stage files or open a GitHub pull request for review. The unused model-generation stub must not be represented as a live LLM remediation generator.

### 14.5 Connector maturity

| Source | Capability | Maturity |
|---|---|---|
| GitHub | Local repository scan, remote repository scan, workflow review, provider and secret detection, remediation PR | Implemented; remote functions require GitHub access. |
| AWS | STS identity, multi-region AI asset discovery, IAM, CloudTrail, Lambda, S3 and Secrets Manager correlation | Live when configured with sufficient AWS permissions. |
| Okta | Identity threat signals | Live when configured. |
| Snyk | Dependency and vulnerability findings | Live when configured. |
| Azure AD | Microsoft Graph identity discovery | Live when configured. |
| VirusTotal | IOC enrichment | Live when configured and subject to provider limits. |
| Elastic Security | Cluster health, alerts and detection rules | Live when configured. |

Connector credentials are entered through server-side paths and stored through the credential vault. Missing credentials return a `not_configured` state rather than fabricated success.

## 15. Identity security design

The identity domain combines identity-provider data, baseline learning and network devices in a spatial risk model.

Implemented capabilities include:

- Identity galaxies and department grouping
- Risk leaderboard
- Access-event views
- Entity inspection and normalized timelines
- Session listing, revocation and forced reauthentication
- Behavior baselines and learning progress
- Impossible-travel detection
- Privilege drift timelines
- Watchlist and analyst brief surfaces
- Approval-gated response proposals when no enforcement connector exists

[identityBaselineStore.mjs](../../server/identityBaselineStore.mjs) records observations and derives anomalies from history. Network identity claims also use vendor, hostname, role and segment history to detect possible misrepresentation.

Sample identity data is explicitly available for demonstrations. Current route tests verify that sample galaxies are blocked in production unless sample behavior is explicitly enabled outside production.

## 16. Network intelligence

### 16.1 Passive discovery

Passive discovery reads the local ARP table, listens for mDNS advertisements and performs reverse DNS resolution. Broadcast and multicast MAC addresses are filtered before becoming device records.

### 16.2 Active discovery

Active discovery is authorization-gated. The operator supplies scope and authorization, which can be revoked or expire. The implementation can enumerate bounded `/24` hosts, ping and perform light TCP-connect probes. It is not a vulnerability exploit scanner.

### 16.3 Vendor attribution

The system bundles the IEEE MA-L registry offline. The assessed file contains 39,809 entries. This supports OUI attribution without sending observed MAC addresses to an external lookup service.

### 16.4 Device inference

ARIA combines hostname, vendor, open-port observations, services and subnet context to infer likely roles such as workstation, server, printer or network equipment. It computes risk reasons and groups devices into inferred subnet or department structures.

### 16.5 Identity-claim checking

The device identity path checks whether the evidence is internally consistent. Examples include:

- A printer-like hostname with a vendor or exposed services inconsistent with a printer
- A vendor change for an identifier with established history
- A device appearing on a segment outside its learned history
- An inferred role that conflicts with the advertised name or service profile

These are anomaly indicators, not proof of spoofing. Modern MAC randomization and recycled names require confidence and provenance to remain visible.

### 16.6 Network limitations

- ARP discovery primarily sees the local broadcast domain.
- Reverse DNS and mDNS depend on local network behavior.
- TCP-connect observations identify reachable ports, not the exact software version or exploitability.
- Exact physical position cannot be inferred from network discovery alone.
- Active scanning requires explicit legal and operational authorization.

## 17. Bluetooth and BLE intelligence

### 17.1 Scanner architecture

The BLE subsystem uses an optional native Noble-compatible binding. It exposes scanner status, discovered devices and explicit start/stop operations. The Electron build includes the native dependency families needed for packaged scanning.

### 17.2 Offline decoding

ARIA bundles Bluetooth assigned numbers rather than sending advertisements to an external lookup API. The assessed registry contains 3,987 company identifiers and 783 service identifiers.

Advertisement intelligence includes:

- Local name and identifier
- RSSI and observation count
- Manufacturer company identifier and decoded name
- Advertised service UUIDs and names
- Manufacturer payload metadata
- First-seen and last-seen timestamps
- Identity fingerprint and attribution state
- Estimated proximity band
- Device type and model hints where evidence permits

### 17.3 Device classification

Classification uses advertisement name, company identifier, service UUIDs and manufacturer payload signatures. The intelligence module contains specific fingerprint logic for selected Apple, Samsung and Midea-family advertisements as well as generic service-category inference.

The correct output is probabilistic: a likely vendor, class or model family with evidence and confidence. An anonymous rotating BLE address is not a durable identity by itself.

### 17.4 Position and proximity

With a single receiver, RSSI supports only a rough proximity band such as immediate, near, room, edge or distant. It does not provide a reliable map coordinate. Walls, device orientation, radio power, interference and human movement can change RSSI substantially.

Actual position requires multiple calibrated receivers, known anchor coordinates, synchronized observations and a positioning method such as trilateration or fingerprinting. ARIA currently provides proximity evidence, not indoor location tracking.

### 17.5 Audit and safety

Scan lifecycle and device observations can be written to audit records. BLE privacy addresses may rotate, so ARIA correctly treats names, services, manufacturer data and signal history as evidence rather than unquestionable identity.

## 18. Authentication, authorization and session security

### 18.1 Operator authentication

The local login path supports a single configured operator or a JSON list of operators. Sessions have a configurable lifetime. A built-in `operator` / `aria` account is limited to development, test or an explicit demo-login flag. Production startup does not enable it by default.

### 18.2 Authorization

The role model includes owner, admin, analyst and viewer. [authz.mjs](../../server/authz.mjs) resolves identity from a server session, verified JWT or tightly constrained local development headers. JWT verification covers signature, expiry and supported key algorithms through JWKS.

Permissions are checked by domain and operation. Denied and missing-context requests emit audit events.

### 18.3 Local bypass boundary

Header-based development identity is intended for loopback use. Allowing it on a remotely reachable server would weaken authentication and must remain an explicit development-only decision.

### 18.4 Session operations

ARIA can issue, list, revoke and force reauthentication of sessions. Security administration surfaces expose session and policy controls to authorized roles.

## 19. Credential and secret handling

Connector credentials use [credentialVault.mjs](../../server/connectors/credentialVault.mjs). Supported storage modes are:

- AES-256-GCM encrypted local files using a 32-byte installation or operator-provided key
- AWS Secrets Manager when enabled

Production startup is fail-closed if neither Secrets Manager nor a valid 64-character hexadecimal key is available. This fixes the older silent plaintext fallback finding.

Development can still run with a warning and plaintext connector storage if no key is configured. That is convenient for evaluation but unsuitable for real credentials.

API keys remain server-side. Only `VITE_` variables are intended for renderer build-time exposure, and these must never contain secrets.

## 20. Persistence and data model

### 20.1 File persistence

ARIA uses a configured persistence directory for local state. Tenant-aware stores place sensitive governance state below tenant-specific paths. Legacy modules still use shared or older JSON layouts, so persistence is not yet uniformly implemented through one repository abstraction.

### 20.2 PostgreSQL

The Docker path includes PostgreSQL 16. The current governance migration defines:

- Tenants
- Trust scores
- Decisions
- Evidence
- Audit events
- Approvals
- Scan records

The database adapter provides queries, transactions and schema setup when `ARIA_DATABASE_URL` is configured. Trust updates use this path. Not every feature store has migrated to Postgres.

### 20.3 KV

An optional REST KV backend supports durable counters and selected state. Without Postgres, KV or a durable persistence path, some state can fall back to process memory and disappear on restart.

### 20.4 Data retention

Audit events contain retention metadata with a default 90-day horizon. The local audit ledger has a finite event cap and lacks a complete rotation and external shipping strategy. A production deployment needs append-safe rotation, export, integrity protection and a customer-defined retention policy.

## 21. Auditability and evidence provenance

ARIA already has a meaningful audit foundation:

- Tenant and actor context
- Event type, status and timestamp
- Approval, denial and policy-change events
- Trust updates and transitions
- Action execution and outcome records
- Decision and evidence records
- Retention metadata
- In-app governance history and API access

The remaining gap is not "no audit log." It is the absence of one user-facing, tamper-evident export that joins the full chain of signal, exact source access, model and prompt version, evidence, approval, execution, verification, outcome and trust effect.

For SOC 2 and regulated pilots, the export should include stable correlation IDs and a cryptographic integrity strategy, then support delivery to a customer-owned SIEM or archive.

## 22. Policy management

Policy routes support list, preview, apply, history, rollback, templates, validation and dry-run behavior. Writes require an authorized role and a reason. The UI can show a proposed diff and risk before application.

Policy governance is valuable because it gives the Trust Ladder an external envelope: trust can decide whether ARIA may act within policy, but it should never expand the policy itself.

## 23. API surface

The local service exposes functional groups rather than a formally versioned public API. Principal groups include:

- `/api/auth/*` - login, logout and session state
- `/api/aria/*` - state, intelligence, commands, approvals, trust, policies, audit, decisions, evidence and operational loop
- `/api/ai-spm/*` - scanning, inventory, findings, evidence, reports, narrative, schedules and remediation
- `/api/connectors/*` - connector status, credential lifecycle, health and scans
- `/api/identity/*` - galaxies, entities, behavior, sessions, access events and actions
- `/api/network/*` - authorization, passive/active scans, interfaces and galaxies
- `/api/bluetooth/*` - scanner status, devices and scan control
- `/api/incidents`, `/api/blocked-ips` and `/api/quarantine` - response operations
- `/api/voice/*` and `/api/tts` - local transcription status and cloud speech output
- `/api/live*` and stream endpoints - live telemetry
- `/api/scan/*` - scan history, records, schedules, export and audit documents

This is a private local API today. Before third-party integration, it needs explicit versioning, schemas, pagination conventions, idempotency rules and generated API documentation.

## 24. Security architecture and threat model

### 24.1 Principal assets

- Connector credentials
- Operator sessions and identity
- Security telemetry and evidence
- Approval and policy records
- Trust scores and outcome history
- Model prompts and responses containing security context
- Quarantined files and staged remediation artifacts

### 24.2 Trust boundaries

| Boundary | Primary controls | Remaining concern |
|---|---|---|
| Renderer to local service | Session token, RBAC, loopback bind, security headers | Large local API surface and development bypass options |
| Electron renderer to native process | Context isolation and narrow preload bridge | Ongoing review needed as IPC grows |
| Service to cloud model | Explicit mode and BYOK | Prompt minimization and customer policy controls |
| Service to local model | Private-host enforcement | A remote override deliberately weakens sovereignty |
| Service to connectors | Scoped credentials and encrypted vault | Permissions may still be broader than necessary |
| Action proposal to execution | Tiering, approvals, policy and audit | Some handlers report staged success rather than external enforcement |
| Local persistence | AES-GCM for connector secrets, tenant paths | Mixed persistence patterns and limited log integrity |

### 24.3 HTTP controls

The service applies HSTS, frame denial, MIME sniffing protection and a restrictive permissions policy. CORS is allowlisted. Content Security Policy remains constrained by the rendering stack and should be reviewed as the renderer is hardened.

### 24.4 Primary abuse cases

- A malicious or compromised model proposes an unsafe action.
- Prompt injection enters through repository, alert or connector content.
- A low-privilege operator attempts policy or response actions.
- A local process steals session or connector material.
- Demo/sample data is mistaken for current evidence.
- An attacker manipulates a hostname, MAC address or BLE advertisement to influence identity inference.
- A public local-model endpoint causes unexpected data egress.
- A response action succeeds in the ARIA ledger but not in the target system.

The deterministic governance path addresses the first and third risks. The other cases require continued provenance, input isolation, credential hardening and post-action verification work.

## 25. Deployment models

### 25.1 Electron desktop

This is the primary product shape. The app starts a local service, stores writable data in the user's application-data directory and renders through a secure application scheme. macOS packaging enables hardened runtime and notarization settings.

### 25.2 Local web development

`npm run start:local` launches the local service and Vite renderer. Development login can be enabled for evaluation. This path should not be exposed to an untrusted network.

### 25.3 Docker

Docker Compose runs the Node service and PostgreSQL. Host ports are loopback-bound. The production service refuses startup without credential encryption. This is suitable as a local or single-site foundation, not a complete multi-tenant hosted architecture.

### 25.4 Public landing and trial form

The marketing surface is built separately from the platform. The repository contains an AWS SAM reference implementation for a trial form using Lambda, DynamoDB and SES. This boundary reduces the chance of accidentally exposing the operational platform through the public site.

### 25.5 Licensing and distribution

ARIA is source-available under BSL 1.1. It should not be described as open source in formal technical or commercial material. Distribution also includes an offline license-verification path for evaluation or commercial activation.

## 26. Observability and operations

Current operational visibility includes:

- Health endpoint
- Electron health polling
- Structured console and audit events
- Live application streams
- Connector health states
- Model status
- Voice pipeline status
- Source availability and stale-state UI concepts

Missing production operations include:

- External uptime and synthetic monitoring
- Central error aggregation
- Metrics with latency and error percentiles
- Alerting for connector failure, audit-write failure and model degradation
- Backup verification and restore exercises
- Operational runbooks
- Automated release promotion and rollback

Voice timing should be the first detailed latency instrumentation because it is directly visible to users.

## 27. Verification performed for this report

### 27.1 Successful checks

- `npm run build` passed with 693 modules transformed.
- The configured server suite passed 36 of 36 tests using its intended `./aria-memory` persistence path.
- The focused AI-SPM suite passed 26 of 26 tests.
- Production-security tests in the broader run confirmed that demo login is disabled in production and a valid credential-encryption configuration is mandatory.

### 27.2 Current quality failures

- `npm run lint` reports 94 issues: 45 errors and 49 warnings.
- A broad concurrent run of all 42 test files reports 312 passes and 106 failures. Some failures are test-isolation problems caused by shared environment, module state, persistence and response mocks. Others identify stale source-contract expectations and audit-path assumptions.
- The broad suite is therefore not a reliable green release gate in its current form.
- The production build warns about large frontend chunks.
- No checked-in workflow under `.github/workflows` was found.

The configured focused suites passing is useful evidence, but it does not justify calling the repository release-clean. The next quality target is one deterministic, isolated command that represents the complete supported test suite.

## 28. Capability maturity matrix

| Domain | Current level | Production blockers |
|---|---|---|
| Spatial cockpit | Implemented | Accessibility, responsiveness, bundle size and component complexity |
| Typed and voice navigation | Implemented | Voice latency instrumentation and stronger interruption semantics |
| Cloud model reasoning | Live when configured | Provider availability, prompt governance and cost controls |
| Sovereign local reasoning | Implemented | Hardware sizing, model evaluation and local TTS |
| Trust Ladder | Implemented foundation | Risk-weighted scoring, calibrated validation and operational trials |
| Approval queue | Implemented | Uniform durable storage and distributed-instance behavior |
| Action runner | Implemented framework | Replace staged/stub handlers with verified enforcement connectors |
| Audit ledger | Implemented foundation | Rotation, integrity, unified export and SIEM shipping |
| AI-SPM | Substantial and connector-dependent | Broader live validation and remediation verification |
| GitHub connector | Substantial | Enterprise auth patterns and large-repository scale testing |
| AWS connector | Substantial and live when configured | Permission minimization and account-scale testing |
| Okta, Snyk, Azure AD, VirusTotal, Elastic | Live when configured | Integration tests against real tenant environments |
| Identity analytics | Implemented with sample/live modes | Baseline calibration, connector enforcement and false-positive evaluation |
| Network discovery | Implemented local discovery | Routed-network coverage and sensor architecture |
| Device identity claims | Implemented heuristic detection | Confidence calibration and adversarial validation |
| Bluetooth/BLE | Implemented local scanner | Cross-platform packaging, receiver calibration and field validation |
| Incident management | Implemented foundation | Case workflow depth and external ticket/SIEM integration |
| Generic threat scan | Demo-grade | Replace simulated findings with real detection sources |
| Multi-tenant hosted service | Not a current product | Complete isolation, scalable storage, deployment and operations |
| Compliance readiness | Early foundation | Policies, evidence pack, controls testing and independent assessment |

## 29. Design risks and technical debt

### Critical before a real security pilot

1. Remove simulated scan findings from any live-data path or label them unmistakably as scenario data.
2. Create one end-to-end action proof where target-system state is verified after execution and failure affects trust.
3. Make the full automated test command isolated and deterministic.
4. Clear lint errors that hide real hook, purity and unused-path defects.
5. Complete audit rotation and a unified export for a pilot's evidence chain.
6. Validate every connector with least-privilege test accounts and document required permissions.

### High priority for pilot hardening

1. Instrument voice stage latency and warm local STT.
2. Break `App.jsx` and `server/index.mjs` into domain composition modules without changing product behavior.
3. Move remaining governance stores behind consistent tenant-aware repositories.
4. Persist autonomous response windows or emit enough raw events for deterministic replay.
5. Add external health monitoring, backup validation and operational runbooks.
6. Add prompt-injection containment and source-content trust labels around connector evidence.

### Later scale work

1. Formally version and document the local API.
2. Add multi-sensor network and BLE collection if customers need wider physical coverage.
3. Introduce semantic retrieval only after memory access controls and evaluation are defined.
4. Add a hosted multi-tenant control plane only if customer demand justifies changing the desktop-first model.
5. Build a local TTS path for fully disconnected voice operation.

## 30. Recommended target architecture

The near-term target should remain a modular local platform rather than a distributed service architecture:

```text
Electron shell
  -> Renderer application
      -> typed domain client modules
          -> Local ARIA API
              -> Auth and policy boundary
              -> Evidence and provenance service
              -> Decision and Trust Ladder service
              -> Approval and action execution service
              -> Domain adapters
                   - Identity
                   - Network
                   - BLE
                   - AI-SPM
                   - Incidents and response
              -> Connector adapters
              -> Persistence repositories
                   - Postgres for governed records
                   - encrypted vault for credentials
                   - file/object archive for large evidence
              -> Event stream and audit exporter
```

The improvement is separation of contracts and ownership inside the existing process. Microservices are not required to achieve this.

## 31. Pilot acceptance criteria

ARIA should be considered ready for a controlled design-partner pilot when all of the following are true:

- The UI never presents sample or simulated findings as live.
- One supported deployment method installs repeatably on a clean machine.
- Production starts fail-closed for auth, encryption and persistence.
- The complete test and lint gates pass in CI.
- At least two connectors have documented least-privilege setups and repeatable integration tests.
- At least one real response action is executed and independently verified end to end.
- A deliberately wrong ARIA recommendation can be overridden, audited and reflected in capability trust.
- Audit export reconstructs the full decision and action chain.
- Backup and restore are tested.
- Voice cold-start and warm-turn latency are measured and presented honestly.
- Security limitations and incident contacts are documented for the pilot customer.

## 32. Strategic technical assessment

ARIA should not try to win by claiming broader detection coverage than established SIEM, EDR or cloud-security products. Its credible technical position is as a governed operations layer that brings together evidence, reasoning, human authority, local discovery and bounded action.

The defensible elements are:

- Capability-specific earned authority rather than one autonomy setting
- Platform-owned trust state that the model cannot edit
- Human promotion with automatic safety demotion
- Local-model egress enforcement
- Spatial, voice-native investigation across connected domains
- Local network and BLE visibility alongside cloud and identity connectors
- A path from evidence to approval, execution, verification and audit

The product becomes materially stronger when every demonstration centers on one complete, inspectable chain rather than the number of panels. The most persuasive demonstration is not ARIA being correct. It is ARIA making a plausible wrong recommendation, the operator rejecting it, the platform preserving the evidence, and authority changing exactly as designed.

## 33. Source map

| Concern | Principal source |
|---|---|
| Desktop lifecycle and native integration | [electron/main.js](../../electron/main.js) |
| Renderer bridge | [electron/preload.js](../../electron/preload.js) |
| Application composition | [src/App.jsx](../../src/App.jsx) |
| Root gates and setup | [src/PlatformRoot.jsx](../../src/PlatformRoot.jsx) |
| Local API composition | [server/index.mjs](../../server/index.mjs) |
| Trust Ladder | [server/ariaTrust.mjs](../../server/ariaTrust.mjs) |
| Approval and memory | [server/ariaMemory.mjs](../../server/ariaMemory.mjs) |
| Unified execution | [server/actionRunner.mjs](../../server/actionRunner.mjs) |
| Decision model | [server/ariaOrchestrator.mjs](../../server/ariaOrchestrator.mjs) |
| Continuous reasoning | [server/reasoningEngine.mjs](../../server/reasoningEngine.mjs) |
| Operational chain | [server/ariaOperationalLoop.mjs](../../server/ariaOperationalLoop.mjs) |
| Conversational intelligence | [server/ariaIntelligence.mjs](../../server/ariaIntelligence.mjs) |
| Local LLM guard | [server/localLlm.mjs](../../server/localLlm.mjs) |
| Local STT | [server/voicePipelineRoutes.mjs](../../server/voicePipelineRoutes.mjs) |
| Authorization | [server/authz.mjs](../../server/authz.mjs) |
| Sessions | [server/authSessions.mjs](../../server/authSessions.mjs) |
| Audit | [server/auditLog.mjs](../../server/auditLog.mjs) |
| Persistence validation | [server/persistenceConfig.mjs](../../server/persistenceConfig.mjs) |
| Postgres adapter and schema | [server/db.mjs](../../server/db.mjs), [migration](../../server/migrations/001_governance_tables.sql) |
| AI-SPM inventory | [server/aiSpmInventory.mjs](../../server/aiSpmInventory.mjs) |
| AI-SPM risk | [server/aiRiskEngine.mjs](../../server/aiRiskEngine.mjs) |
| AI-SPM graph | [server/aiSpmGraphStore.mjs](../../server/aiSpmGraphStore.mjs) |
| Identity API | [server/identityRoutes.mjs](../../server/identityRoutes.mjs) |
| Identity baselines | [server/identityBaselineStore.mjs](../../server/identityBaselineStore.mjs) |
| Network discovery | [server/NetworkIntelligence/networkDiscovery.mjs](../../server/NetworkIntelligence/networkDiscovery.mjs) |
| Device claims | [server/NetworkIntelligence/deviceIdentityClaims.mjs](../../server/NetworkIntelligence/deviceIdentityClaims.mjs) |
| BLE scanner | [server/Bluetooth/bleScanner.mjs](../../server/Bluetooth/bleScanner.mjs) |
| BLE intelligence | [server/Bluetooth/bleIntelligence.mjs](../../server/Bluetooth/bleIntelligence.mjs) |
| Deployment configuration | [Dockerfile](../../Dockerfile), [docker-compose.yml](../../docker-compose.yml) |
| Trial-form reference | [infra/trial-form](../../infra/trial-form) |

## 34. Conclusion

ARIA already contains the foundation of a distinctive security operations product. The Trust Ladder is implemented as a real governance mechanism, the local-model boundary is enforced in code, the connector and AI-SPM surface is substantial, and local network/BLE discovery adds evidence unavailable to many cloud-only copilots.

Its current engineering state is best described as a broad working platform with a strong governance core and uneven hardening around it. The priority is no longer to add breadth. It is to prove complete operational chains, remove ambiguity between staged and enforced actions, make verification deterministic, and turn existing audit data into a defensible customer evidence package.

The next product milestone should be one pilot-ready workflow that is fully real from incoming signal through human-governed response, target-state verification, audit export and Trust Ladder outcome.

## 35. Engineering hardening addendum - 2 August 2026

The implementation was advanced after the original assessment. This addendum supersedes the earlier test snapshot and records what is now present in the working tree.

### Completed in code

- The full test command runs every test file in an isolated process and persistence directory. The current gate contains 47 passing test files.
- ESLint reports no errors and the production Vite build succeeds.
- Asynchronous whoami and audit routes are awaited correctly.
- Interactive and production session issuance remains deny-by-default. Test-only unauthenticated issuance is explicit.
- Live scan results carry live provenance. Host isolation plans, policy drafts, quarantine inventory entries and staged remediation files cannot report successful external enforcement.
- Action verification uses post-action observations. The source-backed scan path and staged host-isolation path have explicit truth-contract tests.
- An operator can override a wrong decision with a written reason. The decision, evidence status, audit event, organizational memory and capability Trust Ladder are updated together.
- Admin and owner users can export a tenant or decision-scoped evidence pack with a canonical SHA-256 digest and optional HMAC-SHA256 signature.
- Autonomous-response inputs are written to a bounded replay log without meta values and recent detection windows are reconstructed on restart.
- Connector metadata stores consistently honor `ARIA_PERSISTENCE_DIR`.
- File-backed state has manifest-based backup, verification and safe restore tooling. Restore refuses tampered backups and non-empty targets.
- CI runs isolated tests, lint, the production build and a container build. It has no deployment step and does not touch Vercel.
- Pilot connector permissions, operations and vulnerability reporting are documented.
- Voice narration has a realtime profile, an eight-second reasoning timeout, startup Whisper warmup and stage timing telemetry.
- Port fallback no longer starts scan schedulers or the reasoning engine more than once.

### Measured live on the development machine

One cloud-selected panel narration request was routed through the realtime Gemini path and completed in 6,641 ms: 56 ms context preparation and 6,585 ms reasoning. This replaces the reported roughly one-minute wait for that path.

One ElevenLabs Flash realtime request returned HTTP response/audio in 1,024 ms and completed a 30,347-byte short utterance in 1,166 ms. Server telemetry recorded upstream headers at 1,022 ms, first audio at 1,023 ms and completion at 1,165 ms.

These are development-machine observations, not a production latency guarantee. Cold Whisper load and warm STT inference still need measurement on the selected pilot host with warmup enabled.

### External acceptance work still required

- Docker is not installed in the current development environment, so the clean-machine container path is defined and covered by CI but was not executed locally in this assessment.
- GitHub and AWS least-privilege roles must be validated against dedicated customer-owned pilot accounts.
- A customer-approved real target action must be executed and independently observed. Staged plans do not satisfy this criterion.
- The customer must run and retain its Postgres backup and restore drill in addition to the tested file-state restore.
- External uptime monitoring and incident contacts must be configured for the selected pilot environment.
- Cold and warm voice measurements must be captured on the actual pilot hardware.

ARIA should remain described as pilot-candidate software until those environment-specific checks are complete.

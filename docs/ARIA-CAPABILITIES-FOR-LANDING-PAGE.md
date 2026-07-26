# ARIA — Complete Capability Report (Landing-Page Source of Truth)

> Handover brief for the landing-page build. This documents **what ARIA actually
> does**, panel by panel, engine by engine, drawn directly from the live codebase
> (`src/App.jsx`, `server/`, panel components, connectors, and the in-product
> guided narration). Use it as the authoritative feature list and messaging input.

---

## 0. Product Identity

- **Name:** ARIA (pronounced/voiced as "Aariya")
- **Expansion:** **A**utonomous **R**esilience **I**ntelligence **A**rchitecture
- **One-liner (from ARIA's own narration):** *"A security operations cockpit built
  to watch your environment, explain risk, coordinate response, and help operators
  make governed decisions."*
- **Category:** Autonomous AI SOC / security operations platform with a
  voice-driven, spatial "galaxy" command interface.
- **Core promise:** *"I turn security telemetry into understandable, accountable
  action that improves over time."*
- **Form factor:** Desktop application (Electron, macOS-first with Touch ID) **and**
  web app. React 19 + Three.js front end; Node.js real-time server back end.

**Positioning pillars** (the four things that make ARIA distinct):
1. **Conversational & voice-native** — a real, interruptible two-way conversation over live data, not a chatbot bolted onto a dashboard.
2. **Spatial galaxy UX** — every capability is a navigable 3D sector/node, not a menu.
3. **Governed autonomy** — an explicit trust ladder from "ask first" to "fully autonomous," with the human always able to bound it.
4. **Self-observing & self-learning** — ARIA monitors itself, keeps an audit-grade memory, and earns more trust over time.

---

## 1. The Core Experience — The Galaxy Interface

ARIA's home screen is a **3D interactive galaxy** (Three.js / WebGL). The platform's
entire feature set is represented spatially:

- **Sectors** = categories (the galaxies/hubs).
- **Nodes** = individual display panels inside each sector.
- A **three-tier color warning system** runs through the whole UI: **blue = neutral / nominal**, **amber = detected threat**, **red = critical alert**. Colors update live from continuous scanning.

**Four ways to navigate — all interchangeable:**
1. **Click** a sector or node in the galaxy.
2. **Speak** a destination ("open the network panel").
3. **Type** a command in the input bar.
4. **Let ARIA route you automatically** when a critical event fires.

**Persistent HUD chrome:**
- **Top bar — main sectors:** Overview · Threat Intel · Timeline · Identity & Access · Network · AI-SPM · Command · Response.
- **Left status stack:** system state, threat level, review/approval items, intelligence mode, operations comms.
- **Right control rail:** open command console · enable voice mode · manage audio alerts (critical siren) · start the guided presentation · adjust autonomy mode.

Each panel follows the same contract: **show the situation → explain why it
matters → offer safe, actionable options.** A **narrative** can be requested on any
panel at any time.

### Sector → Panel map (the real navigation graph)

| Sector | Panels (nodes) |
|---|---|
| **Threat Intel** | Threat Overview · Threat Vectors · Timeline · System Health |
| **Network & Access** | Network · Live Logs · Identity & Sessions |
| **Command** | AI-SPM · Aria Center (Command Center) · Decision Engine |
| **Response** | Incidents · Blocked IPs · Quarantine · Security Admin · Policy Changes |
| **Identity & Access** | Identity Galaxy Map (ITDR / UEBA / Zero Trust) |

---

## 2. Conversational & Voice Intelligence

This is the headline differentiator — ARIA is **voice-native and fully conversational**.

- **Two-way, real-time conversation grounded in live data.** ARIA can discuss
  relevant cybersecurity threats, give advice, explain risk in depth, and walk an
  operator through remediation step by step.
- **Fully interruptible at any moment** — talk over it, redirect it, ask follow-ups.
- **Works by voice or the text input bar**, interchangeably.
- **Local STT (speech-to-text):** Whisper running **in-process** via
  `@xenova/transformers` (`Xenova/whisper-small`). **Audio never leaves the
  operator's network** — a strong privacy/compliance selling point.
- **TTS (text-to-speech):** provider-backed voice pipeline (`/api/tts`), with a
  local voice-chat path and a Gemini Live channel also wired in.
- **Guided self-presentation mode:** ARIA can narrate its own product tour —
  navigating panels, running live scans, and explaining each capability hands-free.
  (This is literally how the demo works; it's a built-in feature, not a video.)
- **Per-panel narration:** any panel can be explained on demand
  (`/api/aria/panel-narrative`).

---

## 3. Three Intelligence Engines (Deployment Models)

ARIA offers **three levels of intelligence**, a core enterprise differentiator:

| Engine | What it is | Why it matters |
|---|---|---|
| **Cloud Engine** | Anthropic's latest models (**Claude Opus 4.8**) for complex reasoning | Maximum reasoning power for hard correlation/triage |
| **Local Engine** | Fully on-prem, configurable | Strict data-provenance & regulatory needs; nothing leaves the network |
| **Hybrid Engine** | Runs on both simultaneously | Always-on protection even if the external network is compromised |

In-product **Intelligence Mode** selector currently exposes **Gemini 2.5 Flash** and
**Cloud (Claude Opus 4.8)**; the architecture is model-pluggable.

---

## 4. Governed Autonomy & The Trust Ladder

ARIA's defining safety story. Autonomy is **earned, bounded, and auditable.**

**Autonomy mode ladder** (`server/ariaTrust.mjs`): `approval → assisted → auto → full_auto`

- **Approval Mode:** ARIA scans **600+ data points simultaneously**, recommends, and
  **asks before any operational action**. Human is the final decision-maker.
- **Auto Mode:** handles standard/low–medium-risk operations, **escalates critical
  decisions** to a human.
- **Fully Auto Mode:** scans, detects, decides, audits, and **executes without
  intervention** — capable of running 24/7: isolating threats, blocking IPs,
  revoking access, quarantining files.

**How trust is earned (real mechanics):**
- **Per-capability trust scoring** across `threat_analysis`, `remediation`,
  `containment`, `identity_actions`. Tracks successes, failures, and human overrides.
- **Platform-owned scores** — the model can *read* its trust score but **never writes
  it** (anti-tampering by design).
- **Promotion thresholds are explicit and conservative**, e.g. approval→assisted
  needs ≥0.80 trust over ≥10 samples with ≤3 overrides; auto→full_auto needs ≥0.97
  trust over ≥80 samples with ≤1 override.
- **Human-scored decisions:** operators manually score ARIA's decisions (e.g. 98/100);
  as accuracy rises, they elect to elevate trust. The operator always controls the
  transition.

**Continuous learning protocol:** every action, decision, and human intervention is
recorded to an internal **study ledger**. ARIA learns from patterns and repeat
approvals, gradually guiding itself from Approval Mode toward Full Auto — but all
self-training notes are **operator-reviewable and editable** so procedures stay
aligned to company policy.

---

## 5. The Panels (Detailed)

### Overview — "Unified Posture Core"
The executive summary / single live posture snapshot. Threat level, live source
count, approvals outstanding, and a synthesized overview report. Audience-aware
"synthesize" produces an executive-readable posture read.

### Threat Intel sector
- **Threat Overview ("Perimeter Defense Radar"):** the risk command deck — current
  posture and risk core.
- **Threat Vectors ("Particle Diffusion Threat Hub"):** attack-vector radar/field.
- **Timeline ("Event Horizon Timeline"):** chronological event stream / incident
  chronology.
- **System Health ("Volumetric Nebula"):** host vitals — CPU, memory, processes,
  machine health.

### Network & Access sector
- **Network ("Fluid Dynamics Firewall"):** active sockets, external remotes, private
  connections, listening services, and blocklist state. Operators can filter
  connections, assess remote endpoints, manage IP blocks, refresh sockets, and
  initiate network discovery. **Passive visibility is always safe; active discovery
  is authorization-gated** so observability never becomes uncontrolled scanning.
- **Live Logs ("Vortex Log Sink"):** live telemetry/log stream with severity and
  source context.
- **Identity & Sessions:** identity truth card (tenant_id, user_id, role, authz_mode
  with source attribution), session inventory table, revoke-with-reason modal, and
  force-re-auth.

### Command sector
- **AI-SPM:** AI Security Posture Management (see §6).
- **Aria Center / Command Center ("Neural Node Web"):** mission control (see §7).
- **Decision Engine:** correlation-to-action core (see §8).

### Response sector
- **Incidents ("Chromatic Glitch Feed"):** the response queue. Ranks active events by
  severity with action buttons next to the evidence — acknowledge, escalate,
  suppress, open context, run a scan, or generate **executive / technical / operator**
  incident reports.
- **Blocked IPs ("Target-Lock Perimeter"):** the blocklist/firewall — block, bulk
  action, and auto-rule creation.
- **Quarantine ("Bio Containment Vault"):** containment of quarantined files with
  bulk action.
- **Security Admin:** governance proof (see §9).
- **Policy Changes:** RBAC policy governance (see §9).

### Identity & Access sector — **Identity Galaxy Map** (ITDR / UEBA / Zero Trust)
A flagship visualization. **Every department/sector in the org is its own galaxy.**
ARIA **auto-detects naming conventions from the connected subnet** and colors each
galaxy on the three-tier system. Continuous progressive scanning updates colors live.

Drill-down workflow (real, demoed):
- Expand a **department galaxy** → see the individuals in it.
- High-risk users are flagged (e.g. *"failed authentication four times, flagged for
  review"*).
- Per-identity actions: **Brief** (real-time AI analysis of what triggered the alert),
  add to **watchlist**, mark **trusted**, **revoke access**, pull **live action logs**,
  and **restrict network or file access instantly**.
- **Credential-protection / Impossible-Travel system:** registers each user's normal
  IP and workstation; a login from an "impossible" environment (sudden geographic
  shift) is detected and flagged instantly by 24/7 monitoring.

Supporting identity intelligence components (all real):
- **Impossible Travel Globe** — 3D globe with arc pairs for impossible/suspicious
  travel verdicts.
- **UEBA Behaviour Ring** — per-user behavioral baseline; deviations visibly distort
  the ring.
- **Privilege Drift Timeline** — privilege level (standard/elevated/admin) over time.
- **Identity Risk Leaderboard** — live top-5 highest-risk identities, each clickable.
- **Policy Gate Visualiser** — real-time access requests stream as particles from
  user → resource, intercepted at a central ARIA policy gate.
- Plus: Identity Constellation, Department Galaxy, Behaviour Ring, Security Galaxy Map.

---

## 6. AI-SPM — AI Security Posture Management

A standout, on-trend capability: **security posture management for AI systems.**

**What it discovers:** AI systems, prompts, tools, endpoints, **secrets**, model
infrastructure, cloud assets, and identity links — normalized and deduplicated across
sources.

**Sources it can connect simultaneously:** GitHub, AWS, Okta, Snyk, Azure AD,
VirusTotal, and Elastic (see §10).

**Engine capabilities:**
- **Risk engine** with severity-scored findings (critical/high/medium/low), CVSS
  normalization, and per-finding rationale.
- **Attack-narrative generation:** summary, **likely attack path**, **confidence**,
  **blast radius**, and recommended actions.
- **Graph store:** persists AI-SPM relationships, supports neighbor queries,
  attack-path candidates, and repo risk summaries.
- **Findings lifecycle:** list, record actions (act/resolve/ignore/reopen),
  remediation-plan generation, **evidence sandbox** (safely explore a threat without
  exposing the org), report generation, and scan history.
- **Narrative on demand:** because ARIA has full scope over every panel, signal, and
  past report, it produces highly informed analysis — ask *why a finding matters* and
  *what to do about it*.
- **Scheduling & export:** scans can be scheduled (`/api/ai-spm/schedule`) and
  exported (`/api/ai-spm/scan/export`).
- **Deterministic demo mode** for sales/eval environments.

---

## 7. Command Center ("Aria Center") — Mission Control

Six tabs (the single pane for power operators):

1. **Command Fabric** — the decision workspace: decision queue, **attack-path
   simulations**, autonomy guardrails, and outcome metrics. Understand an action's
   **blast radius before anything changes.**
2. **Live Monitor** — single-screen operating view unifying threat posture, system
   health, active defense, AI-SPM exposure, approvals, and timelines.
3. **Evidence Scan** — define targets and run scans: check **local host** for config
   issues and secrets, scan **directory paths**, **discover network subnet devices**,
   or target **custom IPs**. Streams phases in real time, plots findings on a radar,
   counts severity, and produces **exportable evidence**.
4. **Autonomy** — execute or stage actions: the **command palette** and **containment
   protocols**, with direct command input and shortcuts.
5. **Evidence** — audit-friendly **proof gallery**: scan history, authorization
   denials, operational signals, and ARIA's **memory/learning records**. Supports
   strict access levels over who can view/amend/delete records.
6. **Diagnostics** — platform health and self-observability ("if an AI agent sits
   inside a security org, it must be completely observable itself").

A **critical warning siren** can be wired to every panel; in the demo it's isolated
to the Command Center.

---

## 8. Decision Engine — From Findings to Action

*"This is what separates me from a standard scanner: I explain exactly what should
happen next, and why."*

- Correlates signals into **attack paths**, estimates **blast radius**, assigns
  **confidence scores**, recommends actions, and decides **whether human approval is
  required.**
- Surfaces ARIA's latest **decisions, trust scores, autonomy levels, and the
  underlying evidence ledger**.
- Backed by a **continuous autonomous reasoning loop** (`reasoningEngine.mjs`): every
  ~30s it samples world state (telemetry, sockets, audit events, incidents,
  findings), keeps a rolling **15-minute signal buffer** checkpointed to disk,
  evaluates **correlation rules**, fires structured hypotheses, persists them, and
  broadcasts to the UI over WebSocket.
- **Correlation rules** include patterns like resource exhaustion + new egress, auth-
  failure flood + new high-CPU process, CPU spike + new outbound connection, memory
  pressure + new scan finding, and multiple simultaneous open incidents.

---

## 9. Governance, RBAC & Compliance

Built for the enterprise buyer — *"proof that my autonomy is strictly bounded by your
policy."*

**Security Admin panel:** tenant context, **role permission matrix**, **authorization
denial feed**, compliance status, quota/rate-bucket status, and session controls
(revoke / force re-auth). Preview the risk of permission changes before applying them.

**Authorization model (`server/authz.mjs`):**
- Centralized middleware over `/api/aria/*`, `/api/ai-spm/*`, `/api/connectors/*`.
- Roles: **owner · admin · analyst · viewer**, with role-based restrictions by scope
  and method.
- **Deny-by-default** when auth context is missing.
- **Cross-tenant guard** (denies `x-resource-tenant` mismatch).
- Explicit enforce mode and controlled local-bypass for dev.

**Policy Changes panel (RBAC governance):**
- Policy browser, inline editor, **before/after merge preview**, field-level diff,
  and **risk classification (low/medium/high)** with capability add/remove summary.
- **Apply requires a reason** + actor attribution + tenant scoping, and writes a
  history entry. Supports validate, dry-run, templates, history, and **rollback**.

**Audit:** structured, compliance-grade audit events across authz, policy, session,
AI-SPM, and approval flows; retrievable with filters; retention metadata; durable
storage.

**Every action verified:** all actions route through a single execution path
(`actionRunner.mjs`) — pre-flight snapshot → execute → **re-observe and verify after a
delay** → single compliance-grade audit entry. No panel calls a countermeasure
directly.

---

## 10. Connector Framework & Integrations

A pluggable connector layer with status/health/connect/disconnect lifecycle, a
credential vault, and per-connector auth stores.

| Connector | What ARIA pulls / does |
|---|---|
| **GitHub** | AI-asset & workflow-risk discovery from repos; auth via `gh` CLI handoff, OAuth device flow, or token; repo listing & selection |
| **AWS** | AI-relevant discovery across **Bedrock, IAM, STS, CloudTrail, Lambda, S3, Secrets Manager**; account/region-aware |
| **Okta** | Identity provider signals (ITDR) |
| **Azure AD / Entra** | Microsoft Graph identity discovery & scanning |
| **Snyk** | SCA / dependency vulnerability signals |
| **VirusTotal** | IOC enrichment (file hashes, IPs, domains) |
| **Elastic** | SIEM integration — cluster health, security indices, alerts, rules |

All connectors expose `status` + `health` and feed the unified AI-SPM inventory and
risk engine.

---

## 11. Autonomous Threat Response (Real-Time Pipeline)

`autonomousResponse.mjs` — in-process, **sub-millisecond decision latency**, three layers:

1. **Velocity detector** — sliding-window per-source rate tracking (e.g. >10
   signals/s sustained 3s = swarm; >5 auth failures in 10s = auto-block).
2. **Cross-signal correlator** — multi-source pattern matching (e.g. >3 distinct IPs
   hitting restricted endpoints within 500ms = coordinated attack).
3. **Auto-countermeasures** — block IP, create incident, escalate severity — with
   debounce to prevent duplicate actions.

**Network Intelligence module** (read-only, authorization-gated active scan):
- **Network discovery** & subnet classification.
- **Device inference** — infers device role (server/workstation/printer/network/
  mobile), department, and risk from passive + active signals (hostname patterns,
  open ports, vendor).
- **Exposure scanner** — light TCP-connect port observation (SSH, Telnet, RDP, VNC,
  SMB, databases, etc.) with per-port risk weighting. **No exploit, no payload** —
  pure observation.
- **Live galaxy adapter** — feeds discovered topology into the Identity/Network
  galaxy visuals.
- **Offline MAC vendor intelligence** — resolves MAC addresses against a bundled
  copy of the official IEEE MA-L registry. No vendor lookup leaves the network.
- **Device identity-claim analysis** — flags explainable conflicts between a
  device's explicit hostname/type claim and its OUI vendor category, plus devices
  appearing on a segment outside a sufficiently learned history. Findings include
  confidence, evidence, severity, and audit context.
- **Native Bluetooth/BLE discovery** — operator-triggered local RF sweeps on
  macOS, Windows, and Linux. Captures passive advertisement evidence including
  names, RSSI, services, manufacturer data, address type, and sighting history,
  with a dedicated UI panel and scan lifecycle audit trail. It does not pair,
  connect, or transmit payloads.
- **BLE device fingerprinting** — decodes the offline Bluetooth SIG company and
  service registries, combines vendor/service/manufacturer-frame evidence into
  an explainable likely device type, and reports confidence plus RSSI history.
  Proximity is explicitly relative to the local scanner; exact position and
  direction are never claimed from a single receiver.

---

## 12. Memory & Self-Learning

`ariaMemory.mjs` — ARIA keeps durable, file-backed memory:
- **ARIA_NOTES, findings, human-interventions, action-log, reports,** autonomy
  policy, approval queue, and memory records.
- **Approval queue** with TTL for pending approvals.
- Feeds the trust/promotion engine; all learning notes are operator-reviewable and
  editable.
- Persisted via a **durable store abstraction** (KV with in-memory fallback) covering
  audit events, policy state/history, session artifacts, and AI-SPM graph/report/
  history artifacts; production-gated for sensitive writes.

---

## 13. Authentication & Onboarding Experience

- **Cinematic boot/login sequence** with a terminal-style boot log: `AUTH MODULE
  v4.2.1 · BIOMETRIC LAYER · ENCRYPTION HANDSHAKE: AES-256-GCM · IDENTITY MESH:
  CONNECTED · AWAITING OPERATOR CREDENTIALS`.
- **Touch ID / biometric authentication** (macOS desktop) via a secure loopback
  bridge with a persisted shared secret (WebAuthn-style challenge flow).
- Animated **ARIA logo / launch overlay** intro.

---

## 14. Architecture & Tech Stack (for accuracy on the page)

- **Front end:** React 19, Three.js (WebGL galaxy + globe visuals), Vite, custom
  canvas/WebGL animation hooks. ~15+ bespoke generative-visual panels.
- **Desktop:** Electron (electron-vite + electron-builder), macOS category
  Productivity, Touch ID, microphone & Bluetooth entitlements.
- **Back end:** Node.js real-time server (`server/index.mjs`), WebSocket event bus &
  streaming, durable KV persistence, rate limiter + quota guard, security headers.
- **AI:** Anthropic Claude (Opus 4.8) cloud engine, Gemini 2.5 Flash, local Whisper
  STT, provider-backed TTS; function-calling orchestration for operator actions.
- **Cloud SDKs:** AWS (Bedrock, IAM, STS, CloudTrail, Lambda, S3, Secrets Manager),
  Microsoft Graph, Okta, Snyk, VirusTotal, Elastic.

---

## 15. API Surface (for "developer-ready / API-first" messaging)

~100 REST/WebSocket endpoints across families: `aria/*` (state, overview, observe,
orchestrate, command, decisions, trust, approvals, evidence, memory, stream),
`ai-spm/*`, `connectors/*` (7 providers), `identity/*`, `network/*`, `incidents`,
`bluetooth/*`, `blocked-ips`, `quarantine`, `scan/*`, `autonomy/*`, `voice/*`, `tts`, `auth/*`,
`gemini/live`, `live/stream`, `hypotheses`. Streaming via SSE/WebSocket for live
telemetry, scans, and reasoning hypotheses.

---

## 16. Design Language / Aesthetic (for art direction)

- **Cinematic "cosmic command center"** — deep space-black backgrounds, neon accent
  palette: cyan `#63f5ff`, electric blue `#1687ff`, violet `#a78bfa` / `#8b5cf6`,
  amber `#ffc857`, hot-magenta alert `#ff3d81`, teal `#2dd4bf`, sky `#38bdf8`.
- **Generative WebGL/SVG visuals** per panel (fluid firewall, particle diffusion,
  orbital telemetry rings, volumetric nebula, vortex log sink, event-horizon
  timeline, neural node web, chromatic glitch feed, target-lock perimeter).
- **HUD / sci-fi mil-spec** typography: monospace labels, wide letter-spacing,
  uppercase micro-labels, glassmorphism panels (`backdrop-filter: blur`).
- **Three-tier semantic color system** (blue/amber/red) is consistent and ownable.
- Motion-first: slow orbital rotation, particle streams, reactive audio-driven
  animation (visuals respond to ARIA's voice frequency).

---

## 17. Suggested Landing-Page Narrative Arc

1. **Hero:** "ARIA — Autonomous Resilience Intelligence Architecture." A security
   operations cockpit you talk to. Voice-native, governed autonomy, live galaxy UI.
   (CTA: Request demo / Watch ARIA give its own tour.)
2. **The problem:** SOC tools show you data; they don't decide, explain, or act —
   and the ones that act, you can't trust or audit.
3. **Meet ARIA:** conversational + voice, the galaxy interface, four ways to navigate.
4. **Governed autonomy:** the trust ladder (Approval → Auto → Full Auto), human always
   in control, platform-owned trust scores, every action verified & audited.
5. **AI-SPM:** secure your AI systems too — discover AI assets, secrets, attack paths,
   blast radius across 7 connectors.
6. **Identity galaxy / ITDR + UEBA:** watch your whole workforce; impossible-travel,
   privilege drift, behavioral baselines, one-click containment.
7. **Three engines:** Cloud (Claude Opus 4.8) · Local (on-prem, data-sovereign) ·
   Hybrid (always-on).
8. **Enterprise-ready:** RBAC, multi-tenant guardrails, compliance status, audit
   gallery, policy preview/rollback.
9. **Self-observing & self-learning:** memory, study ledger, diagnostics.
10. **Proof / closing CTA.**

**Headline candidates:**
- "The security cockpit you talk to."
- "Autonomous. Accountable. Always watching."
- "From telemetry to governed action — explained every step."
- "An AI SOC analyst that earns your trust, literally."

---

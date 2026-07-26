# ARIA — Roadmap & Limitations
### An honest engineering account: what is production-grade, what is demo-grade, and what comes next

> **Why this document is public.** ARIA is a security product, and security
> products earn trust by being specific about their boundaries rather than
> marketing around them. This is the internal engineering audit, published
> unedited apart from removing infrastructure identifiers. Every claim was
> verified directly against source files, with paths and line numbers cited, not
> inferred from documentation. Where something could not be verified from code
> alone (e.g. live AWS console state), it says so.
>
> If you are evaluating ARIA, read this before the [README](./README.md). Where
> the two disagree, this document wins.
>
> **Audit baseline: 2026-06-20.** The body below is preserved as written on that
> date. Items resolved since then are listed immediately below — the original
> findings are left in place rather than quietly edited out, so the delta stays
> auditable.

---

## 0a. Resolved since the audit baseline

| Original finding | Status |
|---|---|
| `persistenceConfig.mjs` — missing `ARIA_CREDENTIAL_ENCRYPTION_KEY` in production logged an error but did not block startup, silently falling back to plaintext credentials | **Fixed.** Production startup now throws `PersistenceMisconfiguredError`. See `runStartupChecks()` in [server/persistenceConfig.mjs](./server/persistenceConfig.mjs). |
| Default `operator`/`aria` login available as a fallback | **Fixed.** Gated to `NODE_ENV` development/test, or an explicit `ARIA_ENABLE_DEMO_LOGIN=true` outside production. See [server/authSessions.mjs](./server/authSessions.mjs). |
| Network discovery reported broadcast (`ff:ff:…`) and multicast MACs as devices | **Fixed.** Filtered at parse time via `isDiscoverableHost()` in [server/NetworkIntelligence/networkDiscovery.mjs](./server/NetworkIntelligence/networkDiscovery.mjs). |
| MAC OUI vendor lookup missing — every device showed "unknown vendor" | **Fixed.** IEEE MA-L registry vendored at `server/data/ieee-ma-l.json`, refreshable via `npm run network:vendors:update`. |
| "Local Engine" / on-prem reasoning mode returned a deterministic template string; no local model was ever invoked | **Fixed.** Real OpenAI-compatible client in [server/localLlm.mjs](./server/localLlm.mjs) (Ollama, vLLM, LM Studio, llama.cpp). Egress is refused to any non-loopback/non-private host unless explicitly overridden, and `LOCAL` mode never silently falls back to a cloud provider. |

**Still open, and the highest-value items on the roadmap:** the simulated threat-scan
engine (§1.2, `ariaData.mjs`), multi-tenant isolation, the legacy in-memory rate
limiter, audit-log rotation, local text-to-speech, and vector-based semantic recall.

---

## 0. Executive Summary

ARIA is a **security operations cockpit** — a voice-driven, spatial "galaxy"
interface backed by a Node.js orchestration server that turns telemetry into
governed, trust-gated autonomous action. The product ships today as a
**desktop Electron app** (the primary distribution vehicle) plus a **live
public landing site and trial-form backend** on AWS. There is currently
**no internet-facing multi-tenant application server** — `server/index.mjs`
runs only locally or inside the Electron shell.

**Overall maturity: ~60–70% of the way to a defensible production system.**
The governance core (trust ladder, RBAC, audit, action execution framework,
decision engine) is genuinely production-grade engineering. The gaps are
concentrated in infrastructure maturity (real database, CI/CD, monitoring,
multi-tenant isolation) and in a handful of simulated subsystems (the main
threat-scan engine) that look real in the UI but are not yet wired to live
detection.

No secrets were found exposed on the public internet. The GitHub repo is
**private**, and `.env.local` / `.secrets/` are correctly gitignored and have
zero commit history — confirmed directly via `git ls-files`, `git log`, and
`gh repo view`. Real secrets do sit unencrypted on local disk, which is a
hygiene item, not a breach.

---

## 1. Backend Architecture

### 1.1 Shape of the system

The backend is a single Node.js process (`server/index.mjs`, ~4,300 lines)
exposing an HTTP + WebSocket API, organized around five cooperating
subsystems:

```
┌─────────────────────────────────────────────────────────────┐
│ server/index.mjs  — HTTP router, SSE/WS streaming, AI bridge │
├───────────────┬───────────────┬───────────────┬─────────────┤
│ Trust Ladder  │ Action Runner │ Decision       │ Autonomous  │
│ ariaTrust.mjs │ actionRunner  │ Orchestrator   │ Response    │
│               │ .mjs          │ ariaOrchestrator│ (velocity, │
│               │               │ .mjs            │ swarm)     │
├───────────────┴───────────────┴───────────────┴─────────────┤
│ ariaMemory.mjs — approvals, learned patterns, recall         │
├───────────────────────────────────────────────────────────────┤
│ authz.mjs (RBAC+JWT) · auditLog.mjs · quotaGuard.mjs ·        │
│ rateLimiter.mjs · durableStore.mjs (Upstash KV or in-memory)  │
├───────────────────────────────────────────────────────────────┤
│ Connectors: AWS, GitHub, Okta, Snyk, Azure AD, VirusTotal,    │
│ Elastic — each with its own auth store + credentialVault.mjs  │
├───────────────────────────────────────────────────────────────┤
│ Persistence: aria-memory/*.json (file) ⟷ optional Upstash KV  │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 Module-by-module status

| Module | Purpose | Status |
|---|---|---|
| [server/ariaTrust.mjs](./server/ariaTrust.mjs) | Per-capability trust score (`threat_analysis`, `remediation`, `containment`, `identity_actions`); promotion ladder `approval → assisted → auto → full_auto`; promotion requires trust %, sample count, and override-limit gates simultaneously; auto-demotion on any failure/override breach | **Production-grade.** Deterministic formula, durable JSON, full audit trail, no auto-promotion shortcut. |
| [server/authz.mjs](./server/authz.mjs) | JWT verification (JWKS, RSA-SHA256, expiry), RBAC matrix (owner/admin/analyst/viewer), tenant context extraction | **Production-grade.** Real JWT validation. Header-based identity is trusted only on loopback by default (opt-in for remote — documented risk if enabled). |
| [server/actionRunner.mjs](./server/actionRunner.mjs) | Unified action lifecycle: pre-flight snapshot → execute → verify (10s delay) → audit. Tier gating: low=auto, medium=requires approval if non-human actor, critical=blocked | **Production-grade framework.** Real side effects for `block-ip`, `kill-process`, GitHub remediation PRs. Several registered actions (`collect-evidence`, `geo-lookup`, `run-scan`, `deep-scan`) are stubs that return mock "verified" instantly. |
| [server/ariaOrchestrator.mjs](./server/ariaOrchestrator.mjs) | Decision schema (observation → reasoning → confidence → action), attack-path graph builder (chains findings by severity across an asset), real Gemini API calls with a 400-line safety-focused system prompt | **Production-grade architecture.** Depends on Gemini API availability; local fallback synthesis exists in `index.mjs`. |
| [server/autonomousResponse.mjs](./server/autonomousResponse.mjs) | Real-time velocity/swarm detection, auth-failure flood detection, coordinated multi-IP attack detection → auto-block + incident creation, with 30s debounce | **Production-grade logic, ephemeral state.** Sliding-window state lives in an in-memory `Map` — lost on restart, no forensic replay. |
| [server/ariaMemory.mjs](./server/ariaMemory.mjs) | Approval queue (1hr TTL), learned-pattern memory, recall via keyword overlap | **Demo-grade.** File-based approvals don't scale across instances. Recall is keyword-matching, not semantic/vector search. |
| [server/persistenceConfig.mjs](./server/persistenceConfig.mjs) | Selects durable backend (local file vs Upstash KV), validates `ARIA_CREDENTIAL_ENCRYPTION_KEY` | **One real flaw:** missing encryption key in production mode logs an error but does **not** block server startup — credentials fall back to plaintext silently. |
| [server/auditLog.mjs](./server/auditLog.mjs) | Audit events to file + optional KV, configurable retention (default 90 days), capped at 2,000 events/file | **Production-grade**, but no log rotation beyond the hard cap, and no shipping to an external SIEM. |
| [server/quotaGuard.mjs](./server/quotaGuard.mjs) | Per-tenant, per-bucket rate + quota enforcement backed by durable KV with atomic windowed counters | **Production-grade.** This is the pattern that should be used everywhere instead of... |
| [server/rateLimiter.mjs](./server/rateLimiter.mjs) | Simple in-memory per-IP limiter (10 req/60s) | **Dev-grade only.** Trusts `X-Forwarded-For` unvalidated (spoofable), resets on restart, doesn't scale across processes. |
| [server/durableStore.mjs](./server/durableStore.mjs) | KV abstraction: Upstash Redis REST API, or in-memory Map fallback | **Production-grade architecture**, but state is lost on restart unless Upstash is actually configured. |
| [server/ariaData.mjs](./server/ariaData.mjs) + scan handlers in `index.mjs` | "Run a scan, return findings" | **Simulated.** Hardcoded findings, artificial 200–1200ms per-phase delays. This is the core "ARIA finds threats" dashboard narrative and it is not a real scanner. |
| Filesystem scan & network/ARP discovery (in `index.mjs`) | World-writable file / secret detection; `arp -a` interface discovery | **Real**, distinct from the simulated scan engine above. |
| Connectors (AWS, GitHub, Okta, Snyk, Azure AD, VirusTotal, Elastic) | Each has an auth store + real API calls (e.g. AWS STS `GetCallerIdentity`, GitHub PR creation) | **Production-grade** for the connectors examined in depth (AWS, GitHub). |

### 1.3 Persistence

Almost everything durable is a JSON file under `aria-memory/` (approvals,
trust scores, decisions, evidence, execution log, sessions, audit events),
optionally mirrored to Upstash Redis if `ARIA_KV_REST_URL` /
`ARIA_KV_REST_TOKEN` are set. **There is no relational or document database.**
This is acceptable for a single operator / single-tenant desktop install; it
will not hold up under concurrent multi-tenant load.

Connector credentials are encrypted at rest with AES-256-GCM when
`ARIA_CREDENTIAL_ENCRYPTION_KEY` is set, or stored via AWS Secrets Manager if
`ARIA_USE_SECRETS_MANAGER=true`. As noted above, if neither is configured in
production mode the system degrades to plaintext silently instead of failing
to boot.

### 1.4 Multi-tenancy

`tenant_id` is extracted and format-validated (`authz.mjs`), and some stores
(`blockedIpStore`, `incidentStore`) do accept it. But the **approval queue,
trust scores, and audit log are not tenant-filtered** — if multi-tenant mode
were switched on today, one tenant could see another's pending approvals and
trust data.

### 1.5 Security controls already in place

- Security headers: HSTS, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, restrictive `Permissions-Policy` ([server/securityHeaders.mjs](./server/securityHeaders.mjs)). CSP allows `unsafe-inline` for scripts/styles (required for Three.js — a real tradeoff, not an oversight).
- CORS origins hardcoded to the app and the two production domains; no wildcard.
- Quota-exempt paths (`/health`, `/state`, `/observe`) prevent background polling from burning quota.
- A default dev login (`operator`/`aria`, role `owner`) exists as a fallback when no real operators are configured — **must be disabled before any real deployment.**

---

## 2. Frontend Architecture

### 2.1 Shape of the system

React 19 + Vite, with an Electron shell for desktop distribution. No
react-router — navigation is conditional rendering driven by build flags and
URL params.

```
src/main.jsx
  ├─ VITE_PUBLIC_SURFACE=landing → CinematicLanding (marketing site bundle)
  └─ otherwise → PlatformRoot.jsx
        ├─ DEMO_BUILD=true → DemoRoot (license gate only, no login)
        └─ real build → FullRoot (Touch ID / login → first-run setup → App.jsx)
              └─ App.jsx (main shell, lazy-loads 16+ panels via Suspense)
```

### 2.2 Key infrastructure

| Piece | File | Status |
|---|---|---|
| Centralized API client | [src/panels/ariaFetch.js](./src/panels/ariaFetch.js) | **Production-grade.** Request dedup, exponential-backoff retry, 30s timeout, 401/403 → global logout event, 429 quota-aware backoff, demo-mode header injection. |
| Demo vs. real mode | [src/ariaBuildFlags.js](./src/ariaBuildFlags.js), [src/PlatformRoot.jsx](./src/PlatformRoot.jsx) | **Production-grade, clear boundary.** Build-time flag (`VITE_ARIA_DEMO_BUILD`) plus a first-run user choice persisted to `localStorage`. Demo build skips auth; real build requires Touch ID/login. |
| Licensing | [src/ariaLicense.js](./src/ariaLicense.js) | ECDSA P-256 signature verification, fully offline, per-install activation, consumed-key ledger prevents re-entry. |
| State management | Distributed `useState` + a few module-level singletons (session token, demo-mode flag) | **Consistent, appropriate for scale (~33 components).** No Redux; no cross-component pollution observed. |
| Electron shell | [electron/main.js](./electron/main.js) (744 lines) | **Production-grade.** Spawns/manages the Node server as a child process, per-machine credential encryption key, Touch ID via `systemPreferences`, tray menu, health-poll every 15s, contextIsolation + safe preload bridge — no raw Node/fs access leaked to the renderer. |
| Build config | [vite.config.js](./vite.config.js), [electron.vite.config.js](./electron.vite.config.js) | No secrets baked into the client bundle; all credentials/tokens are server-side or in the OS keychain/Touch ID flow. |

### 2.3 Panel inventory (functional, not aspirational)

All of the following call real backend endpoints (not hardcoded arrays) and
have working connect/disconnect/scan or revoke/promote/demote handlers:

- **Trust Ladder Control Centre** — promote/demote capabilities, gate visualization.
- **Decision Engine Pane** — attack-path graphs, evidence drawer.
- **Security Admin Pane** — policy preview/apply, session management.
- **Identity Sessions Pane** — revoke / force-reauth.
- **Policy Change Pane** — RBAC delta preview before apply.
- **Identity Sector Pane** — ITDR/UEBA "galaxy" map.
- **Command Center Pane** — command queue.
- **8 Connector Panels** — GitHub, AWS, Okta, Snyk, Azure AD, VirusTotal, Elastic, onboarding wizard.
- **3D telemetry panels** (FluidFirewall, ParticleDiffusionHub, VortexLogSink, OrbitalTelemetry, ChromaticGlitchFeed, etc.) — wired to live data and/or WebSocket streams.

One feature is explicitly **not** wired: Gemini Live voice narration — code
present, flagged `// reserved` in `App.jsx`, not active.

### 2.4 Gaps

- **Accessibility:** Form panels have basic `aria-label`/`aria-live`; the 3D/canvas visualization panels are mouse-only and not screen-reader traversable. Fine for an analyst workstation; a blocker for accessibility-driven enterprise procurement.
- **Loading UX:** No prominent skeleton/spinner pattern — panels assume happy-path data arrival; a slow/down backend renders panels empty rather than showing a clear loading state.
- **Responsive design:** Fixed layout tuned for a 1440×960 Electron window; not validated at other viewport sizes.

---

## 3. Functions — What ARIA Actually Does

*(Capability list, drawn from the live galaxy-interface navigation graph and confirmed wired to real handlers, not just documentation.)*

- **Conversational, voice-native interaction** over live data (two-way, interruptible) — ElevenLabs TTS confirmed wired; Gemini Live voice input reserved but not active.
- **Spatial "galaxy" navigation** — every capability is a 3D sector/node; four equivalent ways to navigate (click, speak, type, auto-routed on critical event).
- **Governed autonomy** — the trust ladder (Section 1.2) is the real mechanism behind ARIA's "ask first → fully autonomous" promise; it is implemented, not just marketing language.
- **Decision engine** — turns findings into structured decisions with confidence, evidence, and an attack-path graph, with Gemini reasoning behind it.
- **Action execution** — `block-ip`, `kill-process`, `revoke-session`, GitHub auto-remediation PRs are real; several lower-tier "investigation" actions are stubbed.
- **Real-time autonomous response** — velocity/swarm/coordinated-attack detection with auto-block, though state isn't durable across restarts yet.
- **Identity & access (ITDR/UEBA)** — session revocation, force-reauth, risk visualization, all backend-wired.
- **AI-SPM (security posture management)** — findings + remediation panel, partially live, partially marked demo-mode in env flags (`VITE_AI_SPM_DEMO_MODE`).
- **Connector ecosystem** — AWS, GitHub, Okta, Snyk, Azure AD, VirusTotal, Elastic — auth, connect/disconnect, and scan handlers are real per-connector.
- **Audit & compliance trail** — every promotion, demotion, approval, and action execution is logged with actor + reason, retained per policy.
- **Self-monitoring** — health endpoint, Electron-side server health polling.
- **Threat/vulnerability scanning** — *partially real*: filesystem and network/ARP discovery are genuine; the headline "deep scan" / "run scan" engine that drives most dashboard findings is simulated.

---

## 4. Infrastructure & Deployment

| Asset | State | Verified how |
|---|---|---|
| Landing site (aria-sec.com) | **Live**, S3 + CloudFront, HTTPS/HSTS, CORS restricted, deploy script has a safety gate preventing platform code from leaking into the public bundle | Code + deploy script inspection. *S3 bucket privacy, encryption, versioning not verifiable from code — check AWS console.* |
| Trial-form backend | **Live**, SAM stack, Lambda (Node 20, 128MB, 10s timeout) + DynamoDB (PITR enabled) + SES → `sary@aria-sec.com`, CORS locked to the two production domains, throttled (10 burst / 5 req/s) | `infra/trial-form/template.yaml` |
| `server/index.mjs` (the actual ARIA platform server) | **Not deployed to the internet.** Runs on `127.0.0.1:5000` only, locally or inside Electron. No hosted multi-tenant backend exists yet | Default bind address, absence of any active EB/ECS/Lambda deployment for this server in the repo |
| CI/CD | **None.** All deploys (landing site, demo DMG, Lambda) are manual local shell scripts requiring AWS/Apple credentials on the developer's machine | No `.github/workflows` present |
| Monitoring | **Minimal.** Health endpoint exists; nothing watches it. No CloudWatch alarms, no external uptime/error tracking | No monitoring config found in repo |
| Secrets | **Private repo, never committed.** `.env.local` and `.secrets/` are gitignored with zero git history (`git ls-files`, `git log` confirmed empty) and the GitHub repo is private (`gh repo view` confirmed) | Verified directly, not assumed |
| Compliance docs | **Missing.** No privacy policy, ToS, incident-response plan, or pen-test results in the repo | — |

---

## 5. Production-Readiness Matrix

| Component | Status |
|---|---|
| Trust ladder | ✅ Ready |
| RBAC / JWT auth | ✅ Ready |
| Action execution framework | ✅ Ready (some action stubs need real implementations) |
| Decision engine | ✅ Ready (depends on Gemini API uptime) |
| Audit logging | ✅ Ready (needs log rotation / external shipping) |
| Quota enforcement | ✅ Ready |
| Frontend API layer / Electron shell | ✅ Ready |
| Landing site & trial form | ✅ Ready / already live |
| Autonomous real-time response | ⚠️ Logic ready, state not durable |
| Persistence layer | ⚠️ File-based, no real DB |
| Multi-tenancy isolation | ⚠️ Partial — shared stores not tenant-filtered |
| Rate limiter (legacy) | ⚠️ Should be replaced by quotaGuard pattern everywhere |
| Credential-key enforcement | ⚠️ Should be fatal, currently just logs |
| Main scan/threat-detection engine | ❌ Simulated, not real |
| Several "investigation" actions | ❌ Stubbed |
| Semantic memory recall | ❌ Keyword-only, not vector/semantic |
| CI/CD | ❌ None |
| External monitoring/alerting | ❌ None |
| Compliance documentation | ❌ None |
| Hosted multi-tenant app server | ❌ Doesn't exist yet — desktop-only today |

---

## 6. Priority Recommendations

1. **Disable** the default `operator`/`aria` login and any demo fixtures outside dev mode before any real customer touches the platform.
2. **Make the missing-encryption-key check fatal** in production mode ([server/persistenceConfig.mjs](./server/persistenceConfig.mjs)) instead of a logged warning.
3. **Decide the deployment model**: stay desktop-only, or invest in a real hosted backend with a proper database and tenant isolation. This is the single largest open architecture decision.
4. **Replace the simulated scan engine** with real detection before any prospect is shown dashboard findings as live data — this is the most reputationally risky gap.
5. **Add basic CI** (lint + test on push) and at least one monitoring/alerting hook on the already-live AWS infrastructure (landing site, trial form Lambda).
6. **Tenant-scope the shared stores** (approvals, trust scores, audit log) before enabling any multi-tenant access.
7. **Retire the legacy in-memory rate limiter** in favor of the existing `quotaGuard.mjs` pattern everywhere.

---

*End of report.*

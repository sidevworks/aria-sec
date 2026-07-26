<div align="center">

# ARIA

### Autonomous Resilience Intelligence Architecture

**A voice-native, 3D spatial security operations cockpit with governed autonomy — that runs entirely on your own hardware if you want it to.**

[![License: BSL 1.1](https://img.shields.io/badge/License-BSL%201.1-blue.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/Node-%E2%89%A522-339933.svg)](https://nodejs.org)
[![React](https://img.shields.io/badge/React-19-61dafb.svg)](https://react.dev)
[![Three.js](https://img.shields.io/badge/Three.js-WebGL-000000.svg)](https://threejs.org)
[![BYOK](https://img.shields.io/badge/AI-Bring%20Your%20Own%20Key-8b5cf6.svg)](#-bring-your-own-key)

*Source-available for evaluation and research. Not open source — see [License](#-license).*

</div>

---

## What this is

Most AI security tools act and then ask you to trust them. ARIA inverts that: every
autonomous capability has to **earn** its authority through measured outcomes, and
you can see and bound exactly how far it is allowed to go.

It is a single-operator SOC cockpit you talk to. The entire feature set is a
navigable 3D galaxy rather than a sidebar of menus. It ingests telemetry from your
cloud, identity, code, and network surfaces, explains what matters in plain
language, and proposes bounded actions that are gated by policy and written to an
audit trail.

> **Honest status:** ARIA is a working platform under active solo development, not
> a hardened commercial product. It is genuinely functional — real connectors, real
> local network and BLE discovery, real audit trails, a real local-model path — but
> parts of it are demo-grade and labelled as such throughout this README and in the
> product itself. Nothing here is presented as more finished than it is.
>
> **→ [ROADMAP_AND_LIMITATIONS.md](./ROADMAP_AND_LIMITATIONS.md)** is the full
> engineering audit, published unedited: module-by-module status with file paths and
> line numbers, naming exactly which subsystems are production-grade and which are
> simulated. If it disagrees with this README, believe it instead. A shorter summary
> is in [Maturity & what is not done](#-maturity--what-is-not-done) below.

---

## ✨ Core features

### 🌌 Spatial Galaxy Command Interface

The whole platform is a Three.js/WebGL galaxy. **Sectors** are capability domains;
**nodes** are individual panels. A three-tier colour system (blue nominal → amber
threat → red critical) propagates live from scan and telemetry state, so posture is
legible from across the room.

Four interchangeable ways to navigate: click a node, **speak** a destination, type a
command, or let ARIA route you automatically when a critical event fires.

### ⚖️ Governed Autonomy & the Trust Ladder

The core idea, and the reason the rest exists. Autonomy is not a global on/off
switch — it is **per-capability** and **earned**.

Four capabilities (`threat_analysis`, `remediation`, `containment`,
`identity_actions`) each sit independently on a four-rung ladder:

| Rung | Mode | Behaviour |
|:--|:--|:--|
| 1 | `approval` | ARIA proposes; a human approves every action |
| 2 | `assisted` | ARIA acts on low-risk items, escalates the rest |
| 3 | `auto` | ARIA acts autonomously except on critical-risk actions |
| 4 | `full_auto` | ARIA acts, and reports |

Promotion requires a track record of measured outcomes. Crucially, **the model
cannot promote itself** — a capability only climbs when an operator promotes it, and
demotion on a bad outcome is immediate. Every promotion, demotion, approval and
action is written to an append-only audit log with a retention envelope.

### 🎙️ Voice-Native & Interruptible

Two-way spoken conversation over live data, not a chatbot bolted to a dashboard.
Speech-to-text is **always local** (Whisper via `@xenova/transformers`) — your voice
never leaves the machine. Text-to-speech is an optional cloud call you can leave
unconfigured.

### 🛡️ Air-Gapped & Sovereign-Ready

ARIA is built for regulated environments where sending telemetry to a third-party
SaaS is not merely undesirable but illegal. In `LOCAL` mode reasoning runs against
your own model over an OpenAI-compatible endpoint (Ollama, vLLM, LM Studio,
llama.cpp) and **the sovereignty boundary is enforced in code, not promised in
docs**:

- `server/localLlm.mjs` refuses to send a prompt to any host outside loopback or a
  private range. A public address is rejected unless you explicitly set
  `ARIA_LOCAL_LLM_ALLOW_REMOTE=true`.
- `LOCAL` mode **never** silently falls back to a cloud provider, even when a cloud
  API key is sitting right there in your environment. If your local engine is down
  you get a clearly-labelled degraded summary and the reason — not a quiet egress.
- The server binds to loopback by default and is not designed to face the internet.

### 🔌 Connectors & AI-SPM

AI Security Posture Management across GitHub, AWS, Okta, Snyk, Azure AD,
VirusTotal, and Elastic Security — inventorying AI assets, secrets, model
infrastructure, endpoints, and identity links, then mapping attack paths and blast
radius across them. Connector credentials are encrypted at rest with AES-256-GCM.

### 📡 Local Network & Bluetooth Intelligence

Real ARP-table and BLE discovery with IEEE OUI vendor attribution and Bluetooth
assigned-number decoding, device identity claims, and proximity estimation.
Broadcast and multicast MACs are filtered at parse time rather than reported as
devices. Active discovery is authorization-gated; passive visibility is not.

---

## 🚀 Quickstart

**Under five minutes, no API keys required** — ARIA starts with local-only features
and every AI provider disabled but visibly labelled as such.

### Prerequisites

- **Node.js ≥ 22** (uses `node:` builtins and native `fetch`)
- **npm** (or pnpm)
- *Optional:* [Ollama](https://ollama.com) for sovereign local reasoning
- *Optional:* Docker, for the containerised server

### 1. Clone and install

```bash
git clone https://github.com/<your-org>/aria-guardian.git
cd aria-guardian
npm install
```

### 2. Configure

```bash
cp .env.example .env.local
node scripts/generate-encryption-key.mjs --write   # AES-256-GCM key for the credential vault
```

`.env.example` documents every variable. **All AI keys are optional** — fill in only
what you want. See [Bring Your Own Key](#-bring-your-own-key).

### 3. Run

```bash
npm run start:local     # API on :5000 + web UI on :5173
```

Then open **http://127.0.0.1:5173** and log in with the development operator:

```
username: operator
password: aria
```

> This built-in account exists **only** when `NODE_ENV` is `development`/`test`, or
> when `ARIA_ENABLE_DEMO_LOGIN=true` outside production. Production is fail-closed:
> it refuses to boot without real operator credentials *and* a credential
> encryption key. Set `ARIA_LOGIN_USERNAME`/`ARIA_LOGIN_PASSWORD` (or
> `ARIA_OPERATORS`) for any real deployment.

### Other entry points

| Command | What it does |
|:--|:--|
| `npm run start:local` | API + web UI together (recommended first run) |
| `npm run aria` | Electron desktop app |
| `npm run server` | API server only, on `:5000` |
| `npm run dev` | Vite frontend only |
| `npm run build` | Production frontend bundle |
| `npm run dist` | Packaged desktop app (macOS `.dmg`) |
| `npm run lint` | ESLint |
| `npm run test:server` | Server test suite |

### Docker

```bash
export ARIA_CREDENTIAL_ENCRYPTION_KEY=$(node scripts/generate-encryption-key.mjs)
docker compose up
```

Compose fails fast with an explanatory message if that key is unset — the image runs
with `NODE_ENV=production`, which will not silently store credentials in plaintext.
To reach a model server running on your host rather than in a container, set
`ARIA_LOCAL_LLM_URL=http://host.docker.internal:11434/v1`.

---

## 🔑 Bring Your Own Key

ARIA ships with **no keys**, has **no telemetry**, and **never proxies your traffic
through anyone else's infrastructure**. There is no analytics SDK in this repo —
verify it yourself:

```bash
grep -rniE --include='*.mjs' --include='*.js' --include='*.jsx' \
  "posthog|mixpanel|amplitude|google-analytics|gtag|datadog|sentry" src/ server/
```

Every outbound host in the codebase is one you configured: your chosen LLM
provider, your connectors' own APIs, and ElevenLabs if you enable speech.

Keys live in `.env.local` (gitignored) or your process environment. Connector
credentials entered through the UI are encrypted at rest with AES-256-GCM, or can be
delegated to AWS Secrets Manager.

Four **Intelligence Modes**, switchable live from the cockpit:

| Mode | Provider | Requires | Data leaves your network? |
|:--|:--|:--|:--|
| `CLOUD` | Anthropic Claude | `ANTHROPIC_API_KEY` | Yes |
| `GEMINI` | Google Gemini | `GEMINI_API_KEY_V2` | Yes |
| `LOCAL` | Any OpenAI-compatible local server | a running engine | **No — enforced in code** |
| `HYBRID` | Cloud first, local failover | either | Only while cloud is reachable |

The selector reflects **reality, not aspiration**: each mode is greyed out with a
hover explanation when it cannot actually answer, and `LOCAL` displays the name of
the model you actually have loaded. Query it directly at
`GET /api/model/status`.

### Sovereign setup

```bash
ollama serve
ollama pull qwen3:8b
```

That is the entire configuration. ARIA defaults to Ollama on loopback and, if you
have not named a model, **uses the first one the server reports** — so it works with
whatever you have already pulled. To be explicit:

```bash
ARIA_LOCAL_LLM_URL=http://127.0.0.1:11434/v1
ARIA_LOCAL_LLM_MODEL=qwen3:8b
```

vLLM, LM Studio, llama.cpp's server and text-generation-webui all work through the
same path — anything that speaks `/v1/chat/completions`.

---

## 🏗 Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  Renderer — React 19 + Three.js (Electron window or browser)     │
│  Galaxy scene · panels · voice loop · Intelligence Mode selector │
└───────────────────────────────┬──────────────────────────────────┘
                                │  HTTP + WebSocket (loopback)
┌───────────────────────────────┴──────────────────────────────────┐
│  Node.js server — server/index.mjs                               │
│                                                                  │
│  authz · quotaGuard · rateLimiter · auditLog · securityHeaders    │
│  ariaTrust (Trust Ladder) · actionRunner · policyStore            │
│  reasoningEngine · autonomousResponse · ariaMemory                │
│  aiSpmInventory · aiRiskEngine · aiSpmBlastRadius                 │
│  NetworkIntelligence/ · Bluetooth/ · connectors/                  │
└───┬──────────────────────┬───────────────────────┬───────────────┘
    │                      │                       │
┌───┴────────┐   ┌─────────┴──────────┐   ┌────────┴─────────────┐
│ Reasoning  │   │ Connectors         │   │ Persistence          │
│            │   │                    │   │                      │
│ Anthropic  │   │ GitHub · AWS       │   │ JSON under           │
│ Gemini     │   │ Okta · Snyk        │   │ aria-memory/         │
│ Local      │   │ Azure AD           │   │ + optional KV mirror │
│ (sovereign)│   │ VirusTotal·Elastic │   │ AES-256-GCM vault    │
└────────────┘   └────────────────────┘   └──────────────────────┘
```

**Frontend** — React 19 with Three.js via `@react-three/fiber`, `drei`, and
`postprocessing`. Panels are lazily code-split. Vite for dev and build;
`electron-vite` for the desktop target.

**Server** — a single Node.js HTTP + WebSocket server, no framework, ~4,500 lines of
routing in `server/index.mjs` delegating to 74 focused modules. Loopback-bound by
default. Role-based authz (`owner`/`admin`/`analyst`/`viewer`) with opaque
in-memory session tokens.

**Reasoning** — one dispatcher (`callAI`) fans out to Anthropic, Gemini, or your
local engine, with per-mode fallback policy that respects the sovereignty
guarantee.

**Persistence** — file-based JSON under `aria-memory/`, with an optional Upstash KV
mirror for durability across restarts. Deliberately boring: it is inspectable with
`cat`, which matters for an audit trail.

**Voice** — local Whisper STT (`@xenova/transformers`, runs on-device); ElevenLabs
TTS as an optional cloud call.

---

## 🧭 Maturity & what is not done

Publishing an honest list is more useful than a feature grid. Known gaps, current as
of this commit — the full module-by-module account with file paths is in
[ROADMAP_AND_LIMITATIONS.md](./ROADMAP_AND_LIMITATIONS.md):

| Area | Status |
|:--|:--|
| **Network scan depth** | ARP-table reads and BLE scanning are real; "deep scan" is not a full active port/vuln scan. Phase naming is being made literal. |
| **Local TTS** | Speech-to-text is local; text-to-speech is still a cloud call, so `LOCAL` mode is sovereign for *reasoning* but not for *speech output*. Piper/Kokoro is the intended fix. |
| **Semantic memory** | Keyword search, not vector search. Fine at current scale. |
| **Multi-tenancy** | Tenant IDs flow through the system but isolation is **not** enforced on every store. Single-tenant desktop use only today. |
| **Approval queue** | File-backed; does not survive across multiple server instances. |
| **Audit log rotation** | Capped per file with a retention envelope; rotation is not yet implemented. |
| **Rate limiting** | Legacy in-memory limiter still present alongside the newer `quotaGuard`. |
| **CI/CD** | Manual shell scripts. No pipeline in this repo. |
| **Lint** | 45 pre-existing ESLint errors, mostly unused vars in two large components. `npm run build` is clean. |
| **Compliance** | No SOC 2, no formal privacy policy or IR plan yet. |

Security reports are welcome — please open a private advisory rather than a public
issue.

---

## 📁 Repository layout

```
server/               Node.js API — routing, autonomy, connectors, intelligence
  ariaTrust.mjs         Trust Ladder: scoring, promotion, demotion
  localLlm.mjs          Sovereign local LLM client + egress guard
  auditLog.mjs          Append-only audit trail with retention
  authz.mjs             Role-based authorization
  connectors/           GitHub, AWS, Okta, Snyk, Azure AD, VirusTotal, Elastic
  NetworkIntelligence/  ARP discovery, OUI vendor lookup, device identity
  Bluetooth/            BLE scanning and intelligence
src/                  React 19 + Three.js renderer
  landing/              Cinematic Three.js entry surface
  panels/               Operator panels (galaxy nodes)
  voice/                Local Whisper STT + voice loop
electron/             Desktop main + preload
scripts/              Launchers, registry updaters, key generation
infra/trial-form/     AWS SAM reference stack for the landing page's forms
docs/                 Capability reference and API documentation
test/                 Node test-runner suites

ROADMAP_AND_LIMITATIONS.md   Full engineering audit — read this before evaluating
```

---

## 📄 License

**Business Source License 1.1** — source-available, not open source.

- ✅ **Permitted without a fee:** development, testing, evaluation, security and
  academic research, personal sandbox use, internal demonstration.
- ❌ **Requires a commercial license:** production use, or offering ARIA's
  functionality to third parties as a hosted or managed service.
- 🔓 **Converts to GPL-3.0-or-later on 2030-07-26.**

Full terms in [LICENSE](./LICENSE). Copyright © 2026 Sary Ismail.

<div align="center">
<br>
<sub>Built in the Kingdom of Bahrain.</sub>
</div>

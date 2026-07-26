# ARIA — Interactive Landing Site · Master Build Brief (for Fable 5 + build agents)

> **This document is the single source of truth.** Fable 5 designs from it; build
> agents implement from it; narration agents write to it. Do not contradict it.
> Facts about the product are drawn from the live codebase — keep them accurate.
> Companion docs: `docs/reports/aria-feature-scope-master.md` (full capability list),
> `docs/landing/narration/` (the recorded-narrative copy).

---

## 0. Role & Mission (read this first)

You are designing and building **not a landing page — an interactive, voice-guided,
cinematic web experience that makes the visitor feel like they are operating the ARIA
platform itself.** It must be as visually striking and as alive as the product's own
cockpit. A static marketing page is an automatic fail.

**Two audiences, one page:**
1. **Security buyers / design partners** — CISOs, SOC leads, security engineers.
2. **Investors / VCs** — this page will be linked from LinkedIn posts and cold VC
   emails. It must signal an inevitable, fundable company.

**The experience must:**
- Navigate like the platform: a **galaxy/sector interface** with warp-style
  transitions, not a scroll-down brochure.
- Offer a **voice-guided tour** the moment a visitor lands (their choice — never
  forced).
- Let users click **"Find out more"** on any sector/page and have **ARIA narrate a
  full deep-dive** (pre-recorded audio, plays instantly).
- Be **flawless on mobile** — never broken, never embarrassing on a VC's phone.
- Be **fast** — the pitch lands even before the heavy 3D loads.

---

## 1. Product Truth (accurate facts — do not invent)

- **Name:** ARIA — voiced/pronounced "Aariya."
- **Expansion:** **A**utonomous **R**esilience **I**ntelligence **A**rchitecture.
- **What it is:** An autonomous AI security operations platform — a voice-native
  cockpit that watches the environment, explains risk in plain language, coordinates
  response, and acts under governed, auditable autonomy.
- **Self-description (canonical voice):** *"I turn security telemetry into
  understandable, accountable action that improves over time."*
- **Form factor:** Electron desktop app (macOS-first, Touch ID) **and** web app.
  React 19 + Three.js front end; Node.js real-time server back end.
- **The wedge to lead with:** **governed autonomy** + **AI-SPM** (securing the AI
  agents companies are already running) — the freshest, most fundable framing.

### The five platform sectors (mirror these as the site's galaxy)
| Sector | What lives there |
|---|---|
| **Threat Intel** | Threat overview, attack vectors, timeline, system health |
| **Network & Access** | Live network, logs, identity & sessions |
| **Command** | AI-SPM, Command Center, Decision Engine |
| **Response** | Incidents, blocked IPs, quarantine, security admin, policy |
| **Identity & Access** | Identity Galaxy Map — ITDR · UEBA · Zero Trust |

### Signature capabilities (the proof points)
- **Conversational & voice-native** — interruptible two-way conversation over live data.
- **AI-SPM** — discovers AI systems, prompts, tools, secrets, model infra, cloud
  assets across **7 connectors** (GitHub, AWS, Okta, Azure AD, Snyk, VirusTotal,
  Elastic); builds attack paths, blast radius, confidence, remediation.
- **Identity Galaxy / ITDR / UEBA** — every department is a galaxy; impossible-travel
  detection, privilege-drift timeline, behavioural baselines, one-click containment.
- **Governed autonomy & the trust ladder** — `approval → assisted → auto → full_auto`;
  trust is *earned per capability*, scores are platform-owned (the model can read but
  never write them), every action is verified and audited.
- **Autonomous response** — sub-millisecond velocity/correlation detection → auto
  block IP / create incident / quarantine.
- **Three intelligence engines** — Cloud (Claude Opus 4.8) · Local (on-prem,
  data-sovereign) · Hybrid (always-on).

---

## 2. Brand & Visual System

**Aesthetic:** cinematic "cosmic command center." Deep-space black, neon HUD,
volumetric depth, generative motion. Mil-spec sci-fi, but premium and restrained —
never gamer-RGB tacky.

**Core palette (use exactly):**
| Token | Hex | Use |
|---|---|---|
| Space black | `#06080f` / `#04060d` | Primary backgrounds |
| Panel ink | `#0a0e1a` / `#070b15` | Surfaces, chrome |
| Cyan (signature) | `#63f5ff` | Primary accent, ARIA voice, CTAs |
| Teal | `#2dd4bf` | Healthy / nominal / AI-SPM |
| Sky | `#38bdf8` | Identity |
| Electric blue | `#1687ff` | Network |
| Violet | `#a78bfa` / `#8b5cf6` | Command / intelligence |
| Amber | `#ffc857` | Warning tier |
| Magenta alert | `#ff3d81` | Critical tier, containment |
| Muted slate | `#9fb3c7` / `#5f7184` | Body / secondary text |

**Three-tier semantic system (ownable — use everywhere):** blue = nominal · amber =
detected threat · red/magenta = critical. Colors should feel like they update live.

**Typography:** geometric/grotesque sans for display (e.g. Space Grotesk, Inter
Tight, or similar); **monospace** for labels, telemetry, coordinates, micro-data
(e.g. SF Mono / JetBrains Mono). Wide letter-spacing on uppercase micro-labels.
Sentence case for prose; uppercase only for HUD micro-labels.

**Texture & depth:** parallax starfield, faint grid/scanlines, volumetric glow on
nodes, glassmorphism panels (backdrop blur), thin neon hairline borders. Motion is
slow and confident (orbital drift, particle streams), never frantic.

---

## 3. Global Navigation & Motion System (the heart of the experience)

The site must **navigate like the platform.** Replace traditional page routing with a
**galaxy command interface**:

- **Home = the galaxy.** Sectors are luminous hubs; each hub holds nodes
  (sub-destinations). Hovering a node = magnetic pull + callout label. Clicking warps
  you in.
- **Four interchangeable ways to move** (mirror the product): **click** a node,
  **speak** a destination (voice), **type** a command in a console bar, or **let ARIA
  route you** during the guided tour.
- **Warp transition verbs** — reuse the platform's own cinematic routes as named
  transition styles between destinations:
  `bank · dive · orbit · slingshot · drop · sweep · rise`. Each destination gets an
  **arrival callout** (e.g. "AI posture mapped", "Identity galaxy online").
- **Persistent HUD chrome:** top sector bar, a left status stack (system state /
  threat level / mode), a right control rail (voice toggle · guided-tour · audio ·
  command console). This chrome frames every view.
- **Command console:** a slim input the visitor can type into ("show me AI-SPM",
  "what is the trust ladder") that routes them — playful but functional.
- **Sound design:** subtle UI blips on navigation, a low ambient hum, an optional
  one-time "critical siren" easter egg. All muted by default; unlocked on first user
  gesture. Never autoplay sound without interaction.

**Accessibility & reduced motion (mandatory):**
- Honor `prefers-reduced-motion`: replace warps with quick cross-fades, freeze the
  starfield, stop autoplaying loops.
- Full keyboard navigation; visible focus rings; every node reachable by tab.
- All narration has synced captions + a text transcript fallback.
- Color is never the only signal (pair tier color with an icon/label).

---

## 4. The Voice System (the defining feature)

ARIA must *speak* on this site. Implement three voice layers:

### 4.1 Landing choice (first 2 seconds)
On arrival, after a fast cinematic boot, present a non-blocking choice overlay:
- **"Take the guided tour"** → ARIA narrates and auto-navigates the experience.
- **"Explore on your own"** → free-roam the galaxy; narration available on demand.
- **"Skip to the pitch"** → jump to a concise scrollable summary (for impatient VCs).

Never trap the user — the tour is interruptible at any moment (talk over it, click
away, hit stop). A persistent mute/caption control is always visible.

### 4.2 Voice-guided navigation
In tour mode, ARIA introduces itself, then **drives the camera** through the galaxy —
opening each sector, triggering its signature animation, and narrating *what it is and
why it matters*. This mirrors the platform's own `runDemoFrom()` guided demo. Tour
length: **~90 seconds** for the headline path, with the option to branch deeper.

### 4.3 "Find out more" deep narratives (per section)
Every major destination — **About, each Function/sector, Demo, Funding** — has a
**"Find out more"** affordance. Clicking it plays a **full, detailed ARIA narration**
specific to that topic, with synced on-screen captions and visuals that respond to the
narration. These are the "deep-dive" scripts (see `docs/landing/narration/`).

### 4.4 Audio production pipeline (pre-rendered, instant playback)
**All narration is pre-rendered to static audio files shipped with the site** so it
plays instantly with zero latency and zero per-visitor API cost or key exposure.

Pipeline:
1. Narration copy is written as text (in `docs/landing/narration/`, in ARIA's voice).
2. Audio is rendered outside this repository and checked in only as final static
   media. Rendering tools, provider keys, and batch-generation scripts are not
   shipped with the codebase.
3. Each clip is saved as a versioned static asset (e.g. `/audio/about.mp3`,
   `/audio/functions/ai-spm.mp3`, `/audio/guided-tour.mp3`) + a matching `.vtt`
   caption file.
4. Front end preloads the guided-tour clip; lazy-loads deep-dive clips on hover/intent.
5. **Browser autoplay policy:** audio only starts after a user gesture (the tour/“find
   out more” click). On mobile, default to captions-on with tap-to-play.

> Do not call external voice providers live from the public site. Pre-bake
> everything and keep generation credentials out of the repository.

---

## 5. Site Map / Information Architecture

A single immersive app with galaxy-routed destinations (treat as "pages"):

1. **Home / Cockpit** — the galaxy, boot sequence, landing voice choice, headline,
   command console, persistent CTA.
2. **About ARIA** — what it is, the story, the "why now," the three engines.
3. **Platform / Functions** — the capability galaxy: AI-SPM, Identity Galaxy,
   Governed Autonomy, Decision Engine / Autonomous Response, Command Center, Network,
   Connectors. Each with its own deep-dive narration.
4. **Demo** — the embedded **short (~90s) interactive demo** + "take control."
5. **Investors / Funding** — the fundraising narrative, market/why-now, the ask,
   gated deck/data-room request.
6. **Request a Trial** — 14-day free-demo signup form → emails Sary → manual license
   key issuance.
7. **Contact** — email / phone / location.

A slim global wayfinder (sector bar + command console + "Request trial" button) is
always present so a visitor is never lost and the CTA is never more than one action
away.

---

## 6. Page-by-Page Specifications

### 6.1 Home / Cockpit
- **Boot (≤1.5s):** terminal-style boot log flickers in (`ENCRYPTION HANDSHAKE:
  AES-256-GCM · IDENTITY MESH: CONNECTED · AWAITING OPERATOR…`) over the forming
  galaxy. Instant first paint; 3D streams in behind it.
- **Landing voice choice** (§4.1).
- **Headline (legible in a screenshot — VCs forward these):**
  *"The autonomous security analyst you can actually trust to act."*
- **Subline:** *"AI agents are flooding into companies with zero security around them.
  ARIA watches your environment, explains the risk, and contains threats — under
  autonomy you bound and audit."*
- **Primary CTA:** Request a 14-day trial. **Secondary:** Watch the 90-second demo.
- The galaxy itself is the hero — alive, drifting, with live-looking tier colors.

### 6.2 About ARIA
- Narrative of what ARIA is and the problem it kills (SOC tools show data; they don't
  decide, explain, or act — and the ones that act, you can't trust or audit).
- The **three intelligence engines** (Cloud / Local / Hybrid) as a clear visual.
- "Find out more" → full About narration.
- Founder/credibility slot (leave structured space; founder to fill).

### 6.3 Platform / Functions (capability galaxy)
Each capability is a node with: a signature animated visual, a one-line "what it is," a
"why it matters" line, and a **"Find out more → ARIA narrates"** deep-dive. Cover:
- **AI-SPM** (lead) · **Identity Galaxy / ITDR / UEBA** · **Governed Autonomy & the
  Trust Ladder** · **Decision Engine / Autonomous Response** · **Command Center** ·
  **Network Intelligence** · **Connectors (7)**.
- The **trust ladder** gets a dedicated interactive visual: the four rungs
  (`approval → assisted → auto → full_auto`) with the real promotion logic ("the model
  can read its trust score but can never write it; you decide when it earns more").

### 6.4 Demo
- Embedded **short interactive demo (~90s)** in the same cinematic style as the
  platform's own guided tour (script + storyboard in §7).
- "Take control" → drop into free-roam galaxy.
- Pre-rendered ARIA narration + captions; mobile shows the video-loop fallback.

### 6.5 Investors / Funding
Tuned for VCs arriving from LinkedIn/cold email. Tasteful, confident, not desperate.
- **The thesis:** why autonomous security + AI-SPM is a category, and why now (AI
  agents proliferating with no security posture around them).
- **Why ARIA wins:** governed autonomy as the trust unlock incumbents/clones lack.
- **The product is the proof:** invite them to *play the live demo* right here.
- **Market framing**, **the ask** (round stage/use of funds — founder fills), **team**.
- **CTA:** "Request the deck / data room" → gated form → emails Sary. Quiet secondary
  "Talk to the founder" (→ Contact).

### 6.6 Request a Trial (free demo)
- **Offer:** a **14-day full-feature free trial**, license-key activated.
- **Form fields:** full name · work email · company · role/title · company size ·
  primary interest (AI-SPM · Autonomous SOC · Identity/ITDR · Just evaluating) ·
  how they heard about ARIA · optional message · consent checkbox.
- **On submit:** send a formatted email to **sary@aria-sec.com** with all fields;
  show the user a confirmation ("Your request is in. We'll email your 14-day license
  key within 1 business day."). See §8 for backend.
- Light validation, honeypot/anti-spam, success + error states, accessible labels.

### 6.7 Contact
- **Email:** sary@aria-sec.com
- **Phone:** +973 3614 6601 (Bahrain)
- **Location:** Kingdom of Bahrain
- Simple message form (also emails Sary), plus the direct details. On-brand, minimal.

---

## 7. The NEW Short Demo — Script & Storyboard (~90s)

Same voice and style as the platform's existing guided tour, condensed to a tight,
investor-friendly ~90 seconds. ARIA speaks in first person. Pre-render this narration.

| # | Visual / motion | ARIA narration (verbatim, render to audio) |
|---|---|---|
| 1 | Galaxy forms from darkness; boot log resolves; camera settles. | *"I am ARIA — Autonomous Resilience Intelligence Architecture. I watch your environment, explain the risk, and act on it — under autonomy you control. Let me show you, in ninety seconds."* |
| 2 | Camera pans the galaxy; sectors light up; a node is spoken-to and opens. | *"Everything I do lives in one interface. Each sector is a galaxy; each node, a live capability. Speak, click, or let me take you there."* |
| 3 | Warp into AI-SPM; assets/secrets plot onto an exposure graph; an attack path draws itself. | *"Your company is already running AI agents — most with no security around them. I discover every model, prompt, secret, and cloud asset, then map the exact attack path and blast radius."* |
| 4 | Slingshot to the Identity Galaxy; an impossible-travel arc flares red; a host is contained. | *"When credentials behave impossibly — a login from two continents at once — I catch it, and I can contain it instantly: block the address, revoke the session, quarantine the host."* |
| 5 | Rise to the trust ladder; four rungs illuminate; an audit entry stamps. | *"But I never act beyond the trust you grant me. I earn autonomy step by step — every decision scored, every action audited. You decide how far I go."* |
| 6 | Pull back to the full galaxy; CTA resolves on screen. | *"This is a fraction of what I can do. Take the guided tour — or request a fourteen-day trial and see me run on your world."* |

Total ≈ 85–95s. Each beat is its own audio segment so the visuals can sync precisely.
A muted **video-loop export** of this sequence is the mobile/low-power fallback.

---

## 8. Forms, Email & Licensing (technical behavior)

**Goal:** trial/contact/investor forms email Sary so he can manually issue license keys.

- **Delivery:** POST form → serverless function or the existing Node
  server → send email to **sary@aria-sec.com** via a transactional provider
  (Resend / Postmark / SendGrid). Do **not** put SMTP creds in the client bundle.
- **Email contents:** all form fields, timestamp, source page, and a generated
  request ID. Subject e.g. `ARIA trial request — {company} ({name})`.
- **User confirmation:** on-page success state + (optional) auto-acknowledgement email
  to the requester ("We received your request; your 14-day key arrives within 1
  business day").
- **Licensing (manual for now):** Sary issues a 14-day key out-of-band. Leave a clean
  seam to automate later (key generator + expiry). Do not build the full licensing
  server now — just the request capture + notification.
- **Anti-spam:** honeypot field + basic rate limiting; never expose the recipient
  address in client-readable markup beyond what's necessary.

---

## 9. Mobile & Responsive Strategy (must not look broken)

A VC will open this on a phone. Plan for it from the start, not as an afterthought.

- **Tiered experience by capability:**
  - **Desktop / capable GPU:** full Three.js galaxy + warps + voice tour.
  - **Mobile / low-power / `prefers-reduced-motion`:** swap the live 3D for a
    **pre-rendered video/poster** of the galaxy and the demo loop. Same narrative,
    same beauty, zero jank.
- **Detection:** feature-detect WebGL + device memory + connection; fall back
  gracefully (never a white screen, never a frozen canvas).
- **Touch-first nav:** sectors become a tappable vertical/stacked layout; the command
  console becomes a tap-to-search; CTAs are thumb-reachable.
- **Audio on mobile:** captions on by default; tap-to-play narration (autoplay audio
  is blocked).
- **Performance budget (mobile):** first contentful paint < 2s; the pitch (headline +
  CTA) readable before any heavy asset loads.

---

## 10. Performance, SEO & Social

- **Performance:** lazy-load 3D behind the boot overlay; code-split per destination;
  preload only the guided-tour audio; compress textures; target Lighthouse ≥ 90 on
  desktop, graceful on mobile.
- **SEO basics:** real, crawlable text for the pitch (don't lock everything inside the
  canvas); semantic headings; meta title/description.
- **Social / Open Graph (critical — links shared on LinkedIn + VC email):**
  - A striking **OG image** (a galaxy frame with the headline).
  - `og:title`, `og:description`, `og:image`, Twitter card. The link preview itself
    must look like a fundable company.
  - A short looping preview video where supported.

---

## 11. Recommended Tech & Reuse

- **Stack:** React + Three.js (matches the platform; lets you reuse components),
  Vite, deployed as a static site. Could be a dedicated marketing app or a public
  "kiosk" route of the existing app in forced **demo mode** (`AI_SPM_DEMO_MODE`,
  demo fixtures) with no auth, no real connectors, no Touch ID.
- **Reuse from the repo where sensible:** the galaxy/sector layout, the guided-demo
  runner pattern (`runDemoFrom` / `DEMO_CHAPTERS`), panel visuals, the frequency-driven
  audio-reactive animation, and the pre-rendered narration assets.
- **Keep the public build sandboxed:** demo data only; no live LLM/voice keys client
  side; pre-baked audio.

---

## 12. Tone & Copy Rules

- Confident, precise, a little awe-inspiring — never hypey or buzzword soup.
- ARIA speaks in **first person**, calm and authoritative.
- Sentence case everywhere except HUD micro-labels.
- Lead with **trust + autonomy**; the galaxy/voice is *how*, not the pitch.
- Never signal incompleteness ("demo", "coming soon", "20% done") on the public page.
- Every screen has one clear next action (trial / demo / talk to us).

---

## 13. Copy Bank (ready to use)

**Headlines (A/B):**
- "The autonomous security analyst you can actually trust to act."
- "Autonomous. Accountable. Always watching."
- "From telemetry to governed action — explained every step."
- "Security that acts at machine speed, under human control."

**Sublines:**
- "AI agents are flooding into companies with zero security around them. ARIA watches,
  explains, and acts — under autonomy you bound and audit."
- "An AI SOC that discovers your risk, decides what to do, and earns the right to act."

**CTAs:** "Request a 14-day trial" · "Watch the 90-second demo" · "Take the guided
tour" · "For investors" · "Talk to the founder."

**Investor one-liner:** "We're building the trust layer that finally lets AI act
inside security operations — starting with the AI systems every company is already
running."

---

## 14. Build Work-Breakdown ("the army")

To parallelize without collisions, work is split into non-overlapping streams. The
narration copy streams (A-D) are already being produced by agents into
`docs/landing/narration/`. The build streams begin **after Fable 5 delivers the visual
design** so nothing is thrown away.

| Stream | Owner | Output | Depends on |
|---|---|---|---|
| Narration: About + Funding | agent | `narration/about.md`, `narration/funding.md` | this brief |
| Narration: Functions pt.1 | agent | `narration/functions/{galaxy,ai-spm,identity-galaxy,network}.md` | this brief |
| Narration: Functions pt.2 | agent | `narration/functions/{governed-autonomy,decision-engine,command-center,connectors}.md` | this brief |
| Narration: Tour + Demo + hooks | agent | `narration/{guided-tour,demo,find-out-more-intros}.md` | this brief |
| Visual design | **Fable 5** | full design system + page comps + motion | this brief |
| Audio production | founder/agent | final static `/audio/*.mp3` + `.vtt` assets | narration copy |
| Front-end build | build agents | the interactive site | Fable design |
| Forms/email/licensing | build agent | trial/contact/investor capture → email | this brief §8 |
| Mobile/fallback + video export | build agent | responsive tiers + demo video loop | Fable design |

---

## 15a. Image & Video Asset Generation

The founder has access to top-tier **image and video generation models** and will
**run the prompts himself**. So: **Claude/Fable write the prompts;
the founder executes and drops the rendered assets into the site.** Don't try to
generate visuals yourself — produce precise, ready-to-run prompts instead.

For every visual/video asset, supply a prompt block with: subject, **aspect ratio**,
**duration** (for video), style (cosmic command-center using the exact palette in §2),
camera/motion notes, and where it's used. Assets the site needs:

- **OG / social image** — galaxy + headline, for LinkedIn & VC-email link previews
  (1200×630). The single most-shared frame; make it striking.
- **Hero galaxy footage / ambient loop** — slow orbital drift, seamless loop.
- **Mobile fallback demo video** — a rendered ~90s capture of the §7 demo storyboard
  (the graceful fallback when WebGL isn't viable; §9).
- **Per-sector signature stills/textures** — one per capability node.
- **Investor-page hero still** — confident, premium, on-brand.

Deliver these as a prompt pack the founder can run in one pass.

### Confirm before launch
- City within Bahrain for Contact (brief uses "Kingdom of Bahrain").
- Final domain (`aria-sec.com` assumed from the contact email).
- Founder bio / credibility copy and any advisor/backer logos.
- Round details for the Investors page (stage, ask, use of funds).

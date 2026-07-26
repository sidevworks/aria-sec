# ARIA — Embedded Short Demo Narration
## Production-ready script · ~90 seconds · 6 beats

> This script drives the embedded short demo section on the landing site.
> Each beat is a discrete audio segment synchronized to its visual/motion sequence.
> Source outline: ARIA-LANDING-BRIEF.md §7.

---

## Beat 1 — Intro / galaxy forms (0:00–0:14)

**Visual / motion cue:**
Galaxy assembles from particles in deep-space black; boot log resolves in monospace
cyan — `ENCRYPTION HANDSHAKE: AES-256-GCM · IDENTITY MESH: CONNECTED · AWAITING OPERATOR…`;
camera settles to a wide orbital view; ARIA logo pulses once.

**Spoken line:**
"I am ARIA — Autonomous Resilience Intelligence Architecture.
I watch your environment, explain the risk, and act on it —
under autonomy you control.
Let me show you — in ninety seconds."

**Timing:** ~12s spoken · 14s with boot animation settling

---

## Beat 2 — Galaxy navigation (0:14–0:26)

**Visual / motion cue:**
Camera pans slowly across the full galaxy; sector hubs light in sequence — Threat
Intel (amber glow), Network (electric blue), Command (violet), Response (magenta edge),
Identity (sky blue); a voice command appears as a console prompt; the spoken
destination node opens with a magnetic pull.

**Spoken line:**
"Everything I do lives in one interface.
Each sector is a galaxy; each node, a live capability.
Speak, click, or let me take you there."

**Timing:** ~9s spoken · 12s with sector lighting sequence

---

## Beat 3 — AI-SPM wow (0:26–0:46)

**Visual / motion cue:**
Warp transition — `bank` into the Command sector; AI-SPM panel opens; assets, model
endpoints, and secrets populate an exposure graph in teal and amber nodes; an attack
path traces itself in amber → red, node by node; a blast-radius ring expands from the
critical node; confidence score resolves alongside a remediation action card.

**Spoken line:**
"Your company is already running AI agents —
most with no security around them.
I discover every model, prompt, secret, and cloud asset,
then map the exact attack path and blast radius —
so you know what's exposed, how badly, and exactly what to do about it."

**Timing:** ~16s spoken · 20s with graph animation completing

---

## Beat 4 — Identity impossible-travel and containment (0:46–1:06)

**Visual / motion cue:**
Slingshot transition to Identity & Access sector; the Identity Galaxy Map blooms —
department galaxies in constellation form; an impossible-travel arc flares magenta
between two points on the 3D globe (Bahrain → London); the flagged account card
surfaces with a red risk indicator; three action buttons appear — block address,
revoke session, quarantine host; a green audit stamp resolves as the action completes.

**Spoken line:**
"When credentials behave impossibly —
a login from two continents at once —
I catch it.
And I can contain it instantly:
block the address, revoke the session, quarantine the host.
One decision. Milliseconds. Logged."

**Timing:** ~14s spoken · 20s with impossible-travel arc and containment animation

---

## Beat 5 — Trust ladder (1:06–1:20)

**Visual / motion cue:**
Rise transition — camera lifts above the galaxy; a vertical trust ladder resolves
with four illuminated rungs: `approval → assisted → auto → full_auto`; each rung
pulses cyan as it is named; an audit ledger entry stamps in the foreground; a human
operator icon remains anchored at the top rung.

**Spoken line:**
"But I never act beyond the trust you grant me.
I earn autonomy step by step —
every decision scored, every action audited.
You decide how far I go."

**Timing:** ~12s spoken · 14s with ladder and ledger animation

---

## Beat 6 — Closing CTA (1:20–1:30)

**Visual / motion cue:**
Orbit pull-back to the full galaxy; all sector hubs glow softly at nominal blue;
the headline fades in — "The autonomous security analyst you can actually trust to act";
two CTA buttons resolve — "Request a 14-day trial" and "Take the guided tour."

**Spoken line:**
"This is a fraction of what I can do.
Take the guided tour — or request a fourteen-day trial and see me run on your world."

**Timing:** ~9s spoken · 10s with fade-in

---

## Full timing summary

| Beat | Label | Spoken | With motion |
|---|---|---|---|
| 1 | Intro / galaxy forms | ~12s | 14s |
| 2 | Galaxy navigation | ~9s | 12s |
| 3 | AI-SPM wow | ~16s | 20s |
| 4 | Identity impossible-travel | ~14s | 20s |
| 5 | Trust ladder | ~12s | 14s |
| 6 | Closing CTA | ~9s | 10s |
| **Total** | | **~72s spoken** | **~90s with motion** |

---

## Production notes

### Voice performance
- **Overall register:** calm, precise, authoritative — never performative or rushed.
  The pace should feel like a confident briefing, not a sales pitch.
- **Beat 1:** slight deceleration on "under autonomy you control" — this line carries
  the core promise; give it weight.
- **Beat 3:** the phrase "every model, prompt, secret, and cloud asset" is a list —
  slight stress on each item, then a natural breath before "then map."
- **Beat 4:** "impossibly" lands with quiet certainty; "milliseconds" is crisp and
  fast, mirroring the speed of the action.
- **Beat 5:** "you decide how far I go" is the emotional peak of the demo — deliver
  it directly, with a half-beat pause before it.
- **Beat 6:** the closing is warm and inviting, not triumphant. The door is open.

### Emphasis / voice style hints
Words to stress (use SSML `<emphasis>` or equivalent in the render prompt):
*every*, *instantly*, *logged*, *you decide*, *fraction*, *your world*

### Pause guidance
- 0.3s natural breath between each sentence within a beat.
- 0.5s silence at the tail of beats 1, 4, and 5 — these are the emotional pivot
  points; let the visual breathe before the next beat fires.
- Beats are discrete audio files: if a beat is re-played (visitor scrubs back),
  it re-enters cleanly.

### Mobile fallback
A muted video-loop export of the full sequence serves as the mobile / low-power
fallback. Captions are on by default on mobile; tap-to-play narration.

### Asset paths
`/audio/demo-b1.mp3` through `/audio/demo-b6.mp3` (per-beat clips, synced to visuals)
`/audio/demo-full.mp3` (single combined clip for environments without beat sync)
`/audio/demo.vtt` (caption track, synchronized to full combined clip)

# ARIA — Guided Tour Narration
## Master script · voice-guided auto-navigation · ~90 seconds headline path

> Fires when visitor selects "Take the guided tour." ARIA introduces itself,
> then drives the camera through the galaxy. Tour is interruptible at any moment —
> a persistent stop/mute control is always visible.

---

## Beat 1 — Awakening (0:00–0:12)

**Navigation move:** Galaxy boot resolves from darkness; ARIA logo pulses cyan;
camera settles at a wide orbital view of the full sector galaxy.

**Spoken line:**
"I am ARIA — Autonomous Resilience Intelligence Architecture.
I watch your environment, explain the risk, and act on it —
under autonomy you control.
Welcome. I'll take you through what I can do."

---

## Beat 2 — The galaxy interface (0:12–0:22)

**Navigation move:** Camera drifts slowly across the galaxy; sector hubs illuminate
one by one — Threat Intel, Network, Command, Response, Identity; each pulses with
its signature color as ARIA names it.

**Spoken line:**
"Everything I do lives in one interface.
Each sector is a live hub — speak a name, click a node,
or let me take you there.
Four ways in. All of them work."

---

## Beat 3 — Warp into AI-SPM (0:22–0:38)

**Navigation move:** Warp transition — `bank into Command sector`; camera drops
into the AI-SPM panel; assets, models, and secrets plot onto an exposure graph;
an attack path draws itself in amber-to-red.

**Spoken line:**
"Your company is already running AI agents.
Most of them with nothing securing them.
I discover every model, prompt, secret, and cloud asset —
across GitHub, AWS, Okta, and four more sources —
then map the exact attack path, the blast radius,
and what to do about it."

---

## Beat 4 — Slingshot to the Identity Galaxy (0:38–0:56)

**Navigation move:** Slingshot transition to Identity & Access sector; the Identity
Galaxy Map opens; department galaxies bloom; an impossible-travel arc flares magenta
between two distant points on the globe; the flagged account card surfaces;
a containment action stamps with a green confirm.

**Spoken line:**
"When a credential behaves impossibly —
a login from Bahrain and London at the same moment —
I catch it.
And I can act on it instantly:
block the address, revoke the session, quarantine the host.
One decision. Milliseconds. Audited."

---

## Beat 5 — Rise to the trust ladder (0:56–1:10)

**Navigation move:** Rise transition — camera lifts to an overhead view; the trust
ladder visual resolves with four glowing rungs: approval · assisted · auto · full_auto;
an audit entry stamps onto the ledger as each rung is named.

**Spoken line:**
"But I never act beyond the trust you grant me.
I earn autonomy step by step —
from asking your approval for everything,
to handling standard threats on my own,
to running fully autonomous, around the clock.
Every decision is scored. Every action is audited.
You decide how far I go — and you can pull it back at any moment."

---

## Beat 6 — Closing CTA (1:10–1:25)

**Navigation move:** Orbit pull-back to full galaxy view; all sectors glow softly;
the headline and CTA resolve on screen — "Request a 14-day trial" and
"Explore on your own."

**Spoken line:**
"This is a fraction of what I can do.
Take a fourteen-day trial and see me run on your own environment —
or stay here and explore every sector yourself.
I'll be here, either way."

---

## Production notes

### Voice performance
- **Pace:** measured and deliberate throughout; never rushed. Allow a natural
  half-beat pause after each sentence — the narration should feel like ARIA is
  thinking, not reading.
- **Tone:** warm on the opening ("Welcome"), authoritative on the capability beats,
  calm and confident on the trust ladder, subtly inviting on the close.
- **Emphasis:** italicize the following words for the voice-provider style prompt —
  *every*, *instantly*, *audited*, *you decide*, *your own environment*.
- **Pauses:** insert a 0.4s silence between Beat 2 and Beat 3 (warp sound effect
  fills this gap in mix).

### Timing targets
| Beat | Spoken duration | With nav transition |
|---|---|---|
| 1 — Awakening | ~10s | 12s |
| 2 — Galaxy interface | ~9s | 10s |
| 3 — AI-SPM | ~13s | 16s |
| 4 — Identity Galaxy | ~13s | 18s |
| 5 — Trust ladder | ~12s | 14s |
| 6 — Closing CTA | ~10s | 12s |
| **Total** | **~67s spoken** | **~82–90s with motion** |

### Interruptibility
- Each beat is a discrete audio segment. Stopping mid-beat fades the current clip
  cleanly; navigation reverts to free-roam.
- A "continue tour" nudge appears if the visitor clicks away during beats 3–5 and
  re-engages within 30 seconds.
- Captions are on by default; a text transcript fallback is always available via
  the transcript link below the player.

### Asset path
`/audio/guided-tour.mp3` (single combined clip for preload)
`/audio/guided-tour-b{1-6}.mp3` (individual beat clips for synced playback)
`/audio/guided-tour.vtt` (caption track)

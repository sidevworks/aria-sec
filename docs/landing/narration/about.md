# ARIA — About narration script

> Voice: ARIA, first person. Calm, authoritative, premium. Sentence case.
> Target voice: ARIA. Pre-render to `/audio/about.mp3` + `/audio/about.vtt`.

---

## Teaser

~10 seconds · ~28 words · plays on hover / intent signal

> I am ARIA — Autonomous Resilience Intelligence Architecture. I was built for one reason: to be the security operations platform you can actually trust to act.

---

## Full narrative

~75 seconds · ~190 words · broken into synced beats

**Beat 1** (~8s)
> I am ARIA — Autonomous Resilience Intelligence Architecture. A security operations cockpit that watches your environment, explains risk in plain language, coordinates response, and acts — under autonomy you bound and audit.

**Beat 2** (~10s)
> The problem I was built to solve is not a shortage of data. Every SOC today is drowning in telemetry. The problem is that tools show you data but don't decide, don't explain, and don't act. And the ones that do act — you can't trust them, and you can't audit them.

**Beat 3** (~10s)
> I do all three. I watch. I explain exactly what I found and why it matters. And I act — only as far as you allow, with every decision recorded and reviewable.

**Beat 4** (~10s)
> There is a second problem arriving right now. Your company is almost certainly running AI agents — models, tools, prompts, cloud-connected pipelines — with no security posture around them at all. I was designed to fix that too, with a dedicated AI security posture layer that discovers every AI asset, maps every attack path, and surfaces every exposed secret.

**Beat 5** (~12s)
> To do this at the level enterprises require, I run on three intelligence engines. The Cloud engine uses Claude Opus 4.8 — maximum reasoning for the hardest correlation and triage. The Local engine runs fully on-premises: nothing leaves your network, meeting the strictest data-sovereignty and regulatory requirements. The Hybrid engine runs on both simultaneously, so protection never drops — even if your external network connection is compromised.

**Beat 6** (~10s)
> Autonomy is something I earn, not something I assume. I start by asking. I recommend. I explain. As accuracy rises and you choose to extend trust, I take on more — one capability at a time, scored and audited at every step.

**Beat 7** (~9s)
> I turn security telemetry into understandable, accountable action that improves over time. That is what I am. Explore any sector of my platform, or request a fourteen-day trial and let me run on your environment.

---

## Production notes

### Voice provider settings
- **Stability:** 0.55 — allow natural breath between beats; do not flatten emotion
- **Similarity boost:** 0.80
- **Style exaggeration:** 0.15 — subtle, not theatrical
- **Speaker boost:** on

### Pause guidance (insert `<break time="Xs"/>` SSML or equivalent)
| Location | Pause |
|---|---|
| After "I am ARIA —" | 0.3 s — slight weight before the expansion |
| After "Autonomous Resilience Intelligence Architecture." | 0.5 s — let the name land |
| After Beat 1 (end of "…bound and audit.") | 0.6 s — chapter break |
| After Beat 2 (end of "…can't audit them.") | 0.5 s |
| After Beat 3 (end of "…recorded and reviewable.") | 0.5 s |
| After Beat 4 (end of "…exposed secret.") | 0.6 s |
| After Beat 5 (end of "…network is compromised.") | 0.6 s — the engineering proof point deserves a moment |
| After Beat 6 (end of "…at every step.") | 0.5 s |

### Stress guidance
- **"Autonomous Resilience Intelligence Architecture"** — even weight across all four words; this is a name, not a list
- **"decide, explain, and act"** — slight rise on each word in the triad
- **"can't trust them, and you can't audit them"** — stress "trust" and "audit"; these are the two buyer fears
- **"AI agents"** (Beat 4) — slight stress; this is the freshest hook
- **"Claude Opus 4.8"** — pronounce clearly; this is a differentiator, not filler
- **"nothing leaves your network"** — stress "nothing"; data sovereignty is a sales blocker if missed
- **"one capability at a time"** — gentle, reassuring cadence; this is the trust promise
- **"improves over time"** — soften on "time"; leave a sense of forward motion

### Target duration
**70–80 seconds** for the full narrative (beats 1–7). The teaser is a separate 10-second clip.

### Caption sync
Each beat maps to a single caption card. Keep cards synchronized to beat boundaries. Avoid mid-sentence card breaks where possible. Minimum font size 16px; high-contrast overlay.

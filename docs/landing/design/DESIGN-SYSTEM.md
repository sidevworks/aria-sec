# ARIA Landing — Design System Specification

> Companion to `tokens.css` (the machine-consumable export) and `aria-ui.css`
> (the component implementation). Where this doc and `tokens.css` disagree,
> `tokens.css` wins. Brand source: `docs/landing/ARIA-LANDING-BRIEF.md` §2.

---

## 1. Color

All values live in `tokens.css`. Highlights:

| Role | Token | Hex |
|---|---|---|
| Page background | `--bg-space` | `#06080f` |
| Deep backdrop (boot, behind galaxy) | `--bg-deep` | `#04060d` |
| Panel surface | `--ink-panel` | `#0a0e1a` |
| Signature accent / ARIA voice / CTAs | `--cyan` | `#63f5ff` |
| AI-SPM / healthy | `--teal` | `#2dd4bf` |
| Identity | `--sky` | `#38bdf8` |
| Network | `--blue` | `#1687ff` |
| Command / intelligence | `--violet` / `--violet-deep` | `#a78bfa` / `#8b5cf6` |
| Warning tier | `--amber` | `#ffc857` |
| Critical tier / containment | `--magenta` | `#ff3d81` |
| Body text | `--text-body` | `#9fb3c7` |
| Tertiary text | `--text-dim` | `#5f7184` |

**Three-tier semantic system** (ownable, used everywhere): blue = nominal ·
amber = detected threat · magenta = critical. Implemented as `--tier-*` tokens
plus `.tier--*` badge classes. **Rule: tier color never appears without its icon
(`#i-nominal` / `#i-threat` / `#i-critical`) and a text label.**

**Sector accent mapping** (`--sector-*`): Threat Intel = amber, Network = blue,
Command = violet, Response = magenta, Identity = sky, AI-SPM node = teal.

## 2. Typography

- **Display:** Space Grotesk (400/500/600/700). Fallback: Inter Tight → system.
- **Mono:** JetBrains Mono (400/500/600). Fallback: SF Mono → Menlo.
- Sentence case for all prose. Uppercase **only** for HUD micro-labels (`.t-micro`).

| Style | Size | LH | Tracking | Use |
|---|---|---|---|---|
| `.t-display-xl` | clamp 40→68px | 1.08 | −0.02em | Hero headline only |
| `.t-display` | clamp 32→48px | 1.08 | −0.02em | Page titles |
| `.t-h1` | 32px | 1.2 | — | Section heads |
| `.t-h2` | 24px | 1.2 | — | Card heads |
| `.t-h3` | 18px | 1.2 | — | Minor heads |
| `.t-body` | 16px | 1.65 | — | Prose |
| `.t-small` | 14px | 1.65 | — | Card copy, hints |
| `.t-mono` | 14px mono | 1.5 | — | Telemetry, data |
| `.t-micro` | 11px mono | — | +0.18em, uppercase | HUD micro-labels |

## 3. Spacing, radii, borders, depth

- **Spacing scale (4px base):** 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96 (`--sp-1…9`).
- **Radii:** 4 chips · 8 controls · 12 panels · 16 cards/modals · pill CTAs.
- **Hairlines:** 1px, cyan @16% (`--hairline`), slate @12% (`--hairline-dim`),
  cyan @38% for emphasis (`--hairline-strong`).
- **Glow:** `--glow-sm/md/lg` (cyan), `--glow-amber`, `--glow-magenta`.
- **Glass:** `--glass-bg` rgba(10,14,26,.62) + `backdrop-filter: blur(14px) saturate(1.15)`.

### HUD chrome redlines
| Region | Spec |
|---|---|
| Top sector bar | h 56px, fixed, glass, hairline bottom; brand left (24px tracking-300), nav center (micro-label links, 8/12 padding, active = cyan + 7% cyan fill), trial CTA right h 36px |
| Left status stack | w 220px, fixed at 24px from left, 24px below top bar; rows = glass, radius 8, padding 8/12 |
| Right control rail | w 60px, vertically centered, 24px from right; 40×40 icon buttons, gap 8 |
| Command console | w min(544px, 100vw−48), h 44px, pill, fixed bottom 24px centered; prompt `›` cyan |
| Captions bar | min(736px, 100vw−48), above console (gap 16), 18px text, speaker micro-label |
| Mobile (≤760px) | nav + stack hidden; rail → bottom action bar (safe-area padded); console above it; thumb CTA 52px fixed above both |

## 4. Motion

| Token | Value | Use |
|---|---|---|
| `--t-micro` | 120ms | hover, focus, color ticks |
| `--t-ui` | 240ms | buttons, badges, reveals |
| `--t-panel` | 480ms | panels, modals, arrival stamps |
| `--t-warp` | 900ms | destination transitions |
| `--t-cine` | 1400ms | boot, hero settle |
| `--ease-std` | cubic-bezier(.22,.61,.36,1) | default |
| `--ease-warp` | cubic-bezier(.70,0,.20,1) | warp travel |
| `--ease-settle` | cubic-bezier(.16,1,.30,1) | arrival overshoot |

**Warp verbs** — apply `data-warp="…"` to the arriving destination root
(implemented in `aria-ui.css`):

| Verb | Recipe |
|---|---|
| `bank` | translateX 8vw + rotateZ 2.5° + rotateY −8° → settle, blur 6→0 |
| `dive` | scale 1.18 + translateY −4vh → settle, blur 10→0 |
| `orbit` | rotateY 16° + scale .94 → settle |
| `slingshot` | scale .86 → 1.04 overshoot → 1 (ease-settle) |
| `drop` | translateY −7vh → 0 |
| `sweep` | clip-path wipe left → right |
| `rise` | translateY +7vh → 0 |

Each arrival is stamped with `.arrival` (480ms ease-settle, letter-spacing
condenses 0.4em→0.18em, hold ~2.4s then fade).

Motion personality: **slow and confident** — orbital drift (26s node rings,
240s starfield), no frantic loops. Sound (build phase): muted by default,
unlocked on first gesture only.

## 5. Components

Implemented in `aria-ui.css`, showcased in `components.html`:
buttons (`.btn--primary/ghost/quiet`, `.btn-rail`), HUD chrome (`.hud-top`,
`.hud-stack`, `.hud-rail`), command console (`.console` + `--routing`), galaxy
node (`.node` + callout/label/active), arrival stamp, tier badges, glass panel
+ card, find-out-more (`.fom` + `--playing` waveform), captions bar, tour bar
(`.tour-bar` + beats), choice overlay, boot overlay, form fields + error/success
notices, modal, audio player.

Interaction states are designed (not described) in `states.html` (S1–S6).

## 6. Mobile & fallback tiers (brief §9)

- **≤760px:** spatial galaxy replaced by `.sector-list` stacked tappable cards
  (designed in `home.html`); rail → bottom bar; thumb CTA fixed; captions on by
  default with tap-to-play audio.
- **Fallback tier design:** the CSS "galaxy poster" composition in
  `comp-shared.css` (`.galaxy-stage`) **is** the design for the static
  poster/video fallback when WebGL isn't viable — same node positions, palette,
  link arcs. Build renders the WebGL galaxy into the same stage; on low-power it
  swaps to the §15a hero-loop video or this CSS poster. Never a white screen.
- **Reduced motion:** global `prefers-reduced-motion` block kills warps
  (cross-fade only), freezes starfield/orbits/waveforms. Designed into every comp.

## 7. Accessibility

- **Contrast (on `#06080f`):** `--text-bright` ≈ 17:1 · `--text-body` ≈ 9.5:1 ·
  `--cyan` ≈ 13:1 · `--amber` ≈ 11:1 · `--magenta` ≈ 5.5:1 — all AA+ for their
  sizes. `--text-dim` (≈ 4.6:1) is restricted to non-essential 14px+ text and
  never used for actionable copy. `--text-on-accent` on cyan ≈ 12:1.
- **Focus:** single `--focus-ring` token (2px bg gap + 2px cyan) via
  `:focus-visible` on every interactive element, including nodes.
- **Color never the only signal:** tier = color + icon + label, enforced by the
  `.tier` component; console routing state adds text ("warping · …").
- Skip link on every page; nodes are real `<button>`s (tab-reachable);
  narration: synced captions + transcript fallback (scripts live in
  `docs/landing/narration/`); forms: visible labels, `aria-describedby` errors,
  `aria-invalid`, 44px+ touch targets.

## 8. Page comps index

| Comp | File | Warp-in | Notes |
|---|---|---|---|
| Home / Cockpit | `comps/home.html` | (boot) | boot ≤1.5s → voice choice; galaxy hero; mobile sector list |
| About | `comps/about.html` | `bank` | three engines; founder slot |
| Platform / Functions | `comps/functions.html` | `orbit` | 7 capability nodes + trust-ladder interactive |
| Demo | `comps/demo.html` | `dive` | 16:9 stage, 6-beat storyboard, player chrome |
| Investors | `comps/investors.html` | `rise` | thesis, two wedges, gated deck form, founder slots |
| Trial | `comps/trial.html` | `drop` | full form per brief §6.6 + success/error states |
| Contact | `comps/contact.html` | `sweep` | direct channels + message form |

View by serving the folder (e.g. `npx serve docs/landing/design`) so the icon
sprite and fonts load; check 1440px, 768px, 390px, and with reduced motion on.

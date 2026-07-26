# ARIA Landing — Design Phase Deliverables (Fable 5)

Visual design + front-end UI per the **Fable 5 Design Deliverables Checklist**.
Build agents take over from here (Three.js galaxy, voice-tour state machine,
forms/email, performance, deploy).

## How to view
```bash
npx serve docs/landing/design
# open /components.html, /states.html, /og-card.html, /comps/home.html …
```
Serve the folder (don't open via `file://`) so the icon sprite + fonts load.
Review at 1440px, 768px, 390px, and with **reduce motion** enabled.

## Deliverables → checklist map

| Checklist | Deliverable |
|---|---|
| §1 Design system | `tokens.css` (consumable export) · `aria-ui.css` (components) · `components.html` (showcase) · `DESIGN-SYSTEM.md` (specs/redlines) |
| §1 Motion tokens & warp verbs | `tokens.css` (`--t-*`, `--ease-*`) · `aria-ui.css` (`data-warp` keyframes) · DESIGN-SYSTEM §4 |
| §2 Page comps (desktop, hi-fi) | `comps/{home,about,functions,demo,investors,trial,contact}.html` |
| §3 Interaction states | `states.html` (S1–S6: node states, tier cycle, find-out-more playing, console states, tour overlay, voice choice) |
| §4 Mobile / responsive | every comp is responsive ≤760px (stacked sectors, bottom rail, thumb CTA); fallback tier = `.galaxy-stage` poster design (DESIGN-SYSTEM §6); reduced-motion variant global |
| §5 OG card | `og-card.html` (1200×630 artboard — screenshot to `public/og.png`) |
| §5 Generation prompts | `ASSET-PROMPTS.md` (A1–A6 prompt pack, ready to run) |
| §5 Iconography | `icons.svg` (38 outline symbols, 24-grid, 1.5 stroke) |
| §5 Token export / redlines | `tokens.css` + DESIGN-SYSTEM §3 redline tables |
| §5 Audio wiring map | `AUDIO-WIRING.md` (every clip → element, preload policy, captions) |
| §6 Accessibility | DESIGN-SYSTEM §7 (contrast math, focus ring, color-never-alone rule); skip links, labels, focus states in every comp |

## Notes for the build phase
- The comps' `.galaxy-stage` is the **WebGL mount slot**; its CSS composition is
  also the low-power poster design. Same DOM contract: 5 sector `.node`s with
  `--accent`, callouts, labels.
- `.fom` buttons carry `data-audio` / `data-captions` attributes — wire directly.
- Warp-in per destination is declared with `data-warp` on the page root
  (matches the platform's route verbs).
- Founder-fill slots (marked `[…]` in about/investors) must not ship empty
  (brief §12: never signal incompleteness).
- Confirm-before-launch list lives at the end of the brief (§15a): Bahrain city,
  final domain, founder bio, round details.

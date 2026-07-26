# Fable 5 — Design Deliverables Checklist (ARIA landing site)

Hand this to Fable alongside `ARIA-LANDING-BRIEF.md`. Fable's job is the **visual
design + front-end UI**. When every box below is checked, Fable's phase is done and
the build phase (Three.js galaxy reuse, voice-tour state machine, forms/email) begins.

---

## 1. Design system (foundation)
- [ ] Color tokens implemented from brief §2 (exact palette + the 3-tier blue/amber/red system).
- [ ] Type scale — display + monospace, sizes/weights/letter-spacing.
- [ ] Spacing, radii, border, glow/blur, grid tokens.
- [ ] Component library: buttons, nav/sector bar, HUD chrome, status stack, command console, cards/panels, badges, form fields, modals, audio/caption player.
- [ ] Motion tokens: durations, easings, the named warp transitions (`bank · dive · orbit · slingshot · drop · sweep · rise`).

## 2. Page comps (desktop) — high fidelity
- [ ] Home / cockpit (boot sequence + landing voice choice + hero + galaxy).
- [ ] About ARIA.
- [ ] Platform / Functions (the capability galaxy + each node state).
- [ ] Demo section.
- [ ] Investors / Funding.
- [ ] Request a Trial (form + success/error states).
- [ ] Contact.

## 3. Key interaction states (designed, not just described)
- [ ] Sector/node: default · hover (magnetic + callout) · active · arrival callout.
- [ ] Voice "Find out more" affordance + the playing/caption state.
- [ ] Command console: empty · typing · routing.
- [ ] Guided-tour overlay + persistent stop/mute/caption control.
- [ ] Tier color changes (nominal → threat → critical) shown on a node.

## 4. Mobile / responsive (brief §9) — non-negotiable
- [ ] Mobile comps for all 7 pages.
- [ ] The tiered fallback designed: WebGL galaxy → static poster/video on low-power.
- [ ] Touch nav (stacked sectors), thumb-reachable CTAs, captions-on-by-default audio.
- [ ] `prefers-reduced-motion` variant.

## 5. Assets & specs the build needs
- [ ] Open Graph / social card design (1200×630) — the LinkedIn/VC link preview.
- [ ] Image/video **generation prompts** for every visual (brief §15a) — NOT placeholder art.
- [ ] Iconography set (outline, on-brand).
- [ ] Redlines / spacing specs or a token export the front-end can consume.
- [ ] Audio wiring map: which `/audio/*.mp3` clip plays on which element.

## 6. Accessibility (brief §3)
- [ ] Contrast meets WCAG AA on the dark theme.
- [ ] Visible focus states for every interactive element.
- [ ] Caption styling for narration; color never the only signal.

---

## "Done" criteria → handoff to build
Fable's phase is complete when: the design system + all desktop and mobile comps exist,
every interaction state is designed, the OG card is delivered, and the image/video
prompt pack is written. At that point the build agents take over for: galaxy/Three.js
implementation, voice-guided-tour state machine, audio preloading/playback, forms →
email/licensing, and the responsive fallback wiring.

**Not Fable's job (build phase):** real Three.js galaxy, voice-tour logic, form
backend/email/license issuance, performance tuning, deployment.

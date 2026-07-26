# ARIA — "Find Out More" Hook Lines
## Spoken micro-intros · fires instantly on click · ~6–10 words each

> Each line plays the moment a visitor clicks "Find out more" on a section,
> before the full deep-dive narration loads. One line per section.
> First person, ARIA's voice. Calm, crisp, making the visitor want what comes next.

---

## 1. About

"Let me tell you exactly what I am."

---

## 2. AI-SPM

"Your AI agents have no security around them — yet."

---

## 3. Identity Galaxy

"I watch every identity in your organisation, always."

---

## 4. Governed Autonomy

"I earn the right to act — you never lose control."

---

## 5. Decision Engine

"I don't just detect threats — I decide what to do."

---

## 6. Command Center

"One screen. Every signal. Every action. All mine."

---

## 7. Network

"I see every connection in your environment, live."

---

## 8. Connectors

"Seven sources. One unified picture of your risk."

---

## 9. Demo

"Watch me work — ninety seconds, your own environment."

---

## 10. Funding

"We're building the trust layer AI security needs."

---

## Production notes

### Voice performance
- Each line is a standalone clip: no preceding music bed or intro, no trailing CTA.
  The line itself is the draw.
- **Delivery:** confident and unhurried. Not a teaser — a declaration.
  The visitor should feel ARIA already knows what they need.
- **Pace:** slower than conversational. One beat of silence after the final word
  before the clip ends — this cues the visitor that the full narration is about to begin.
- **Lines 2, 4, 5:** the contrast word ("yet", "never", "don't just") carries the
  weight — stress it lightly.

### Timing targets
All lines should render to 3–5 seconds of audio including the trailing silence.
Longer delivery on lines 4 and 5 (they carry a structural contrast);
faster on lines 6 and 7 (declarative and punchy).

### Asset paths
`/audio/intros/about.mp3`
`/audio/intros/ai-spm.mp3`
`/audio/intros/identity-galaxy.mp3`
`/audio/intros/governed-autonomy.mp3`
`/audio/intros/decision-engine.mp3`
`/audio/intros/command-center.mp3`
`/audio/intros/network.mp3`
`/audio/intros/connectors.mp3`
`/audio/intros/demo.mp3`
`/audio/intros/funding.mp3`

### Playback behavior
- Preloaded on hover/intent (≥200ms hover triggers prefetch).
- Plays immediately on click; does not wait for the full deep-dive clip to load.
- If the deep-dive clip is ready before the intro finishes, cross-fade at the
  natural sentence end — no gap or abrupt cut.
- Caption overlays are shown for all clips; font size and contrast meet WCAG AA.

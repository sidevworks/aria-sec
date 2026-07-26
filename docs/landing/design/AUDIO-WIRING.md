# ARIA Landing — Audio Wiring Map

> Cross-reference: rendered MP3s in `public/audio/`. Captions (`.vtt`) are
> maintained per clip at matching paths under `/captions/`.
> All playback is user-gesture-initiated (brief §4.4); nothing autoplays.

## Global rules
- **Preload:** only `guided-tour-b1.mp3` is preloaded (after boot). Deep-dive
  clips lazy-load on hover/focus of their `.fom` button ("intent"); beats N+1
  preload while beat N plays.
- **One voice at a time:** starting any clip stops the current one. Tour yields
  instantly to any user navigation/click/Esc.
- **Mobile:** captions on by default; tap-to-play.
- **Every playing state:** shows `.fom--playing` waveform + caption bar + the
  persistent stop/mute/captions controls (designed in `states.html` S3/S5).

## Guided tour (Home, "Take the guided tour")
| Beat | Clip | Camera destination (build) |
|---|---|---|
| 1 | `/audio/guided-tour-b1.mp3` | Galaxy settles, ARIA introduces itself |
| 2 | `/audio/guided-tour-b2.mp3` | Pan across sectors; console + voice affordances pulse |
| 3 | `/audio/guided-tour-b3.mp3` | Warp (slingshot) → AI-SPM node |
| 4 | `/audio/guided-tour-b4.mp3` | Warp (bank) → Identity galaxy, impossible-travel arc |
| 5 | `/audio/guided-tour-b5.mp3` | Rise → trust ladder |
| 6 | `/audio/guided-tour-b6.mp3` | Pull back to galaxy; CTA resolves |

(Single-file alternative: `/audio/guided-tour.mp3` for the video-fallback tier.)

## Demo page (6 beats, sync to stage visuals / fallback video)
`/audio/demo-b1.mp3` … `/audio/demo-b6.mp3` — wired to the demo player beats
(see `comps/demo.html` beat rows). Full file: `/audio/demo.mp3`.

## "Find out more" deep dives (`.fom` buttons, `data-audio` attr already set in comps)
| Page / element | Teaser (hover/intro) | Deep dive |
|---|---|---|
| About lede | `/audio/about-teaser.mp3` | `/audio/about.mp3` |
| Functions header (how the galaxy works) | `/audio/functions/galaxy-teaser.mp3` | `/audio/functions/galaxy.mp3` |
| AI-SPM card | `/audio/functions/ai-spm-teaser.mp3` | `/audio/functions/ai-spm.mp3` |
| Identity Galaxy card | `/audio/functions/identity-galaxy-teaser.mp3` | `/audio/functions/identity-galaxy.mp3` |
| Governed autonomy card | `/audio/functions/governed-autonomy-teaser.mp3` | `/audio/functions/governed-autonomy.mp3` |
| Decision engine card | `/audio/functions/decision-engine-teaser.mp3` | `/audio/functions/decision-engine.mp3` |
| Command center card | `/audio/functions/command-center-teaser.mp3` | `/audio/functions/command-center.mp3` |
| Network card | `/audio/functions/network-teaser.mp3` | `/audio/functions/network.mp3` |
| Connectors card | `/audio/functions/connectors-teaser.mp3` | `/audio/functions/connectors.mp3` |
| Investors thesis | `/audio/funding-teaser.mp3` | `/audio/funding.mp3` |

## One-line spoken intros (`/audio/intros/*.mp3`)
Short hooks played on **node arrival** after a warp (not on hover — too chatty):
`about, ai-spm, identity-galaxy, governed-autonomy, decision-engine,
command-center, network, connectors, demo, funding` — one per destination,
plays once per session per destination, suppressed during the guided tour.

## Captions
Each clip gets `/captions/<same-path>.vtt` (e.g.
`/captions/functions/ai-spm.vtt`). Caption copy is maintained as static content
beside the rendered audio assets.
Caption styling: `.captions` component (18px, speaker micro-label, ≥AA contrast).

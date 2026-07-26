# ARIA Landing — Image & Video Generation Prompt Pack (brief §15a)

> Founder runs these in one pass and drops results into `landing` `public/media/`.
> Every prompt uses the exact §2 palette. Negative cues for all assets:
> **no gamer-RGB rainbow, no lens flare clichés, no text/watermarks unless
> specified, no humans unless specified, no bright daylight, never tacky.**
>
> Shared style block (paste into every prompt):
> *"Cinematic cosmic command center. Deep space-black background (#06080f /
> #04060d). Neon HUD accents: signature cyan #63f5ff, electric blue #1687ff,
> violet #a78bfa, teal #2dd4bf, sky #38bdf8, amber #ffc857, hot-magenta #ff3d81.
> Volumetric glow, glassmorphism panels, thin neon hairline lines, faint
> starfield and grid. Premium, restrained, mil-spec sci-fi — Apple-keynote
> polish, not video-game UI."*

---

## A1 · OG / social image — 1200×630 (THE most-shared frame)
- **Used:** `og:image`, Twitter card, LinkedIn/VC link previews.
- **Reference comp:** `og-card.html` (replicate this composition).
- **Aspect:** 1200×630 (render 2400×1260, downscale).
- **Prompt:** Shared style block + *"A luminous spiral galaxy of security
  sectors seen slightly from above, right-of-frame: one large cyan core hub with
  concentric orbit rings, five smaller orbiting nodes in amber, electric blue,
  magenta, sky and violet, connected by faint dashed cyan arcs. Left half kept
  dark and clean for headline typography (will be composited). Subtle depth of
  field, stars softly out of focus at edges. Single key light from the cyan
  core."*
- **Post:** composite headline "The autonomous security analyst you can actually
  trust to act." + ARIA brand per `og-card.html`. Export `public/og.png`.

## A2 · Hero galaxy ambient loop (desktop hero / poster fallback)
- **Used:** Home hero behind headline; poster/video fallback tier (§9).
- **Aspect / duration:** 16:9, 3840×2160 if possible; **12–20s seamless loop**.
- **Camera/motion:** slow orbital drift around the galaxy center, ~5° total
  parallax, no cuts; loop point invisible. Nodes pulse softly (blue-tier
  rhythm); one node briefly ticks amber and settles back to blue — alive, calm.
- **Prompt:** Shared style block + *"Wide shot of a five-hub security galaxy
  floating in deep space-black. Central violet command core, hubs in amber,
  electric blue, magenta and sky, joined by faint cyan filament arcs. Slow,
  confident orbital drift; particles stream gently along the filaments; soft
  volumetric haze. Seamless loop."*
- **Export:** `public/media/hero-loop.mp4` (H.265 + H.264 fallback, muted) +
  first frame as `public/media/hero-poster.jpg`.

## A3 · Mobile fallback demo video (~90s, the §7 storyboard)
- **Used:** Demo page on mobile/low-power (replaces live WebGL demo); synced to
  the pre-rendered beats `demo-b1…b6.mp3`.
- **Aspect / duration:** 16:9, 1920×1080, **~90s** in six segments matching:
  1. (0:00–0:14) Galaxy forms from darkness; terminal boot log resolves; camera settles.
  2. (0:14–0:26) Camera pans the galaxy; sectors light up; a node opens.
  3. (0:26–0:48) Warp into AI-SPM: assets/secrets plot onto a teal exposure
     graph; a magenta attack path draws itself node-to-node; blast-radius ring expands.
  4. (0:48–1:06) Slingshot to identity galaxy: 3D globe, an impossible-travel
     arc flares magenta between two continents; a host is contained (ring snaps shut, tier returns to blue).
  5. (1:06–1:22) Rise to the trust ladder: four rungs illuminate left to right
     (approval → assisted → auto → full_auto); an audit entry stamps in mono type.
  6. (1:22–1:31) Pull back to full galaxy; calm settle for CTA overlay.
- **Camera:** continuous flowing moves using the platform's warp verbs — bank,
  slingshot, rise; never a hard cut.
- **Prompt:** Shared style block + the six beats above as the shot list.
- **Export:** `public/media/demo-loop.mp4` + poster `public/media/demo-poster.jpg`.

## A4 · Per-sector signature stills (7 textures, one per capability node)
- **Used:** Functions page card headers / node warp backdrops; can replace the
  CSS vignettes in `comps/functions.html`.
- **Aspect:** 16:7 (e.g. 1600×700) each.
- **Common prompt:** Shared style block + *"Abstract generative still, single
  dominant accent color, deep black field, fine mono-spaced HUD micro-labels
  barely visible, volumetric glow, shallow depth."* Per asset:
  1. **AI-SPM (teal #2dd4bf):** "an exposure graph of glowing teal asset nodes
     (repo, secret, lambda, prod-model) joined by a drawn attack path that ends
     in a magenta-ringed critical node."
  2. **Identity galaxy (sky #38bdf8):** "departments as small spiral galaxies;
     one user-star flagged amber; a magenta impossible-travel arc crossing a
     faint 3D globe."
  3. **Governed autonomy (violet #a78bfa):** "four ascending translucent rungs
     of a trust ladder, the highest rung cyan-lit; a small platform-owned lock
     glyph; audit stamps in mono type."
  4. **Decision engine (cyan #63f5ff):** "signals converging through correlation
     lines into a single glowing hypothesis card; confidence number 0.91 in mono."
  5. **Command center (violet-deep #8b5cf6):** "a mission-control wall of slim
     glass panels — radar sweep, timeline, approvals queue — one screen alive."
  6. **Network (electric blue #1687ff):** "a live socket map radiating from a
     cyan core to device nodes labeled ssh:22, rdp:3389; passive, observational, calm."
  7. **Connectors (amber #ffc857):** "seven labeled satellites (github, aws,
     okta, azure ad, snyk, virustotal, elastic) feeding amber filaments into one
     cyan hub."
- **Export:** `public/media/sectors/{ai-spm,identity,autonomy,decision,command,network,connectors}.jpg`

## A5 · Investor-page hero still
- **Used:** Investors page header backdrop (behind the thesis).
- **Aspect:** 21:9 (e.g. 2520×1080), dark left two-thirds for type.
- **Prompt:** Shared style block + *"A single confident cyan hub seen from a
  low, heroic angle, orbit rings catching light, deep black negative space to
  the left, faint capital-grade grid below. Mood: inevitable, fundable,
  restrained. No text."*
- **Export:** `public/media/investors-hero.jpg`

## A6 · Short looping social preview video (§10)
- **Used:** og:video / pinned-post preview where supported.
- **Aspect / duration:** 1200×630, **6–8s loop**, no audio.
- **Prompt:** A1 composition, but the attack-path arc draws itself, the core
  pulses once, a node ticks amber→blue. Headline pre-composited (use og-card.html render).
- **Export:** `public/media/og-preview.mp4`

---

### Delivery checklist
| Asset | Path | Format |
|---|---|---|
| OG image | `public/og.png` | PNG 1200×630 |
| Hero loop | `public/media/hero-loop.mp4` + `hero-poster.jpg` | H.265/H.264, muted |
| Demo fallback | `public/media/demo-loop.mp4` + `demo-poster.jpg` | 1080p ~90s |
| Sector stills ×7 | `public/media/sectors/*.jpg` | 1600×700 |
| Investor hero | `public/media/investors-hero.jpg` | 2520×1080 |
| Social loop | `public/media/og-preview.mp4` | 6–8s |

// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

// ════════════════════════════════════════════════════════════════════════
// CrossfadeLoopVideo — stitches TWO clips into one seamless infinite loop.
//
// A single <video loop> hard-cuts at its wrap point. Instead we stack two
// clips and cross-dissolve between them: A plays out, dissolves into B, B
// plays out, dissolves back into A, forever. The dissolve always hides the
// seam, so the loop reads as one continuous, never-repeating ambience.
//
// Pass the same src for both clips to get a seamless single-clip loop (the
// crossfade still hides the wrap). Opacity is driven imperatively off the
// rAF clock so React never re-renders mid-dissolve.
// ════════════════════════════════════════════════════════════════════════
import { useEffect, useRef } from "react";

export default function CrossfadeLoopVideo({
  clipA,
  clipB,
  fade = 1.2, // dissolve window in seconds at each hand-off
  maxOpacity = 1,
  className,
  style,
}) {
  const aRef = useRef(null);
  const bRef = useRef(null);

  useEffect(() => {
    const a = aRef.current;
    const b = bRef.current;
    if (!a || !b) return undefined;

    // `front` is the clip currently in full view; `armed` flips true once the
    // incoming clip has been kicked off for the current hand-off so we only
    // trigger the dissolve once per seam.
    let front = a;
    let back = b;
    let armed = false;
    let raf = 0;

    a.style.opacity = String(maxOpacity);
    b.style.opacity = "0";
    a.currentTime = 0;
    a.play().catch(() => {});

    const step = () => {
      const dur = front.duration;
      if (Number.isFinite(dur) && dur > 0) {
        const remaining = dur - front.currentTime;

        // Near the end of the front clip: launch the back clip from its head.
        if (!armed && remaining <= fade) {
          armed = true;
          back.currentTime = 0;
          back.play().catch(() => {});
        }

        if (armed) {
          // Dissolve: fade front out, back in, over the `fade` window.
          const p = Math.min(1, Math.max(0, (fade - remaining) / fade));
          front.style.opacity = String((1 - p) * maxOpacity);
          back.style.opacity = String(p * maxOpacity);

          // Hand-off complete once the front clip runs out: swap roles.
          if (remaining <= 0 || front.ended) {
            front.style.opacity = "0";
            back.style.opacity = String(maxOpacity);
            const tmp = front;
            front = back;
            back = tmp;
            armed = false;
          }
        } else {
          front.style.opacity = String(maxOpacity);
        }
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(raf);
      a.pause();
      b.pause();
    };
  }, [clipA, clipB, fade, maxOpacity]);

  const layer = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "cover",
  };

  return (
    <div className={className} style={{ position: "absolute", inset: 0, ...style }} aria-hidden="true">
      <video ref={aRef} src={clipA} muted playsInline preload="auto" style={layer} />
      <video ref={bRef} src={clipB} muted playsInline preload="auto" style={layer} />
    </div>
  );
}

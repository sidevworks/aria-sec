// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

// ════════════════════════════════════════════════════════════════════════
// COSMOS-UI · shared Canvas2D animation contract
// Mirrors App.jsx's useCanvasAnimation(draw, deps) — draw(ctx, w, h, t),
// t = seconds since mount — but DOES NOT clearRect each frame, so panels can
// own their own backbuffer (e.g. motion-blur trails). All per-frame state
// must live in refs initialized *inside* the draw callback (React 19 strict
// hooks: no ref writes / impure calls during render).
// ════════════════════════════════════════════════════════════════════════
import { useEffect, useRef } from "react";

export const TAU = Math.PI * 2;
export const clamp01 = (v) => Math.max(0, Math.min(1, v));
export const lerp = (a, b, t) => a + (b - a) * t;

export const hexToRgba = (hex, a) => {
  const v = hex.replace("#", "");
  const r = parseInt(v.slice(0, 2), 16);
  const g = parseInt(v.slice(2, 4), 16);
  const b = parseInt(v.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
};

export const CANVAS_STYLE = { position: "absolute", inset: 0, width: "100%", height: "100%" };

export const POSTURE = { clean: "#63f5ff", elevated: "#ffc857", breach: "#ff3d81" };

export function useCanvasAnimation(draw, deps = []) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext("2d");
    let raf;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      if (!w || !h) return;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const tick = (now) => {
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      // No clearRect: panels manage their own buffer (trails / additive glow).
      if (w && h) draw(ctx, w, h, now * 0.001);
      raf = requestAnimationFrame(tick);
    };
    resize();
    window.addEventListener("resize", resize);
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return ref;
}

// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

// ════════════════════════════════════════════════════════════════════════════
// DepartmentGalaxy — canvas-rendered spiral galaxy node
// Props: galaxy, x, y, radius, selected, onClick
// Each department is a live WebGL-quality spiral galaxy painted on its own
// canvas, positioned via foreignObject inside the SVG map.
// Visual language borrowed from SI DevWorks landing galaxy + cosmos-tokens.
// ════════════════════════════════════════════════════════════════════════════
import { useEffect, useRef, useMemo } from "react";
import { riskBand, RISK_BANDS } from "./identityContract.js";

const TAU = Math.PI * 2;

// ─── Risk band → core palette (RGB triplets for canvas) ──────────────────────
const BAND_PALETTE = {
  nominal:  { core: [56, 189, 248],  mid: [30, 120, 200],  halo: [20,  80, 160],  glow: "rgba(56,189,248," },
  elevated: { core: [255, 200,  87], mid: [220, 150,  40],  halo: [160,  90,  20],  glow: "rgba(255,200,87," },
  warning:  { core: [239,  68,  68], mid: [200,  40,  40],  halo: [140,  20,  20],  glow: "rgba(239,68,68,"  },
  critical: { core: [255, 255, 255], mid: [200, 210, 255],  halo: [140, 160, 240],  glow: "rgba(255,255,255," },
};

// ─── Deterministic RNG seeded by galaxy id ────────────────────────────────────
function mkRng(seed) {
  let s = Math.abs(seed.split("").reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 0)) || 1;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

// ─── Build particle array (stable — rebuilt only when radius/band changes) ────
function buildParticles(rng, count, band) {
  const pal = BAND_PALETTE[band] || BAND_PALETTE.nominal;
  const NUM_ARMS = 2;
  const DISC_TILT = 0.38;
  const particles = [];

  for (let i = 0; i < count; i++) {
    const isHalo = i >= Math.floor(count * 0.78);
    let dist, angle, rc, gc, bc, baseAlpha;

    if (isHalo) {
      dist  = rng() * 0.42 + 0.50;
      angle = rng() * TAU;
      const t = rng();
      if (t < 0.5) {
        [rc, gc, bc] = pal.halo;
        rc += rng() * 30 | 0; gc += rng() * 30 | 0; bc += rng() * 30 | 0;
      } else {
        [rc, gc, bc] = pal.mid;
        rc += rng() * 20 | 0;
      }
      baseAlpha = rng() * 0.18 + 0.04;
    } else {
      const arm     = i % NUM_ARMS;
      const armOff  = (arm / NUM_ARMS) * TAU;
      const ti      = Math.pow(rng(), 0.5);
      dist          = ti * 0.48 + 0.015;
      angle         = dist * TAU * 3.5 + armOff + (rng() - 0.5) * 1.2;

      if (dist < 0.08) {
        // nucleus — bright core colour
        [rc, gc, bc] = pal.core;
        rc = Math.min(255, rc + (rng() * 40 | 0));
        gc = Math.min(255, gc + (rng() * 40 | 0));
        bc = Math.min(255, bc + (rng() * 40 | 0));
      } else if (dist < 0.22) {
        const m = (dist - 0.08) / 0.14;
        [rc, gc, bc] = pal.core.map((v, j) => Math.min(255, v + ((pal.mid[j] - v) * m) | 0));
      } else {
        const m = Math.min(1, (dist - 0.22) / 0.26);
        [rc, gc, bc] = pal.mid.map((v, j) => Math.min(255, v + ((pal.halo[j] - v) * m) | 0));
      }
      baseAlpha = dist < 0.1
        ? rng() * 0.6 + 0.3
        : rng() * 0.55 + 0.15;
    }

    particles.push({
      angle, dist,
      speed: isHalo
        ? (0.0004 + rng() * 0.0006) / Math.sqrt(dist + 0.04)
        : (0.0012 + rng() * 0.0025) / Math.sqrt(dist + 0.04),
      drift: (rng() - 0.5) * 0.00012,
      r: isHalo
        ? rng() * 0.9 + 0.2
        : dist < 0.1 ? rng() * 1.5 + 0.4 : rng() * 0.9 + 0.2,
      rc: rc | 0, gc: gc | 0, bc: bc | 0, baseAlpha,
      wobbleFreq: rng() * 3 + 1,
      wobbleAmp:  isHalo ? rng() * 0.007 + 0.002 : rng() * 0.018 + 0.004,
      isHalo,
      DISC_TILT,
    });
  }
  return particles;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function DepartmentGalaxy({ galaxy, x, y, radius, selected, onClick }) {
  const band = riskBand(galaxy.riskScore);
  const pal  = BAND_PALETTE[band] || BAND_PALETTE.nominal;
  const strokeToken = RISK_BANDS[band].cssToken;

  // Canvas size: 2.8× the galaxy radius so halo has room to breathe
  const size   = Math.round(radius * 2.8) * 2; // *2 for devicePixelRatio
  const rng    = useMemo(() => mkRng(galaxy.id), [galaxy.id]);
  const COUNT  = Math.max(320, Math.min(800, radius * 14)) | 0;
  const pRef   = useRef(null); // particle array — stable across re-renders
  const canRef = useRef(null);
  const rafRef = useRef(null);
  const tRef   = useRef(Math.random() * 100); // random phase offset per galaxy

  // ── Rebuild particles when band or size changes ──────────────────────────
  useEffect(() => {
    const r2 = mkRng(galaxy.id + band);
    pRef.current = buildParticles(r2, COUNT, band);
  }, [galaxy.id, band, COUNT]);

  // ── Animation loop ───────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr   = Math.min(window.devicePixelRatio || 1, 2);
    const dim   = Math.round(radius * 2.8);
    canvas.width  = dim * dpr;
    canvas.height = dim * dpr;
    canvas.style.width  = `${dim}px`;
    canvas.style.height = `${dim}px`;
    ctx.scale(dpr, dpr);

    const cx = dim / 2;
    const cy = dim / 2;
    const scale = dim * 0.46;

    const draw = () => {
      const t = (tRef.current += 0.007);
      const particles = pRef.current;
      if (!particles) { rafRef.current = requestAnimationFrame(draw); return; }

      // Motion blur
      ctx.fillStyle = "rgba(3,3,7,0.18)";
      ctx.fillRect(0, 0, dim, dim);

      // Deep nebula haze
      const hazeR = scale * 0.92;
      const pulse = Math.sin(t * 0.4) * 0.005;
      const [cr, cg, cb] = pal.core;
      const haze = ctx.createRadialGradient(cx, cy, 0, cx, cy, hazeR);
      haze.addColorStop(0,    `rgba(${cr},${cg},${cb},${0.07 + pulse})`);
      haze.addColorStop(0.3,  `rgba(${cr},${cg},${cb},${0.03 + pulse})`);
      haze.addColorStop(0.65, `rgba(${cr},${cg},${cb},0.008)`);
      haze.addColorStop(1,    "rgba(0,0,0,0)");
      ctx.beginPath(); ctx.arc(cx, cy, hazeR, 0, TAU);
      ctx.fillStyle = haze; ctx.fill();

      // Orbital ring
      const orbA = scale * 0.52;
      const orbB = orbA * 0.36;
      ctx.save(); ctx.translate(cx, cy);
      ctx.beginPath(); ctx.ellipse(0, 0, orbA, orbB, 0, 0, TAU);
      ctx.strokeStyle = `rgba(${cr},${cg},${cb},${selected ? 0.28 : 0.14})`;
      ctx.lineWidth = selected ? 1.2 : 0.7;
      ctx.setLineDash([3, 9]);
      ctx.stroke(); ctx.setLineDash([]);
      // Orbital marker dot
      const ma  = t * 0.22;
      const mpx = Math.cos(ma) * orbA;
      const mpy = Math.sin(ma) * orbB;
      const mg  = ctx.createRadialGradient(mpx, mpy, 0, mpx, mpy, 4);
      mg.addColorStop(0,   `rgba(255,255,255,0.85)`);
      mg.addColorStop(0.4, `rgba(${cr},${cg},${cb},0.6)`);
      mg.addColorStop(1,   "rgba(0,0,0,0)");
      ctx.beginPath(); ctx.arc(mpx, mpy, 4, 0, TAU);
      ctx.fillStyle = mg; ctx.fill();
      ctx.restore();

      // Particles
      for (const p of particles) {
        p.angle += p.speed;
        p.dist  += p.drift;
        const maxD = p.isHalo ? 0.93 : 0.50;
        const minD = p.isHalo ? 0.48 : 0.008;
        if (p.dist > maxD || p.dist < minD) {
          p.dist = p.isHalo ? 0.50 + Math.random() * 0.05 : 0.02 + Math.random() * 0.06;
        }
        const wobble = Math.sin(p.angle * p.wobbleFreq + t) * p.wobbleAmp;
        const rad    = (p.dist + wobble) * scale;
        const px = cx + Math.cos(p.angle) * rad;
        const py = cy + Math.sin(p.angle) * rad * (p.isHalo ? 0.7 : p.DISC_TILT);

        let alpha = p.baseAlpha;
        if (p.isHalo) alpha *= Math.pow(Math.max(0, 1 - (p.dist - 0.48) / 0.45), 0.6);
        else          alpha *= Math.pow(Math.max(0, 1 - p.dist / 0.54), 0.8);
        if (alpha < 0.012) continue;

        ctx.beginPath();
        ctx.arc(px, py, p.r, 0, TAU);
        ctx.fillStyle = `rgba(${p.rc},${p.gc},${p.bc},${alpha})`;
        ctx.fill();
      }

      // Nucleus glow
      const ng = ctx.createRadialGradient(cx, cy, 0, cx, cy, scale * 0.12);
      ng.addColorStop(0,   `rgba(255,255,255,0.85)`);
      ng.addColorStop(0.4, `rgba(${cr},${cg},${cb},0.55)`);
      ng.addColorStop(1,   "rgba(0,0,0,0)");
      ctx.beginPath(); ctx.arc(cx, cy, scale * 0.12, 0, TAU);
      ctx.fillStyle = ng; ctx.fill();

      // Selected ring pulse
      if (selected) {
        const selR = dim / 2 - 4;
        const selA = 0.35 + Math.sin(t * 2) * 0.15;
        ctx.beginPath(); ctx.arc(cx, cy, selR, 0, TAU);
        ctx.strokeStyle = `rgba(${cr},${cg},${cb},${selA})`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [radius, band, selected, pal]);

  const dim = Math.round(radius * 2.8);

  return (
    <g
      transform={`translate(${x}, ${y})`}
      onClick={onClick}
      role="button"
      aria-label={`${galaxy.name} — risk ${galaxy.riskScore}`}
      style={{ cursor: "pointer" }}
    >
      {/* Invisible hit target */}
      <circle r={Math.max(dim / 2 + 20, 60)} fill="transparent" pointerEvents="all" />

      {/* Canvas galaxy via foreignObject */}
      <foreignObject
        x={-dim / 2}
        y={-dim / 2}
        width={dim}
        height={dim}
        style={{ overflow: "visible", pointerEvents: "none" }}
      >
        <canvas
          ref={canRef}
          style={{
            display:    "block",
            borderRadius: "50%",
            pointerEvents: "none",
          }}
        />
      </foreignObject>

      {/* Department name */}
      <text
        y={dim / 2 + 14}
        textAnchor="middle"
        fill={strokeToken}
        style={{
          font:          "600 11px ui-monospace, 'SF Mono', Menlo, monospace",
          letterSpacing: "0.10em",
          textTransform: "uppercase",
          pointerEvents: "none",
          textShadow:    `0 0 12px ${pal.glow}0.8)`,
        }}
      >
        {galaxy.name}
      </text>

      {/* Risk score badge */}
      <g transform={`translate(${radius * 0.72}, ${-radius * 0.72})`}>
        <circle
          r={11}
          fill={strokeToken}
          fillOpacity="0.9"
          stroke="var(--cx-void)"
          strokeWidth="1.5"
        />
        <text
          textAnchor="middle"
          dominantBaseline="central"
          fill="var(--cx-void)"
          style={{
            font:          `700 ${galaxy.riskScore >= 100 ? 7 : 8}px ui-monospace, 'SF Mono', Menlo, monospace`,
            pointerEvents: "none",
          }}
        >
          {galaxy.riskScore}
        </text>
      </g>
    </g>
  );
}

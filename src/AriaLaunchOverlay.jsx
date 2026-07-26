// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import { useEffect, useRef, useState, useCallback } from 'react';
import './AriaLaunchOverlay.css';

const STATUS_MESSAGES = [
  'Establishing Secure Mesh...',
  'Synchronizing Defense Nodes...',
  'Validating Trust Graph...',
  'Scanning Orbital Perimeter...',
];

// ── Ring definitions (rx/ry in canvas px from center, rot in radians) ────────
const RINGS = [
  { rx: 210, ry: 76,  rot: -0.44, rotSpeed:  0.28, color: [99,  245, 255] },
  { rx: 152, ry: 58,  rot:  0.26, rotSpeed: -0.42, color: [139,  92, 246] },
  { rx:  92, ry: 36,  rot:  0.78, rotSpeed:  0.65, color: [99,  245, 255] },
];

// ── Dots riding each ring ─────────────────────────────────────────────────────
const DOTS_INIT = [
  { ringIdx: 0, angle: 0,              speed:  0.55 },
  { ringIdx: 1, angle: 0,              speed: -0.80 },
  { ringIdx: 1, angle: Math.PI,        speed: -0.80 },
  { ringIdx: 2, angle: Math.PI / 2.5,  speed:  1.10 },
];

// ── Static constellation nodes (shown as pulsing points on ring edges) ───────
const NODES = [0, 60, 120, 180, 240, 300].map((deg, i) => ({
  angle:      (deg * Math.PI) / 180,
  ringIdx:    i % 2 === 0 ? 0 : 1,
  cyan:       i % 2 === 0,
  pulsePhase: (i / 6) * Math.PI * 2,
}));

// ════════════════════════════════════════════════════════════════════════════
//  AUDIO — plays the pre-recorded boot MP3 bundled with the app.
// ════════════════════════════════════════════════════════════════════════════
const WAV_SRC = '/aria-welcome.mp3';

function playOnce(onBlocked) {
  const audio = new Audio(WAV_SRC);
  audio.play().catch(onBlocked ?? (() => {}));
  return audio;
}

function triggerSystemAudio() {
  if (!WAV_SRC) return;

  let blocked = false;

  const audio1 = new Audio(WAV_SRC);
  audio1.play().catch(() => {
    blocked = true;
    // Browser blocked autoplay — replay both on first interaction.
    const unlock = () => {
      audio1.play().catch(() => {});
      setTimeout(() => {
        const audio2 = new Audio(WAV_SRC);
        audio2.play().catch(() => {});
      }, 50);
      document.removeEventListener('click',      unlock);
      document.removeEventListener('keydown',    unlock);
      document.removeEventListener('touchstart', unlock);
    };
    document.addEventListener('click',      unlock, { once: true });
    document.addEventListener('keydown',    unlock, { once: true });
    document.addEventListener('touchstart', unlock, { once: true });
  });

  // Echo: fires 50ms after first play (only when autoplay succeeded)
  setTimeout(() => {
    if (blocked) return;
    const audio2 = new Audio(WAV_SRC);
    audio2.play().catch(() => {});
  }, 50);
}

// ── Returns the canvas-space coordinates of a point on a rotated ellipse ─────
function ellipsePoint(ring, angle, cx, cy) {
  const lx  = ring.rx * Math.cos(angle);
  const ly  = ring.ry * Math.sin(angle);
  const cos = Math.cos(ring.rot);
  const sin = Math.sin(ring.rot);
  return { x: cx + cos * lx - sin * ly, y: cy + sin * lx + cos * ly };
}

export default function AriaLaunchOverlay({ onDismiss, fadeOutDelay = 4600 }) {
  const canvasRef = useRef(null);
  const animRef   = useRef(null);
  const dotsRef   = useRef(DOTS_INIT.map(d => ({ ...d })));

  const [statusIdx, setStatusIdx] = useState(0);
  const [phase,     setPhase]     = useState('active'); // 'active' | 'exit' | 'done'

  // ── Dismiss: fade → unmount ────────────────────────────────────────────────
  const dismiss = useCallback(() => {
    setPhase('exit');
    setTimeout(() => {
      setPhase('done');
      onDismiss?.();
    }, 1550);
  }, [onDismiss]);

  // Expose globally so the audio callback can drive the dismiss timing
  useEffect(() => {
    window.ariaDismissOverlay = dismiss;
    return () => { delete window.ariaDismissOverlay; };
  }, [dismiss]);

  // ── Auto-dismiss timer — NEVER guarded, must fire on every real mount ────
  useEffect(() => {
    if (!isFinite(fadeOutDelay)) return;
    const t = setTimeout(dismiss, fadeOutDelay);
    return () => clearTimeout(t);
  }, [dismiss, fadeOutDelay]);

  // ── Audio ─────────────────────────────────────────────────────────────────
  // No guard: StrictMode cleanup fires before the 400ms timer, so the first
  // mount's timer is always cancelled before it triggers. The real (second in
  // dev, only in prod) mount fires the audio exactly once.
  useEffect(() => {
    const t = setTimeout(triggerSystemAudio, 400);
    return () => clearTimeout(t);
  }, []);

  // ── Status text cycler ─────────────────────────────────────────────────────
  useEffect(() => {
    const interval = (fadeOutDelay - 600) / STATUS_MESSAGES.length;
    let i = 0;
    const id = setInterval(() => {
      i++;
      if (i >= STATUS_MESSAGES.length) { clearInterval(id); return; }
      setStatusIdx(i);
    }, Math.max(interval, 560));
    return () => clearInterval(id);
  }, [fadeOutDelay]);

  // ── Canvas: particles, data streams, orbital rings, moving dots ───────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    let W = 0, H = 0;
    const resize = () => {
      W = canvas.width  = window.innerWidth;
      H = canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    // ── Particle pool ───────────────────────────────────────────────────────
    const PARTICLE_N = 95;
    const particles = Array.from({ length: PARTICLE_N }, () => ({
      x:     Math.random() * window.innerWidth,
      y:     Math.random() * window.innerHeight,
      r:     Math.random() * 1.5 + 0.3,
      vx:    (Math.random() - 0.5) * 0.22,
      vy:    (Math.random() - 0.5) * 0.22,
      alpha: Math.random() * 0.42 + 0.08,
      cyan:  Math.random() > 0.45,
    }));

    // ── Vertical data stream lines ──────────────────────────────────────────
    const STREAM_N = 20;
    const streams = Array.from({ length: STREAM_N }, () => ({
      x:     Math.random() * window.innerWidth,
      y:     Math.random() * window.innerHeight,
      len:   Math.random() * 68 + 18,
      speed: Math.random() * 0.65 + 0.22,
      alpha: Math.random() * 0.22 + 0.04,
      cyan:  Math.random() > 0.38,
    }));

    let dashOffset = 0;
    let t          = 0;
    let lastTime   = performance.now();
    const dots     = dotsRef.current;

    const draw = (now) => {
      animRef.current = requestAnimationFrame(draw);
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;
      t         += dt;
      dashOffset += dt * 38;

      ctx.clearRect(0, 0, W, H);
      const cx = W / 2, cy = H / 2;

      // ── Data streams ────────────────────────────────────────────────────
      streams.forEach(s => {
        s.y -= s.speed;
        if (s.y + s.len < 0) { s.y = H + 10; s.x = Math.random() * W; }
        const [r, g, b] = s.cyan ? [99, 245, 255] : [139, 92, 246];
        const g2 = ctx.createLinearGradient(s.x, s.y, s.x, s.y + s.len);
        g2.addColorStop(0,   `rgba(${r},${g},${b},0)`);
        g2.addColorStop(0.5, `rgba(${r},${g},${b},${s.alpha})`);
        g2.addColorStop(1,   `rgba(${r},${g},${b},0)`);
        ctx.strokeStyle = g2;
        ctx.lineWidth   = 1;
        ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x, s.y + s.len);
        ctx.stroke();
      });

      // ── Ambient particles ────────────────────────────────────────────────
      particles.forEach(p => {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x = W; else if (p.x > W) p.x = 0;
        if (p.y < 0) p.y = H; else if (p.y > H) p.y = 0;
        const [r, g, b] = p.cyan ? [99, 245, 255] : [139, 92, 246];
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r},${g},${b},${p.alpha})`;
        ctx.fill();
      });

      // ── Orbital ring outlines (dashed ellipses via scale trick) ──────────
      RINGS.forEach((ring, ri) => {
        const [r, g, b] = ring.color;
        const scaleY    = ring.ry / ring.rx;
        const period    = 18;
        const offset    = (dashOffset * (ring.rotSpeed > 0 ? 1 : -1)) % period;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(ring.rot);
        ctx.scale(1, scaleY);
        ctx.beginPath();
        ctx.arc(0, 0, ring.rx, 0, Math.PI * 2);
        ctx.setLineDash([10, 5]);
        ctx.lineDashOffset  = -offset;
        ctx.strokeStyle     = `rgba(${r},${g},${b},${ri === 2 ? 0.55 : 0.38})`;
        ctx.lineWidth       = (ri === 2 ? 1.4 : 1) / scaleY;
        ctx.stroke();
        ctx.restore();
      });

      // ── Constellation connectors between nodes ───────────────────────────
      ctx.save();
      ctx.setLineDash([3, 6]);
      ctx.lineDashOffset = -(dashOffset * 0.35) % 9;
      for (let i = 0; i < NODES.length; i++) {
        const na = NODES[i];
        const nb = NODES[(i + 1) % NODES.length];
        const pa = ellipsePoint(RINGS[na.ringIdx], na.angle, cx, cy);
        const pb = ellipsePoint(RINGS[nb.ringIdx], nb.angle, cx, cy);
        const [r, g, b] = na.cyan ? [99, 245, 255] : [139, 92, 246];
        ctx.strokeStyle = `rgba(${r},${g},${b},0.26)`;
        ctx.lineWidth   = 0.7;
        ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y);
        ctx.stroke();
      }
      ctx.restore();

      // ── Constellation nodes (static pulsing dots) ────────────────────────
      NODES.forEach(node => {
        const pt    = ellipsePoint(RINGS[node.ringIdx], node.angle, cx, cy);
        const pulse = 0.6 + 0.4 * Math.sin(t * 1.9 + node.pulsePhase);
        const [r, g, b] = node.cyan ? [99, 245, 255] : [139, 92, 246];
        const grd = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, 11);
        grd.addColorStop(0, `rgba(${r},${g},${b},${0.38 * pulse})`);
        grd.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx.beginPath(); ctx.arc(pt.x, pt.y, 11, 0, Math.PI * 2);
        ctx.fillStyle = grd; ctx.fill();
        ctx.beginPath(); ctx.arc(pt.x, pt.y, 2.6 * pulse, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r},${g},${b},${0.88 * pulse})`; ctx.fill();
      });

      // ── Moving orbital dots ──────────────────────────────────────────────
      dots.forEach(dot => {
        dot.angle += dot.speed * dt;
        const ring  = RINGS[dot.ringIdx];
        const pt    = ellipsePoint(ring, dot.angle, cx, cy);
        const [r, g, b] = ring.color;
        const gSize = 4.5 + 1.8 * Math.sin(t * 2.8 + dot.angle);

        // Glow halo
        const grd = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, gSize * 2.8);
        grd.addColorStop(0, `rgba(${r},${g},${b},0.75)`);
        grd.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx.beginPath(); ctx.arc(pt.x, pt.y, gSize * 2.8, 0, Math.PI * 2);
        ctx.fillStyle = grd; ctx.fill();

        // Bright core
        ctx.beginPath(); ctx.arc(pt.x, pt.y, gSize * 0.55, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r},${g},${b},1)`; ctx.fill();
      });
    };

    animRef.current = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', resize);
    };
  }, []);

  if (phase === 'done') return null;

  return (
    <div className={`aria-ov${phase === 'exit' ? ' aria-ov--exit' : ''}`}>
      <canvas ref={canvasRef} className="aria-ov__canvas" />

      {/* Corner brackets */}
      <span className="aria-ov__corner aria-ov__corner--tl" />
      <span className="aria-ov__corner aria-ov__corner--tr" />
      <span className="aria-ov__corner aria-ov__corner--bl" />
      <span className="aria-ov__corner aria-ov__corner--br" />

      {/* Center text */}
      <div className="aria-ov__stage">
        <p className="aria-ov__eyebrow">SECURE SYSTEM BOOT</p>

        <h1 className="aria-ov__title">
          ARIA-SEC
          <span className="aria-ov__scan" />
        </h1>

        <p className="aria-ov__tagline">ORBITAL DEFENSE NETWORK</p>

        {/* key remounts the element so the fade-up animation replays each cycle */}
        <p
          className="aria-ov__status"
          key={statusIdx}
          style={{ animationDelay: statusIdx === 0 ? '1.9s' : '0s' }}
        >
          {STATUS_MESSAGES[statusIdx]}
        </p>

        <div className="aria-ov__progress-wrap">
          <div className="aria-ov__progress-bar" />
        </div>
      </div>
    </div>
  );
}

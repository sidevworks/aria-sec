// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

/**
 * AriaLogoAnimation — persistent ambient logo layer for the landing page.
 *
 * Same orbital ring + particle canvas as the boot overlay, but:
 *  • no background fill (fully transparent — main canvas shows through)
 *  • no dismiss / no audio / no boot UI
 *  • pointer-events: none — never intercepts clicks
 *  • sits at z-index 1 between the neural-node canvas (0) and the HUD (10)
 *  • parent controls opacity (default 0.7)
 */
import { useEffect, useRef } from 'react';

const RINGS = [
  { rx: 210, ry: 76,  rot: -0.44, rotSpeed:  0.28, color: [99,  245, 255] },
  { rx: 152, ry: 58,  rot:  0.26, rotSpeed: -0.42, color: [139,  92, 246] },
  { rx:  92, ry: 36,  rot:  0.78, rotSpeed:  0.65, color: [99,  245, 255] },
];

const DOTS_INIT = [
  { ringIdx: 0, angle: 0,              speed:  0.55 },
  { ringIdx: 1, angle: 0,              speed: -0.80 },
  { ringIdx: 1, angle: Math.PI,        speed: -0.80 },
  { ringIdx: 2, angle: Math.PI / 2.5,  speed:  1.10 },
];

const NODES = [0, 60, 120, 180, 240, 300].map((deg, i) => ({
  angle:      (deg * Math.PI) / 180,
  ringIdx:    i % 2 === 0 ? 0 : 1,
  cyan:       i % 2 === 0,
  pulsePhase: (i / 6) * Math.PI * 2,
}));

function ellipsePoint(ring, angle, cx, cy) {
  const lx  = ring.rx * Math.cos(angle);
  const ly  = ring.ry * Math.sin(angle);
  const cos = Math.cos(ring.rot);
  const sin = Math.sin(ring.rot);
  return { x: cx + cos * lx - sin * ly, y: cy + sin * lx + cos * ly };
}

export default function AriaLogoAnimation({ opacity = 0.7 }) {
  const canvasRef = useRef(null);
  const animRef   = useRef(null);
  const dotsRef   = useRef(DOTS_INIT.map(d => ({ ...d })));

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

    // Fewer particles than boot overlay — subtle ambient presence
    const PARTICLE_N = 55;
    const particles = Array.from({ length: PARTICLE_N }, () => ({
      x:     Math.random() * window.innerWidth,
      y:     Math.random() * window.innerHeight,
      r:     Math.random() * 1.2 + 0.2,
      vx:    (Math.random() - 0.5) * 0.18,
      vy:    (Math.random() - 0.5) * 0.18,
      alpha: Math.random() * 0.35 + 0.06,
      cyan:  Math.random() > 0.45,
    }));

    const STREAM_N = 12;
    const streams = Array.from({ length: STREAM_N }, () => ({
      x:     Math.random() * window.innerWidth,
      y:     Math.random() * window.innerHeight,
      len:   Math.random() * 60 + 15,
      speed: Math.random() * 0.55 + 0.18,
      alpha: Math.random() * 0.18 + 0.03,
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

      // Transparent clear — neural canvas shows through
      ctx.clearRect(0, 0, W, H);
      const cx = W / 2, cy = H / 2;

      // Data streams
      streams.forEach(s => {
        s.y -= s.speed;
        if (s.y + s.len < 0) { s.y = H + 10; s.x = Math.random() * W; }
        const [r, g, b] = s.cyan ? [99, 245, 255] : [139, 92, 246];
        const g2 = ctx.createLinearGradient(s.x, s.y, s.x, s.y + s.len);
        g2.addColorStop(0,   `rgba(${r},${g},${b},0)`);
        g2.addColorStop(0.5, `rgba(${r},${g},${b},${s.alpha})`);
        g2.addColorStop(1,   `rgba(${r},${g},${b},0)`);
        ctx.strokeStyle = g2; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x, s.y + s.len);
        ctx.stroke();
      });

      // Particles
      particles.forEach(p => {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x = W; else if (p.x > W) p.x = 0;
        if (p.y < 0) p.y = H; else if (p.y > H) p.y = 0;
        const [r, g, b] = p.cyan ? [99, 245, 255] : [139, 92, 246];
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r},${g},${b},${p.alpha})`; ctx.fill();
      });

      // Orbital ring outlines
      RINGS.forEach((ring, ri) => {
        const [r, g, b] = ring.color;
        const scaleY    = ring.ry / ring.rx;
        const period    = 18;
        const offset    = (dashOffset * (ring.rotSpeed > 0 ? 1 : -1)) % period;
        ctx.save();
        ctx.translate(cx, cy); ctx.rotate(ring.rot); ctx.scale(1, scaleY);
        ctx.beginPath(); ctx.arc(0, 0, ring.rx, 0, Math.PI * 2);
        ctx.setLineDash([10, 5]); ctx.lineDashOffset = -offset;
        ctx.strokeStyle = `rgba(${r},${g},${b},${ri === 2 ? 0.5 : 0.32})`;
        ctx.lineWidth   = (ri === 2 ? 1.3 : 1) / scaleY;
        ctx.stroke(); ctx.restore();
      });

      // Constellation connectors
      ctx.save();
      ctx.setLineDash([3, 6]);
      ctx.lineDashOffset = -(dashOffset * 0.35) % 9;
      for (let i = 0; i < NODES.length; i++) {
        const na = NODES[i], nb = NODES[(i + 1) % NODES.length];
        const pa = ellipsePoint(RINGS[na.ringIdx], na.angle, cx, cy);
        const pb = ellipsePoint(RINGS[nb.ringIdx], nb.angle, cx, cy);
        const [r, g, b] = na.cyan ? [99, 245, 255] : [139, 92, 246];
        ctx.strokeStyle = `rgba(${r},${g},${b},0.2)`;
        ctx.lineWidth = 0.7;
        ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y);
        ctx.stroke();
      }
      ctx.restore();

      // Constellation nodes
      NODES.forEach(node => {
        const pt    = ellipsePoint(RINGS[node.ringIdx], node.angle, cx, cy);
        const pulse = 0.6 + 0.4 * Math.sin(t * 1.9 + node.pulsePhase);
        const [r, g, b] = node.cyan ? [99, 245, 255] : [139, 92, 246];
        const grd = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, 11);
        grd.addColorStop(0, `rgba(${r},${g},${b},${0.32 * pulse})`);
        grd.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx.beginPath(); ctx.arc(pt.x, pt.y, 11, 0, Math.PI * 2);
        ctx.fillStyle = grd; ctx.fill();
        ctx.beginPath(); ctx.arc(pt.x, pt.y, 2.4 * pulse, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r},${g},${b},${0.8 * pulse})`; ctx.fill();
      });

      // Moving orbital dots
      dots.forEach(dot => {
        dot.angle += dot.speed * dt;
        const ring  = RINGS[dot.ringIdx];
        const pt    = ellipsePoint(ring, dot.angle, cx, cy);
        const [r, g, b] = ring.color;
        const gSize = 4.2 + 1.6 * Math.sin(t * 2.8 + dot.angle);
        const grd = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, gSize * 2.6);
        grd.addColorStop(0, `rgba(${r},${g},${b},0.7)`);
        grd.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx.beginPath(); ctx.arc(pt.x, pt.y, gSize * 2.6, 0, Math.PI * 2);
        ctx.fillStyle = grd; ctx.fill();
        ctx.beginPath(); ctx.arc(pt.x, pt.y, gSize * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r},${g},${b},1)`; ctx.fill();
      });

      // ── Centre wordmark ──────────────────────────────────────────────────
      // Drawn on canvas so it blends with the orbital effects.
      ctx.save();
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';

      // Outer glow pass
      ctx.font      = '900 52px "Orbitron", "Courier New", monospace';
      ctx.fillStyle = `rgba(99,245,255,${0.12 + 0.06 * Math.sin(t * 0.8)})`;
      ctx.filter    = 'blur(18px)';
      ctx.fillText('ARIA-SEC', cx, cy);

      // Mid glow pass
      ctx.font      = '900 52px "Orbitron", "Courier New", monospace';
      ctx.fillStyle = `rgba(99,245,255,${0.3 + 0.08 * Math.sin(t * 0.8)})`;
      ctx.filter    = 'blur(6px)';
      ctx.fillText('ARIA-SEC', cx, cy);

      // Crisp text
      ctx.filter    = 'none';
      ctx.fillStyle = `rgba(234,247,255,${0.82 + 0.06 * Math.sin(t * 0.9)})`;
      ctx.fillText('ARIA-SEC', cx, cy);

      // Tagline
      ctx.font      = '500 11px "Share Tech Mono", "Courier New", monospace';
      ctx.fillStyle = `rgba(99,245,255,${0.38 + 0.08 * Math.sin(t * 0.7)})`;
      ctx.letterSpacing = '0.4em';
      ctx.fillText('ORBITAL DEFENSE NETWORK', cx, cy + 38);

      ctx.restore();
    };

    animRef.current = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position:      'fixed',
        inset:         0,
        width:         '100%',
        height:        '100%',
        zIndex:        1,          // above neural canvas (0), below HUD (10)
        opacity,
        pointerEvents: 'none',
      }}
    />
  );
}

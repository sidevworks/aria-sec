// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import { useEffect, useRef, useState, useCallback } from 'react';
import './AriaLoginScreen.css';

const BOOT_LINES = [
  'AUTH MODULE v4.2.1 LOADED',
  'SESSION LAYER: STANDBY',
  'ENCRYPTION HANDSHAKE: AES-256-GCM',
  'IDENTITY MESH: CONNECTED',
  'AWAITING OPERATOR CREDENTIALS...',
];

function getApiBase() {
  return (import.meta.env?.VITE_ARIA_API_BASE || '').replace(/\/$/, '');
}

export default function AriaLoginScreen({ onLogin }) {
  const canvasRef  = useRef(null);
  const animRef    = useRef(null);
  const [phase,    setPhase]    = useState('enter');   // 'enter' | 'idle' | 'exit'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const [bootIdx,  setBootIdx]  = useState(0);

  // Boot-log ticker
  useEffect(() => {
    if (bootIdx >= BOOT_LINES.length) return;
    const t = setTimeout(() => setBootIdx(i => i + 1), 420);
    return () => clearTimeout(t);
  }, [bootIdx]);

  // Enter phase → idle after CSS animation settles
  useEffect(() => {
    const t = setTimeout(() => setPhase('idle'), 900);
    return () => clearTimeout(t);
  }, []);

  // Canvas: ambient particles + data streams (reuses overlay canvas style)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let W = 0, H = 0;
    const resize = () => { W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; };
    resize();
    window.addEventListener('resize', resize);

    const particles = Array.from({ length: 70 }, () => ({
      x: Math.random() * window.innerWidth, y: Math.random() * window.innerHeight,
      r: Math.random() * 1.4 + 0.2, vx: (Math.random() - 0.5) * 0.18, vy: (Math.random() - 0.5) * 0.18,
      alpha: Math.random() * 0.35 + 0.06, cyan: Math.random() > 0.5,
    }));

    const streams = Array.from({ length: 16 }, () => ({
      x: Math.random() * window.innerWidth, y: Math.random() * window.innerHeight,
      len: Math.random() * 60 + 15, speed: Math.random() * 0.55 + 0.18,
      alpha: Math.random() * 0.18 + 0.03, cyan: Math.random() > 0.4,
    }));

    let lastTime = performance.now();
    const draw = (now) => {
      animRef.current = requestAnimationFrame(draw);
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;
      ctx.clearRect(0, 0, W, H);

      streams.forEach(s => {
        s.y -= s.speed;
        if (s.y + s.len < 0) { s.y = H + 10; s.x = Math.random() * W; }
        const [r, g, b] = s.cyan ? [99, 245, 255] : [139, 92, 246];
        const g2 = ctx.createLinearGradient(s.x, s.y, s.x, s.y + s.len);
        g2.addColorStop(0,   `rgba(${r},${g},${b},0)`);
        g2.addColorStop(0.5, `rgba(${r},${g},${b},${s.alpha})`);
        g2.addColorStop(1,   `rgba(${r},${g},${b},0)`);
        ctx.strokeStyle = g2; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x, s.y + s.len); ctx.stroke();
      });

      particles.forEach(p => {
        p.x += p.vx * dt * 60; p.y += p.vy * dt * 60;
        if (p.x < 0) p.x = W; else if (p.x > W) p.x = 0;
        if (p.y < 0) p.y = H; else if (p.y > H) p.y = 0;
        const [r, g, b] = p.cyan ? [99, 245, 255] : [139, 92, 246];
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r},${g},${b},${p.alpha})`; ctx.fill();
      });
    };
    animRef.current = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(animRef.current); window.removeEventListener('resize', resize); };
  }, []);

  const completeLogin = useCallback((session) => {
    setPhase('exit');
    setTimeout(() => onLogin?.(session), 900);
  }, [onLogin]);

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('CREDENTIALS REQUIRED');
      return;
    }

    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${getApiBase()}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoading(false);
        setError((data?.error || 'AUTHENTICATION FAILED').toUpperCase());
        return;
      }
      completeLogin(data);
    } catch {
      setLoading(false);
      setError('AUTH SERVICE UNREACHABLE');
    }
  }, [username, password, completeLogin]);

  return (
    <div className={`aria-lg aria-lg--${phase}`}>
      <canvas ref={canvasRef} className="aria-lg__canvas" />

      {/* Corner brackets */}
      <span className="aria-lg__corner aria-lg__corner--tl" />
      <span className="aria-lg__corner aria-lg__corner--tr" />
      <span className="aria-lg__corner aria-lg__corner--bl" />
      <span className="aria-lg__corner aria-lg__corner--br" />

      {/* Horizontal scan line */}
      <div className="aria-lg__scanline" />

      <div className="aria-lg__center">
        {/* Logo lockup */}
        <div className="aria-lg__logo-wrap">
          <p className="aria-lg__eyebrow">SECURE SYSTEM ACCESS</p>
          <h1 className="aria-lg__title">ARIA-SEC</h1>
          <p className="aria-lg__tagline">ORBITAL DEFENSE NETWORK</p>
        </div>

        {/* Boot log */}
        <div className="aria-lg__boot-log">
          {BOOT_LINES.slice(0, bootIdx).map((line, i) => (
            <p key={i} className="aria-lg__boot-line">{line}</p>
          ))}
        </div>

        {/* Auth card */}
        <form className="aria-lg__card" onSubmit={handleSubmit} autoComplete="off">
          <p className="aria-lg__card-label">OPERATOR AUTHENTICATION</p>

          <div className="aria-lg__field">
            <label className="aria-lg__field-label" htmlFor="aria-lg-username">USERNAME</label>
            <input
              id="aria-lg-username"
              className="aria-lg__input"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={loading}
              placeholder="operator"
            />
          </div>

          <div className="aria-lg__field">
            <label className="aria-lg__field-label" htmlFor="aria-lg-password">ACCESS KEY</label>
            <input
              id="aria-lg-password"
              className="aria-lg__input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              placeholder="••••••••"
            />
          </div>

          {error && <p className="aria-lg__error">{error}</p>}

          <button
            className={`aria-lg__btn${loading ? ' aria-lg__btn--loading' : ''}`}
            type="submit"
            disabled={loading}
          >
            {loading ? 'AUTHENTICATING...' : 'SIGN IN'}
          </button>
        </form>

        <p className="aria-lg__footer">UNAUTHORIZED ACCESS PROHIBITED · ARIA-SEC v4.2.1</p>
      </div>
    </div>
  );
}

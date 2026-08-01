// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Bloom, ChromaticAberration, DepthOfField, EffectComposer, Vignette } from "@react-three/postprocessing";
import { Float, Line, Points, PointMaterial, Text, Trail, useTexture } from "@react-three/drei";
import { easing } from "maath";
import { createNoise3D } from "simplex-noise";
import gsap from "gsap";
import * as THREE from "three";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import DemoCinematic from "./DemoCinematic.jsx";
import DemoFeature from "./DemoFeature.jsx";
import SiteIntroBrief from "./SiteIntroBrief.jsx";
import TrialForm from "./TrialForm.jsx";
import InvestorForm from "./InvestorForm.jsx";
import "./CinematicLanding.css";

const ICE = "#eaf6ff";
const ACCENT = "#37c4e0";
const ACCENT_SOFT = "#8fd4e6";
const ALERT = "#ff2e54";
const GOLD = "#d9a84a";
const TRAVEL_DURATION_MS = 3800;

// One backdrop video per sector. All sectors share the deep-space clip until
// their dedicated renders land — drop new files in /public/landing/media/sectors
// and point the sector here.
const SECTOR_VIDEOS = {
  cockpit:  "/landing/media/sectors/deep-space.mp4",
  aispm:    "/landing/media/sectors/aispm.mp4",
  identity: "/landing/media/sectors/identity.mp4",
  network:  "/landing/media/sectors/network.mp4",
  autonomy: "/landing/media/sectors/autonomy.mp4",
  demo:     "/landing/media/sectors/demo.mp4",
  trial:    "/landing/media/sectors/trial.mp4",
  invest:   "/landing/media/sectors/deep-space.mp4",
};
const SECTOR_VIDEO_LOOP_FADE_S = 1.2; // fade window at each end of the loop
const SECTOR_VIDEO_MAX_OPACITY = 0.55;

const SECTORS = [
  {
    id: "cockpit",
    label: "Cockpit",
    verb: "arrive",
    accent: ACCENT,
    secondary: ACCENT_SOFT,
    position: [0, 0, 0],
    camera: [0, 1.55, 9.2],
    lookAt: [0, 0.05, 0],
    title: "ARIA is the security analyst you can trust to act.",
    body: "A public landing experience that behaves like the product: one autonomous command world, not a stack of pages. Move by sector, voice, or guided tour.",
    audio: "/audio/functions/galaxy.mp3",
    intro: "/audio/intros/command-center.mp3",
    stats: [["Mode", "Governed"], ["Audit", "Always"], ["Scroll", "None"]],
  },
  {
    id: "aispm",
    label: "AI-SPM",
    verb: "slingshot",
    accent: ACCENT,
    secondary: ACCENT_SOFT,
    position: [-7.4, 2.1, -6],
    camera: [-8.8, 2.9, 1.2],
    lookAt: [-7.4, 1.7, -6],
    title: "Every model, prompt, secret, and cloud path exposed.",
    body: "AI assets orbit as live bodies. ARIA maps attack paths, blast radius, severity, and the exact remediation route across seven enterprise sources.",
    audio: "/audio/functions/ai-spm.mp3",
    intro: "/audio/intros/ai-spm.mp3",
    stats: [["Sources", "7"], ["Blast radius", "Mapped"], ["Fixes", "Gated"]],
  },
  {
    id: "identity",
    label: "Identity",
    verb: "bank",
    accent: ACCENT,
    secondary: ACCENT_SOFT,
    position: [7.2, 2.4, -5.3],
    camera: [8.6, 3.4, 1.6],
    lookAt: [7.2, 1.7, -5.3],
    title: "Departments become galaxies. Risk becomes visible.",
    body: "Impossible travel, privilege drift, behavioural baselines, and zero-trust decisions move as living identity constellations inside the ARIA universe.",
    audio: "/audio/functions/identity-galaxy.mp3",
    intro: "/audio/intros/identity-galaxy.mp3",
    stats: [["Signals", "UEBA"], ["Action", "Revoke"], ["Trust", "Audited"]],
  },
  {
    id: "network",
    label: "Network",
    verb: "dive",
    accent: ACCENT,
    secondary: ACCENT_SOFT,
    position: [-5.8, -2.6, -9.2],
    camera: [-6.9, -1.2, -2.5],
    lookAt: [-5.8, -2.7, -9.2],
    title: "Dive through the membrane of every live connection.",
    body: "Active sockets, blocked remotes, listening services, and passive discovery render as a liquid firewall ocean. ARIA sees first and asks before active discovery.",
    audio: "/audio/functions/network.mp3",
    intro: "/audio/intros/network.mp3",
    stats: [["Sockets", "Live"], ["Blocks", "Audited"], ["Scan", "Ask first"]],
  },
  {
    id: "autonomy",
    label: "Autonomy",
    verb: "rise",
    accent: ACCENT,
    secondary: ACCENT_SOFT,
    position: [0, 5.8, -11],
    camera: [0, 7.2, -4.2],
    lookAt: [0, 5.5, -11],
    title: "Trust is earned. The model cannot promote itself.",
    body: "Approval, assisted, auto, and full-auto modes rise as a mechanical trust ladder. Each capability advances through scored decisions and human judgement.",
    audio: "/audio/functions/governed-autonomy.mp3",
    intro: "/audio/intros/governed-autonomy.mp3",
    stats: [["Assisted", "0.80"], ["Auto", "0.92"], ["Full", "0.97"]],
  },
  {
    id: "demo",
    label: "Demo",
    verb: "sweep",
    accent: ACCENT,
    secondary: ACCENT_SOFT,
    position: [6, -2.8, -9.6],
    camera: [7.1, -1.2, -2.7],
    lookAt: [6, -2.8, -9.6],
    title: "For a full technical breakdown of what ARIA can do, click the demo below.",
    body: "The demo is the real interface ARIA runs on — alert, explanation, blast radius, proposed action, approval, and verified containment, walked through end to end on the live product.",
    audio: "/audio/demo.mp3",
    intro: "/audio/intros/demo.mp3",
    stats: [["Format", "Live UI"], ["Voice", "Ready"], ["Captions", "On"]],
  },
  {
    id: "trial",
    label: "Trial",
    verb: "dock",
    accent: ALERT,
    secondary: ACCENT_SOFT,
    position: [0, -5.1, -7.4],
    camera: [0, -3.8, -0.5],
    lookAt: [0, -5.1, -7.4],
    title: "Start your ARIA trial.",
    body: "Tell us about your organisation and the ARIA team will set up a tailored evaluation. A few quick details on the right is all we need to get started.",
    audio: "/audio/funding.mp3",
    intro: "/audio/intros/funding.mp3",
    stats: [["Trial", "14 days"]],
  },
  {
    id: "invest",
    label: "Investors",
    verb: "ascend",
    accent: GOLD,
    secondary: ACCENT_SOFT,
    position: [-6.4, 5.2, -9.5],
    camera: [-7.4, 6.2, -2.6],
    lookAt: [-6.4, 5.0, -9.5],
    title: "Back the security analyst enterprises can finally trust to act.",
    body: "AI outpaced everyone's defenses. ARIA is the governed, autonomous analyst that closes the gap — explaining risk and containing it under human approval. If you invest in category-defining security infrastructure, request the deck.",
    audio: "/audio/invest.mp3",
    intro: "/audio/intros/invest.mp3",
    stats: [["Stage", "Raising"], ["Materials", "On request"], ["Contact", "Direct"]],
  },
];

const TOUR = [
  { id: "cockpit", audio: "/audio/guided-tour-b1.mp3" },
  { id: "cockpit", audio: "/audio/guided-tour-b2.mp3" },
  { id: "aispm", audio: "/audio/guided-tour-b3.mp3" },
  { id: "identity", audio: "/audio/guided-tour-b4.mp3" },
  { id: "autonomy", audio: "/audio/guided-tour-b5.mp3" },
  { id: "trial", audio: "/audio/guided-tour-b6.mp3" },
];

const seededUnit = (seed) => {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
};

const hexToRgb = (hex) => {
  const clean = hex.replace("#", "");
  const value = Number.parseInt(clean.length === 3
    ? clean.split("").map((char) => char + char).join("")
    : clean, 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
};

function useAudioController(setAudioState, goToSector) {
  const audioRef = useRef(null);
  const blockedRef = useRef(null);
  const playedIntros = useRef(new Set());
  const tourIndex = useRef(0);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    blockedRef.current = null;
    setAudioState({ mode: "idle", label: "Audio ready", src: null });
  }, [setAudioState]);

  const play = useCallback((src, label, mode = "voice") => {
    stop();
    blockedRef.current = null;
    const audio = new Audio(src);
    audio.preload = "auto";
    audioRef.current = audio;
    setAudioState({ mode, label, src });
    audio.onended = () => setAudioState({ mode: "idle", label: "Audio ready", src: null });
    audio.onerror = () => setAudioState({ mode: "error", label: "Audio unavailable", src });
    audio.play().catch(() => {
      blockedRef.current = { src, label, mode };
      setAudioState({ mode: "blocked", label: "Tap to enable audio", src });
    });
  }, [setAudioState, stop]);

  const retryBlocked = useCallback(() => {
    const blocked = blockedRef.current;
    if (!blocked) return false;
    play(blocked.src, blocked.label, blocked.mode);
    return true;
  }, [play]);

  const playArrival = useCallback((sector) => {
    if (!sector?.intro || playedIntros.current.has(sector.id)) return;
    playedIntros.current.add(sector.id);
    play(sector.intro, `${sector.label} arrival`, "arrival");
  }, [play]);

  const playDeepDive = useCallback((sector) => {
    if (sector?.audio) play(sector.audio, `${sector.label} narration`, "deep-dive");
  }, [play]);

  const startTour = useCallback(() => {
    tourIndex.current = 0;
    const runBeat = () => {
      const beat = TOUR[tourIndex.current];
      if (!beat) {
        setAudioState({ mode: "idle", label: "Tour complete", src: null });
        return;
      }
      goToSector(beat.id, { playIntro: false });
      const audio = new Audio(beat.audio);
      stop();
      audioRef.current = audio;
      setAudioState({ mode: "tour", label: `Guided tour ${tourIndex.current + 1}/6`, src: beat.audio });
      audio.onended = () => {
        tourIndex.current += 1;
        runBeat();
      };
      audio.onerror = () => setAudioState({ mode: "error", label: "Tour audio unavailable", src: beat.audio });
      audio.play().catch(() => {
        blockedRef.current = { src: beat.audio, label: `Guided tour ${tourIndex.current + 1}/6`, mode: "tour" };
        setAudioState({ mode: "blocked", label: "Tap to enable tour audio", src: beat.audio });
      });
    };
    runBeat();
  }, [goToSector, setAudioState, stop]);

  useEffect(() => () => stop(), [stop]);

  return useMemo(() => ({ stop, playArrival, playDeepDive, retryBlocked, startTour }), [playArrival, playDeepDive, retryBlocked, startTour, stop]);
}

function SignalTransitBackdrop({ activeSector, travel }) {
  const canvasRef = useRef(null);
  const stateRef = useRef({
    mx: -9999,
    my: -9999,
    activeColor: hexToRgb(activeSector.accent),
    secondaryColor: hexToRgb(activeSector.secondary || "#a78bfa"),
    travelActive: false,
    sectorIndex: 0,
  });

  useEffect(() => {
    stateRef.current.activeColor = hexToRgb(activeSector.accent);
    stateRef.current.secondaryColor = hexToRgb(activeSector.secondary || "#a78bfa");
    stateRef.current.travelActive = travel.active;
    stateRef.current.sectorIndex = Math.max(0, SECTORS.findIndex((sector) => sector.id === activeSector.id));
  }, [activeSector, travel.active]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d", { alpha: true });
    if (!canvas || !ctx) return undefined;

    let width = 0;
    let height = 0;
    let dpr = 1;
    let raf = 0;
    let time = 0;
    const twoPi = Math.PI * 2;

    const mkStar = () => ({
      x: Math.random(),
      y: Math.random(),
      r: Math.random() * 1.1 + 0.12,
      a: Math.random() * 0.8 + 0.08,
      da: (Math.random() * 0.003 + 0.0004) * (Math.random() > 0.5 ? 1 : -1),
    });

    const stars = Array.from({ length: 220 }, mkStar);
    const lanes = Array.from({ length: 76 }, (_, i) => ({
      x: Math.random(),
      y: Math.random(),
      z: Math.random(),
      len: 0.04 + Math.random() * 0.12,
      speed: 0.00045 + Math.random() * 0.0016,
      lane: i % 7,
      phase: Math.random() * Math.PI * 2,
    }));
    const shards = Array.from({ length: 16 }, (_, i) => ({
      x: Math.random(),
      y: Math.random(),
      rot: Math.random() * Math.PI,
      size: 18 + Math.random() * 74,
      phase: i * 0.37,
      alpha: 0.012 + Math.random() * 0.035,
    }));
    const mkComet = () => ({
      x: Math.random() * 0.9,
      y: Math.random() * 0.82,
      len: Math.random() * 180 + 90,
      speed: Math.random() * 0.003 + 0.002,
      opacity: 0,
      active: false,
      timer: Math.floor(Math.random() * 220 + 60),
    });
    const comets = Array.from({ length: 3 }, mkComet);

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#010103";
      ctx.fillRect(0, 0, width, height);
    };

    const onPointerMove = (event) => {
      stateRef.current.mx = event.clientX;
      stateRef.current.my = event.clientY;
    };
    const onPointerLeave = () => {
      stateRef.current.mx = -9999;
      stateRef.current.my = -9999;
    };

    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerleave", onPointerLeave);
    resize();

    const draw = () => {
      const active = stateRef.current.activeColor;
      const secondary = stateRef.current.secondaryColor;
      const isWarping = stateRef.current.travelActive;
      const sectorIndex = stateRef.current.sectorIndex;
      const mx = stateRef.current.mx;
      const my = stateRef.current.my;
      const pointerActive = mx > -1000 && my > -1000;
      const horizon = 0.24 + (sectorIndex % 4) * 0.08;
      const tilt = -0.34 + (sectorIndex % 5) * 0.17;

      ctx.fillStyle = isWarping ? "rgba(1,1,3,0.2)" : "rgba(1,1,3,0.13)";
      ctx.fillRect(0, 0, width, height);

      for (const star of stars) {
        star.a += star.da;
        if (star.a > 1 || star.a < 0.05) star.da *= -1;
        ctx.beginPath();
        ctx.arc(star.x * width, star.y * height, star.r, 0, twoPi);
        ctx.fillStyle = `rgba(235,245,255,${star.a * 0.72})`;
        ctx.fill();
      }

      const cx = width * (0.5 + Math.sin(time * 0.06 + sectorIndex) * 0.08);
      const cy = height * horizon;
      const scale = Math.max(width, height);
      const haze = ctx.createRadialGradient(cx, cy, 0, cx, cy, scale * 0.82);
      haze.addColorStop(0, `rgba(${active.r},${active.g},${active.b},0.05)`);
      haze.addColorStop(0.28, "rgba(110,72,200,0.025)");
      haze.addColorStop(0.58, "rgba(22,80,140,0.012)");
      haze.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = haze;
      ctx.fillRect(0, 0, width, height);

      for (const shard of shards) {
        ctx.save();
        const sx = (shard.x + Math.sin(time * 0.03 + shard.phase) * 0.03) * width;
        const sy = (shard.y + Math.cos(time * 0.025 + shard.phase) * 0.02) * height;
        ctx.translate(sx, sy);
        ctx.rotate(shard.rot + tilt);
        ctx.beginPath();
        ctx.rect(-shard.size * 0.55, -0.5, shard.size, 1);
        ctx.fillStyle = `rgba(${active.r},${active.g},${active.b},${shard.alpha})`;
        ctx.fill();
        ctx.restore();
      }

      for (let i = 0; i < lanes.length; i += 1) {
        const lane = lanes[i];
        lane.z -= lane.speed * (isWarping ? 10 : 1.4);
        if (lane.z < 0) {
          lane.z = 1;
          lane.x = Math.random();
          lane.y = Math.random();
        }
        const depth = 1 - lane.z;
        const bend = Math.sin(lane.phase + time * 0.15) * 0.09 + (sectorIndex - 3) * 0.018;
        const x = (lane.x + bend * depth - 0.5) * width * (1 + depth * 1.8) + width * 0.5;
        const y = (lane.y - 0.5) * height * (1 + depth * 1.1) + height * 0.5;
        const len = lane.len * width * (isWarping ? 1.9 : 0.85) * (0.5 + depth);
        const alpha = (0.018 + depth * 0.18) * (isWarping ? 1.55 : 0.34);
        const repel = pointerActive ? Math.max(0, 1 - Math.hypot(x - mx, y - my) / 260) : 0;
        ctx.beginPath();
        ctx.moveTo(x - len * Math.cos(tilt), y - len * Math.sin(tilt));
        ctx.lineTo(x + (8 + repel * 60) * Math.cos(tilt), y + (8 + repel * 60) * Math.sin(tilt));
        ctx.strokeStyle = lane.lane % 5 === 0
          ? `rgba(${secondary.r},${secondary.g},${secondary.b},${alpha})`
          : `rgba(${active.r},${active.g},${active.b},${alpha})`;
        ctx.lineWidth = 0.55 + depth * 1.2 + repel * 1.8;
        ctx.stroke();
      }

      for (let i = 0; i < comets.length; i += 1) {
        const comet = comets[i];
        if (!comet.active) {
          comet.timer -= 1;
          if (comet.timer <= 0) {
            comets[i] = mkComet();
            comets[i].active = true;
            comets[i].opacity = 0.9;
          }
          continue;
        }
        comet.x += comet.speed * 1.15;
        comet.y += comet.speed * 0.18;
        comet.opacity -= 0.011;
        if (comet.opacity <= 0 || comet.x > 1.16 || comet.y > 1.05) {
          comets[i] = mkComet();
          continue;
        }
        const headX = comet.x * width;
        const headY = comet.y * height;
        const tailX = headX - comet.len;
        const tailY = headY - comet.len * 0.18;
        const gradient = ctx.createLinearGradient(tailX, tailY, headX, headY);
        gradient.addColorStop(0, "rgba(200,225,255,0)");
        gradient.addColorStop(0.62, `rgba(${active.r},${active.g},${active.b},${comet.opacity * 0.44})`);
        gradient.addColorStop(1, `rgba(255,255,255,${comet.opacity})`);
        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(headX, headY);
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      time += isWarping ? 0.06 : 0.01;
      if (!reducedMotion) raf = requestAnimationFrame(draw);
    };

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerleave", onPointerLeave);
    };
  }, []);

  return <canvas ref={canvasRef} className="signalCanvas" aria-hidden="true" />;
}

// Per-sector looping video backdrop. Opacity follows playback position so each
// loop fades in from black and back out before it wraps — the seam is invisible.
// A sector switch swaps the source, which restarts at t=0 and rides the same
// fade-in ramp. During warp travel the layer dips so the streak field reads.
function SectorVideoBackdrop({ activeSector, travel }) {
  const src = SECTOR_VIDEOS[activeSector.id] || SECTOR_VIDEOS.cockpit;
  const videoRef = useRef(null);
  const travelRef = useRef(travel.active);

  useEffect(() => {
    travelRef.current = travel.active;
  }, [travel.active]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;
    video.style.opacity = "0";
    let raf = 0;
    const step = () => {
      const duration = video.duration;
      if (Number.isFinite(duration) && duration > 0) {
        const t = video.currentTime;
        const ramp = Math.min(1, Math.min(t, duration - t) / SECTOR_VIDEO_LOOP_FADE_S);
        const dim = travelRef.current ? 0.3 : 1;
        video.style.opacity = String(Math.max(0, ramp) * SECTOR_VIDEO_MAX_OPACITY * dim);
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    video.play().catch(() => {});
    return () => cancelAnimationFrame(raf);
  }, [src]);

  return (
    <video
      key={src}
      ref={videoRef}
      className="sectorVideo"
      src={src}
      muted
      loop
      playsInline
      autoPlay
      preload="auto"
      aria-hidden="true"
    />
  );
}

function CameraRig({ sector, travel }) {
  const { camera } = useThree();
  const lookTarget = useRef(new THREE.Vector3(...sector.lookAt));
  const travelVectors = useRef({
    from: new THREE.Vector3(),
    mid: new THREE.Vector3(),
    to: new THREE.Vector3(),
    fromLook: new THREE.Vector3(),
    midLook: new THREE.Vector3(),
    toLook: new THREE.Vector3(),
    pos: new THREE.Vector3(),
    look: new THREE.Vector3(),
  });

  useEffect(() => {
    gsap.to(lookTarget.current, {
      x: sector.lookAt[0],
      y: sector.lookAt[1],
      z: sector.lookAt[2],
      duration: 1.55,
      ease: "power3.inOut",
    });
  }, [sector]);

  useFrame((_, delta) => {
    if (travel.active) {
      const fromSector = SECTORS.find((item) => item.id === travel.from) || sector;
      const toSector = SECTORS.find((item) => item.id === travel.to) || sector;
      const elapsed = performance.now() - (travel.startedAt || performance.now());
      const t = THREE.MathUtils.clamp(elapsed / (travel.duration || TRAVEL_DURATION_MS), 0, 1);
      const smooth = t * t * (3 - 2 * t);
      const vectors = travelVectors.current;
      vectors.from.set(...fromSector.camera);
      vectors.to.set(...toSector.camera);
      vectors.mid
        .copy(vectors.from)
        .lerp(vectors.to, 0.5)
        .add(new THREE.Vector3(0, 0.8 + Math.abs(toSector.position[1] - fromSector.position[1]) * 0.12, -15.5));
      vectors.fromLook.set(...fromSector.lookAt);
      vectors.toLook.set(...toSector.lookAt);
      vectors.midLook
        .copy(vectors.fromLook)
        .lerp(vectors.toLook, 0.5)
        .add(new THREE.Vector3(0, 0, -8));

      if (smooth < 0.5) {
        vectors.pos.copy(vectors.from).lerp(vectors.mid, smooth / 0.5);
        vectors.look.copy(vectors.fromLook).lerp(vectors.midLook, smooth / 0.5);
      } else {
        vectors.pos.copy(vectors.mid).lerp(vectors.to, (smooth - 0.5) / 0.5);
        vectors.look.copy(vectors.midLook).lerp(vectors.toLook, (smooth - 0.5) / 0.5);
      }

      camera.position.lerp(vectors.pos, 0.18);
      lookTarget.current.lerp(vectors.look, 0.16);
      easing.damp(camera, "fov", 78 - Math.abs(t - 0.5) * 42, 0.32, delta);
      camera.updateProjectionMatrix();
      camera.lookAt(lookTarget.current);
      return;
    }
    easing.damp3(camera.position, sector.camera, 0.58, delta);
    easing.damp(camera, "fov", travel.active ? 64 : 48, 0.42, delta);
    camera.updateProjectionMatrix();
    camera.lookAt(lookTarget.current);
  });

  return null;
}

function SectorAura({ activeSector, travel }) {
  const group = useRef();
  const target = useMemo(() => new THREE.Vector3(...activeSector.position), [activeSector]);
  const scaleTarget = useMemo(() => new THREE.Vector3(1, 1, 1), []);

  useFrame((_, delta) => {
    if (!group.current) return;
    easing.damp3(group.current.position, target, 0.5, delta);
    group.current.rotation.y += delta * (travel.active ? 0.55 : 0.12);
    group.current.rotation.z -= delta * (travel.active ? 0.24 : 0.04);
    const scale = travel.active ? 1.35 : 1;
    scaleTarget.setScalar(scale);
    group.current.scale.lerp(scaleTarget, 0.04);
  });

  return (
    <group ref={group} position={activeSector.position}>
      <mesh>
        <torusGeometry args={[3.2, 0.018, 8, 180]} />
        <meshBasicMaterial color={activeSector.accent} transparent opacity={travel.active ? 0.32 : 0.18} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[4.35, 0.01, 8, 180]} />
        <meshBasicMaterial color={activeSector.accent} transparent opacity={travel.active ? 0.2 : 0.09} />
      </mesh>
      <mesh rotation={[0.8, 0.5, 0.2]}>
        <torusGeometry args={[5.25, 0.006, 8, 180]} />
        <meshBasicMaterial color="#eaf6ff" transparent opacity={travel.active ? 0.1 : 0.045} />
      </mesh>
    </group>
  );
}

function StarRiver({ activeSector }) {
  const points = useRef();
  const positions = useMemo(() => {
    const arr = new Float32Array(1150 * 3);
    for (let i = 0; i < 1150; i += 1) {
      const radius = 9 + seededUnit(i + 1) * 26;
      const angle = seededUnit(i + 101) * Math.PI * 2;
      arr[i * 3] = Math.cos(angle) * radius;
      arr[i * 3 + 1] = (seededUnit(i + 201) - 0.5) * 18;
      arr[i * 3 + 2] = Math.sin(angle) * radius - 8 - seededUnit(i + 301) * 16;
    }
    return arr;
  }, []);

  useFrame((_, delta) => {
    if (!points.current) return;
    points.current.rotation.y += delta * 0.012;
    points.current.rotation.x = THREE.MathUtils.lerp(points.current.rotation.x, activeSector.position[1] * 0.008, 0.02);
  });

  return (
    <Points ref={points} positions={positions} stride={3} frustumCulled={false}>
      <PointMaterial transparent color={activeSector.accent} size={0.03} sizeAttenuation depthWrite={false} opacity={0.28} />
    </Points>
  );
}

function CoreCitadel({ sector }) {
  const group = useRef();
  useFrame((_, delta) => {
    if (!group.current) return;
    group.current.rotation.y += delta * 0.16;
    group.current.rotation.x = THREE.MathUtils.lerp(group.current.rotation.x, sector.id === "cockpit" ? 0.12 : -0.08, 0.02);
  });

  return (
    <group ref={group} position={[0, 0, 0]}>
      <Float speed={1.2} rotationIntensity={0.12} floatIntensity={0.35}>
        <mesh>
          <boxGeometry args={[1.55, 1.55, 1.55, 5, 5, 5]} />
          <meshStandardMaterial color="#040d16" emissive={sector.accent} emissiveIntensity={0.42} roughness={0.2} metalness={0.55} transparent opacity={0.84} />
        </mesh>
        <mesh scale={[2.8, 2.8, 2.8]}>
          <octahedronGeometry args={[1, 1]} />
          <meshBasicMaterial color={sector.accent} wireframe transparent opacity={0.22} />
        </mesh>
      </Float>
    </group>
  );
}

function OrbitalAispm() {
  const group = useRef();
  const nodes = useMemo(() => Array.from({ length: 34 }, (_, i) => ({
    angle: (i / 34) * Math.PI * 2,
    ring: i % 4,
    size: 0.045 + seededUnit(i + 401) * 0.045,
  })), []);

  useFrame((_, delta) => {
    if (group.current) group.current.rotation.y += delta * 0.18;
  });

  return (
    <group ref={group} position={[-7.4, 2.1, -6]}>
      {[1.1, 1.7, 2.25, 2.85].map((r, i) => (
        <mesh key={r} rotation={[Math.PI / 2.5, i * 0.5, i * 0.14]}>
          <torusGeometry args={[r, 0.008, 8, 160]} />
          <meshBasicMaterial color={ACCENT} transparent opacity={0.42 - i * 0.055} />
        </mesh>
      ))}
      {nodes.map((node, i) => {
        const r = 1.15 + node.ring * 0.54;
        return (
          <Float key={i} speed={1 + node.ring * 0.3} floatIntensity={0.18}>
            <mesh position={[Math.cos(node.angle) * r, Math.sin(node.angle * 1.7) * 0.42, Math.sin(node.angle) * r]}>
              <sphereGeometry args={[node.size, 12, 12]} />
              <meshStandardMaterial color={i % 7 === 0 ? ALERT : ACCENT} emissive={i % 7 === 0 ? ALERT : ACCENT} emissiveIntensity={0.8} />
            </mesh>
          </Float>
        );
      })}
    </group>
  );
}

function IdentityGalaxy() {
  const group = useRef();
  const clusters = useMemo(() => Array.from({ length: 42 }, (_, i) => {
    const arm = i % 3;
    const t = i / 42;
    const angle = t * Math.PI * 5 + arm * 2.1;
    const radius = 0.35 + t * 2.8;
    return [Math.cos(angle) * radius, (seededUnit(i + 501) - 0.5) * 0.8, Math.sin(angle) * radius];
  }), []);

  useFrame((_, delta) => {
    if (group.current) group.current.rotation.y -= delta * 0.12;
  });

  return (
    <group ref={group} position={[7.2, 2.4, -5.3]}>
      {clusters.map((pos, i) => (
        <mesh key={i} position={pos}>
          <sphereGeometry args={[i % 11 === 0 ? 0.085 : 0.045, 12, 12]} />
          <meshStandardMaterial color={i % 11 === 0 ? ICE : ACCENT} emissive={i % 11 === 0 ? ICE : ACCENT} emissiveIntensity={0.75} />
        </mesh>
      ))}
      <Line points={clusters.filter((_, i) => i % 3 === 0)} color={ACCENT} transparent opacity={0.38} lineWidth={1} />
      <Line points={clusters.filter((_, i) => i % 5 === 0)} color={ALERT} transparent opacity={0.22} lineWidth={1} />
    </group>
  );
}

function NetworkMembrane({ active }) {
  const mesh = useRef();
  const noise = useMemo(() => createNoise3D(), []);
  const frame = useRef(0);

  useFrame(({ clock }) => {
    if (!mesh.current) return;
    frame.current += 1;
    if (!active && frame.current % 4 !== 0) {
      mesh.current.rotation.z += 0.0015;
      return;
    }
    const positions = mesh.current.geometry.attributes.position;
    const time = clock.elapsedTime * 0.42;
    for (let i = 0; i < positions.count; i += 1) {
      const x = positions.getX(i);
      const y = positions.getY(i);
      positions.setZ(i, noise(x * 0.32, y * 0.32, time) * 0.42);
    }
    positions.needsUpdate = true;
    mesh.current.rotation.z += 0.0015;
  });

  return (
    <group position={[-5.8, -2.6, -9.2]} rotation={[-Math.PI / 2.8, 0.2, -0.16]}>
      <mesh ref={mesh}>
        <planeGeometry args={[5.8, 5.8, 56, 56]} />
        <meshStandardMaterial color="#04141f" emissive={ACCENT} emissiveIntensity={0.4} wireframe transparent opacity={0.66} />
      </mesh>
    </group>
  );
}

function AutonomyLadder() {
  return (
    <group position={[0, 5.8, -11]}>
      {["APPROVAL", "ASSISTED", "AUTO", "FULL AUTO"].map((label, i) => (
        <Float key={label} speed={1.1 + i * 0.12} floatIntensity={0.12}>
          <group position={[0, i * 0.58 - 0.9, 0]}>
            <mesh>
              <boxGeometry args={[2 + i * 0.55, 0.06, 0.72]} />
              <meshStandardMaterial color="#04101a" emissive={i === 3 ? ALERT : ACCENT} emissiveIntensity={0.3 + i * 0.12} metalness={0.5} roughness={0.2} />
            </mesh>
            <Text position={[0, 0.13, 0.4]} fontSize={0.12} letterSpacing={0.18} anchorX="center" color={ICE}>
              {label}
            </Text>
          </group>
        </Float>
      ))}
      <Line points={[[-1.55, -1.25, 0], [-2.65, 1.35, 0]]} color={ACCENT} transparent opacity={0.5} />
      <Line points={[[1.55, -1.25, 0], [2.65, 1.35, 0]]} color={ACCENT} transparent opacity={0.5} />
    </group>
  );
}

function DemoRibbon() {
  const group = useRef();
  const points = useMemo(() => Array.from({ length: 90 }, (_, i) => {
    const t = i / 89;
    return new THREE.Vector3(Math.sin(t * Math.PI * 4) * 1.6, Math.cos(t * Math.PI * 2) * 0.55, (t - 0.5) * 4.4);
  }), []);

  useFrame((_, delta) => {
    if (group.current) group.current.rotation.y += delta * 0.13;
  });

  return (
    <group ref={group} position={[6, -2.8, -9.6]}>
      <Line points={points} color={ACCENT} lineWidth={2} transparent opacity={0.7} />
      {points.filter((_, i) => i % 15 === 0).map((point, i) => (
        <Trail key={i} width={0.45} length={4} color={ACCENT} attenuation={(t) => t * t}>
          <mesh position={point}>
            <sphereGeometry args={[0.08, 16, 16]} />
            <meshBasicMaterial color={i === 2 ? ALERT : ACCENT} />
          </mesh>
        </Trail>
      ))}
    </group>
  );
}

function TrialDock() {
  const group = useRef();
  useFrame((_, delta) => {
    if (group.current) group.current.rotation.y += delta * 0.08;
  });

  return (
    <group ref={group} position={[0, -5.1, -7.4]}>
      <mesh>
        <cylinderGeometry args={[1.9, 2.35, 0.45, 7, 1, false]} />
        <meshStandardMaterial color="#0a0510" emissive={ALERT} emissiveIntensity={0.38} metalness={0.64} roughness={0.18} transparent opacity={0.9} />
      </mesh>
      <mesh position={[0, 0.55, 0]}>
        <torusGeometry args={[2.55, 0.025, 8, 120]} />
        <meshBasicMaterial color={ALERT} transparent opacity={0.6} />
      </mesh>
    </group>
  );
}

function InvestmentAscent() {
  const group = useRef();
  const COUNT = 64;
  // A spiral that tapers inward as it climbs — an ascending spire of value.
  const helix = useMemo(() => Array.from({ length: COUNT }, (_, i) => {
    const t = i / (COUNT - 1);
    const angle = t * Math.PI * 6.2;
    const radius = 1.8 * (1 - t * 0.72);
    const y = (t - 0.5) * 4.3;
    return new THREE.Vector3(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
  }), []);
  // Stacked tier-rings shrinking toward the top — the rising structure.
  const rings = useMemo(() => [-1.9, -0.95, 0, 0.95, 1.9].map((y) => {
    const t = (y + 2.15) / 4.3;
    return { y, r: 1.9 * (1 - t * 0.72) };
  }), []);

  useFrame((_, delta) => {
    if (group.current) group.current.rotation.y += delta * 0.1;
  });

  return (
    <group ref={group} position={[-6.4, 5.2, -9.5]}>
      <Line points={helix} color={GOLD} lineWidth={1.5} transparent opacity={0.55} />
      {helix.filter((_, i) => i % 2 === 0).map((p, i) => (
        <mesh key={i} position={p}>
          <sphereGeometry args={[i % 6 === 0 ? 0.07 : 0.04, 12, 12]} />
          <meshStandardMaterial color={i % 6 === 0 ? ICE : GOLD} emissive={i % 6 === 0 ? ICE : GOLD} emissiveIntensity={0.85} />
        </mesh>
      ))}
      {rings.map((ring, i) => (
        <Float key={i} speed={0.8 + i * 0.1} floatIntensity={0.1} rotationIntensity={0}>
          <mesh position={[0, ring.y, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[ring.r, 0.018, 8, 96]} />
            <meshBasicMaterial color={GOLD} transparent opacity={0.5} />
          </mesh>
        </Float>
      ))}
      <mesh position={[0, 2.3, 0]}>
        <sphereGeometry args={[0.14, 20, 20]} />
        <meshStandardMaterial color={ICE} emissive={GOLD} emissiveIntensity={1.4} />
      </mesh>
      <mesh position={[0, -2.25, 0]}>
        <cylinderGeometry args={[1.95, 2.2, 0.14, 6, 1, false]} />
        <meshStandardMaterial color="#100a02" emissive={GOLD} emissiveIntensity={0.32} metalness={0.6} roughness={0.25} transparent opacity={0.9} />
      </mesh>
    </group>
  );
}

function TravelPath({ activeSector }) {
  const path = useMemo(() => SECTORS.map((sector) => new THREE.Vector3(...sector.position)), []);
  return (
    <>
      <Line points={path} color={activeSector.accent} transparent opacity={0.04} lineWidth={1} />
      {SECTORS.map((sector) => (
        <mesh key={sector.id} position={sector.position}>
          <sphereGeometry args={[sector.id === activeSector.id ? 0.16 : 0.08, 16, 16]} />
          <meshBasicMaterial color={sector.accent} transparent opacity={sector.id === activeSector.id ? 0.62 : 0.12} />
        </mesh>
      ))}
    </>
  );
}

function DestinationGalaxy({ activeSector, travel }) {
  const group = useRef();
  const index = Math.max(0, SECTORS.findIndex((sector) => sector.id === activeSector.id));
  const { inner, outer, threads } = useMemo(() => {
    const innerPoints = new Float32Array(520 * 3);
    const outerPoints = new Float32Array(260 * 3);
    const threadLines = [];
    const mode = index % 7;

    for (let i = 0; i < 520; i += 1) {
      const t = i / 520;
      const angle = t * Math.PI * (mode === 2 ? 9 : mode === 4 ? 3.6 : 6.4) + seededUnit(i + index * 901) * 0.7;
      const radius = mode === 3
        ? 0.75 + seededUnit(i + 33) * 4.4
        : 0.25 + Math.pow(seededUnit(i + 61), 0.62) * (mode === 6 ? 2.8 : 3.7);
      const vertical = mode === 4
        ? (t - 0.5) * 4.8
        : (seededUnit(i + 121) - 0.5) * (mode === 3 ? 0.34 : 1.35);
      const squash = mode === 3 ? 0.18 : mode === 6 ? 0.55 : 0.78;
      innerPoints[i * 3] = Math.cos(angle) * radius;
      innerPoints[i * 3 + 1] = vertical;
      innerPoints[i * 3 + 2] = Math.sin(angle) * radius * squash;
    }

    for (let i = 0; i < 260; i += 1) {
      const angle = seededUnit(i + 811 + index * 17) * Math.PI * 2;
      const radius = 4.5 + seededUnit(i + 911) * 7.5;
      outerPoints[i * 3] = Math.cos(angle) * radius;
      outerPoints[i * 3 + 1] = (seededUnit(i + 1011) - 0.5) * 7.4;
      outerPoints[i * 3 + 2] = Math.sin(angle) * radius - 1.8;
    }

    for (let i = 0; i < 6; i += 1) {
      const start = new THREE.Vector3(
        (seededUnit(i + 1311) - 0.5) * 6,
        (seededUnit(i + 1411) - 0.5) * 3,
        (seededUnit(i + 1511) - 0.5) * 4,
      );
      const end = start.clone().multiplyScalar(0.22);
      threadLines.push([start, end]);
    }

    return { inner: innerPoints, outer: outerPoints, threads: threadLines };
  }, [index]);

  useFrame((_, delta) => {
    if (!group.current) return;
    group.current.rotation.y += delta * (travel.active ? 0.6 : 0.075 + index * 0.006);
    group.current.rotation.x = THREE.MathUtils.lerp(group.current.rotation.x, Math.sin(index) * 0.18, 0.025);
    const scale = travel.active ? 1.42 : 1;
    group.current.scale.lerp(new THREE.Vector3(scale, scale, scale), 0.045);
  });

  return (
    <group ref={group} position={activeSector.position}>
      <Points positions={outer} stride={3} frustumCulled={false}>
        <PointMaterial transparent color={activeSector.secondary || ACCENT_SOFT} size={0.022} sizeAttenuation depthWrite={false} opacity={travel.active ? 0.18 : 0.08} />
      </Points>
      <Points positions={inner} stride={3} frustumCulled={false}>
        <PointMaterial transparent color={activeSector.accent} size={0.042} sizeAttenuation depthWrite={false} opacity={travel.active ? 0.68 : 0.36} />
      </Points>
      {threads.map((points, i) => (
        <Line key={i} points={points} color={i % 3 === 0 ? activeSector.secondary : activeSector.accent} transparent opacity={travel.active ? 0.22 : 0.1} lineWidth={1} />
      ))}
      <mesh rotation={[Math.PI / 2.5, 0, index * 0.31]}>
        <torusGeometry args={[4.15, 0.012, 8, 220]} />
        <meshBasicMaterial color={activeSector.accent} transparent opacity={travel.active ? 0.3 : 0.1} />
      </mesh>
      <mesh rotation={[0.4 + index * 0.13, 0.5, -0.2]}>
        <torusGeometry args={[5.55, 0.007, 8, 220]} />
        <meshBasicMaterial color={activeSector.secondary || "#a78bfa"} transparent opacity={travel.active ? 0.18 : 0.055} />
      </mesh>
    </group>
  );
}

function WarpTunnel({ activeSector, travel }) {
  const group = useRef();
  const streaks = useMemo(() => Array.from({ length: 118 }, (_, i) => {
    const angle = seededUnit(i + 1701) * Math.PI * 2;
    const radius = 1.4 + seededUnit(i + 1801) * 6.6;
    const z = -8 - seededUnit(i + 1901) * 14;
    const start = new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius * 0.65, z);
    const end = start.clone().multiplyScalar(0.24);
    end.z += 8 + seededUnit(i + 2001) * 4;
    return [start, end];
  }), []);

  useFrame((_, delta) => {
    if (!group.current) return;
    group.current.rotation.z += delta * (travel.active ? 1.1 : 0.08);
  });

  return (
    <group ref={group} visible={travel.active}>
      {streaks.map((points, i) => (
        <Line key={i} points={points} color={i % 5 === 0 ? activeSector.secondary : activeSector.accent} transparent opacity={0.4} lineWidth={i % 7 === 0 ? 1.6 : 0.8} />
      ))}
    </group>
  );
}

function ProductProofScreens({ activeSector }) {
  const textures = useTexture([
    "/landing/media/threat-overview.jpg",
    "/landing/media/ai-spm.jpg",
    "/landing/media/command-state.jpg",
  ]);
  const visible = activeSector.id === "demo" || activeSector.id === "aispm" || activeSector.id === "cockpit";

  return (
    <group position={[6, -1.85, -8.7]} rotation={[0.02, -0.72, 0.03]} visible={visible}>
      {textures.map((texture, i) => (
        <Float key={texture.uuid} speed={0.85 + i * 0.13} floatIntensity={0.16} rotationIntensity={0.06}>
          <group position={[(i - 1) * 1.55, i === 1 ? 0.35 : -0.1, -i * 0.28]} rotation={[0, (i - 1) * -0.16, 0]}>
            <mesh>
              <planeGeometry args={[1.6, 0.9]} />
              <meshBasicMaterial map={texture} color="#eaf6ff" transparent opacity={0.52} toneMapped={false} />
            </mesh>
            <mesh position={[0, 0, -0.012]}>
              <planeGeometry args={[1.72, 1.02]} />
              <meshBasicMaterial color={activeSector.accent} transparent opacity={0.075} />
            </mesh>
          </group>
        </Float>
      ))}
    </group>
  );
}

function Scene({ activeSector, travel }) {
  return (
    <>
      <fog attach="fog" args={["#010104", 6, 27]} />
      <ambientLight intensity={0.1} />
      <pointLight position={[0, 2, 4]} color={ACCENT} intensity={2.6} distance={18} />
      <pointLight position={[-4, 4, -5]} color="#0c5d7a" intensity={1.5} distance={18} />
      <pointLight position={[4, -3, -7]} color="#eaf6ff" intensity={0.8} distance={18} />
      <pointLight position={activeSector.position} color={activeSector.accent} intensity={travel.active ? 7 : 4.8} distance={10} />
      <CameraRig sector={activeSector} travel={travel} />
      <StarRiver activeSector={activeSector} />
      <DestinationGalaxy activeSector={activeSector} travel={travel} />
      <WarpTunnel activeSector={activeSector} travel={travel} />
      {activeSector.id === "cockpit" && <CoreCitadel sector={activeSector} />}
      {activeSector.id === "aispm" && <OrbitalAispm />}
      {activeSector.id === "identity" && <IdentityGalaxy />}
      {activeSector.id === "network" && <NetworkMembrane active />}
      {activeSector.id === "autonomy" && <AutonomyLadder />}
      {activeSector.id === "demo" && <DemoRibbon />}
      {activeSector.id === "trial" && <TrialDock />}
      {activeSector.id === "invest" && <InvestmentAscent />}
      <ProductProofScreens activeSector={activeSector} />
      <TravelPath activeSector={activeSector} />
      <SectorAura activeSector={activeSector} travel={travel} />
      <EffectComposer disableNormalPass>
        <Bloom intensity={travel.active ? 1.6 : 1.0} luminanceThreshold={0.12} luminanceSmoothing={0.3} mipmapBlur />
        <DepthOfField focusDistance={0.018} focalLength={0.036} bokehScale={travel.active ? 3.1 : 2.35} />
        <ChromaticAberration offset={travel.active ? [0.0016, 0.001] : [0.0004, 0.0003]} />
        <Vignette eskil={false} offset={0.18} darkness={1.02} />
      </EffectComposer>
    </>
  );
}

export default function CinematicLanding() {
  const reducedMotionBoot = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [activeId, setActiveId] = useState("cockpit");
  const [navOpen, setNavOpen] = useState(false); // mobile sector menu (nav row is hidden < 1080px)
  const [soundOn, setSoundOn] = useState(true);
  const soundOnRef = useRef(true);
  const [audioState, setAudioState] = useState({ mode: "idle", label: "Audio ready", src: null });
  const [bootDone, setBootDone] = useState(reducedMotionBoot);
  const [bootProgress, setBootProgress] = useState(reducedMotionBoot ? 100 : 0);
  const [travel, setTravel] = useState({ active: false, verb: "arrive", from: "cockpit", to: "cockpit" });
  const [copyQuiet, setCopyQuiet] = useState(false);
  // The intro cinematic plays on every load by default. A visitor can opt out
  // of future intros via the in-intro prompt, which is the only thing that sets
  // the stored flag. The platform demo video is a separate option in the landing.
  const [siteIntro, setSiteIntro] = useState(() => {
    try {
      return window.localStorage.getItem("aria-intro-off") !== "1";
    } catch {
      return true;
    }
  });
  // After the cinematic video, newcomers land on a plain-language explainer of
  // what ARIA is before entering the command world. Shown in the same cases as
  // the video — a visitor who has opted out of intros skips both.
  const [siteBrief, setSiteBrief] = useState(false);
  const [demoFeature, setDemoFeature] = useState(false);
  const travelTimer = useRef(null);
  const arrivalTimer = useRef(null);
  const copyTimer = useRef(null);
  const firstArrival = useRef(true);
  const activeSector = SECTORS.find((sector) => sector.id === activeId) || SECTORS[0];

  const goToSector = useCallback((id, opts = {}) => {
    const sector = SECTORS.find((item) => item.id === id);
    if (!sector) return;
    setNavOpen(false);
    if (id === activeId) {
      setCopyQuiet(false);
      return;
    }
    if (travelTimer.current) window.clearTimeout(travelTimer.current);
    if (arrivalTimer.current) window.clearTimeout(arrivalTimer.current);
    setTravel({
      active: true,
      verb: sector.verb,
      from: activeId,
      to: id,
      startedAt: performance.now(),
      duration: TRAVEL_DURATION_MS,
    });
    setCopyQuiet(false);
    setActiveId(id);
    travelTimer.current = window.setTimeout(() => {
      setTravel((current) => ({ ...current, active: false }));
    }, TRAVEL_DURATION_MS);
    if (opts.playIntro !== false) {
      arrivalTimer.current = window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent("aria-sector-arrival", { detail: sector }));
      }, TRAVEL_DURATION_MS - 900);
    }
  }, [activeId]);

  const audio = useAudioController(setAudioState, goToSector);

  useEffect(() => {
    const onArrival = (event) => { if (soundOnRef.current) audio.playArrival(event.detail); };
    window.addEventListener("aria-sector-arrival", onArrival);
    return () => window.removeEventListener("aria-sector-arrival", onArrival);
  }, [audio]);

  // Master sound switch. Off → stop and suppress auto narration; on → resume
  // (and retry if the browser had blocked autoplay before a user gesture).
  const toggleSound = useCallback(() => {
    setSoundOn((on) => {
      const next = !on;
      soundOnRef.current = next;
      if (!next) audio.stop();
      else if (audioState.mode === "blocked") audio.retryBlocked();
      return next;
    });
  }, [audio, audioState.mode]);

  // Play demo: launch the self-navigating platform demo video, which drives its
  // own walkthrough. This is an option within the landing, not the site intro.
  const startDemo = useCallback(() => {
    audio.stop();
    setDemoFeature(true);
  }, [audio]);

  const handleIntroDone = useCallback(() => {
    setSiteIntro(false);
    setSiteBrief(true);
  }, []);

  const handleBriefEnter = useCallback(() => {
    setSiteBrief(false);
  }, []);

  // Only this opt-out persists — set when the visitor turns off future intros.
  const handleIntroDisableFuture = useCallback(() => {
    try {
      window.localStorage.setItem("aria-intro-off", "1");
    } catch {
      /* storage unavailable (private mode) — preference simply won't persist */
    }
  }, []);

  const handleDemoFeatureClose = useCallback(() => {
    setDemoFeature(false);
  }, []);

  useEffect(() => {
    if (reducedMotionBoot) return undefined;
    const duration = 2400;
    const start = performance.now();
    let raf = 0;
    let doneTimer = 0;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setBootProgress(Math.round(eased * 100));
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        doneTimer = window.setTimeout(() => setBootDone(true), 420);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(doneTimer);
    };
  }, [reducedMotionBoot]);

  useEffect(() => () => {
    if (travelTimer.current) window.clearTimeout(travelTimer.current);
    if (arrivalTimer.current) window.clearTimeout(arrivalTimer.current);
    if (copyTimer.current) window.clearTimeout(copyTimer.current);
  }, []);

  useEffect(() => {
    if (copyTimer.current) window.clearTimeout(copyTimer.current);
    const dwell = firstArrival.current ? 8200 : TRAVEL_DURATION_MS + 8800;
    firstArrival.current = false;
    copyTimer.current = window.setTimeout(() => setCopyQuiet(true), dwell);
    return () => {
      if (copyTimer.current) window.clearTimeout(copyTimer.current);
    };
  }, [activeId]);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "ArrowRight") {
        const index = SECTORS.findIndex((sector) => sector.id === activeId);
        goToSector(SECTORS[(index + 1) % SECTORS.length].id);
      }
      if (event.key === "ArrowLeft") {
        const index = SECTORS.findIndex((sector) => sector.id === activeId);
        goToSector(SECTORS[(index - 1 + SECTORS.length) % SECTORS.length].id);
      }
      if (event.key === "Escape") {
        setNavOpen(false);
        audio.stop();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeId, audio, goToSector]);

  return (
    <div className={`cinematicLanding ${travel.active ? "isTravelling" : ""} ${copyQuiet ? "isCopyQuiet" : ""}`} style={{ "--sector": activeSector.accent }}>
      {demoFeature && <DemoFeature onClose={handleDemoFeatureClose} />}
      {siteIntro && (
        <DemoCinematic onDone={handleIntroDone} onDisableFuture={handleIntroDisableFuture} />
      )}
      {siteBrief && <SiteIntroBrief onEnter={handleBriefEnter} />}
      <div className={`cinematicBoot ${bootDone ? "isDone" : ""}`} aria-hidden={bootDone}>
        <div className="bootGlyph"><span /></div>
        <div className="bootCounter">
          <b>{String(bootProgress).padStart(3, "0")}</b>
          <span>%</span>
        </div>
        <div className="bootRail" aria-hidden="true">
          <span style={{ transform: `scaleX(${bootProgress / 100})` }} />
        </div>
        <div className="bootReadout">
          <b>ARIA</b>
          <span>{bootProgress < 100 ? "initialising sector travel" : "systems nominal"}</span>
        </div>
      </div>

      <SignalTransitBackdrop activeSector={activeSector} travel={travel} />
      <SectorVideoBackdrop activeSector={activeSector} travel={travel} />
      <Canvas
        camera={{ position: [0, 1.55, 9.2], fov: 48 }}
        dpr={[1, 1.8]}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}
      >
        <Suspense fallback={null}>
          <Scene activeSector={activeSector} travel={travel} />
        </Suspense>
      </Canvas>

      <div className="cosmicWash" aria-hidden="true" />
      <div className="filmGrain" aria-hidden="true" />
      <div className="letterbox letterboxTop" aria-hidden="true" />
      <div className="letterbox letterboxBottom" aria-hidden="true" />
      <div className="warpCurtain" aria-hidden="true">
        <span>{travel.verb}</span>
      </div>
      <div key={`arrival-${activeSector.id}`} className="arrivalMark" aria-hidden="true">
        <span>{activeSector.label}</span>
      </div>

      <header className="landingTop">
        <button className="brandLockup" type="button" onClick={() => goToSector("cockpit")} aria-label="Return to ARIA cockpit">
          <span className="brandSigil" aria-hidden="true">
            <video className="brandMotion" autoPlay muted loop playsInline preload="metadata">
              {/* Alpha sources: HEVC for Safari, VP9 for Chrome/FF/Edge. Transparent background. */}
              <source src="/landing/media/aria-logo-alpha.mov" type='video/mp4; codecs="hvc1"' />
              <source src="/landing/media/aria-logo-alpha.webm" type="video/webm" />
              <source src="/landing/media/aria-logo-motion.mp4" type="video/mp4" />
            </video>
          </span>
        </button>
        <nav className="wordNav" aria-label="Sectors">
          {SECTORS.map((sector) => (
            <button key={sector.id} type="button" onClick={() => goToSector(sector.id)} aria-current={sector.id === activeId ? "page" : undefined}>
              {sector.label}
            </button>
          ))}
        </nav>
        <div className="topActions">
          <button
            type="button"
            className={`soundSwitch ${soundOn ? "isOn" : ""}`}
            role="switch"
            aria-checked={soundOn}
            onClick={toggleSound}
          >
            <span className="soundSwitchLabel">Sound</span>
            <span className="soundSwitchTrack" aria-hidden="true"><span className="soundSwitchKnob" /></span>
          </button>
          <button
            type="button"
            className="navToggle"
            aria-label="Open sector menu"
            aria-expanded={navOpen}
            onClick={() => setNavOpen((open) => !open)}
          >
            <span aria-hidden="true" /><span aria-hidden="true" /><span aria-hidden="true" />
          </button>
        </div>
      </header>

      <main key={`copy-${activeSector.id}`} className="landingCopy" aria-live="polite" onPointerEnter={() => setCopyQuiet(false)}>
        <div className="sectorMeta">
          <span>{String(SECTORS.findIndex((sector) => sector.id === activeId) + 1).padStart(2, "0")}</span>
          <span>{activeSector.verb} travel</span>
        </div>
        <h1>
          {activeSector.title.split(" ").map((word, i) => (
            <span className="revealWord" key={`${activeSector.id}-${i}`} style={{ "--i": i }}>
              {word}
            </span>
          ))}
        </h1>
        <p>{activeSector.body}</p>
        {activeId !== "trial" && (
          <div className="landingActions">
            <button type="button" onClick={() => { soundOnRef.current = true; setSoundOn(true); audio.playDeepDive(activeSector); }}>Hear ARIA explain</button>
            <button type="button" onClick={startDemo}>Play demo</button>
            <button type="button" onClick={() => goToSector("trial")}>Request trial</button>
          </div>
        )}
      </main>

      {activeId === "trial" && <TrialForm />}
      {activeId === "invest" && <InvestorForm />}

      <button className="briefRecall" type="button" onClick={() => {
        setCopyQuiet(false);
        if (copyTimer.current) window.clearTimeout(copyTimer.current);
        copyTimer.current = window.setTimeout(() => setCopyQuiet(true), 6200);
      }}>
        Read brief
      </button>

      {activeId !== "trial" && (
        <section className="sectorTelemetry" aria-label={`${activeSector.label} telemetry`}>
          {activeSector.stats.map(([label, value]) => (
            <div key={label}>
              <span>{label}</span>
              <b>{value}</b>
            </div>
          ))}
        </section>
      )}

      <footer className="landingBottom">
        <button type="button" onClick={() => {
          const index = SECTORS.findIndex((sector) => sector.id === activeId);
          goToSector(SECTORS[(index - 1 + SECTORS.length) % SECTORS.length].id);
        }}>Prev</button>
        <div className="progressGroup">
          <span className="pageCount" aria-live="polite">
            <b>{String(SECTORS.findIndex((sector) => sector.id === activeId) + 1).padStart(2, "0")}</b>
            <i>/</i>
            {String(SECTORS.length).padStart(2, "0")}
            <em>{activeSector.label}</em>
          </span>
          <div className="progressRail">
            <span style={{ width: `${((SECTORS.findIndex((sector) => sector.id === activeId) + 1) / SECTORS.length) * 100}%` }} />
          </div>
        </div>
        <button type="button" onClick={() => {
          const index = SECTORS.findIndex((sector) => sector.id === activeId);
          goToSector(SECTORS[(index + 1) % SECTORS.length].id);
        }}>Next</button>
      </footer>

      <aside className={`voiceCaption ${audioState.mode !== "idle" ? "isActive" : ""}`} aria-live="polite">
        <span />
        <b>{audioState.label}</b>
      </aside>

      {navOpen && (
        <div className="navSheet" role="dialog" aria-modal="true" aria-label="Sectors" onClick={() => setNavOpen(false)}>
          <nav className="navSheetPanel" onClick={(event) => event.stopPropagation()}>
            <div className="navSheetHead">
              <span>Navigate</span>
              <button type="button" className="navSheetClose" aria-label="Close menu" onClick={() => setNavOpen(false)}>✕</button>
            </div>
            {SECTORS.map((sector, i) => (
              <button
                key={sector.id}
                type="button"
                className={sector.id === activeId ? "isActive" : ""}
                onClick={() => goToSector(sector.id)}
              >
                <b>{String(i + 1).padStart(2, "0")}</b>
                <span>{sector.label}</span>
                <small>{sector.verb}</small>
              </button>
            ))}
          </nav>
        </div>
      )}
    </div>
  );
}

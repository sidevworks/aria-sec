// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

// ════════════════════════════════════════════════════════════════════════
// PANEL 02 · PARTICLE DIFFUSION THREAT HUB     maps to panel id "threat-vectors"
// Agent 2 · Particle Diffusion Architect
// ────────────────────────────────────────────────────────────────────────
// 9k GPU particles diffuse (calm) ↔ coalesce (threat). uCoalesce is driven by
// the LIVE threat-vector scores: the higher the top vector, the tighter the
// hostile core. HUD shows the real top vector label + score + average.
// ════════════════════════════════════════════════════════════════════════
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { postureFromVectors } from "./panelData.js";
import { HudDock } from "./HudOverlay.jsx";

const STYLE = { position: "absolute", inset: 0, width: "100%", height: "100%" };
const N = 9000;

const VERT = /* glsl */ `
  uniform float uTime; uniform float uCoalesce; uniform float uSize;
  attribute vec3 aHome; attribute float aSeed; varying float vGlow;
  void main(){
    float s = aSeed;
    vec3 dispersed = aHome * (1.0 + sin(uTime*1.2 + s*6.2831)*0.07);
    vec3 core = aHome*0.10 + vec3(sin(uTime*3.0+s*40.0), cos(uTime*2.7+s*31.0), sin(uTime*3.3+s*22.0))*0.18;
    vec3 pos = mix(dispersed, core, uCoalesce);
    vGlow = mix(0.35, 1.1, uCoalesce) + sin(uTime*4.0 + s*12.0)*0.15;
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * (300.0 / -mv.z) * (0.6 + s*0.8);
  }`;
const FRAG = /* glsl */ `
  precision highp float;
  uniform vec3 uColorA; uniform vec3 uColorB; uniform float uCoalesce; varying float vGlow;
  void main(){
    vec2 uv = gl_PointCoord - 0.5; float d = length(uv);
    if (d > 0.5) discard;
    float a = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(mix(uColorA, uColorB, uCoalesce) * vGlow, a * 0.9);
  }`;

export default function ParticleDiffusionHub({ vectors = [] }) {
  const mountRef = useRef(null);
  const { state, intensity, avg, max, top } = postureFromVectors(vectors);

  const target = useRef(0);
  useEffect(() => {
    target.current = Math.max(0, Math.min(0.95, (max ?? intensity * 100) / 100));
  }, [max, intensity]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
    camera.position.z = 7;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setClearColor(0x030307, 1);
    mount.appendChild(renderer.domElement);

    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(N * 3);
    const home = new Float32Array(N * 3);
    const seed = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      const r = 3.0 + Math.random() * 1.8;
      const x = r * Math.sin(ph) * Math.cos(th);
      const y = r * Math.sin(ph) * Math.sin(th);
      const z = r * Math.cos(ph);
      pos.set([x, y, z], i * 3);
      home.set([x, y, z], i * 3);
      seed[i] = Math.random();
    }
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aHome", new THREE.BufferAttribute(home, 3));
    geo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uCoalesce: { value: 0 },
        uSize: { value: 2.2 },
        uColorA: { value: new THREE.Color("#63f5ff") },
        uColorB: { value: new THREE.Color("#ff3d81") },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const points = new THREE.Points(geo, mat);
    scene.add(points);

    const resize = () => {
      const r = mount.getBoundingClientRect();
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(r.width, r.height, false);
      camera.aspect = (r.width || 1) / (r.height || 1);
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(mount);
    resize();

    let raf = 0;
    const start = performance.now();
    const loop = (now) => {
      const t = (now - start) / 1000;
      mat.uniforms.uTime.value = t;
      mat.uniforms.uCoalesce.value += (target.current - mat.uniforms.uCoalesce.value) * 0.04;
      points.rotation.y += 0.0009;
      points.rotation.x = Math.sin(t * 0.1) * 0.2;
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      geo.dispose();
      mat.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, []);

  const items = vectors
    .slice()
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, 6)
    .map((v) => `${v.label || "vector"} ${Math.round(v.score || 0)}`);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div ref={mountRef} style={STYLE} aria-label="Particle Diffusion Threat Hub" />
      <HudDock
        state={state}
        metrics={[
          { label: "Top vector", value: top ? Math.round(top.score || 0) : 0, accent: state === "breach" ? "#ff3d81" : undefined },
          { label: "Avg score", value: avg },
          { label: "Vectors", value: vectors.length },
        ]}
        items={items}
        emptyText="— no threat vectors —"
      />
    </div>
  );
}

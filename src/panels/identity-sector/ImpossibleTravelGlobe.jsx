// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

// ════════════════════════════════════════════════════════════════════════════
// ARIA-SEC · Impossible Travel Globe
// Three.js globe with arc pairs for impossible travel anomalies
// ════════════════════════════════════════════════════════════════════════════

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

// ─── Colour mapping (Three.js hex — CSS vars not supported in WebGL) ──────────
const VERDICT_COLOR = {
  impossible: 0xff3d81,   // var(--cx-breach) / --cx-flare
  suspicious: 0xffc857,   // var(--cx-amber)
  possible:   0x63f5ff,   // var(--cx-cyan)
};

const VERDICT_CSS = {
  impossible: "var(--cx-breach)",
  suspicious: "var(--cx-amber)",
  possible:   "var(--cx-cyan)",
};

// ─── Geo math ─────────────────────────────────────────────────────────────────
function latLngToVec3(lat, lng, r = 1) {
  const phi   = (90 - lat)  * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
     r * Math.cos(phi),
     r * Math.sin(phi) * Math.sin(theta)
  );
}

// ─── Arc geometry via QuadraticBezierCurve3 ───────────────────────────────────
function buildArcGeometry(pointA, pointB, apexR = 1.6, segments = 64) {
  const mid    = new THREE.Vector3().addVectors(pointA, pointB).multiplyScalar(0.5);
  const apex   = mid.clone().normalize().multiplyScalar(apexR);
  const curve  = new THREE.QuadraticBezierCurve3(pointA, apex, pointB);
  const points = curve.getPoints(segments);
  return new THREE.BufferGeometry().setFromPoints(points);
}

// ─── Marker sphere ────────────────────────────────────────────────────────────
function buildMarker(color) {
  const geo  = new THREE.SphereGeometry(0.035, 12, 12);
  const mat  = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 });
  return new THREE.Mesh(geo, mat);
}

// ─── HTML annotation position → screen coords ────────────────────────────────
function midpointWorld(vecA, vecB, apexR = 1.6) {
  const mid = new THREE.Vector3().addVectors(vecA, vecB).multiplyScalar(0.5);
  return mid.clone().normalize().multiplyScalar(apexR * 0.72);
}

function worldToScreen(worldVec, camera, width, height) {
  const ndc = worldVec.clone().project(camera);
  return {
    x: ((ndc.x + 1) / 2) * width,
    y: ((-ndc.y + 1) / 2) * height,
  };
}

export default function ImpossibleTravelGlobe({ events, width = 400, height = 300 }) {
  const canvasRef       = useRef(null);
  const sceneRef        = useRef(null);   // { renderer, camera, scene, animId }
  const [annotations, setAnnotations] = useState([]);

  const safeEvents = Array.isArray(events) && events.length > 0 ? events : [];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // ── Renderer ─────────────────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0);

    // ── Scene ─────────────────────────────────────────────────────────────────
    const scene  = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 0, 3.2);
    camera.lookAt(0, 0, 0);

    // ── Globe body ────────────────────────────────────────────────────────────
    const globeGeo  = new THREE.SphereGeometry(1, 48, 48);
    const globeMat  = new THREE.MeshBasicMaterial({
      color:       0x0d1b2a,
      transparent: true,
      opacity:     0.85,
    });
    const globeMesh = new THREE.Mesh(globeGeo, globeMat);
    scene.add(globeMesh);

    // ── Wireframe overlay ─────────────────────────────────────────────────────
    const wireMat  = new THREE.MeshBasicMaterial({
      color:       0x1e3a5f,
      wireframe:   true,
      transparent: true,
      opacity:     0.3,
    });
    const wireMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 32), wireMat);
    scene.add(wireMesh);

    // ── Event arcs + markers ──────────────────────────────────────────────────
    const annots = [];

    safeEvents.forEach((ev) => {
      const color  = VERDICT_COLOR[ev.verdict] ?? VERDICT_COLOR.suspicious;
      const vecA   = latLngToVec3(ev.eventA.lat, ev.eventA.lng, 1.01);
      const vecB   = latLngToVec3(ev.eventB.lat, ev.eventB.lng, 1.01);

      // Arc line
      const arcGeo  = buildArcGeometry(vecA, vecB);
      const arcMat  = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.85 });
      const arcLine = new THREE.Line(arcGeo, arcMat);
      scene.add(arcLine);

      // Markers
      const markerA = buildMarker(color);
      markerA.position.copy(vecA);
      scene.add(markerA);

      const markerB = buildMarker(color);
      markerB.position.copy(vecB);
      scene.add(markerB);

      // World position for annotation
      const midWorld = midpointWorld(vecA, vecB);
      annots.push({
        worldVec:  midWorld,
        label:     `${ev.distanceKm?.toLocaleString() ?? "?"}km / ${ev.timeDeltaMinutes ?? "?"}min`,
        verdict:   ev.verdict,
        userName:  ev.userName || "",
      });
    });

    // ── Animate ───────────────────────────────────────────────────────────────
    let animId;

    function animate() {
      animId = requestAnimationFrame(animate);
      globeMesh.rotation.y += 0.003;
      wireMesh.rotation.y  += 0.003;

      // Update annotation screen positions each frame
      if (annots.length > 0) {
        const next = annots.map(a => {
          // Rotate world vec to match globe rotation
          const rotated = a.worldVec.clone().applyEuler(
            new THREE.Euler(0, globeMesh.rotation.y, 0)
          );
          const screen = worldToScreen(rotated, camera, width, height);
          return { ...a, screen };
        });
        setAnnotations(next);
      }

      renderer.render(scene, camera);
    }

    animate();
    sceneRef.current = { renderer, animId };

    return () => {
      cancelAnimationFrame(animId);
      renderer.dispose();
      globeGeo.dispose();
      globeMat.dispose();
      wireMat.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height, JSON.stringify(safeEvents)]);

  return (
    <div style={{ position: "relative", width, height }}>
      <canvas
        ref={canvasRef}
        style={{ display: "block", width, height }}
      />

      {/* Empty state label */}
      {safeEvents.length === 0 && (
        <div style={emptyLabelStyle}>
          NO IMPOSSIBLE TRAVEL DETECTED
        </div>
      )}

      {/* Per-event HTML annotations */}
      {annotations.map((ann, i) => (
        <div
          key={i}
          style={{
            ...annotStyle,
            left:  ann.screen?.x ?? 0,
            top:   ann.screen?.y ?? 0,
            color: VERDICT_CSS[ann.verdict] ?? "var(--cx-cyan)",
            borderColor: VERDICT_CSS[ann.verdict] ?? "var(--cx-panel-line)",
          }}
        >
          <span style={{ fontWeight: 700 }}>{ann.verdict.toUpperCase()}</span>
          {" · "}
          {ann.label}
          {ann.userName && (
            <span style={{ color: "var(--cx-text-dim)", marginLeft: 4 }}>
              {ann.userName}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const emptyLabelStyle = {
  position:       "absolute",
  inset:          0,
  display:        "flex",
  alignItems:     "center",
  justifyContent: "center",
  fontSize:       10,
  fontFamily:     "ui-monospace, 'SF Mono', Menlo, monospace",
  fontWeight:     700,
  letterSpacing:  "0.18em",
  color:          "var(--cx-text-dim)",
  pointerEvents:  "none",
};

const annotStyle = {
  position:       "absolute",
  transform:      "translate(-50%, -50%)",
  fontSize:       9,
  fontFamily:     "ui-monospace, 'SF Mono', Menlo, monospace",
  letterSpacing:  "0.12em",
  whiteSpace:     "nowrap",
  padding:        "3px 7px",
  borderRadius:   3,
  border:         "1px solid",
  background:     "rgba(3,3,7,0.75)",
  pointerEvents:  "none",
};

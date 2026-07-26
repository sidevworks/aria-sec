// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

// ════════════════════════════════════════════════════════════════════════════
// galaxyLayout — pure math for positioning department galaxies
// computeGalaxyPositions(galaxies, width, height)
//   → Array<{ id, x, y, radius }>
// ════════════════════════════════════════════════════════════════════════════

const BASE_RADIUS   = 52;   // larger base so canvas galaxies fill nicely
const EXTRA_RADIUS  = 32;   // added proportional to risk: score/100 * 32
const CRIT_MULT     = 1.18; // riskScore >= 76 gets this size boost
const MIN_GAP       = 60;   // wide gap so spiral arms don't overlap
const MIN_LAYOUT_W  = 480;
const MIN_LAYOUT_H  = 420;
const PAD_X         = 90;
const PAD_TOP       = 90;
const PAD_BOTTOM    = 80;

/**
 * Compute the display radius for a galaxy.
 * @param {number} riskScore 0..100
 * @returns {number}
 */
export function galaxyRadius(riskScore) {
  const base = BASE_RADIUS + (riskScore / 100) * EXTRA_RADIUS;
  return riskScore >= 76 ? base * CRIT_MULT : base;
}

/**
 * Distribute galaxies around a centre in a spiral / multi-ring layout.
 * Falls back to equal-angle distribution if only a few galaxies.
 * Runs one pass of overlap-nudge to improve separation.
 *
 * @param {import("./identityContract.js").DepartmentGalaxy[]} galaxies
 * @param {number} width   canvas pixel width
 * @param {number} height  canvas pixel height
 * @returns {Array<{id: string, x: number, y: number, radius: number}>}
 */
export function computeGalaxyPositions(galaxies, width, height) {
  if (!galaxies || galaxies.length === 0) return [];

  const safeWidth  = Math.max(Number(width) || 0, MIN_LAYOUT_W);
  const safeHeight = Math.max(Number(height) || 0, MIN_LAYOUT_H);
  const plotLeft   = Math.min(PAD_X, safeWidth / 4);
  const plotRight  = safeWidth - plotLeft;
  const plotTop    = Math.min(PAD_TOP, safeHeight / 4);
  const plotBottom = safeHeight - Math.min(PAD_BOTTOM, safeHeight / 4);
  const plotWidth  = Math.max(1, plotRight - plotLeft);
  const plotHeight = Math.max(1, plotBottom - plotTop);
  const cx = plotLeft + plotWidth / 2;
  const cy = plotTop + plotHeight / 2;

  // Sort: critical first so they land closest to viewer-attention centre,
  // then by descending riskScore for visual dominance.
  const sorted = [...galaxies].sort((a, b) => b.riskScore - a.riskScore);

  if (sorted.length === 1) {
    const g = sorted[0];
    const radius = clampRadius(galaxyRadius(g.riskScore) * 1.16, plotWidth, plotHeight);
    return [{ id: g.id, x: cx, y: cy, radius }];
  }

  if (sorted.length === 2) {
    const radii = sorted.map((g) => clampRadius(galaxyRadius(g.riskScore), plotWidth, plotHeight));
    const spread = Math.min(plotWidth * 0.2, Math.max(90, radii[0] + radii[1] + MIN_GAP));
    const positions = sorted.map((g, index) => ({
      id: g.id,
      x: cx + (index === 0 ? -spread / 2 : spread / 2),
      y: cy,
      radius: radii[index],
    }));
    nudgeOverlaps(positions, safeWidth, safeHeight, 3);
    return positions;
  }

  // Assign ring + angle position
  // Ring 0 (centre): 1 galaxy
  // Ring 1: up to 6
  // Ring 2: up to 12
  // Ring 3+: overflow
  const RING_CAPACITY = [1, 5, 10, 16, 22];
  const RING_RADII    = [0, 0.38, 0.58, 0.74, 0.88]; // fraction of min(w/2, h/2)

  const minDim = Math.min(plotWidth, plotHeight);
  const positions = [];

  let ringIdx  = 0;
  let inRing   = 0;

  for (let i = 0; i < sorted.length; i++) {
    const g = sorted[i];
    const r = clampRadius(galaxyRadius(g.riskScore), plotWidth, plotHeight);

    // Advance ring if full
    while (ringIdx < RING_CAPACITY.length - 1 && inRing >= RING_CAPACITY[ringIdx]) {
      ringIdx++;
      inRing  = 0;
    }

    const ringBase = Math.max(0, minDim / 2 - 70);
    const ringR   = RING_RADII[Math.min(ringIdx, RING_RADII.length - 1)] * ringBase;
    const cap     = RING_CAPACITY[Math.min(ringIdx, RING_CAPACITY.length - 1)] || 1;
    const angleOffset = sorted.length === 2 ? 0 : -Math.PI / 2;
    const angle   = (2 * Math.PI * inRing) / cap + angleOffset;
    // Deterministic jitter based on id hash — stable across renders, no Math.random()
    const h = g.id.split("").reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 0);
    const jitterX = (((h & 0xff) / 255) - 0.5) * 16;
    const jitterY = ((((h >> 8) & 0xff) / 255) - 0.5) * 16;

    positions.push({
      id:     g.id,
      x:      cx + Math.cos(angle) * ringR + jitterX,
      y:      cy + Math.sin(angle) * ringR + jitterY,
      radius: r,
    });

    inRing++;
  }

  // Multiple repulsion nudge passes to reduce overlaps
  nudgeOverlaps(positions, safeWidth, safeHeight, 6);

  return positions;
}

function clampRadius(radius, plotWidth, plotHeight) {
  const maxRadius = Math.max(52, Math.min(plotWidth, plotHeight) * 0.24);
  return Math.min(radius, maxRadius);
}

/**
 * Iteratively push overlapping galaxies apart.
 * @param {Array<{id, x, y, radius}>} positions  mutated in-place
 * @param {number} width
 * @param {number} height
 * @param {number} iterations
 */
function nudgeOverlaps(positions, width, height, iterations) {
  const margin = 24; // keep away from canvas edges
  for (let iter = 0; iter < iterations; iter++) {
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const a = positions[i];
        const b = positions[j];
        const minDist = a.radius + b.radius + MIN_GAP;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
        if (dist < minDist) {
          const overlap = (minDist - dist) / 2;
          const nx = (dx / dist) * overlap;
          const ny = (dy / dist) * overlap;
          a.x -= nx;  a.y -= ny;
          b.x += nx;  b.y += ny;
        }
      }
    }
    // Clamp to canvas bounds
    for (const p of positions) {
      p.x = clampAxis(p.x, p.radius + margin, width  - p.radius - margin, width / 2);
      p.y = clampAxis(p.y, p.radius + margin, height - p.radius - margin, height / 2);
    }
  }
}

function clampAxis(value, min, max, fallback) {
  if (min > max) return fallback;
  return Math.max(min, Math.min(max, value));
}

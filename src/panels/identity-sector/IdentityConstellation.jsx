// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

// IdentityConstellation.jsx — sub-team cluster view within a department
// Groups users by derived sub-team, positions them in small circular clusters.
// Cosmos tokens only, no inline hex.

import { useMemo } from "react";
import IdentityNode from "./IdentityNode.jsx";

/** Derive a sub-team bucket from a user's name (first word, title-cased). */
function deriveSubTeam(user, index) {
  const first = user.name?.trim().split(/\s+/)[0];
  if (first && first.length > 1) return first;
  // Fallback: bucket by index groups of 4
  return `Team ${Math.floor(index / 4) + 1}`;
}

/** Partition an array into groups of up to maxSize. */
function chunkArray(arr, maxSize) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += maxSize) {
    chunks.push(arr.slice(i, i + maxSize));
  }
  return chunks;
}

/**
 * @param {{ users: import("./identityContract.js").IdentityNode[],
 *            width: number, height: number,
 *            onSelectUser: (user) => void,
 *            selectedUserId: string|null }} props
 */
export default function IdentityConstellation({
  users = [],
  width = 600,
  height = 480,
  onSelectUser,
  selectedUserId = null,
}) {
  // ── Group users by sub-team ──────────────────────────────────────────────────
  const clusters = useMemo(() => {
    if (!users.length) return [];

    // Build sub-team map
    const map = new Map();
    users.forEach((u, i) => {
      const team = deriveSubTeam(u, i);
      if (!map.has(team)) map.set(team, []);
      map.get(team).push(u);
    });

    // If a single cluster has > 5 members, break it into smaller groups
    const result = [];
    map.forEach((members, label) => {
      if (members.length <= 5) {
        result.push({ label, members });
      } else {
        chunkArray(members, 5).forEach((chunk, idx) => {
          result.push({ label: `${label} ${idx + 1}`, members: chunk });
        });
      }
    });
    return result;
  }, [users]);

  // ── Layout: arrange cluster centres on a large circle ───────────────────────
  const clusterPositions = useMemo(() => {
    if (!clusters.length) return [];
    const safeWidth = Math.max(Number(width) || 0, 360);
    const safeHeight = Math.max(Number(height) || 0, 320);
    const cx = safeWidth / 2;
    const cy = safeHeight / 2;
    const outerR = Math.max(0, Math.min(cx, cy) * 0.68);

    if (clusters.length === 1) {
      return [{ x: cx, y: cy }];
    }

    if (clusters.length === 2) {
      const spread = Math.min(safeWidth * 0.30, Math.max(160, outerR));
      return [
        { x: cx - spread / 2, y: cy },
        { x: cx + spread / 2, y: cy },
      ];
    }

    return clusters.map((_, i) => {
      const angle = (2 * Math.PI * i) / clusters.length - Math.PI / 2;
      return {
        x: cx + outerR * Math.cos(angle),
        y: cy + outerR * Math.sin(angle),
      };
    });
  }, [clusters, width, height]);

  // ── User positions within each cluster ──────────────────────────────────────
  const CLUSTER_R = 62; // radius of mini-circle within cluster

  function userPositions(memberCount) {
    return Array.from({ length: memberCount }, (_, i) => {
      if (memberCount === 1) return { dx: 0, dy: 0 };
      const angle = (2 * Math.PI * i) / memberCount - Math.PI / 2;
      return {
        dx: CLUSTER_R * Math.cos(angle),
        dy: CLUSTER_R * Math.sin(angle),
      };
    });
  }

  if (!users.length) {
    return (
      <svg width={width} height={height}>
        <text
          x={width / 2}
          y={height / 2}
          textAnchor="middle"
          fontSize="12"
          fontFamily='ui-monospace, "SF Mono", Menlo, monospace'
          fill="var(--cx-text-dim)"
        >
          No users or devices returned for this galaxy
        </text>
      </svg>
    );
  }

  return (
    <svg
      width={width}
      height={height}
      style={{ display: "block", background: "transparent" }}
      className="identity-constellation"
    >
      {clusters.map((cluster, ci) => {
        const { x: cxPos, y: cyPos } = clusterPositions[ci];
        const positions = userPositions(cluster.members.length);
        const enclosingR = cluster.members.length === 1 ? 22 : CLUSTER_R + 26;

        return (
          <g key={cluster.label} className="identity-cluster">
            {/* ── Enclosing cluster orbit ring ── */}
            <circle
              cx={cxPos}
              cy={cyPos}
              r={enclosingR + 8}
              fill="none"
              stroke="var(--cx-cyan)"
              strokeWidth="0.6"
              strokeOpacity="0.12"
              strokeDasharray="6 12"
            />

            {/* ── Connector lines between cluster members ── */}
            {cluster.members.length > 1 &&
              cluster.members.map((_, mi) => {
                const a = positions[mi];
                const b = positions[(mi + 1) % cluster.members.length];
                return (
                  <line
                    key={mi}
                    x1={cxPos + a.dx}
                    y1={cyPos + a.dy}
                    x2={cxPos + b.dx}
                    y2={cyPos + b.dy}
                    stroke="var(--cx-cyan)"
                    strokeWidth="0.6"
                    strokeOpacity="0.18"
                  />
                );
              })}

            {/* ── Cluster label (only for multi-member clusters) ── */}
            {cluster.members.length > 1 && (
              <text
                x={cxPos}
                y={cyPos + enclosingR + 14}
                textAnchor="middle"
                fontSize="9"
                fontFamily='ui-monospace, "SF Mono", Menlo, monospace'
                fill="var(--cx-text-dim)"
                style={{ letterSpacing: "0.12em", textTransform: "uppercase" }}
              >
                {cluster.label.toUpperCase()}
              </text>
            )}

            {/* ── Individual IdentityNode stars ── */}
            {cluster.members.map((user, mi) => {
              const { dx, dy } = positions[mi];
              return (
                <IdentityNode
                  key={user.id}
                  user={user}
                  x={cxPos + dx}
                  y={cyPos + dy}
                  selected={user.id === selectedUserId}
                  onClick={() => onSelectUser?.(user)}
                />
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}

// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

// ════════════════════════════════════════════════════════════════════════════
// IDENTITY SECTOR · IdentityRiskLeaderboard
// Top-5 highest-risk identities, live, each clickable.
// ════════════════════════════════════════════════════════════════════════════

import { useEffect, useState, useRef, useCallback } from "react";
import { ariaFetch } from "../ariaFetch.js";
import { RISK_BANDS, riskBand } from "./identityContract.js";

const POLL_INTERVAL_MS = 30_000;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function RankBadge({ rank, band }) {
  return (
    <span
      className="id-lb-rank"
      style={{
        color: RISK_BANDS[band].cssToken,
        border: `1px solid ${RISK_BANDS[band].cssToken}`,
      }}
    >
      {rank}
    </span>
  );
}

function RiskScoreBadge({ score, band }) {
  return (
    <span
      className="id-lb-score"
      style={{
        background: RISK_BANDS[band].cssToken,
        color: band === "nominal" ? "var(--cx-void)" : band === "critical" ? "var(--cx-void)" : "var(--cx-void)",
      }}
    >
      {score}
    </span>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function IdentityRiskLeaderboard({ onSelectUser }) {
  const [leaderboard, setLeaderboard] = useState([]);
  const [dataMode, setDataMode] = useState(null);
  const [error, setError] = useState(null);
  const timerRef = useRef(null);

  const fetchLeaderboard = useCallback(async () => {
    const result = await ariaFetch("GET", "/api/identity/leaderboard");
    if (result.error) {
      setError(result.error);
      return;
    }
    setError(null);
    setDataMode(result.data.dataMode);
    setLeaderboard(result.data.leaderboard ?? []);
  }, []);

  useEffect(() => {
    fetchLeaderboard();
    timerRef.current = setInterval(fetchLeaderboard, POLL_INTERVAL_MS);
    return () => clearInterval(timerRef.current);
  }, [fetchLeaderboard]);

  const sourceTag = dataMode === "live"
    ? <span className="id-lb-source-tag id-lb-source-live">[LIVE]</span>
    : dataMode === "sample"
    ? <span className="id-lb-source-tag id-lb-source-sample">[SAMPLE]</span>
    : null;

  return (
    <div className="cx-panel id-lb-panel">
      <div className="id-lb-header">
        <span className="cx-readout id-lb-title">TOP RISK IDENTITIES</span>
        {sourceTag}
        {dataMode === "sample" && (
          <span className="id-lb-sample-label">SAMPLE DATA</span>
        )}
      </div>

      {error && (
        <div className="id-lb-error cx-readout">
          FEED ERROR · {error}
        </div>
      )}

      {!error && leaderboard.length === 0 && (
        <div className="id-lb-empty cx-readout">ACQUIRING FEED…</div>
      )}

      <ol className="id-lb-list">
        {leaderboard.slice(0, 5).map((user, idx) => {
          const band = user.riskBand ?? riskBand(user.riskScore);
          const isTop = idx === 0;
          return (
            <li
              key={user.id}
              className={`id-lb-row${isTop ? " id-lb-row--top" : ""}`}
              onClick={() => onSelectUser?.(user)}
              data-identity-demo-name={user.name}
              title={`${user.name} — Risk ${user.riskScore}`}
            >
              <RankBadge rank={idx + 1} band={band} />

              {/* Avatar circle */}
              <span
                className="id-lb-avatar"
                style={{ background: RISK_BANDS[band].cssToken }}
              >
                {user.name?.[0]?.toUpperCase() ?? "?"}
              </span>

              {/* Identity info */}
              <span className="id-lb-identity">
                <span className="id-lb-name">{user.name}</span>
                <span className="id-lb-upn">{user.upn}</span>
              </span>

              {/* Admin crown */}
              {user.isAdmin && (
                <span className="id-lb-crown" aria-label="Admin">★</span>
              )}

              <RiskScoreBadge score={user.riskScore} band={band} />
            </li>
          );
        })}
      </ol>

      <style>{`
        .id-lb-panel {
          padding: 16px 18px 12px;
          min-width: 280px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .id-lb-header {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
          margin-bottom: 4px;
        }
        .id-lb-title {
          color: var(--cx-text-dim);
          flex: 1;
        }
        .id-lb-source-tag {
          font: 600 10px/1 ui-monospace, "SF Mono", Menlo, monospace;
          letter-spacing: 0.14em;
          padding: 2px 6px;
          border-radius: 4px;
        }
        .id-lb-source-live {
          color: var(--cx-cyan);
          border: 1px solid var(--cx-cyan);
        }
        .id-lb-source-sample {
          color: var(--cx-amber);
          border: 1px solid var(--cx-amber);
        }
        .id-lb-sample-label {
          font: 600 9px/1 ui-monospace, "SF Mono", Menlo, monospace;
          letter-spacing: 0.1em;
          color: var(--cx-amber);
          text-transform: uppercase;
          margin-left: auto;
        }
        .id-lb-error,
        .id-lb-empty {
          text-align: center;
          padding: 12px 0;
          opacity: 0.5;
        }
        .id-lb-list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .id-lb-row {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 10px;
          border-radius: 8px;
          cursor: pointer;
          transition: background var(--cx-dur-micro) var(--cx-ease-cosmic);
          font-size: 12px;
          color: var(--cx-text);
        }
        .id-lb-row:hover {
          background: var(--cx-panel-line);
        }
        .id-lb-row--top {
          font-size: 14px;
        }
        .id-lb-rank {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font: 700 10px/1 ui-monospace, "SF Mono", Menlo, monospace;
          flex-shrink: 0;
        }
        .id-lb-row--top .id-lb-rank {
          width: 24px;
          height: 24px;
          font-size: 12px;
        }
        .id-lb-avatar {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font: 700 12px/1 ui-monospace, "SF Mono", Menlo, monospace;
          color: var(--cx-void);
          flex-shrink: 0;
        }
        .id-lb-row--top .id-lb-avatar {
          width: 34px;
          height: 34px;
          font-size: 14px;
        }
        .id-lb-identity {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .id-lb-name {
          color: var(--cx-text);
          font-weight: 600;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .id-lb-upn {
          color: var(--cx-text-dim);
          font-size: 10px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .id-lb-crown {
          color: var(--cx-amber);
          font-size: 13px;
          flex-shrink: 0;
          line-height: 1;
        }
        .id-lb-score {
          font: 700 11px/1 ui-monospace, "SF Mono", Menlo, monospace;
          padding: 3px 7px;
          border-radius: 5px;
          flex-shrink: 0;
          color: var(--cx-void);
        }
        .id-lb-row--top .id-lb-score {
          font-size: 13px;
          padding: 4px 9px;
        }
      `}</style>
    </div>
  );
}

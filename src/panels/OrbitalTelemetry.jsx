// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

// ════════════════════════════════════════════════════════════════════════
// PANEL 04 · ORBITAL TELEMETRY RINGS          maps to panel id "ai-spm"
// Agent 4 · Orbital Ring & Celestial Cartographer
// ────────────────────────────────────────────────────────────────────────
// Multi-axis gyroscope of AI assets. Each ring is an asset class; the number
// of orbiting bodies = the REAL count from aiSpmSummary (assets / agents /
// secrets / criticals). Spin scales with exposure.
//
// Phase 2: clicking an asset opens a Remediation Modal that fetches blast
// radius + concrete artifacts (IAM policy / code diff / config), with an
// APPLY button that routes through the actionRunner (medium-tier approval).
// ════════════════════════════════════════════════════════════════════════
import { useEffect, useState } from "react";
import { CANVAS_STYLE, TAU, useCanvasAnimation } from "./useCanvasAnimation.js";
import { postureFromAiSpm } from "./panelData.js";
import { ariaFetch } from "./ariaFetch.js";

const ACCENT = { clean: 1, elevated: 1.6, breach: 2.6 };

const aiSpmActionErrorMessage = (error) => {
  if (error === "SESSION_EXPIRED") return "Authorization required. Re-authenticate Aria or reconnect the AI-SPM source, then retry remediation.";
  if (error === "PERMISSION_DENIED") return "Your current Aria role can view this finding but cannot apply remediation.";
  if (error === "UNAUTHORIZED") return "Authorization required. Re-authenticate Aria or reconnect the AI-SPM source, then retry remediation.";
  if (error === "FORBIDDEN") return "Your current Aria role can view this finding but cannot apply remediation.";
  if (error === "TIMEOUT") return "Remediation request timed out. The server may still be generating artifacts.";
  if (error === "NETWORK_ERROR") return "Aria could not reach the local function server.";
  return error || "Remediation request failed.";
};

// ── Remediation modal ────────────────────────────────────────────────────────
function RemediationModal({ findingId, onClose }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState(0);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState(null);

  useEffect(() => {
    let live = true;
    (async () => {
      const result = await ariaFetch("POST", `/api/ai-spm/case/${encodeURIComponent(findingId)}/remediate`, {});
      if (!live) return;
      if (result.error) {
        setError(aiSpmActionErrorMessage(result.error));
      } else {
        setData(result.data);
      }
      setLoading(false);
    })();
    return () => { live = false; };
  }, [findingId]);

  const apply = async () => {
    setApplying(true);
    const artifact = data.artifacts[activeTab];
    const result = await ariaFetch("POST", `/api/ai-spm/case/${encodeURIComponent(findingId)}/apply`, {
      artifact,
      findingTitle: data.finding?.title,
      approver: "operator",
    });
    setApplied(result.error
      ? { outcome: "failed", detail: aiSpmActionErrorMessage(result.error) }
      : result.data?.execution);
    setApplying(false);
  };

  const verify = async () => {
    setVerifying(true);
    const result = await ariaFetch("POST", `/api/ai-spm/case/${encodeURIComponent(findingId)}/verify`, {});
    setVerifyResult(result.error
      ? { status: "error", error: aiSpmActionErrorMessage(result.error) }
      : result.data);
    setVerifying(false);
  };

  const copy = () => {
    if (data?.artifacts?.[activeTab]) {
      navigator.clipboard?.writeText(data.artifacts[activeTab].body || "");
    }
  };

  const artifact = data?.artifacts?.[activeTab];

  return (
    <div onClick={onClose} style={{
      position: "absolute", inset: 0, zIndex: 20,
      display: "flex", alignItems: "stretch", justifyContent: "center",
      padding: 14,
      background: "rgba(3,3,7,0.86)", backdropFilter: "blur(4px)",
      boxSizing: "border-box",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "rgba(8,10,28,0.98)", borderRadius: 14,
        border: "1px solid rgba(45,212,191,0.35)", padding: 22,
        width: "min(900px, 100%)", maxHeight: "100%", minHeight: 0,
        display: "flex", flexDirection: "column", gap: 14, color: "rgba(234,247,255,0.95)",
        overflowY: "auto",
        scrollbarWidth: "thin",
        scrollbarColor: "rgba(45,212,191,0.45) transparent",
      }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div>
            <div style={{ fontSize: 10, letterSpacing: "0.18em", color: "#2dd4bf", textTransform:"uppercase" }}>AI-SPM Remediation</div>
            <div style={{ fontSize: 16, fontWeight: 700, marginTop: 4 }}>{data?.finding?.title || findingId}</div>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "1px solid rgba(234,247,255,0.2)", color: "#eaf7ff", padding: "4px 10px", borderRadius: 6, cursor: "pointer", fontSize: 11 }}>Close ✕</button>
        </div>

        {loading && <div style={{ color: "rgba(234,247,255,0.6)", padding: 24, textAlign: "center" }}>Generating remediation artifacts…</div>}
        {error   && <div style={{ color: "#ff3d81", padding: 24 }}>Error: {error}</div>}

        {data && (
          <>
            {/* Blast Radius summary */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
              {[
                { label: "Credentials", count: data.blastRadius?.credentialReach?.length || 0, items: data.blastRadius?.credentialReach },
                { label: "Data assets",  count: data.blastRadius?.dataReach?.length || 0,        items: data.blastRadius?.dataReach },
                { label: "Tool reach",   count: data.blastRadius?.toolReach?.length || 0,        items: (data.blastRadius?.toolReach||[]).map(t=>`${t.name}(${t.tier})`) },
                { label: "Egress",       count: data.blastRadius?.egressReach?.length || 0,      items: data.blastRadius?.egressReach },
              ].map(b => (
                <div key={b.label} style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(45,212,191,0.18)", background: "rgba(45,212,191,0.05)" }}>
                  <div style={{ fontSize: 8, color: "rgba(234,247,255,0.55)", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 4 }}>{b.label}</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: b.count ? "#2dd4bf" : "rgba(234,247,255,0.4)" }}>{b.count}</div>
                  <div style={{ fontSize: 9, color: "rgba(234,247,255,0.5)", lineHeight: 1.3, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {(b.items || []).slice(0, 3).join(", ") || "—"}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <div style={{ fontSize: 11, color: "rgba(234,247,255,0.6)" }}>Composite exposure:</div>
              <div style={{ flex: 1, height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 999, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${data.exposureScore}%`, background: data.exposureScore >= 70 ? "#ff3d81" : data.exposureScore >= 40 ? "#ffc857" : "#2dd4bf", borderRadius: 999 }} />
              </div>
              <div style={{ fontSize: 13, fontWeight: 800, color: data.exposureScore >= 70 ? "#ff3d81" : data.exposureScore >= 40 ? "#ffc857" : "#2dd4bf" }}>{data.exposureScore}/100</div>
            </div>

            {/* Tabs per artifact */}
            <div style={{ display:"flex", gap:6, borderBottom: "1px solid rgba(234,247,255,0.08)", paddingBottom: 4 }}>
              {data.artifacts.map((a, i) => (
                <button key={i} onClick={() => setActiveTab(i)} style={{
                  background: activeTab === i ? "rgba(45,212,191,0.16)" : "transparent",
                  border: activeTab === i ? "1px solid rgba(45,212,191,0.5)" : "1px solid rgba(234,247,255,0.12)",
                  color: activeTab === i ? "#2dd4bf" : "rgba(234,247,255,0.7)",
                  padding: "5px 11px", borderRadius: 6, fontSize: 10, cursor: "pointer", letterSpacing: "0.1em", textTransform: "uppercase",
                }}>
                  {a.type}
                </button>
              ))}
            </div>

            {artifact && (
              <>
                <div style={{ fontSize: 11, color: "rgba(234,247,255,0.6)", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <span><strong style={{ color:"rgba(234,247,255,0.85)" }}>{artifact.filename}</strong> — {artifact.summary}</span>
                  <button onClick={copy} style={{ background:"transparent", border:"1px solid rgba(234,247,255,0.18)", color:"#eaf7ff", padding:"3px 9px", borderRadius:5, fontSize:10, cursor:"pointer" }}>Copy</button>
                </div>
                <pre style={{
                  background: "rgba(0,0,0,0.45)", border: "1px solid rgba(234,247,255,0.08)", borderRadius: 8,
                  padding: 12, fontSize: 11, color: "rgba(234,247,255,0.85)", overflow: "auto", maxHeight: "32vh", margin: 0,
                  fontFamily: "ui-monospace,monospace", lineHeight: 1.45,
                }}>{artifact.body}</pre>
              </>
            )}

            {/* Action row */}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center" }}>
              {applied && (
                <span style={{ fontSize: 11, color: applied.outcome === "success" ? "#4ade80" : applied.outcome === "awaiting-approval" ? "#ffc857" : "#ff3d81", marginRight: 8 }}>
                  {applied.outcome === "success" ? "✓ Applied" : applied.outcome === "awaiting-approval" ? "⏱ Awaiting approval" : `⚠ ${applied.outcome}`}
                  {applied.postState?.pr?.html_url && <> · <a href={applied.postState.pr.html_url} target="_blank" rel="noreferrer" style={{ color:"#63f5ff" }}>PR #{applied.postState.pr.number}</a></>}
                </span>
              )}
              {verifyResult && (
                <span style={{ fontSize: 11, color: verifyResult.status === "resolved-verified" ? "#4ade80" : "#ffc857" }}>
                  Verify: {verifyResult.status}
                </span>
              )}
              <button disabled={!applied?.outcome || verifying} onClick={verify} style={{
                background: "transparent", border: "1px solid rgba(99,245,255,0.4)", color: "#63f5ff",
                padding: "6px 14px", borderRadius: 6, fontSize: 11, cursor: applied ? "pointer" : "not-allowed",
                opacity: applied ? 1 : 0.4,
              }}>{verifying ? "Verifying…" : "Verify resolved"}</button>
              <button disabled={applying || !artifact} onClick={apply} style={{
                background: "rgba(45,212,191,0.18)", border: "1px solid rgba(45,212,191,0.6)", color: "#2dd4bf",
                padding: "6px 18px", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: applying ? "wait" : "pointer",
                opacity: applying ? 0.6 : 1,
              }}>{applying ? "Applying…" : "Apply"}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function OrbitalTelemetry({ aiSpmSummary = {}, findings = [] }) {
  const { state, intensity, critical, high, secrets, assets, agents, exposure } =
    postureFromAiSpm(aiSpmSummary);

  // Top exposure findings drive node size — Phase 2.1
  const topFindings = (findings || []).slice(0, 8);
  const [selectedFinding, setSelectedFinding] = useState(null);

  // ring bodies bound to real counts (clamped so the gyroscope stays legible)
  const rings = [
    { label: "agents", tilt: 0.30, rad: 0.42, n: Math.max(1, Math.min(14, agents)), col: [45, 212, 191] },
    { label: "assets", tilt: 0.62, rad: 0.62, n: Math.max(1, Math.min(20, assets)), col: [139, 92, 246] },
    { label: "high", tilt: 0.18, rad: 0.80, n: Math.max(0, Math.min(16, high)), col: [255, 200, 87] },
    { label: "secrets", tilt: 0.50, rad: 0.98, n: Math.max(0, Math.min(12, secrets)), col: [255, 61, 129] },
  ];

  const ref = useCanvasAnimation(
    (ctx, w, h, t) => {
      const cx = w / 2;
      const cy = h / 2;
      const base = Math.min(w, h) * 0.40;
      const sp = (ACCENT[state] || 1) * (0.4 + intensity);

      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "rgba(3,3,7,0.30)";
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";

      const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, 18);
      cg.addColorStop(0, "rgba(255,255,255,0.9)");
      cg.addColorStop(0.4, "rgba(45,212,191,0.6)");
      cg.addColorStop(1, "transparent");
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.arc(cx, cy, 18, 0, TAU);
      ctx.fill();

      rings.forEach((ring, ri) => {
        const rr = base * ring.rad;
        const ry = rr * ring.tilt;
        const rot = t * 0.2 * sp * (ri % 2 ? -1 : 1) + ri;
        const [r0, g0, b0] = ring.col;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(ri * 0.5);
        ctx.strokeStyle = `rgba(${r0},${g0},${b0},0.22)`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(0, 0, rr, ry, 0, 0, TAU);
        ctx.stroke();
        for (let i = 0; i < ring.n; i++) {
          const a = rot + (i / ring.n) * TAU;
          const x = Math.cos(a) * rr;
          const y = Math.sin(a) * ry;
          const wob = state === "breach" ? Math.sin(t * 6 + i) * 2.5 : 0;
          // Node size scales with exposure score if mapped to a top finding
          const tf = topFindings[i % topFindings.length];
          const expScale = tf?.exposureScore ? 0.8 + (tf.exposureScore / 100) * 1.5 : 1;
          const halo = ctx.createRadialGradient(x, y + wob, 0, x, y + wob, 9 * expScale);
          halo.addColorStop(0, `rgba(${r0},${g0},${b0},0.8)`);
          halo.addColorStop(1, "transparent");
          ctx.fillStyle = halo;
          ctx.beginPath();
          ctx.arc(x, y + wob, 9 * expScale, 0, TAU);
          ctx.fill();
          ctx.fillStyle = "rgba(255,255,255,0.9)";
          ctx.beginPath();
          ctx.arc(x, y + wob, 2 * expScale, 0, TAU);
          ctx.fill();
        }
        ctx.restore();
      });
    },
    [state, intensity, agents, assets, high, secrets, topFindings],
  );

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <canvas ref={ref} style={CANVAS_STYLE} aria-label="Orbital Telemetry Rings" />
      <div style={{
        position: "absolute",
        top: 16,
        right: 16,
        width: 220,
        display: "grid",
        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
        gap: 8,
        pointerEvents: "none",
        fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
      }}>
        {[
          { label: "Exposure", value: `${exposure}`, accent: exposure >= 70 ? "#ff3d81" : exposure >= 40 ? "#ffc857" : "#2dd4bf" },
          { label: "AI assets", value: assets, accent: "#2dd4bf" },
          { label: "Agents", value: agents, accent: "#63f5ff" },
          { label: "Critical", value: critical, accent: critical ? "#ff3d81" : "rgba(234,247,255,0.5)" },
          { label: "Secrets", value: secrets, accent: secrets ? "#ff3d81" : "rgba(234,247,255,0.5)" },
        ].map((metric) => (
          <div key={metric.label} style={{
            minWidth: 0,
            padding: "7px 8px",
            borderRadius: 7,
            border: "1px solid rgba(45,212,191,0.16)",
            background: "rgba(4,8,20,0.64)",
            boxShadow: "0 10px 28px rgba(0,0,0,0.22)",
          }}>
            <div style={{ fontSize: 8, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(234,247,255,0.46)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {metric.label}
            </div>
            <div style={{
              marginTop: 3,
              fontSize: 17,
              lineHeight: 1,
              fontWeight: 800,
              color: metric.accent,
              textShadow: metric.accent.startsWith("#") ? `0 0 12px ${metric.accent}55` : "none",
            }}>
              {metric.value}
            </div>
          </div>
        ))}
        <div style={{ gridColumn: "1 / -1", justifySelf: "end", fontSize: 10, color: "rgba(234,247,255,0.66)", letterSpacing: "0.06em" }}>
          <span style={{ color: "#ff3d81" }}>▸ </span>AI posture mapped
        </div>
      </div>

      {/* Top finding shortlist — click to open remediation modal */}
      {topFindings.length > 0 && (
        <div style={{
          position: "absolute", left: 14, bottom: 14, width: "min(360px, calc(100% - 280px))",
          background: "rgba(8,10,28,0.92)", border: "1px solid rgba(45,212,191,0.28)", borderRadius: 10,
          padding: 11, display: "flex", flexDirection: "column", gap: 6,
        }}>
          <div style={{ fontSize: 9, color: "#2dd4bf", letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 3 }}>
            Top exposure findings — click to remediate
          </div>
          {topFindings.slice(0, 5).map(f => (
            <button key={f.id} onClick={() => setSelectedFinding(f.id)} style={{
              background: "transparent", textAlign: "left", cursor: "pointer",
              border: "1px solid rgba(99,245,255,0.12)", borderRadius: 7,
              padding: "6px 9px", color: "rgba(234,247,255,0.92)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8,
            }}>
              <span style={{ fontSize: 11, lineHeight: 1.3, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.title}</span>
              <span style={{ fontSize: 10, color: f.exposureScore >= 70 ? "#ff3d81" : f.exposureScore >= 40 ? "#ffc857" : "#2dd4bf", fontWeight: 700, fontFamily: "ui-monospace,monospace" }}>
                {f.exposureScore ?? "—"}
              </span>
            </button>
          ))}
        </div>
      )}

      {selectedFinding && <RemediationModal findingId={selectedFinding} onClose={() => setSelectedFinding(null)} />}
    </div>
  );
}

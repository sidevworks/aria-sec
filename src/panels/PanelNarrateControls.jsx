// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

// PanelNarrateControls.jsx — Brief Summary via Gemini realtime talk
import { useState } from "react";
import { DEMO_BUILD } from "../ariaBuildFlags.js";

const ARIA_API_BASE = (import.meta.env.VITE_ARIA_API_BASE || "").replace(/\/$/, "");
const AUTH_HEADERS = {
  "x-tenant-id": import.meta.env.VITE_ARIA_TENANT_ID || "tenant-local",
  "x-user-id": import.meta.env.VITE_ARIA_USER_ID || "admin",
  "x-role": import.meta.env.VITE_ARIA_ROLE || "owner",
};

const DEMO_PANEL_BRIEFS = {
  "aria-center": "Command Center is mission control. It unifies live monitoring, evidence scans, autonomy controls, diagnostics, and the command fabric so every decision has visible proof.",
  "identity-galaxy": "Identity Galaxy turns departments and users into a risk map. It highlights impossible travel, failed authentication, privilege drift, and the next safe access action.",
  "ai-spm": "AI Security Posture Management maps models, prompts, secrets, endpoints, cloud assets, and connector exposure. The priority is to understand the attack path and close the highest-risk route first.",
  "network": "The Network panel shows live sockets, listening services, external remotes, and block states. Passive visibility stays safe, while active discovery remains guarded by approval.",
  "decision-engine": "The Decision Engine explains what ARIA recommends, why it recommends it, how confident it is, and whether human approval is required before action.",
  "security-admin": "Security Admin proves governance. It shows tenant context, roles, authorization denials, compliance state, and session controls for audit-ready operation.",
};

const demoBriefFor = (panelId) => DEMO_PANEL_BRIEFS[panelId]
  || `This ${String(panelId || "current").replace(/-/g, " ")} panel is part of the ARIA security cockpit. Review the highest-risk signal, then open the evidence before taking action.`;

const DEMO_PANEL_AUDIO = {
  "aria-center": "/demo-audio/narration/aria-center.mp3",
  "identity-galaxy": "/demo-audio/narration/identity-galaxy.mp3",
  "ai-spm": "/demo-audio/narration/ai-spm.mp3",
  network: "/demo-audio/narration/network.mp3",
  "decision-engine": "/demo-audio/narration/decision-engine.mp3",
  "security-admin": "/demo-audio/narration/security-admin.mp3",
  "identity-sessions": "/demo-audio/narration/identity-sessions.mp3",
  "policy-change": "/demo-audio/narration/policy-change.mp3",
  "trust-ladder": "/demo-audio/narration/trust-ladder.mp3",
  overview: "/demo-audio/narration/overview.mp3",
};

export default function PanelNarrateControls({ panelId, panelData = {}, style }) {
  const [loading, setLoading] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  async function handleBrief() {
    if (loading || speaking) return;
    setLoading(true);
    try {
      if (DEMO_BUILD) {
        setSpeaking(true);
        const text = demoBriefFor(panelId);
        window.dispatchEvent(new CustomEvent("aria:realtime-speak", {
          detail: { text, audioSrc: DEMO_PANEL_AUDIO[panelId] || "/demo-audio/actions/overview-summary.mp3" },
        }));
        const spokenMs = Math.max(5200, String(text).split(/\s+/).filter(Boolean).length * 380);
        window.setTimeout(() => setSpeaking(false), Math.min(14000, spokenMs));
        return;
      }

      setSpeaking(true);
      const res = await fetch(`${ARIA_API_BASE}/api/aria/panel-narrative`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...AUTH_HEADERS },
        body: JSON.stringify({ panelId, context: panelData || {}, model_mode: "gemini", latency_profile: "realtime" }),
      });
      if (!res.ok) throw new Error(`panel-narrative ${res.status}`);
      const data = await res.json();
      const text = data?.narrative?.summary || demoBriefFor(panelId);
      window.dispatchEvent(new CustomEvent("aria:realtime-speak", { detail: { text, audioSrc: null } }));
      const spokenMs = Math.max(5200, String(text).split(/\s+/).filter(Boolean).length * 380);
      window.setTimeout(() => setSpeaking(false), Math.min(20000, spokenMs));
    } catch (err) {
      console.warn("[PanelNarrateControls] brief error:", err.message);
      setSpeaking(false);
    } finally {
      setLoading(false);
    }
  }

  const base = {
    display: "flex",
    alignItems: "center",
    ...style,
  };

  const briefBtn = {
    padding: "4px 10px",
    fontSize: 10,
    fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    border: "1px solid rgba(99,245,255,0.35)",
    borderRadius: 3,
    cursor: loading || speaking ? "default" : "pointer",
    background: "transparent",
    color: "var(--cx-cyan, #63f5ff)",
    opacity: loading || speaking ? 0.45 : 1,
    transition: "opacity 0.15s",
  };

  return (
    <div style={base}>
      <button style={briefBtn} onClick={handleBrief} disabled={loading || speaking} title={DEMO_BUILD ? "Aria speaks an offline demo brief" : "Aria briefs this panel through the selected intelligence profile"}>
        {speaking ? "◎ Speaking…" : loading ? "◌ Reading…" : "▶ Brief"}
      </button>
    </div>
  );
}

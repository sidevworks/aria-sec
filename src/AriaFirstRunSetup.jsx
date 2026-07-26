// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import { useState } from "react";
import { setDemoMode } from "./panels/ariaFetch.js";
import { persistSetupChoice } from "./ariaSetupState.js";

// First-run onboarding shown once after login (gated by localStorage in
// PlatformRoot). Lets an operator pick how to start ARIA without the founder
// present: explore a guided demo environment (bundled offline intelligence,
// sample data) or connect their own sources (their keys, encrypted locally; real scans).
//
// Two key categories — kept deliberately distinct:
//   • Demo intelligence and narration are bundled into this build.
//   • Connector keys (AWS / GitHub / Okta / …) are always the operator's own and
//     are entered later via the in-app Connectors wizard, encrypted at rest.

const ACCENT = "#2dd4bf";

const CARD_BASE = {
  flex: 1,
  textAlign: "left",
  padding: "26px 24px",
  borderRadius: 18,
  background: "rgba(8,12,24,0.72)",
  cursor: "pointer",
  transition: "transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease",
  backdropFilter: "blur(18px)",
};

function Card({ title, kicker, body, points, accent, hovered, onHover, onLeave, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      style={{
        ...CARD_BASE,
        border: `1px solid ${accent}${hovered ? "88" : "33"}`,
        boxShadow: hovered ? `0 18px 48px rgba(0,0,0,0.55), 0 0 0 1px ${accent}33` : "0 8px 28px rgba(0,0,0,0.4)",
        transform: hovered ? "translateY(-4px)" : "none",
      }}
    >
      <div style={{ fontSize: 10, letterSpacing: "0.22em", textTransform: "uppercase", color: accent, fontWeight: 700, marginBottom: 10 }}>
        {kicker}
      </div>
      <div style={{ fontSize: 21, color: "rgba(232,244,255,0.96)", fontWeight: 650, marginBottom: 10 }}>
        {title}
      </div>
      <div style={{ fontSize: 13, lineHeight: 1.55, color: "rgba(190,212,232,0.78)", marginBottom: 16 }}>
        {body}
      </div>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
        {points.map((p) => (
          <li key={p} style={{ display: "flex", gap: 9, fontSize: 12.5, color: "rgba(200,220,240,0.8)", lineHeight: 1.4 }}>
            <span style={{ color: accent, flexShrink: 0 }}>›</span>
            <span>{p}</span>
          </li>
        ))}
      </ul>
      <div style={{ marginTop: 20, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", color: accent }}>
        {hovered ? "Select →" : " "}
      </div>
    </button>
  );
}

export default function AriaFirstRunSetup({ onComplete }) {
  const [hovered, setHovered] = useState(null);

  const choose = (mode) => {
    persistSetupChoice(mode);
    setDemoMode(mode === "demo");
    onComplete?.(mode);
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: "radial-gradient(circle at 50% 30%, rgba(20,30,55,0.6), #05070d 70%)",
        animation: "ariaSetupFade 0.5s ease",
      }}
    >
      <style>{`@keyframes ariaSetupFade{from{opacity:0}to{opacity:1}}`}</style>
      <div style={{ width: "100%", maxWidth: 880 }}>
        <div style={{ textAlign: "center", marginBottom: 30 }}>
          <div style={{ fontSize: 11, letterSpacing: "0.3em", textTransform: "uppercase", color: ACCENT, fontWeight: 700, marginBottom: 12 }}>
            Welcome to ARIA
          </div>
          <h1 style={{ fontSize: 30, fontWeight: 600, color: "rgba(236,246,255,0.97)", margin: "0 0 12px" }}>
            How would you like to start?
          </h1>
          <p style={{ fontSize: 14, color: "rgba(180,202,224,0.72)", margin: "0 auto", maxWidth: 560, lineHeight: 1.6 }}>
            You can change this anytime from the AI-SPM panel. This build includes
            bundled offline intelligence and narration — you only ever supply your own keys
            for the sources you choose to connect.
          </p>
        </div>

        <div style={{ display: "flex", gap: 20 }}>
          <Card
            kicker="Guided demo"
            title="Explore the demo environment"
            body="See the full platform populated with realistic, clearly-labelled sample data — no credentials required."
            points={[
              "Live decision engine, identity galaxy & threat panels, pre-populated",
              "Runs with bundled offline demo intelligence",
              "Nothing connects to your real infrastructure",
            ]}
            accent={ACCENT}
            hovered={hovered === "demo"}
            onHover={() => setHovered("demo")}
            onLeave={() => setHovered(null)}
            onClick={() => choose("demo")}
          />
          <Card
            kicker="Live setup"
            title="Connect my own sources"
            body="Start with a clean slate and connect your real environment from the in-app Connectors wizard."
            points={[
              "Your AWS / GitHub / Okta / Snyk keys — yours, never ours",
              "Credentials encrypted at rest on this machine (AES-256-GCM)",
              "Runs real AI-SPM scans against your infrastructure",
            ]}
            accent="#63a8ff"
            hovered={hovered === "live"}
            onHover={() => setHovered("live")}
            onLeave={() => setHovered(null)}
            onClick={() => choose("live")}
          />
        </div>

        <div style={{ textAlign: "center", marginTop: 22 }}>
          <button
            type="button"
            onClick={() => choose("live")}
            style={{
              background: "none",
              border: "none",
              color: "rgba(150,172,196,0.6)",
              fontSize: 12.5,
              cursor: "pointer",
              letterSpacing: "0.04em",
            }}
          >
            Skip — go straight to the platform
          </button>
        </div>
      </div>
    </div>
  );
}

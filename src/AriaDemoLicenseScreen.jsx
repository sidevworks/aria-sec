// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import { useState } from "react";
import { verifyLicense, startSession } from "./ariaLicense.js";
import { YC_DEMO_BUILD } from "./ariaBuildFlags.js";

// Demo license gate (demo builds only). Investor enters the key they were
// supplied; a valid key opens the platform for the key's session window. On
// expiry the platform logs back out to this screen (see PlatformRoot).

const CONTACT_EMAIL = "sary@aria-sec.com";
const ACCENT = "#8b7cff";

const REASONS = {
  malformed: "That doesn't look like a valid key. Paste the full key you were sent.",
  invalid: "This license key isn't valid. Check it was copied in full.",
  expired: "This key has expired. Contact us for a new one.",
  used: "This key has already been used. Contact us to extend your trial.",
};

const YC_REASONS = {
  malformed: "Access key not recognized. Paste the complete key from the application.",
  invalid: "Access key not recognized. Check that it was copied in full.",
  expired: "Access key not recognized.",
  used: "Access key not recognized.",
};

export default function AriaDemoLicenseScreen({ onActivated }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const activate = async () => {
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      const result = await verifyLicense(value);
      if (!result.valid) {
        const messages = YC_DEMO_BUILD ? YC_REASONS : REASONS;
        setError(messages[result.reason] || messages.invalid);
        return;
      }
      const session = startSession(result.claims);
      onActivated?.(session);
    } finally {
      setBusy(false);
    }
  };

  const mailto = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("ARIA demo - trial extension request")}&body=${encodeURIComponent("Hi Sary,\n\nI'd like more time to evaluate the ARIA demo.\n\nThanks.")}`;

  const openContactLink = (event) => {
    if (!window.aria?.openExternal) return;
    event.preventDefault();
    void window.aria.openExternal(mailto);
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
        background: "radial-gradient(circle at 50% 28%, rgba(34,28,66,0.55), #05060c 72%)",
        animation: "ariaLicFade 0.5s ease",
      }}
    >
      <style>{`@keyframes ariaLicFade{from{opacity:0}to{opacity:1}}`}</style>
      <div
        style={{
          width: "100%",
          maxWidth: 460,
          padding: "34px 34px 26px",
          borderRadius: 22,
          background: "rgba(12,14,24,0.86)",
          border: "1px solid rgba(139,124,255,0.22)",
          boxShadow: "0 30px 80px rgba(0,0,0,0.55)",
          backdropFilter: "blur(22px)",
        }}
      >
        {/* Brand */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 26 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: `linear-gradient(135deg, ${ACCENT}, #5b4bd6)`,
              boxShadow: `0 6px 20px ${ACCENT}55`,
            }}
          />
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: "rgba(238,242,255,0.97)" }}>ARIA</div>
            <div style={{ fontSize: 10, letterSpacing: "0.18em", color: "rgba(168,176,210,0.7)", textTransform: "uppercase" }}>
              Autonomous Security Platform
            </div>
          </div>
        </div>

        <h1 style={{ fontSize: 27, fontWeight: 650, color: "rgba(240,244,255,0.98)", margin: "0 0 10px" }}>
          {YC_DEMO_BUILD ? "YC Demo Access" : "Demo Access"}
        </h1>
        <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "rgba(182,190,222,0.78)", margin: "0 0 24px" }}>
          {YC_DEMO_BUILD
            ? "Enter the access key supplied with the application to open the ARIA product demo."
            : "Enter the license key you were supplied to begin your trial. Your session runs for the period on your key. If you need more time, contact us and we'll help extend your evaluation."}
        </p>

        <label style={{ display: "block", fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(168,176,210,0.75)", fontWeight: 700, marginBottom: 8 }}>
          {YC_DEMO_BUILD ? "Access Key" : "License Key"}
        </label>
        <input
          type={YC_DEMO_BUILD ? "password" : "text"}
          value={value}
          autoFocus
          spellCheck={false}
          onChange={(e) => { setValue(e.target.value); if (error) setError(""); }}
          onKeyDown={(e) => { if (e.key === "Enter") activate(); }}
          placeholder="ARIA-XXXXXXXX…"
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "13px 15px",
            borderRadius: 12,
            background: "rgba(6,8,16,0.85)",
            border: `1px solid ${error ? "#ff5d7a" : "rgba(139,124,255,0.45)"}`,
            color: "rgba(232,238,255,0.96)",
            fontSize: 14,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            outline: "none",
          }}
        />
        {error && (
          <div style={{ marginTop: 9, fontSize: 12.5, color: "#ff8198", lineHeight: 1.45 }}>{error}</div>
        )}

        <button
          type="button"
          onClick={activate}
          disabled={busy || !value.trim()}
          style={{
            width: "100%",
            marginTop: 18,
            padding: "14px 0",
            borderRadius: 12,
            border: "none",
            background: busy || !value.trim()
              ? "rgba(139,124,255,0.3)"
              : `linear-gradient(135deg, ${ACCENT}, #6a55e0)`,
            color: "#fff",
            fontSize: 14.5,
            fontWeight: 650,
            cursor: busy || !value.trim() ? "default" : "pointer",
            transition: "filter 0.15s ease",
          }}
        >
          {busy ? "Verifying…" : (YC_DEMO_BUILD ? "Enter ARIA" : "Activate & Enter Demo")}
        </button>

        <div style={{ marginTop: 22, textAlign: "center", lineHeight: 1.8 }}>
          <div style={{ fontSize: 12, color: "rgba(150,158,190,0.6)" }}>
            Built by <span style={{ color: ACCENT, fontWeight: 600 }}>ARIA-SEC</span>
          </div>
          {!YC_DEMO_BUILD && (
            <a
              href={mailto}
              onClick={openContactLink}
              style={{ fontSize: 12.5, color: "rgba(168,176,210,0.78)", textDecoration: "none" }}
            >
              Need more time to evaluate?{" "}
              <span style={{ color: ACCENT, fontWeight: 600 }}>Contact us for an extension</span>
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

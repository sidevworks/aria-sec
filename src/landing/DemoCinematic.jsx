// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import { useCallback, useEffect, useRef, useState } from "react";
import "./DemoCinematic.css";

const INTRO_SRC = "/landing/media/intro.mp4";

// Site intro: the full-screen cinematic that gates the whole landing on first
// load. It plays edge to edge, then dissolves into the landing via onDone.
// Skip jumps straight in; mute toggles the soundtrack. Autoplay starts unmuted
// when the browser allows it and falls back to muted otherwise — the control
// always reflects the real <video> state so the label can't lie.
export default function DemoCinematic({ onDone, onDisableFuture }) {
  const videoRef = useRef(null);
  const [leaving, setLeaving] = useState(false);
  const [muted, setMuted] = useState(false);
  // The "play this intro every time?" prompt should only be asked once. Once the
  // visitor answers either way, remember it so the intro stops nagging.
  const [prompt, setPrompt] = useState(() => {
    try { return window.localStorage.getItem("aria-intro-prompt-off") !== "1"; } catch { return true; }
  });

  const dismissPrompt = useCallback(() => {
    try { window.localStorage.setItem("aria-intro-prompt-off", "1"); } catch { /* storage unavailable */ }
    setPrompt(false);
  }, []);

  const disableFuture = useCallback(() => {
    onDisableFuture?.();
    dismissPrompt();
  }, [onDisableFuture, dismissPrompt]);

  const finish = useCallback(() => {
    setLeaving((already) => {
      if (already) return already;
      // Match the dissolve duration in DemoCinematic.css before handing off.
      window.setTimeout(() => onDone?.(), 900);
      return true;
    });
  }, [onDone]);

  // Sound is on by default. No user gesture exists on first load, so unmuted
  // autoplay may be blocked — if so, fall back to muted playback BUT arm a
  // one-shot listener so the very first interaction anywhere flips sound on,
  // without the visitor needing to find the Unmute control.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;
    let cleanup = () => {};

    video.muted = false;
    video.play().catch(() => {
      // Blocked unmuted — start muted so the visuals still roll...
      video.muted = true;
      setMuted(true);
      video.play().catch(() => finish());
      // ...then unmute on the first user gesture.
      const unmute = () => {
        const v = videoRef.current;
        if (!v) return;
        v.muted = false;
        setMuted(false);
        v.play().catch(() => {});
        cleanup();
      };
      const opts = { once: true, capture: true };
      window.addEventListener("pointerdown", unmute, opts);
      window.addEventListener("keydown", unmute, opts);
      window.addEventListener("touchstart", unmute, opts);
      cleanup = () => {
        window.removeEventListener("pointerdown", unmute, opts);
        window.removeEventListener("keydown", unmute, opts);
        window.removeEventListener("touchstart", unmute, opts);
      };
    });

    return () => cleanup();
  }, [finish]);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const next = !video.muted;
    video.muted = next;
    setMuted(next);
    // Unmuting needs a play() nudge in case autoplay started it muted.
    if (!next) video.play().catch(() => {});
  }, []);

  return (
    <div className={`ariaIntro ${leaving ? "isLeaving" : ""}`} role="presentation">
      <video
        ref={videoRef}
        className="ariaIntroVideo"
        src={INTRO_SRC}
        autoPlay
        playsInline
        preload="auto"
        onEnded={finish}
        onError={finish}
      />
      <div className="ariaIntroVignette" aria-hidden="true" />
      {prompt && (
        <div className="ariaIntroPrompt" role="dialog" aria-label="Intro preference">
          <span>Play this intro every time you visit?</span>
          <div className="ariaIntroPromptActions">
            <button type="button" className="ariaIntroPromptBtn" onClick={dismissPrompt}>
              Keep it on
            </button>
            <button type="button" className="ariaIntroPromptBtn isOff" onClick={disableFuture}>
              Turn off
            </button>
          </div>
        </div>
      )}
      <div className="ariaIntroControls">
        <button
          type="button"
          className="ariaIntroBtn"
          onClick={toggleMute}
          aria-pressed={muted}
        >
          {muted ? "Unmute" : "Mute"}
        </button>
        <button type="button" className="ariaIntroBtn ariaIntroSkip" onClick={finish}>
          Skip intro
        </button>
      </div>
    </div>
  );
}

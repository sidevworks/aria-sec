// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import { useCallback, useEffect, useRef, useState } from "react";
import "./DemoFeature.css";

// The long-form capture is ~220MB, over GitHub's file limit, so it is hosted
// separately rather than committed. Point VITE_DEMO_VIDEO_URL at your copy to
// use it; otherwise we fall back to the short clip that ships in the repo, so a
// fresh clone still plays something instead of dissolving to nothing.
const DEMO_SRC_PRIMARY =
  import.meta.env.VITE_DEMO_VIDEO_URL || "/landing/media/demo-hq-complete.mp4";
const DEMO_SRC_FALLBACK = "/landing/media/sectors/demo.mp4";

// The self-navigating product demo. The cinematic intro dissolves into this
// full-screen video, which drives its own walkthrough (visuals + narration).
// Unlike the intro, this is long-form, so it offers an exit back to the world.
export default function DemoFeature({ onClose }) {
  const videoRef = useRef(null);
  const [leaving, setLeaving] = useState(false);
  const [src, setSrc] = useState(DEMO_SRC_PRIMARY);
  const triedFallback = useRef(false);

  const finish = useCallback(() => {
    setLeaving(true);
    // Match the dissolve duration in DemoFeature.css before handing back.
    window.setTimeout(() => onClose?.(), 600);
  }, [onClose]);

  // Swap to the bundled clip the first time the primary source fails to load;
  // only give up and hand back control if the fallback fails too.
  const handleError = useCallback(() => {
    if (!triedFallback.current && src !== DEMO_SRC_FALLBACK) {
      triedFallback.current = true;
      setSrc(DEMO_SRC_FALLBACK);
      return;
    }
    finish();
  }, [finish, src]);

  // The intro that preceded this already satisfied the autoplay-with-sound
  // gesture, so play unmuted; fall back to muted if the browser still blocks.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;
    video.play().catch(() => {
      video.muted = true;
      video.play().catch(() => finish());
    });
    const onKey = (event) => {
      if (event.key === "Escape") finish();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // `src` is a dependency so switching to the fallback re-attempts playback.
  }, [finish, src]);

  return (
    <div className={`ariaDemo ${leaving ? "isLeaving" : ""}`} role="presentation">
      <video
        ref={videoRef}
        className="ariaDemoVideo"
        src={src}
        autoPlay
        playsInline
        preload="auto"
        onEnded={finish}
        onError={handleError}
      />
      <button type="button" className="ariaDemoClose" onClick={finish} aria-label="Exit demo">
        Exit demo
      </button>
    </div>
  );
}

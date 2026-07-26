// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import { useCallback, useEffect, useState } from "react";
import "./SiteIntroBrief.css";

// What-is-ARIA explainer. Sits between the cinematic intro video and the
// command world: the video sets the mood, this states plainly what the
// visitor has landed on, then Enter dissolves into the Cockpit. Pillars echo
// the four sectors a newcomer is about to fly through.
const PILLARS = [
  ["AI-SPM", "Every model, prompt, secret, and cloud path mapped for attack paths and blast radius."],
  ["Identity", "Impossible travel, privilege drift, and behavioural baselines across every department."],
  ["Network", "Live connections, blocked remotes, and passive discovery as one living map."],
  ["Governed autonomy", "Approval, assisted, auto. The model earns trust through scored decisions — it never promotes itself."],
];

export default function SiteIntroBrief({ onEnter }) {
  const [leaving, setLeaving] = useState(false);

  const enter = useCallback(() => {
    setLeaving((already) => {
      if (already) return already;
      // Match the dissolve duration in SiteIntroBrief.css before handing off.
      window.setTimeout(() => onEnter?.(), 700);
      return true;
    });
  }, [onEnter]);

  // Enter / Escape continue into the world, so the page never traps a visitor.
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Enter" || event.key === "Escape" || event.key === " ") {
        event.preventDefault();
        enter();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enter]);

  return (
    <div
      className={`ariaBrief ${leaving ? "isLeaving" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label="What is ARIA"
      onClick={enter}
    >
      <div className="ariaBriefVeil" aria-hidden="true" />
      <button type="button" className="ariaBriefClose" onClick={enter} aria-label="Enter ARIA and close introduction">
        Skip
      </button>
      <div className="ariaBriefInner" onClick={(event) => event.stopPropagation()}>
        <span className="ariaBriefKicker">Autonomous security · Governed</span>
        <h1 className="ariaBriefTitle">
          {"ARIA is the security analyst you can trust to act.".split(" ").map((word, i) => (
            <span className="ariaBriefWord" key={i} style={{ "--i": i }}>{word}</span>
          ))}
        </h1>
        <p className="ariaBriefLede">
          An AI security platform that watches your AI systems, identities, and network in
          real time — it investigates threats, explains them in plain language, and contains
          them under human-governed approval. Everything is audited. Nothing acts without
          earned trust.
        </p>

        <div className="ariaBriefPillars">
          {PILLARS.map(([label, copy], i) => (
            <div className="ariaBriefPillar" key={label} style={{ "--i": i }}>
              <span>{label}</span>
              <p>{copy}</p>
            </div>
          ))}
        </div>

        <div className="ariaBriefActions">
          <button type="button" className="ariaBriefEnter" onClick={enter}>
            Enter the command world
          </button>
          <span className="ariaBriefHint">Press Enter to begin</span>
        </div>
      </div>
    </div>
  );
}

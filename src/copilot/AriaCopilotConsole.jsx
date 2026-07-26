// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  COPILOT_QUICK_PROMPTS,
  answerCopilotPrompt,
  getCopilotContextCards,
  summarizeDataCaveat,
} from "./copilotContext.js";
import "./AriaCopilotConsole.css";

const COPILOT_POSITION_KEY = "aria-copilot-position";

function readCopilotPosition() {
  if (typeof window === "undefined") return null;
  try {
    const value = JSON.parse(window.localStorage.getItem(COPILOT_POSITION_KEY) || "null");
    if (!value || typeof value.x !== "number" || typeof value.y !== "number") return null;
    return value;
  } catch {
    return null;
  }
}

function clampPosition(x, y, width, height) {
  if (typeof window === "undefined") return { x, y };
  const margin = 10;
  return {
    x: Math.max(margin, Math.min(window.innerWidth - width - margin, x)),
    y: Math.max(margin, Math.min(window.innerHeight - height - margin, y)),
  };
}

function StatusPill({ tone, children }) {
  return <span className={`ariaCopilotPill ${tone || ""}`}>{children}</span>;
}

export default function AriaCopilotConsole({
  context,
  visible = true,
  onAsk,
  onStageAction,
  onOpenFullConsole,
  onDismiss,
}) {
  const [expanded, setExpanded] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [position, setPosition] = useState(readCopilotPosition);
  const [prompt, setPrompt] = useState("");
  const [history, setHistory] = useState(() => [
    {
      role: "aria",
      text: "Copilot online. I can explain the active panel, risk, blast radius, evidence, and governed next action from the current ARIA context.",
    },
  ]);
  const inputRef = useRef(null);
  const shellRef = useRef(null);
  const dragRef = useRef(null);
  const cards = useMemo(() => getCopilotContextCards(context), [context]);
  const caveat = useMemo(() => summarizeDataCaveat(context), [context]);
  const flags = context?.flags || {};
  const governance = context?.governance || {};

  const runPrompt = useCallback(async (value) => {
    const text = String(value || "").trim();
    if (!text) return;
    setPrompt("");
    setExpanded(true);
    setHistory((items) => [...items.slice(-7), { role: "operator", text }]);

    let response;
    try {
      response = await onAsk?.(text, context);
    } catch {
      response = null;
    }
    const grounded = response?.answer || response?.voice_response || response?.summary || response || answerCopilotPrompt(text, context);
    setHistory((items) => [...items.slice(-8), { role: "aria", text: String(grounded) }]);
  }, [context, onAsk]);

  useEffect(() => {
    if (!expanded) return undefined;
    const handleKey = (event) => {
      if (event.key === "Escape") {
        setExpanded(false);
        onDismiss?.();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [expanded, onDismiss]);

  useEffect(() => {
    if (expanded) window.setTimeout(() => inputRef.current?.focus(), 40);
  }, [expanded]);

  const beginDrag = useCallback((event) => {
    if (event.button !== 0) return;
    if (event.target.closest("button, input, textarea, select, a")) return;
    const shell = shellRef.current;
    if (!shell) return;
    const rect = shell.getBoundingClientRect();
    dragRef.current = {
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      width: rect.width,
      height: rect.height,
    };

    const move = (moveEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const next = clampPosition(
        moveEvent.clientX - drag.offsetX,
        moveEvent.clientY - drag.offsetY,
        drag.width,
        drag.height,
      );
      setPosition(next);
    };

    const end = () => {
      const shellRect = shell.getBoundingClientRect();
      const next = clampPosition(shellRect.left, shellRect.top, shellRect.width, shellRect.height);
      setPosition(next);
      window.localStorage.setItem(COPILOT_POSITION_KEY, JSON.stringify(next));
      dragRef.current = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end, { once: true });
  }, []);

  if (!visible) return null;

  const shellStyle = position
    ? { left: position.x, top: position.y, right: "auto", bottom: "auto" }
    : undefined;

  return (
    <aside
      ref={shellRef}
      className={`ariaCopilot ${expanded ? "expanded" : "compact"} ${minimized ? "minimized" : ""}`}
      style={shellStyle}
      aria-label="ARIA copilot console"
    >
      <div className="ariaCopilotHeader" onPointerDown={beginDrag}>
        <button className="ariaCopilotIdentity" type="button" onClick={() => { setMinimized(false); setExpanded((value) => !value); }}>
          <span className="ariaCopilotCore" />
          <span>
            <strong>ARIA Copilot</strong>
            <em>{context?.route?.activePanel?.label || "Workspace context"}</em>
          </span>
        </button>
        <div className="ariaCopilotHeaderActions">
          {flags.demoData || flags.mockData ? <StatusPill tone="warn">Demo</StatusPill> : null}
          {flags.staleData ? <StatusPill tone="warn">Stale</StatusPill> : null}
          {flags.unavailableData ? <StatusPill tone="danger">Gaps</StatusPill> : null}
          <button type="button" className="ariaCopilotIconButton" aria-label="Minimise copilot" title="Minimise copilot" onClick={() => { setExpanded(false); setMinimized(true); }}>_</button>
          <button type="button" className="ariaCopilotIconButton" aria-label="Open full command center" title="Open full command center" onClick={onOpenFullConsole}>⌘</button>
          <button type="button" className="ariaCopilotIconButton" aria-label={expanded && !minimized ? "Collapse copilot" : "Expand copilot"} title={expanded && !minimized ? "Collapse copilot" : "Expand copilot"} onClick={() => { setMinimized(false); setExpanded((value) => !value); }}>
            {expanded ? "-" : "+"}
          </button>
        </div>
      </div>

      {!minimized ? <div className="ariaCopilotContextGrid">
        {cards.slice(0, expanded ? cards.length : 3).map((card) => (
          <div className="ariaCopilotCard" key={card.label}>
            <span>{card.label}</span>
            <strong title={card.value}>{card.value}</strong>
            <em title={card.detail}>{card.detail}</em>
          </div>
        ))}
      </div> : null}

      {expanded && !minimized ? (
        <>
          <div className="ariaCopilotCaveat">{caveat}</div>
          <div className="ariaCopilotHistory" data-console-scroll>
            {history.map((item, index) => (
              <div key={`${item.role}-${index}`} className={`ariaCopilotMessage ${item.role}`}>
                <span>{item.role === "aria" ? "ARIA" : "YOU"}</span>
                <p>{item.text}</p>
              </div>
            ))}
          </div>
          <div className="ariaCopilotQuickPrompts">
            {COPILOT_QUICK_PROMPTS.map((item) => (
              <button key={item} type="button" onClick={() => void runPrompt(item)}>{item}</button>
            ))}
          </div>
          <div className="ariaCopilotGovernance">
            <span>{governance.availableActions?.length || 0} available actions</span>
            <span>{governance.approvalRequiredCount || 0} require approval</span>
            <button type="button" onClick={() => onStageAction?.(answerCopilotPrompt("Stage the safest action.", context))}>
              Stage safest
            </button>
          </div>
        </>
      ) : null}

      {!minimized ? <form
        className="ariaCopilotPrompt"
        onSubmit={(event) => {
          event.preventDefault();
          void runPrompt(prompt);
        }}
      >
        <input
          ref={inputRef}
          value={prompt}
          onFocus={() => setExpanded(true)}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Ask why risky, blast radius, safest action..."
        />
        <button type="submit">Ask</button>
      </form> : null}
    </aside>
  );
}

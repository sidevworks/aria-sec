// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import { useEffect, useId } from "react";
import "./EvidenceDrawer.css";
import { EMPTY_TEXT, normalizeEvidenceDrawerData } from "./evidenceDrawerModel.js";

function FieldValue({ label, value }) {
  const unavailable = !value || value === EMPTY_TEXT;
  return (
    <section className="aria-evidence-field" data-empty={unavailable ? "true" : "false"}>
      <span className="aria-evidence-label">{label}</span>
      <p>{unavailable ? EMPTY_TEXT : value}</p>
    </section>
  );
}

function EvidenceList({ label, items, emptyText = EMPTY_TEXT, variant = "list" }) {
  const hasItems = items?.length > 0;
  return (
    <section className={`aria-evidence-section aria-evidence-section-${variant}`} data-empty={hasItems ? "false" : "true"}>
      <div className="aria-evidence-section-title">{label}</div>
      {hasItems ? (
        <ol className="aria-evidence-list">
          {items.map((item, index) => (
            <li key={`${item.title}-${index}`}>
              <div>
                <strong>{item.title}</strong>
                {item.detail ? <p>{item.detail}</p> : null}
              </div>
              {item.meta || item.time ? <span>{item.time || item.meta}</span> : null}
            </li>
          ))}
        </ol>
      ) : (
        <div className="aria-evidence-empty">{emptyText}</div>
      )}
    </section>
  );
}

function ConfidenceMeter({ confidence }) {
  const unavailable = !confidence?.percent && confidence?.percent !== 0;
  const width = unavailable ? 0 : confidence.percent;
  return (
    <section className="aria-evidence-confidence" data-level={confidence?.level || "unknown"} data-empty={unavailable ? "true" : "false"}>
      <div>
        <span className="aria-evidence-label">Confidence</span>
        <strong>{confidence?.label || EMPTY_TEXT}</strong>
      </div>
      <div className="aria-evidence-confidence-track" aria-hidden="true">
        <span style={{ width: `${width}%` }} />
      </div>
    </section>
  );
}

export default function EvidenceDrawer({
  open,
  evidence,
  title = "Evidence",
  subtitle = "Decision proof record",
  accent = "#63f5ff",
  onClose,
  closeOnBackdrop = true,
  className = "",
}) {
  const titleId = useId();
  const data = normalizeEvidenceDrawerData(evidence);

  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const handleBackdropClick = (event) => {
    if (closeOnBackdrop && event.target === event.currentTarget) {
      onClose?.();
    }
  };

  return (
    <div className={`aria-evidence-backdrop ${className}`} onMouseDown={handleBackdropClick}>
      <aside
        className="aria-evidence-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={{ "--aria-evidence-accent": accent }}
      >
        <header className="aria-evidence-header">
          <div>
            <span>{subtitle}</span>
            <h2 id={titleId}>{title}</h2>
          </div>
          <button type="button" className="aria-evidence-close" aria-label="Close evidence drawer" onClick={onClose}>
            X
          </button>
        </header>

        <div className="aria-evidence-body">
          <div className="aria-evidence-grid">
            <FieldValue label="Source" value={data.source} />
            <FieldValue label="Timestamp" value={data.timestamp} />
            <FieldValue label="Blast radius" value={data.blastRadius} />
            <FieldValue label="Approval state" value={data.approvalState} />
          </div>

          <ConfidenceMeter confidence={data.confidence} />
          <FieldValue label="Recommended action" value={data.recommendedAction} />

          <EvidenceList label="Affected entities" items={data.affectedEntities} emptyText="No affected entities supplied." />
          <EvidenceList label="Related findings" items={data.relatedFindings} emptyText="No related findings supplied." />
          <EvidenceList label="Timeline" items={data.timeline} emptyText="No timeline events supplied." variant="timeline" />
          <EvidenceList label="Policy controls" items={data.policyControls} emptyText="No policy controls linked." />
          <EvidenceList label="Audit trail" items={data.auditTrail} emptyText="No audit entries available." variant="audit" />
        </div>
      </aside>
    </div>
  );
}

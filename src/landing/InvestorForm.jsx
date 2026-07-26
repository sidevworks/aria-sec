// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import { useCallback, useState } from "react";
import "./TrialForm.css"; // shares the lead-form styling; themed per-sector via --sector

// Investor enquiry. Same endpoint as the trial form, but tagged type:"investor"
// so it lands distinctly (own subject line + DynamoDB stream). Gated by design —
// no raise figures here; the deck is shared privately. No default endpoint: set
// VITE_TRIAL_ENDPOINT at build time (see infra/trial-form/).
const ENDPOINT = import.meta.env.VITE_TRIAL_ENDPOINT || "";

const STAGES = ["Pre-seed", "Seed", "Series A", "Growth / later", "Angel"];
const CHECKS = ["< $100k", "$100k–$500k", "$500k–$2M", "$2M+"];

const EMPTY = {
  name: "",
  email: "",
  firm: "",
  role: "",
  stage: "",
  check: "",
  message: "",
  request_deck: true,
  company_website: "", // honeypot
};

export default function InvestorForm() {
  const [form, setForm] = useState(EMPTY);
  const [status, setStatus] = useState("idle"); // idle | sending | success | error
  const [error, setError] = useState("");

  const set = useCallback(
    (field) => (event) => setForm((prev) => ({ ...prev, [field]: event.target.value })),
    [],
  );
  const toggle = useCallback(
    (field) => (event) => setForm((prev) => ({ ...prev, [field]: event.target.checked })),
    [],
  );

  const submit = useCallback(
    async (event) => {
      event.preventDefault();
      if (status === "sending") return;
      setStatus("sending");
      setError("");
      try {
        if (!ENDPOINT) {
          throw new Error("No submission endpoint configured for this build (VITE_TRIAL_ENDPOINT).");
        }
        const res = await fetch(ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...form, type: "investor", source: "landing-investor", submitted_at: new Date().toISOString() }),
        });
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        setStatus("success");
        setForm(EMPTY);
      } catch (err) {
        setStatus("error");
        setError(err?.message || "Something went wrong.");
      }
    },
    [form, status],
  );

  if (status === "success") {
    return (
      <div className="trialForm trialFormDone" role="status">
        <span className="trialFormKicker">Thank you</span>
        <h2>We&apos;ll be in touch.</h2>
        <p>Your details are with the ARIA team — we&apos;ll follow up and share the investor materials shortly.</p>
        <button type="button" className="trialFormReset" onClick={() => setStatus("idle")}>
          Submit another
        </button>
      </div>
    );
  }

  return (
    <form className="trialForm" onSubmit={submit} aria-label="Investor enquiry">
      <span className="trialFormKicker">Investor relations</span>

      <div className="trialFormGrid">
        <label className="trialField">
          <span>Full name</span>
          <input type="text" value={form.name} onChange={set("name")} required autoComplete="name" />
        </label>
        <label className="trialField">
          <span>Work email</span>
          <input type="email" value={form.email} onChange={set("email")} required autoComplete="email" />
        </label>
        <label className="trialField">
          <span>Fund / firm</span>
          <input type="text" value={form.firm} onChange={set("firm")} required autoComplete="organization" />
        </label>
        <label className="trialField">
          <span>Your role</span>
          <input type="text" value={form.role} onChange={set("role")} placeholder="e.g. Partner, Principal" />
        </label>
        <label className="trialField">
          <span>Stage focus</span>
          <select value={form.stage} onChange={set("stage")}>
            <option value="" disabled>Select…</option>
            {STAGES.map((s) => (<option key={s} value={s}>{s}</option>))}
          </select>
        </label>
        <label className="trialField">
          <span>Typical check</span>
          <select value={form.check} onChange={set("check")}>
            <option value="" disabled>Select…</option>
            {CHECKS.map((s) => (<option key={s} value={s}>{s}</option>))}
          </select>
        </label>
        <label className="trialField trialFieldWide">
          <span>Anything you&apos;d like to share? <em>(optional)</em></span>
          <textarea value={form.message} onChange={set("message")} rows={2} placeholder="Your thesis, fit, or timing." />
        </label>
      </div>

      <label className="trialCheck">
        <input type="checkbox" checked={form.request_deck} onChange={toggle("request_deck")} />
        <span>Send me the investor deck</span>
      </label>

      {/* Honeypot — hidden from humans, filled by bots. */}
      <input
        type="text"
        className="trialHoneypot"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        value={form.company_website}
        onChange={set("company_website")}
      />

      {status === "error" && (
        <p className="trialFormError" role="alert">
          Couldn&apos;t submit ({error}). Please try again, or email{" "}
          <a href="mailto:sary@aria-sec.com">sary@aria-sec.com</a>.
        </p>
      )}

      <button type="submit" className="trialFormSubmit" disabled={status === "sending"}>
        {status === "sending" ? "Sending…" : "Request the deck"}
      </button>
    </form>
  );
}

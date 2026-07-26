// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import { useCallback, useState } from "react";
import "./TrialForm.css";

// Where trial/contact submissions are delivered. Deliberately has no default:
// this is deployment-specific infrastructure, so each build supplies its own
// endpoint (a Lambda, a form service, a staging API) via VITE_TRIAL_ENDPOINT.
// See infra/trial-form/ for a deployable AWS SAM reference implementation.
const ENDPOINT = import.meta.env.VITE_TRIAL_ENDPOINT || "";

const ORG_SIZES = ["1–50", "51–200", "201–500", "501–1,000", "1,000+"];
const INDUSTRIES = [
  "Technology / SaaS",
  "Financial services",
  "Healthcare",
  "Government / Public sector",
  "Retail / E-commerce",
  "Manufacturing",
  "Energy / Utilities",
  "Education",
  "Other",
];
const FOOTPRINTS = [
  "Evaluating — not in production yet",
  "1–3 cloud providers",
  "4+ cloud providers / heavy AI use",
];

const EMPTY = {
  name: "",
  email: "",
  organisation: "",
  size: "",
  role: "",
  industry: "",
  footprint: "",
  message: "",
  company_website: "", // honeypot — must stay empty; only bots fill it
};

export default function TrialForm() {
  const [form, setForm] = useState(EMPTY);
  const [status, setStatus] = useState("idle"); // idle | sending | success | error
  const [error, setError] = useState("");

  const set = useCallback(
    (field) => (event) => setForm((prev) => ({ ...prev, [field]: event.target.value })),
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
          body: JSON.stringify({ ...form, source: "landing-trial", submitted_at: new Date().toISOString() }),
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
        <span className="trialFormKicker">Request received</span>
        <h2>We&apos;ll be in touch shortly.</h2>
        <p>Thanks — your details are with the ARIA team. Expect a tailored evaluation plan in your inbox.</p>
        <button type="button" className="trialFormReset" onClick={() => setStatus("idle")}>
          Submit another
        </button>
      </div>
    );
  }

  return (
    <form className="trialForm" onSubmit={submit} aria-label="Request an ARIA trial">
      <span className="trialFormKicker">Trial request</span>

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
          <span>Organisation</span>
          <input type="text" value={form.organisation} onChange={set("organisation")} required autoComplete="organization" />
        </label>
        <label className="trialField">
          <span>Your role</span>
          <input type="text" value={form.role} onChange={set("role")} autoComplete="organization-title" placeholder="e.g. CISO, Security lead" />
        </label>
        <label className="trialField">
          <span>Organisation size</span>
          <select value={form.size} onChange={set("size")} required>
            <option value="" disabled>Select size…</option>
            {ORG_SIZES.map((s) => (
              <option key={s} value={s}>{s} users</option>
            ))}
          </select>
        </label>
        <label className="trialField">
          <span>Industry</span>
          <select value={form.industry} onChange={set("industry")} required>
            <option value="" disabled>Select industry…</option>
            {INDUSTRIES.map((i) => (
              <option key={i} value={i}>{i}</option>
            ))}
          </select>
        </label>
        <label className="trialField trialFieldWide">
          <span>Cloud &amp; AI footprint</span>
          <select value={form.footprint} onChange={set("footprint")}>
            <option value="" disabled>Select…</option>
            {FOOTPRINTS.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </label>
        <label className="trialField trialFieldWide">
          <span>What would you like to evaluate? <em>(optional)</em></span>
          <textarea value={form.message} onChange={set("message")} rows={2} placeholder="Tell us about your environment, priorities, or timeline." />
        </label>
      </div>

      {/* Honeypot: hidden from humans, irresistible to bots. Off-screen, not a
          11y-announced, and excluded from tab order. */}
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
          Couldn&apos;t submit your request ({error}). Please try again, or email{" "}
          <a href="mailto:hello@aria-sec.com">hello@aria-sec.com</a>.
        </p>
      )}

      <button type="submit" className="trialFormSubmit" disabled={status === "sending"}>
        {status === "sending" ? "Sending…" : "Request trial"}
      </button>
    </form>
  );
}

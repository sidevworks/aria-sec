// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";

// AWS SDK v3 ships in the nodejs20.x Lambda runtime, so there are no
// dependencies to bundle — `sam deploy` just zips this file.
const ses = new SESClient({});
const ddb = new DynamoDBClient({});

const NOTIFY = process.env.NOTIFY_EMAIL;
const FROM = process.env.FROM_EMAIL;
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || "*";
const LEADS_TABLE = process.env.LEADS_TABLE;

const newId = () => `lead-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LIMITS = {
  name: 200,
  email: 320,
  organisation: 200,
  size: 40,
  role: 200,
  industry: 80,
  footprint: 120,
  message: 4000,
};

const clean = (value, max) => String(value ?? "").trim().slice(0, max);

// Escape anything user-supplied before it lands in the HTML email body.
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// Branded HTML notification. Email clients ignore <style>/external CSS, so every
// style is inline and layout uses tables — the lowest common denominator that
// renders consistently across Gmail, Apple Mail, Outlook, etc.
function buildHtml(rec, item) {
  const sans = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  const rows = [
    ["Name", esc(rec.name)],
    ["Email", `<a href="mailto:${esc(rec.email)}" style="color:#1f8fb0;text-decoration:none;">${esc(rec.email)}</a>`],
    ["Role", esc(rec.role) || "&mdash;"],
    ["Cloud &amp; AI", esc(rec.footprint) || "&mdash;"],
  ];
  const rowsHtml = rows.map(([k, v]) => `
        <tr>
          <td style="padding:11px 0;border-bottom:1px solid #eceff3;color:#8a94a3;font:600 11px/1.4 ${sans};letter-spacing:.08em;text-transform:uppercase;width:120px;vertical-align:top;">${k}</td>
          <td style="padding:11px 0;border-bottom:1px solid #eceff3;color:#1a2332;font:500 15px/1.5 ${sans};">${v}</td>
        </tr>`).join("");

  return `<!doctype html><html><body style="margin:0;padding:0;background:#eef1f5;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f5;padding:28px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e3e8ef;">
        <tr><td style="background:#000000;padding:22px 28px;">
          <img src="https://www.aria-sec.com/landing/media/aria-email-logo.png" width="210" height="59" alt="ARIA" style="display:block;border:0;outline:none;text-decoration:none;">
          <div style="margin-top:11px;font:600 14px/1.3 ${sans};letter-spacing:.04em;color:#8fd4e6;">New trial request</div>
        </td></tr>
        <tr><td style="padding:26px 28px 6px;">
          <div style="font:700 22px/1.2 ${sans};color:#0a0e17;">${esc(rec.organisation)}</div>
          <div style="margin-top:5px;font:500 14px/1.4 ${sans};color:#8a94a3;">${esc(rec.size)} users &middot; ${esc(rec.industry) || "&mdash;"}</div>
        </td></tr>
        <tr><td style="padding:10px 28px 6px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rowsHtml}
          </table>
        </td></tr>
        <tr><td style="padding:20px 28px 6px;">
          <div style="color:#8a94a3;font:600 11px/1.4 ${sans};letter-spacing:.08em;text-transform:uppercase;margin-bottom:9px;">Message</div>
          <div style="background:#f5f7fa;border-left:3px solid #37c4e0;border-radius:6px;padding:14px 16px;color:#1a2332;font:400 15px/1.6 ${sans};white-space:pre-wrap;">${esc(rec.message) || "&mdash;"}</div>
        </td></tr>
        <tr><td style="padding:22px 28px 26px;">
          <a href="mailto:${esc(rec.email)}" style="display:inline-block;background:#37c4e0;color:#04222b;font:600 14px/1 ${sans};text-decoration:none;padding:13px 24px;border-radius:999px;">Reply to ${esc(rec.name)}</a>
        </td></tr>
        <tr><td style="padding:16px 28px;background:#fafbfc;border-top:1px solid #eceff3;color:#9aa3b2;font:400 12px/1.6 ${sans};">
          Submitted ${esc(item.received_at)} &middot; source: ${esc(item.source)}<br>Lead ID: ${esc(item.id)}
        </td></tr>
      </table>
    </td></tr>
  </table>
  </body></html>`;
}

const HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": ALLOW_ORIGIN,
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};
const reply = (statusCode, obj) => ({ statusCode, headers: HEADERS, body: JSON.stringify(obj) });

const INVESTOR_LIMITS = { name: 200, email: 320, firm: 200, role: 200, stage: 60, check: 60, message: 4000 };

// Investor-enquiry email — same card system as the trial notification, gold accent.
function buildInvestorHtml(rec, item) {
  const sans = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  const rows = [
    ["Name", esc(rec.name)],
    ["Email", `<a href="mailto:${esc(rec.email)}" style="color:#1f8fb0;text-decoration:none;">${esc(rec.email)}</a>`],
    ["Role", esc(rec.role) || "&mdash;"],
    ["Stage focus", esc(rec.stage) || "&mdash;"],
    ["Typical check", esc(rec.check) || "&mdash;"],
    ["Wants deck", rec.request_deck ? "Yes" : "No"],
  ];
  const rowsHtml = rows.map(([k, v]) => `
        <tr>
          <td style="padding:11px 0;border-bottom:1px solid #eceff3;color:#8a94a3;font:600 11px/1.4 ${sans};letter-spacing:.08em;text-transform:uppercase;width:130px;vertical-align:top;">${k}</td>
          <td style="padding:11px 0;border-bottom:1px solid #eceff3;color:#1a2332;font:500 15px/1.5 ${sans};">${v}</td>
        </tr>`).join("");

  return `<!doctype html><html><body style="margin:0;padding:0;background:#eef1f5;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f5;padding:28px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e3e8ef;">
        <tr><td style="background:#000000;padding:22px 28px;">
          <img src="https://www.aria-sec.com/landing/media/aria-email-logo.png" width="210" height="59" alt="ARIA" style="display:block;border:0;outline:none;text-decoration:none;">
          <div style="margin-top:11px;font:600 14px/1.3 ${sans};letter-spacing:.04em;color:#e6c46e;">Investor enquiry</div>
        </td></tr>
        <tr><td style="padding:26px 28px 6px;">
          <div style="font:700 22px/1.2 ${sans};color:#0a0e17;">${esc(rec.firm)}</div>
        </td></tr>
        <tr><td style="padding:10px 28px 6px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rowsHtml}
          </table>
        </td></tr>
        <tr><td style="padding:20px 28px 6px;">
          <div style="color:#8a94a3;font:600 11px/1.4 ${sans};letter-spacing:.08em;text-transform:uppercase;margin-bottom:9px;">Message</div>
          <div style="background:#f5f7fa;border-left:3px solid #d9a84a;border-radius:6px;padding:14px 16px;color:#1a2332;font:400 15px/1.6 ${sans};white-space:pre-wrap;">${esc(rec.message) || "&mdash;"}</div>
        </td></tr>
        <tr><td style="padding:22px 28px 26px;">
          <a href="mailto:${esc(rec.email)}" style="display:inline-block;background:#0a0e17;color:#ffffff;font:600 14px/1 ${sans};text-decoration:none;padding:13px 24px;border-radius:999px;">Reply to ${esc(rec.name)}</a>
        </td></tr>
        <tr><td style="padding:16px 28px;background:#fafbfc;border-top:1px solid #eceff3;color:#9aa3b2;font:400 12px/1.6 ${sans};">
          Submitted ${esc(item.received_at)} &middot; source: ${esc(item.source)}<br>Enquiry ID: ${esc(item.id)}
        </td></tr>
      </table>
    </td></tr>
  </table>
  </body></html>`;
}

async function handleInvestor(body, event) {
  const rec = {};
  for (const [field, max] of Object.entries(INVESTOR_LIMITS)) rec[field] = clean(body[field], max);
  rec.request_deck = body.request_deck !== false;
  if (!rec.name) return reply(400, { error: "Name is required." });
  if (!EMAIL_RE.test(rec.email)) return reply(400, { error: "A valid work email is required." });
  if (!rec.firm) return reply(400, { error: "Fund / firm is required." });

  // Store first (durability). entity:"investor" keeps these a separate, queryable stream.
  const item = {
    id: `inv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    entity: "investor",
    received_at: new Date().toISOString(),
    ...rec,
    source: clean(body.source, 60) || "landing-investor",
    ip: clean(event?.requestContext?.http?.sourceIp, 64) || null,
    user_agent: clean(event?.headers?.["user-agent"], 400) || null,
  };
  try {
    await ddb.send(new PutItemCommand({ TableName: LEADS_TABLE, Item: marshall(item, { removeUndefinedValues: true }) }));
  } catch (err) {
    console.error("DynamoDB put failed (investor):", err);
    return reply(500, { error: "Could not store request. Please try again." });
  }

  const text = [
    `Fund / firm:   ${rec.firm}`,
    `Name:          ${rec.name}`,
    `Email:         ${rec.email}`,
    `Role:          ${rec.role || "—"}`,
    `Stage focus:   ${rec.stage || "—"}`,
    `Typical check: ${rec.check || "—"}`,
    `Wants deck:    ${rec.request_deck ? "Yes" : "No"}`,
    "",
    "Message:",
    rec.message || "—",
    "",
    `— investor enquiry, submitted ${item.received_at} (${item.id})`,
  ].join("\n");

  try {
    await ses.send(new SendEmailCommand({
      Source: FROM,
      Destination: { ToAddresses: [NOTIFY] },
      ReplyToAddresses: [rec.email],
      Message: {
        Subject: { Data: `New investor enquiry — ${rec.firm}` },
        Body: { Text: { Data: text }, Html: { Data: buildInvestorHtml(rec, item) } },
      },
    }));
  } catch (err) {
    console.error("SES send failed (investor, still stored):", err);
  }

  return reply(200, { ok: true, id: item.id });
}

export const handler = async (event) => {
  const method = event?.requestContext?.http?.method;
  if (method === "OPTIONS") return reply(204, {});
  if (method !== "POST") return reply(405, { error: "Method not allowed" });

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch { return reply(400, { error: "Invalid JSON" }); }

  // Honeypot: a hidden field no human fills. If a bot populated it, pretend
  // success and send nothing — silent so scrapers don't learn to skip it.
  if (clean(body.company_website, 200)) return reply(200, { ok: true });

  // Investor enquiries share this endpoint but are a separate stream.
  if (String(body.type || "").toLowerCase() === "investor") {
    return handleInvestor(body, event);
  }

  const rec = {};
  for (const [field, max] of Object.entries(LIMITS)) rec[field] = clean(body[field], max);
  if (!rec.name) return reply(400, { error: "Name is required." });
  if (!EMAIL_RE.test(rec.email)) return reply(400, { error: "A valid work email is required." });
  if (!rec.organisation) return reply(400, { error: "Organisation is required." });
  if (!rec.size) return reply(400, { error: "Organisation size is required." });

  // ── Store first (durability) ────────────────────────────────────────────────
  // A lead must never be lost, so it is written to DynamoDB before we attempt the
  // (best-effort) email. `entity` is the constant GSI partition for time queries.
  const item = {
    id: newId(),
    entity: "lead",
    received_at: new Date().toISOString(),
    ...rec,
    source: clean(body.source, 60) || "landing",
    ip: clean(event?.requestContext?.http?.sourceIp, 64) || null,
    user_agent: clean(event?.headers?.["user-agent"], 400) || null,
  };
  try {
    await ddb.send(new PutItemCommand({
      TableName: LEADS_TABLE,
      Item: marshall(item, { removeUndefinedValues: true }),
    }));
  } catch (err) {
    console.error("DynamoDB put failed:", err);
    return reply(500, { error: "Could not store request. Please try again." });
  }

  const text = [
    `Organisation:  ${rec.organisation}`,
    `Size:          ${rec.size} users`,
    `Name:          ${rec.name}`,
    `Email:         ${rec.email}`,
    `Role:          ${rec.role || "—"}`,
    `Industry:      ${rec.industry || "—"}`,
    `Cloud & AI:    ${rec.footprint || "—"}`,
    "",
    "Message:",
    rec.message || "—",
    "",
    `— submitted ${item.received_at} from the ARIA landing (lead ${item.id})`,
  ].join("\n");

  // ── Notify (best-effort) ──────────────────────────────────────────────────
  // The lead is already persisted, so an email failure must NOT fail the request
  // (that would prompt a resubmit and duplicate the stored lead). Log and move on.
  try {
    await ses.send(new SendEmailCommand({
      Source: FROM,
      Destination: { ToAddresses: [NOTIFY] },
      ReplyToAddresses: [rec.email], // reply goes straight to the prospect
      Message: {
        Subject: { Data: `New ARIA trial request — ${rec.organisation}` },
        Body: {
          Text: { Data: text },                 // fallback for non-HTML clients
          Html: { Data: buildHtml(rec, item) }, // branded layout
        },
      },
    }));
  } catch (err) {
    console.error("SES send failed (lead still stored):", err);
  }

  return reply(200, { ok: true, id: item.id });
};

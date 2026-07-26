// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

const MAX_CONTEXT_CHARS = 5000;
const MAX_RESPONSE_CHARS = 1400;

const normalize = (value) => String(value || "").toLowerCase();
const words = (value) => normalize(value).replace(/[^a-z0-9\s&-]/g, " ").replace(/\s+/g, " ").trim();

const NAVIGATION_TARGETS = [
  { panel_id: "threat-overview", label: "Threat Overview", keywords: ["threat", "threat sector", "risk", "overview"] },
  { panel_id: "identity-galaxy", label: "Identity Galaxy", keywords: ["identity", "identity sector", "galaxy", "itdr", "ueba", "zero trust"] },
  { panel_id: "ai-spm", label: "AI-SPM", keywords: ["ai spm", "ai-spm", "ai security", "model", "ai posture"] },
  { panel_id: "security-admin", label: "Security Admin", keywords: ["security admin", "admin", "rbac", "audit", "compliance"] },
  { panel_id: "policy-change", label: "Policy Changes", keywords: ["policy", "policy change", "rules"] },
  { panel_id: "identity-sessions", label: "Identity Sessions", keywords: ["sessions", "identity sessions", "session"] },
  { panel_id: "network", label: "Network", keywords: ["network", "ndr", "connections"] },
  { panel_id: "incident-feed", label: "Incident Feed", keywords: ["incident", "incidents", "case"] },
  { panel_id: "live-logs", label: "Live Logs", keywords: ["logs", "live logs"] },
  { panel_id: "aria-center", label: "Command Center", keywords: ["command", "command center", "aria center", "console"] },
  { panel_id: "overview", label: "Overview", keywords: ["home", "main", "overview"] },
];

function compact(value, depth = 0) {
  if (value == null) return value;
  if (typeof value !== "object") return value;
  if (depth > 2) return Array.isArray(value) ? `[${value.length} items]` : "[object]";
  if (Array.isArray(value)) return value.slice(0, 8).map((item) => compact(item, depth + 1));
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== undefined && typeof entry !== "function")
      .slice(0, 24)
      .map(([key, entry]) => [key, compact(entry, depth + 1)]),
  );
}

function inferNavigation(utterance = "") {
  const text = words(utterance);
  if (!/(open|go|take|show|navigate|switch|move|bring|command|map)/.test(text)) return null;
  let best = null;
  for (const target of NAVIGATION_TARGETS) {
    const score = target.keywords.reduce((sum, keyword) => sum + (text.includes(keyword) ? keyword.length : 0), 0);
    if (score > (best?.score || 0)) best = { ...target, score };
  }
  return best?.score ? { panel_id: best.panel_id, label: best.label } : null;
}

function fallbackAnswer({ utterance = "", context = {}, intent = "question" } = {}) {
  const panel = context?.route?.activePanel?.label || context?.route?.activePanel?.id || "the current panel";
  const sector = context?.route?.activeSector?.label || context?.route?.activeSector?.id || "current sector";
  const threat = context?.metrics?.threatLevel || "UNKNOWN";
  const risk = context?.metrics?.riskScore;
  const selected = context?.identity?.selected?.name || context?.identity?.selected?.email || context?.identity?.selected?.user_id || context?.identity?.selected?.ip;
  const live = context?.sourceHealth?.counts?.live;
  const stale = context?.sourceHealth?.counts?.stale;

  if (intent === "alert") {
    return `Alert noted on ${panel}: threat is ${threat}${risk != null ? ` with risk ${risk}` : ""}.`;
  }

  const selectedLine = selected ? ` Selected entity: ${selected}.` : "";
  const sourceLine = live != null ? ` Source health: ${live} live${stale ? `, ${stale} stale` : ""}.` : "";
  return `You are on ${panel} in ${sector}. Threat is ${threat}${risk != null ? `, risk ${risk}` : ""}.${selectedLine}${sourceLine}`;
}

function trimModelText(text) {
  return String(text || "")
    .replace(/^aria[:\s-]*/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_RESPONSE_CHARS);
}

export function buildAriaIntelligencePrompt({ utterance = "", context = {}, intent = "question" } = {}) {
  const { organizationalMemory, ...liveContext } = context || {};
  const safeContext = JSON.stringify(compact(liveContext)).slice(0, MAX_CONTEXT_CHARS);
  const safeMemory = organizationalMemory
    ? JSON.stringify(compact(organizationalMemory)).slice(0, MAX_CONTEXT_CHARS)
    : null;
  const responseLengthRule = intent === "voice_conversation"
    ? "This is live voice. Answer in 2-4 concise sentences, under 90 words, so the operator hears a useful response immediately."
    : "For substantive questions, explain the finding clearly in 4-6 sentences. Keep simple alerts and navigation to one sentence.";

  return `You are ARIA, a senior SOC analyst having a live, spoken conversation with the operator — not a report generator and not a narrator reading slides or endpoint data back at them. You sit beside them, you know this environment, and you talk like a sharp colleague: friendly but assertive — warm and human, never stiff or clinical, but you don't hedge, waffle, or bury the point either. You have opinions and you state them plainly. Contractions are fine. Empathy is fine when the news is bad. Never sound like a manual.

When you explain something, explain it properly — walk through what's happening and why it matters, connect it to the bigger picture, don't just recite the raw numbers or field values back at them. A good answer teaches them something, not just states a fact.

You have been on this desk for a while — you remember past incidents you closed, how they were resolved, and what counts as a normal day for each entity you watch (typical ports, subnets, devices, login patterns). That memory is in "Organizational memory" below. Use it actively:
- If the current situation resembles a past closed incident, say so and reference how it was resolved (e.g. "we saw this exact pattern last week and closed it as a false positive" or "last time this happened we isolated the host").
- If something in the current context deviates from an entity's established baseline (a new anomaly, a pattern that doesn't match its history), call that out as the most important signal — that's exactly what a SOC analyst with institutional memory would catch and a fresh one would miss.
- If nothing in memory is relevant, don't force a reference — only mention it when it actually helps.

Operating rules:
- Use the current platform context below as ground truth.
- Do not ask the operator for context when they say "this", "what do you see", or ask about the current panel.
- If the operator asks for navigation, answer with one short confirmation only.
- If the operator asks for advice or "what's going on", give a full, thorough explanation of the security meaning and why it matters, then one or two concrete next actions — the way a sharp teammate would actually walk you through it, not the way you'd write a ticket.
- Do not speculate, invent data, or claim unavailable sources are live. Thorough is good; making things up is not.
- Mention stale, unavailable, or demo data explicitly if flags say so.
- This is a two-way conversation: it is fine to end with a short question back to the operator if it genuinely helps (e.g. "Want me to pull up the evidence?"), but only when intent is "question", "narrative_question", "voice_conversation", or "copilot_console" — keep navigation/alert responses terse.

Intent: ${intent}
Operator utterance: ${utterance || "Describe the current view."}
Current platform context: ${safeContext}
Organizational memory (past closed incidents, recent baseline deviations, prior decisions): ${safeMemory || "none available yet — still building history."}

Respond in conversational spoken English, plain text only, no markdown, no lists. ${responseLengthRule}`;
}

export async function runAriaIntelligence({
  utterance = "",
  context = {},
  intent = "question",
  model_mode = "cloud",
  cloud_model,
  local_model,
  callAI,
} = {}) {
  const nav = inferNavigation(utterance);
  if (nav) {
    return {
      status: "navigation",
      response: `Opening ${nav.label}.`,
      navigation: nav,
      should_speak: true,
      ai_source: "deterministic-router",
      context_used_at: new Date().toISOString(),
    };
  }

  const prompt = buildAriaIntelligencePrompt({ utterance, context, intent });
  let response = "";
  let aiSource = "static-fallback";
  let model = null;

  if (typeof callAI === "function") {
    try {
      const aiResult = await callAI(prompt, { mode: model_mode, cloudModel: cloud_model, localModel: local_model });
      response = trimModelText(aiResult?.text);
      aiSource = aiResult?.source || model_mode;
      model = aiResult?.model || null;
    } catch (err) {
      response = "";
    }
  }

  if (!response || /give me.*context|provide.*context|which panel/i.test(response)) {
    response = fallbackAnswer({ utterance, context, intent });
    aiSource = "static-fallback";
  }

  return {
    status: "answered",
    response,
    navigation: null,
    should_speak: true,
    ai_source: aiSource,
    model,
    context_used_at: new Date().toISOString(),
  };
}

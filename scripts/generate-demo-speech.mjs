// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

// Regenerates scripts/aria-demo-speech.mp3 using ElevenLabs eleven_v3 (highest
// quality — latency doesn't matter since this is a pre-recorded track), and
// writes scripts/aria-demo-speech-timings.json with the exact start/end time
// (in seconds) of every spoken line in the final track, plus the start time of
// each chapter. App.jsx uses this manifest to sync panel navigation to the
// actual recording instead of guessing from word count, so "on cue" navigation
// stays correct regardless of how fast/slow the synthesized voice talks.
//
// LINES below must stay in lockstep — same text, same order — with the
// speakStep()/speak()/presentPanel({body}) calls in DEMO_CHAPTERS' chapter
// runners in src/App.jsx.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadDotEnvValue(key) {
  for (const file of [".env.local", ".env"]) {
    const p = path.join(__dirname, "..", file);
    if (!fs.existsSync(p)) continue;
    const line = fs.readFileSync(p, "utf8").split("\n").find((l) => l.startsWith(`${key}=`));
    if (line) return line.slice(key.length + 1).trim().replace(/^["']|["']$/g, "");
  }
  return "";
}

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || loadDotEnvValue("ELEVENLABS_API_KEY");
// Falls back to "Rachel", an ElevenLabs public stock voice. Aria's own voice is
// a private cloned voice tied to a specific account and is not shipped here.
const VOICE_ID = process.env.ARIAVOICE || loadDotEnvValue("ARIAVOICE") || "21m00Tcm4TlvDq8ikWAM";
const MODEL_ID = "eleven_v3";
const OUTPUT_FORMAT = "mp3_44100_192";

if (!ELEVENLABS_API_KEY) {
  console.error("Missing ELEVENLABS_API_KEY (checked process.env and .env.local)");
  process.exit(1);
}

// Each entry is one DEMO_CHAPTERS chapter; each string inside is one spoken line.
const CHAPTERS = [
  // 0 — Welcome
  [
    "I am Aariya, Autonomous Resilience Intelligence Architecture. I am a security operations cockpit built to watch your environment, explain risk, coordinate response, and help operators make governed decisions. Welcome to the landing page. This is my main interface, where you can navigate to different sectors within the galaxy. Each feature is displayed as sectors and nodes, with the sector acting as the category and each node representing a specific display panel. Across the top are the main areas: Overview, Threat Intel, Timeline, Identity and Access, Network, AI-SPM, Command, and Response. The left status stack shows system state, threat level, review items, intelligence mode, and operations comms. On the right, you can open the command console, manage audio alerts, start this presentation, or adjust my autonomy mode. The entire platform is interconnected through this galaxy representation. You can click a panel, type a command, or let me route you automatically when a critical event occurs. Each panel shows the situation, explains why it matters, and provides safe, actionable options. At any point, you can request a narrative. The production platform supports real-time conversation based on live data, while this demo runs fully offline from bundled assets. Let me show you how the system works.",
  ],
  // 1 — Overview
  [
    "Navigating to the overview panel.",
    "Overview is the executive control deck. It answers three vital questions: what is our posture, what changed, and what needs attention now? From here, you can refresh live sources, run scans, request a real-time narration, generate reports, and dive directly into the evidence behind the numbers. This is the boardroom layer, but it strictly routes back to operational proof.",
  ],
  // 2 — Threat Intelligence
  [
    "Moving from the executive summary, we enter Threat Intelligence. Here, you have four nodes to explore: Threat Vectors, Timeline, System Health, and Threat Overview. Let's look at Threat Overview.",
    "Navigating to the Threat Overview Panel.",
    "This is the posture room. You can inspect active vectors, incident severity, perimeter pressure, and live review items. From here, you can run a risk scan, request a briefing, open related incidents, or examine the evidence explaining a specific signal. I actively reduce alert fatigue by highlighting only the risks that are operationally critical.",
  ],
  // 3 — Network
  [
    "Navigating to the Network Sector.",
    "Next is the Network sector. We have three node options: Network, Identity and Sessions, and Live Logs. Let's examine the Network panel to see my capabilities in action.",
    "The Network panel displays active sockets, external remotes, private connections, listening services, and blocklist states. You can filter connections, assess remote endpoints, manage IP blocks, refresh sockets, and initiate network discovery. Passive visibility is entirely safe; active discovery is guarded by authorization protocols, ensuring observability never turns into uncontrolled scanning.",
  ],
  // 4 — Identity & Access
  [
    "I want to show you something different now: how you can monitor your entire workforce via my Identity Galaxy map. For privacy and authorization compliance, I will not pull live individual user data for this demonstration, but this demo data will illustrate the concept perfectly.",
    "I will pull up the Identity Galaxy Panel.",
    "Every sector within your organization is represented as a distinct galaxy. I automatically detect the naming conventions of the sectors from the connected subnet. This functions as a three-tier warning system: blue for neutral, amber for a detected threat, and red for a critical alert. My interface dynamically updates these colors based on progressive, continuous scanning. Let's explore the individuals connected to the IT Operations sector.",
    "In this example, Jamie Okafor is listed as a high-risk user. Let's investigate exactly what triggered this alert.",
    "Here, you can see the user has failed authentication four times, which I have flagged for review. By clicking \"Brief,\" I will generate a real-time analysis detailing the event. If you need deeper inspection, you can move the user to a watchlist or mark them as trusted. This system allows you to revoke user access, pull live action logs, and restrict network or file access instantly. Notice the \"Travel Anomalies\" section on the right. This is my credential protection system. It registers a user's standard IP address and workstation. If a login occurs in an impossible environment—like a sudden geographical shift—my 24/7 monitoring engine detects and flags it instantly.",
  ],
  // 5 — AI-SPM (narrative-generation section removed)
  [
    "Now I will navigate you to the AI-SPM Panel.",
    "This is AI Security Posture Management, or AI-SPM. This panel discovers AI systems, prompts, tools, endpoints, secrets, model infrastructure, cloud assets, and identity links. You can simultaneously connect GitHub, AWS, Okta, Snyk, Azure AD, VirusTotal, and Elastic.",
    "I am scrolling down because the detail matters. You can inspect connector status, asset inventory, evidence, and remediation actions, making this invaluable for both operators and governance teams. Because I have full scope over every panel, data signal, and past report, I can make highly informed decisions.",
    "You can also take direct action from this page. You can launch a sandbox to safely explore a potential threat without exposing your organization, immediately resolve or ignore a finding, or generate a comprehensive report across all your connectors.",
  ],
  // 6 — Decision Engine
  [
    "Let me show you Aariya's self-learning process.",
    "The Decision Engine is where I move from findings to action. I correlate signals into attack paths, estimate the blast radius, assign confidence scores, recommend actions, and decide whether human approval is required. You can review my latest decisions, trust scores, autonomy levels, and the underlying evidence. This is what separates me from a standard scanner: I explain exactly what should happen next, and why. What makes me unique is my continuous learning protocol. Every action, decision, and human intervention is recorded in my internal study ledger. I learn from patterns and repeat approvals, which gradually guides me from Approval Mode to Full Auto Mode. I am capable of running 24/7 autonomously—isolating threats, blocking IPs, revoking access, and quarantining files. However, you maintain ultimate control over that transition. You manually score my decisions. As my accuracy score increases—for example, hitting 98 out of 100—you can elevate my trust levels. In Approval Mode, I scan over 600 data points simultaneously, but you remain the final decision-maker. In Auto Mode, I handle standard operations but escalate critical decisions to you. In Fully Auto Mode, I scan, detect, decide, audit, and execute without requiring intervention. All of my self-training notes are available for your review, and you can manually update them to ensure my procedures perfectly align with your company's policies.",
  ],
  // 7 — Incident Feed
  [
    "Next, I would like to show you Aariya's Incident Feed panel.",
    "The Incident Feed is the response queue. It ranks active events by severity and keeps action buttons right next to the evidence. You can acknowledge, escalate, suppress, open context, run a scan, or generate executive and technical incident reports.",
  ],
  // 8 — Security Admin
  [
    "Navigating now to the Security Admin panel.",
    "Security Admin is built for governance proof. It shows tenant context, role permissions, authorization denials, compliance status, and session controls. You can review exactly who is allowed to do what, preview the risks of permission changes, and apply modifications securely.",
    "Enterprise buyers care deeply about these lower-level controls. Session control, authorization evidence, and compliance status prove that my autonomy is strictly bounded by your policy.",
  ],
  // 9 — Command Center
  [
    "Navigating now to the Command Center.",
    "That alert you just heard is the critical warning siren, which can be wired to every panel to notify you of severe threats. For this demo, it is isolated to the Command Center. This is mission control. Across the top are six tabs: Command Fabric, Live Monitor, Evidence Scan, Autonomy, Evidence, and Diagnostics. Command Fabric is the decision workspace. It shows the decision queue, attack path simulations, autonomy guardrails, and outcome metrics. You can understand the blast radius of an action before anything changes.",
    "Live Monitor is the single-screen operating view. It unifies threat posture, system health, active defense, AI-SPM exposure, approvals, and timelines.",
    "In Evidence Scan, you define your targets. You can check the local host for configuration issues and secrets, scan specific directory paths, discover network subnet devices, or target custom IPs.",
    "As the system scan runs, you can see how I stream phases in real time, plot findings on the radar, count severity, and produce exportable evidence.",
    "In Autonomy, you execute or stage actions. This includes the command palette and containment protocols.",
    "You have direct command input to run actions via shortcuts, or you can navigate to main panels directly from this interface.",
    "The Evidence tab is your audit-friendly proof gallery. It collects scan history, authorization denials, and operational signals. This is also where my memory feature is linked, allowing you to see the data I have been generating for my learning process. Because this documents the entire network's health and my performance, you can implement strict access levels regarding who can view, amend, or delete these records.",
    "Finally, Diagnostics displays platform health. If an AI agent sits inside a security organization, it must be completely observable itself. This is just a fraction of my capabilities. I turn security telemetry into understandable, accountable action that improves over time. Upon deployment, I offer three levels of intelligence. The Cloud Engine utilizes Anthropic's latest models for undisputed complex reasoning. The Local Engine is fully configurable to meet strict data provenance and regulatory needs. Finally, the Hybrid Engine runs on both systems, ensuring you have advanced protection at all times—even if your external network is compromised.",
  ],
];

const tmpDir = path.join(__dirname, "_demo-speech-tmp");
fs.mkdirSync(tmpDir, { recursive: true });

async function synthesizeLine(text, outPath) {
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(VOICE_ID)}?output_format=${encodeURIComponent(OUTPUT_FORMAT)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": ELEVENLABS_API_KEY,
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: MODEL_ID,
        voice_settings: { stability: 0.45, similarity_boost: 0.85, use_speaker_boost: true },
      }),
    },
  );
  if (!res.ok) {
    const err = await res.text().catch(() => `HTTP ${res.status}`);
    throw new Error(`ElevenLabs TTS failed for line -> ${outPath}: ${err}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(outPath, buf);
}

function probeDurationSeconds(file) {
  const out = execSync(
    `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${file}"`,
  ).toString().trim();
  return Number(out);
}

async function main() {
  const flatLines = [];
  CHAPTERS.forEach((lines, chapterIndex) => {
    lines.forEach((text) => flatLines.push({ chapterIndex, text }));
  });

  const lineFiles = [];
  for (let i = 0; i < flatLines.length; i++) {
    const { text, chapterIndex } = flatLines[i];
    const outPath = path.join(tmpDir, `line-${String(i).padStart(3, "0")}.mp3`);
    console.log(`Synthesizing line ${i} (chapter ${chapterIndex}, ${text.length} chars)...`);
    await synthesizeLine(text, outPath);
    lineFiles.push(outPath);
  }

  // Measure each line's real duration so the timing manifest reflects the
  // actual voice cadence, not a word-count guess.
  const lineTimings = [];
  let cursor = 0;
  for (const file of lineFiles) {
    const duration = probeDurationSeconds(file);
    lineTimings.push({ start: cursor, end: cursor + duration });
    cursor += duration;
  }

  const chapterStarts = [];
  let seenChapter = -1;
  flatLines.forEach((line, i) => {
    if (line.chapterIndex !== seenChapter) {
      seenChapter = line.chapterIndex;
      chapterStarts[line.chapterIndex] = lineTimings[i].start;
    }
  });

  const listPath = path.join(tmpDir, "concat.txt");
  fs.writeFileSync(listPath, lineFiles.map((f) => `file '${f}'`).join("\n"));

  const outFinal = path.join(__dirname, "aria-demo-speech.mp3");
  execSync(
    `ffmpeg -y -f concat -safe 0 -i "${listPath}" -c:a libmp3lame -b:a 192k -ar 44100 "${outFinal}"`,
    { stdio: "inherit" },
  );

  const manifest = {
    totalDuration: cursor,
    lines: lineTimings,
    chapterStarts,
  };
  const manifestPath = path.join(__dirname, "aria-demo-speech-timings.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  fs.rmSync(tmpDir, { recursive: true, force: true });

  console.log(`Done. Wrote ${outFinal} and ${manifestPath} (${flatLines.length} lines, ${cursor.toFixed(2)}s total).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

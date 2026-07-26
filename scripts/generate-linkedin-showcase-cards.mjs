import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const outputDir = path.join(root, "marketing", "linkedin", "showcase-cards");
const backgroundPath = path.join(
  root,
  "public",
  "landing",
  "social",
  "aria-linkedin-launch-artwork.png",
);

await fs.mkdir(outputDir, { recursive: true });

const width = 2400;
const height = 2400;

const background = await sharp(backgroundPath)
  .resize(width, height, { fit: "cover" })
  .blur(2.2)
  .modulate({ brightness: 0.36, saturation: 1.18 })
  .png()
  .toBuffer();

const artwork = `
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="core" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#ffffff" stop-opacity="1"/>
      <stop offset="0.12" stop-color="#6eeaff" stop-opacity=".98"/>
      <stop offset="0.34" stop-color="#087dff" stop-opacity=".42"/>
      <stop offset="1" stop-color="#071326" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="shade" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#02060d" stop-opacity=".42"/>
      <stop offset=".5" stop-color="#03101e" stop-opacity=".12"/>
      <stop offset="1" stop-color="#010308" stop-opacity=".56"/>
    </linearGradient>
    <linearGradient id="cyan" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#6eeaff"/>
      <stop offset="1" stop-color="#1689ff"/>
    </linearGradient>
    <filter id="glow">
      <feGaussianBlur stdDeviation="16" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <style>
      .font { font-family: Avenir Next, Avenir, Helvetica, Arial, sans-serif; }
      .eyebrow { font-size: 29px; font-weight: 600; letter-spacing: 8px; fill: #6eeaff; }
      .title { font-size: 82px; font-weight: 650; letter-spacing: -2px; fill: #ffffff; }
      .body { font-size: 38px; font-weight: 450; fill: #d9e9f4; }
      .detail { font-size: 25px; font-weight: 600; letter-spacing: 4px; fill: #78dff5; }
      .number { font-size: 27px; font-weight: 650; letter-spacing: 4px; fill: #ffffff; }
    </style>
  </defs>

  <rect width="2400" height="2400" fill="url(#shade)"/>
  <rect x="42" y="42" width="2316" height="2316" rx="38" fill="none" stroke="#56dff5" stroke-opacity=".22" stroke-width="2"/>
  <path d="M1200 0V2400M0 1200H2400" stroke="#5ce7ff" stroke-opacity=".12" stroke-width="2"/>

  <circle cx="1200" cy="1200" r="770" fill="none" stroke="#45dbff" stroke-opacity=".16" stroke-width="3"/>
  <circle cx="1200" cy="1200" r="615" fill="none" stroke="#7a67ff" stroke-opacity=".2" stroke-width="2" stroke-dasharray="18 26"/>
  <ellipse cx="1200" cy="1200" rx="1010" ry="360" fill="none" stroke="#49dfff" stroke-opacity=".17" stroke-width="3" transform="rotate(-18 1200 1200)"/>
  <ellipse cx="1200" cy="1200" rx="1040" ry="330" fill="none" stroke="#9d5cff" stroke-opacity=".14" stroke-width="2" transform="rotate(37 1200 1200)"/>
  <circle cx="1200" cy="1200" r="215" fill="url(#core)" filter="url(#glow)"/>
  <circle cx="1200" cy="1200" r="74" fill="#071529" stroke="#8beeff" stroke-width="4"/>
  <text class="font" x="1200" y="1232" text-anchor="middle" font-size="86" font-weight="650" fill="#ffffff">A</text>

  <!-- Card 1 -->
  <g class="font" transform="translate(105 105)">
    <text class="number" x="0" y="34">01 / ARIA</text>
    <rect x="0" y="74" width="210" height="4" rx="2" fill="url(#cyan)"/>
    <text class="eyebrow" x="0" y="166">WHAT IT IS</text>
    <text class="title" x="0" y="276">An AI security</text>
    <text class="title" x="0" y="370">operations cockpit.</text>
    <text class="body" x="0" y="492">One operational view across</text>
    <text class="body" x="0" y="548">identities, networks and AI systems.</text>
    <text class="detail" x="0" y="690">SEE THE WHOLE ENVIRONMENT</text>
  </g>

  <!-- Card 2 -->
  <g class="font" transform="translate(1305 105)">
    <text class="number" x="0" y="34">02 / INVESTIGATE</text>
    <rect x="0" y="74" width="210" height="4" rx="2" fill="url(#cyan)"/>
    <text class="eyebrow" x="0" y="166">WHAT IT UNDERSTANDS</text>
    <text class="title" x="0" y="276">Threats in context.</text>
    <text class="body" x="0" y="412">ARIA correlates security signals,</text>
    <text class="body" x="0" y="468">maps the potential blast radius,</text>
    <text class="body" x="0" y="524">and explains risk in plain language.</text>
    <text class="detail" x="0" y="690">SIGNAL → EVIDENCE → EXPLANATION</text>
  </g>

  <!-- Card 3 -->
  <g class="font" transform="translate(105 1305)">
    <text class="number" x="0" y="34">03 / DECIDE</text>
    <rect x="0" y="74" width="210" height="4" rx="2" fill="url(#cyan)"/>
    <text class="eyebrow" x="0" y="166">WHAT IT RECOMMENDS</text>
    <text class="title" x="0" y="276">A response you</text>
    <text class="title" x="0" y="370">can understand.</text>
    <text class="body" x="0" y="492">ARIA proposes the next action with</text>
    <text class="body" x="0" y="548">supporting evidence and reasoning.</text>
    <text class="detail" x="0" y="690">CONTEXT → CONFIDENCE → ACTION</text>
  </g>

  <!-- Card 4 -->
  <g class="font" transform="translate(1305 1305)">
    <text class="number" x="0" y="34">04 / ACT</text>
    <rect x="0" y="74" width="210" height="4" rx="2" fill="url(#cyan)"/>
    <text class="eyebrow" x="0" y="166">HOW CONTROL WORKS</text>
    <text class="title" x="0" y="276">Autonomy, governed.</text>
    <text class="body" x="0" y="412">Meaningful actions stay bounded by</text>
    <text class="body" x="0" y="468">your policies and human approval.</text>
    <text class="body" x="0" y="524">Every decision remains auditable.</text>
    <text class="detail" x="0" y="690">EXPLAIN → APPROVE → ACT → VERIFY</text>
  </g>

  <g class="font" fill="#ffffff" opacity=".84">
    <text x="105" y="1120" font-size="26" letter-spacing="6">ARIA-SEC.COM</text>
    <text x="2295" y="1120" font-size="26" letter-spacing="6" text-anchor="end">GOVERNED AUTONOMY</text>
    <text x="105" y="2320" font-size="25" letter-spacing="5">THE SECURITY ANALYST YOU CAN TRUST TO ACT.</text>
    <text x="2295" y="2320" font-size="25" letter-spacing="5" text-anchor="end">ARIA-SEC.COM</text>
  </g>
</svg>`;

const master = await sharp(background)
  .composite([{ input: Buffer.from(artwork), top: 0, left: 0 }])
  .png()
  .toBuffer();

await sharp(master).png().toFile(path.join(outputDir, "aria-showcase-combined-preview.png"));

const cards = [
  { name: "01-what-is-aria.png", left: 0, top: 0 },
  { name: "02-investigate.png", left: 1200, top: 0 },
  { name: "03-decide.png", left: 0, top: 1200 },
  { name: "04-governed-action.png", left: 1200, top: 1200 },
];

for (const card of cards) {
  await sharp(master)
    .extract({ left: card.left, top: card.top, width: 1200, height: 1200 })
    .png()
    .toFile(path.join(outputDir, card.name));
}

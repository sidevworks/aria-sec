import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const out = path.join(root, "marketing", "linkedin", "title-cards");
await fs.mkdir(out, { recursive: true });

const cards = [
  ["SECURITY TEAMS DON’T NEED", "ANOTHER DASHBOARD.", "", 500],
  ["THEY NEED AN ANALYST", "THEY CAN TRUST TO ACT.", "", 500],
  ["THREAT DETECTED.", "", "LIVE SECURITY SIGNALS · ONE OPERATIONAL VIEW", 165],
  ["BLAST RADIUS MAPPED.", "", "IDENTITIES · PRIVILEGE · BEHAVIOUR", 165],
  ["RISK EXPLAINED.", "", "AI SYSTEMS · FINDINGS · EVIDENCE", 165],
  ["RESPONSE PROPOSED.", "", "CONTEXT · CONFIDENCE · RECOMMENDED ACTION", 165],
  ["HUMAN APPROVAL RETAINED.", "", "AUTONOMY IS EARNED · NOT ASSUMED", 165],
  ["GOVERNED AUTONOMY.", "", "FROM SIGNAL TO VERIFIED ACTION", 505],
  ["THE SECURITY ANALYST", "YOU CAN TRUST TO ACT.", "ARIA-SEC.COM", 805],
];

const esc = (value) =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

for (const [index, [line1, line2, subline, y]] of cards.entries()) {
  const isEnd = index === 8;
  const headlineSize = line1.length > 24 ? 54 : 66;
  const secondY = y + 78;
  const subY = isEnd ? y + 225 : y + (line2 ? 175 : 110);
  const ruleY = isEnd ? y + 165 : y + (line2 ? 155 : 82);
  const svg = `
    <svg width="1080" height="1350" xmlns="http://www.w3.org/2000/svg">
      <style>
        .h { font-family: Avenir Next, Avenir, Helvetica, sans-serif; font-weight: 600; letter-spacing: 1px; }
        .s { font-family: Avenir Next, Avenir, Helvetica, sans-serif; font-weight: 500; letter-spacing: 4px; }
      </style>
      <text class="h" x="540" y="${y}" fill="#ffffff" font-size="${headlineSize}" text-anchor="middle">${esc(line1)}</text>
      ${line2 ? `<text class="h" x="540" y="${secondY}" fill="#65e9ff" font-size="${headlineSize + 3}" text-anchor="middle">${esc(line2)}</text>` : ""}
      <rect x="390" y="${ruleY}" width="300" height="3" fill="#65e9ff" opacity="0.85"/>
      ${subline ? `<text class="s" x="540" y="${subY}" fill="${isEnd ? "#ffffff" : "#65e9ff"}" font-size="${isEnd ? 30 : 24}" text-anchor="middle">${esc(subline)}</text>` : ""}
    </svg>`;
  await sharp(Buffer.from(svg)).png().toFile(path.join(out, `card-${index}.png`));
}

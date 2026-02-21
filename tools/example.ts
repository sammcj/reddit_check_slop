#!/usr/bin/env node
/**
 * Standalone example runner -- applies the same detection logic as server.ts
 * against local test data files and prints results to stdout.
 *
 * Output mirrors the markdown format the app writes to the Devvit log, so you
 * can preview what `devvit logs` would show without deploying.
 *
 * Usage: npm run example
 *
 * Constants are intentionally duplicated here because server.ts imports from
 * @devvit/web/server which isn't available outside the Devvit runtime.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ---------------------------------------------------------------------------
// Duplicated detection config (keep in sync with src/server/server.ts)
// ---------------------------------------------------------------------------

const MAX_LINE_LENGTH = 200;

const EMOJI_LINE_RE =
  /^\s*(?:\p{Emoji_Presentation}|[\p{Emoji}\u{200D}]\u{FE0F})/u;

const SLOP_PHRASES: readonly string[] = [
  "all-in-one solution",
  "best-in-class",
  "buckle up",
  "complete comprehensive",
  "comprehensive guide",
  "comprehensive platform",
  "comprehensive solution",
  "comprehensive suite",
  "cutting edge",
  "cutting-edge",
  "deep dive",
  "delve into",
  "enterprise grade",
  "enterprise-grade",
  "excited to announce",
  "excited to announce",
  "excited to share",
  "explore how",
  "game changer",
  "game-changer",
  "groundbreaking",
  "happy to announce",
  "happy to announce",
  "harness the power",
  "in this article",
  "leverage the power",
  "next-gen",
  "our research",
  "pleased to announce",
  "production ready",
  "production-ready",
  "proud to announce",
  "proud to share",
  "revolutionise",
  "revolutionize",
  "robust and scalable",
  "seamlessly integrat",
  "state-of-the-art",
  "take .* to the next level",
  "the new version of my",
  "transform the way",
  "unleash the power",
  "unlock the power",
  "without further ado",
];

const SLOP_PHRASE_RES: readonly RegExp[] = SLOP_PHRASES.map(
  (p) => new RegExp(p, "i"),
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function splitPosts(content: string): string[] {
  return content
    .split(/^---$/m)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Duplicated from server.ts -- builds a padded markdown table. */
function formatTable(
  headers: string[],
  align: ("l" | "r")[],
  rows: string[][],
): string[] {
  const cols = headers.length;
  const widths: number[] = headers.map((h) => h.length);
  for (const row of rows) {
    for (let i = 0; i < cols; i++) {
      widths[i] = Math.max(widths[i]!, (row[i] ?? "").length);
    }
  }

  const pad = (s: string, w: number, a: "l" | "r") =>
    a === "r" ? s.padStart(w) : s.padEnd(w);

  const fmtRow = (cells: string[]) =>
    "| " +
    cells.map((c, i) => pad(c, widths[i]!, align[i] ?? "l")).join(" | ") +
    " |";

  const sep =
    "| " +
    widths
      .map((w, i) => {
        const dashes = "-".repeat(w);
        return (align[i] ?? "l") === "r" ? dashes.slice(0, -1) + ":" : dashes;
      })
      .join(" | ") +
    " |";

  return [fmtRow(headers), sep, ...rows.map(fmtRow)];
}

// ---------------------------------------------------------------------------
// Main -- replicate the server's scan logic against local files
// ---------------------------------------------------------------------------

const rootDir = resolve(import.meta.dirname ?? ".", "..");
const dataDir = resolve(rootDir, "test_data");

const files = ["example_slop_posts.md", "example_real_posts.md"];

const postBodies: string[] = [];

for (const file of files) {
  const filePath = resolve(dataDir, file);
  const content = readFileSync(filePath, "utf-8");
  postBodies.push(...splitPosts(content));
}

// -- Detection (mirrors src/server/server.ts onScanEmojiPatterns) ----------

const emojiCounts = new Map<string, number>();
const phraseCounts = new Map<string, number>();
let postsWithEmoji = 0;
let postsWithPhrases = 0;

for (const body of postBodies) {
  const lines = body.split("\n");
  let postHadEmoji = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || !EMOJI_LINE_RE.test(trimmed)) continue;

    postHadEmoji = true;
    emojiCounts.set(trimmed, (emojiCounts.get(trimmed) || 0) + 1);
  }

  if (postHadEmoji) postsWithEmoji++;

  let postHadPhrase = false;
  for (const [i, re] of SLOP_PHRASE_RES.entries()) {
    if (re.test(body)) {
      postHadPhrase = true;
      const phrase = SLOP_PHRASES[i]!;
      phraseCounts.set(phrase, (phraseCounts.get(phrase) || 0) + 1);
    }
  }
  if (postHadPhrase) postsWithPhrases++;
}

const sortedEmoji = [...emojiCounts.entries()].sort((a, b) => b[1] - a[1]);
const sortedPhrases = [...phraseCounts.entries()].sort(
  (a, b) => b[1] - a[1],
);
const totalIndicators = sortedEmoji.length + sortedPhrases.length;

// -- Build markdown output (same format as server) -------------------------

const out: string[] = [
  `## Slop scan results for example test data`,
  "",
  `- **Posts scanned:** ${postBodies.length}`,
  `- **Posts with emoji-prefixed lines:** ${postsWithEmoji}`,
  `- **Posts with slop phrases:** ${postsWithPhrases}`,
  "",
];

if (sortedEmoji.length > 0) {
  out.push(`### Emoji-prefixed lines (${sortedEmoji.length} unique)`);
  out.push("");

  const emojiRows = sortedEmoji.map(([line, count]) => {
    const escaped =
      line.length > MAX_LINE_LENGTH
        ? line.slice(0, MAX_LINE_LENGTH).replace(/\|/g, "\\|") + "..."
        : line.replace(/\|/g, "\\|");
    return [String(count), escaped];
  });
  out.push(...formatTable(["Count", "Line"], ["r", "l"], emojiRows));

  out.push("");
}

if (sortedPhrases.length > 0) {
  out.push(
    `### Slop phrases matched (${sortedPhrases.length} unique across ${postsWithPhrases} posts)`,
  );
  out.push("");

  const phraseRows = sortedPhrases.map(([phrase, count]) => [
    String(count),
    phrase,
  ]);
  out.push(...formatTable(["Posts", "Phrase"], ["r", "l"], phraseRows));

  out.push("");
}

if (totalIndicators === 0) {
  out.push("No slop indicators found in the scanned posts.");
}

for (const line of out) {
  console.log(line);
}

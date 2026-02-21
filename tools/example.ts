#!/usr/bin/env node
/**
 * Standalone example runner -- applies the same detection logic as server.ts
 * against local test data files and prints results to stdout.
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

interface PostResult {
  source: string;
  index: number;
  title: string;
  emojiLines: string[];
  matchedPhrases: string[];
}

function extractTitle(body: string): string {
  const match = body.match(/^#\s+(.+)/m);
  return match ? match[1].trim() : "(untitled)";
}

function analysePost(
  body: string,
  source: string,
  index: number,
): PostResult {
  const title = extractTitle(body);
  const emojiLines: string[] = [];
  const matchedPhrases: string[] = [];

  for (const line of body.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && EMOJI_LINE_RE.test(trimmed)) {
      emojiLines.push(trimmed);
    }
  }

  for (const [i, re] of SLOP_PHRASE_RES.entries()) {
    if (re.test(body)) {
      matchedPhrases.push(SLOP_PHRASES[i]!);
    }
  }

  return { source, index, title, emojiLines, matchedPhrases };
}

function splitPosts(content: string): string[] {
  return content
    .split(/^---$/m)
    .map((s) => s.trim())
    .filter(Boolean);
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "..." : s;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const rootDir = resolve(import.meta.dirname ?? ".", "..");
const dataDir = resolve(rootDir, "test_data");

const files = [
  "example_slop_posts.md",
  "example_real_posts.md",
];

const allResults: PostResult[] = [];

for (const file of files) {
  const filePath = resolve(dataDir, file);
  const content = readFileSync(filePath, "utf-8");
  const posts = splitPosts(content);

  for (let i = 0; i < posts.length; i++) {
    allResults.push(analysePost(posts[i]!, file, i + 1));
  }
}

// ---------------------------------------------------------------------------
// Per-post detail output
// ---------------------------------------------------------------------------

console.log("=".repeat(72));
console.log("  SLOP DETECTION -- EXAMPLE RUNNER");
console.log("=".repeat(72));
console.log();

for (const r of allResults) {
  const total = r.emojiLines.length + r.matchedPhrases.length;
  const tag = total > 0 ? `TRIGGERED (${total})` : "CLEAN";

  console.log(`--- [${r.source}] Post ${r.index}: ${r.title}`);
  console.log(`    Result: ${tag}`);

  if (r.emojiLines.length > 0) {
    console.log(`    Emoji lines (${r.emojiLines.length}):`);
    for (const line of r.emojiLines) {
      console.log(`      ${truncate(line, MAX_LINE_LENGTH)}`);
    }
  }

  if (r.matchedPhrases.length > 0) {
    console.log(`    Slop phrases (${r.matchedPhrases.length}):`);
    for (const phrase of r.matchedPhrases) {
      console.log(`      - "${phrase}"`);
    }
  }

  console.log();
}

// ---------------------------------------------------------------------------
// Aggregate summary (markdown table matching server output style)
// ---------------------------------------------------------------------------

const emojiCounts = new Map<string, number>();
const phraseCounts = new Map<string, number>();
let postsWithEmoji = 0;
let postsWithPhrases = 0;

for (const r of allResults) {
  if (r.emojiLines.length > 0) postsWithEmoji++;
  if (r.matchedPhrases.length > 0) postsWithPhrases++;

  for (const line of r.emojiLines) {
    emojiCounts.set(line, (emojiCounts.get(line) || 0) + 1);
  }
  for (const phrase of r.matchedPhrases) {
    phraseCounts.set(phrase, (phraseCounts.get(phrase) || 0) + 1);
  }
}

const sortedEmoji = [...emojiCounts.entries()].sort((a, b) => b[1] - a[1]);
const sortedPhrases = [...phraseCounts.entries()].sort((a, b) => b[1] - a[1]);

console.log("=".repeat(72));
console.log("  AGGREGATE RESULTS (markdown)");
console.log("=".repeat(72));
console.log();

console.log(`## Slop scan results (example data)`);
console.log();
console.log(`- **Total posts scanned:** ${allResults.length}`);
console.log(`- **Posts with emoji-prefixed lines:** ${postsWithEmoji}`);
console.log(`- **Posts with slop phrases:** ${postsWithPhrases}`);
console.log();

if (sortedEmoji.length > 0) {
  console.log(`### Emoji-prefixed lines (${sortedEmoji.length} unique)`);
  console.log();
  console.log("| Count | Line |");
  console.log("|------:|------|");
  for (const [line, count] of sortedEmoji) {
    const escaped =
      line.length > MAX_LINE_LENGTH
        ? line.slice(0, MAX_LINE_LENGTH).replace(/\|/g, "\\|") + "..."
        : line.replace(/\|/g, "\\|");
    console.log(`| ${count} | ${escaped} |`);
  }
  console.log();
}

if (sortedPhrases.length > 0) {
  console.log(
    `### Slop phrases matched (${sortedPhrases.length} unique across ${postsWithPhrases} posts)`,
  );
  console.log();
  console.log("| Posts | Phrase |");
  console.log("|------:|--------|");
  for (const [phrase, count] of sortedPhrases) {
    console.log(`| ${count} | ${phrase} |`);
  }
  console.log();
}

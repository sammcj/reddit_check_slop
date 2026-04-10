#!/usr/bin/env node
/**
 * Standalone example runner -- applies the same detection logic as server.ts
 * against local test data files and prints results to stdout.
 *
 * Output mirrors the markdown format the app writes to the Devvit log, so you
 * can preview what `devvit logs` would show without deploying.
 *
 * Usage: npm run example
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  EMOJI_LINE_RE,
  MAX_LINE_LENGTH,
  MIN_MATCH_COUNT,
  SLOP_PHRASES,
  SLOP_PHRASE_RES,
  formatTable,
} from "../src/shared/rules.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function splitPosts(content: string): string[] {
  return content
    .split(/^---$/m)
    .map((s) => s.trim())
    .filter(Boolean);
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

const emojiPosts = new Map<string, string[]>();
const phrasePosts = new Map<string, string[]>();
let postsWithEmoji = 0;
let postsWithPhrases = 0;

for (let p = 0; p < postBodies.length; p++) {
  const body = postBodies[p]!;
  const url = `https://reddit.com/r/example/comments/fake${String(p).padStart(3, "0")}/`;
  const lines = body.split("\n");

  // First pass: collect this post's matches without committing them
  const postEmojiLines: string[] = [];
  const postPhraseIndices: number[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && EMOJI_LINE_RE.test(trimmed)) {
      postEmojiLines.push(trimmed);
    }
  }

  for (const [i, re] of SLOP_PHRASE_RES.entries()) {
    if (re.test(body)) {
      postPhraseIndices.push(i);
    }
  }

  // Skip posts below the minimum match threshold
  const totalMatches = postEmojiLines.length + postPhraseIndices.length;
  if (totalMatches < MIN_MATCH_COUNT) continue;

  // Post meets threshold -- record its matches
  if (postEmojiLines.length > 0) {
    postsWithEmoji++;
    for (const trimmed of postEmojiLines) {
      const urls = emojiPosts.get(trimmed);
      if (urls) urls.push(url);
      else emojiPosts.set(trimmed, [url]);
    }
  }

  if (postPhraseIndices.length > 0) {
    postsWithPhrases++;
    for (const i of postPhraseIndices) {
      const phrase = SLOP_PHRASES[i]!;
      const urls = phrasePosts.get(phrase);
      if (urls) urls.push(url);
      else phrasePosts.set(phrase, [url]);
    }
  }
}

const sortedEmoji = [...emojiPosts.entries()].sort(
  (a, b) => b[1].length - a[1].length,
);
const sortedPhrases = [...phrasePosts.entries()].sort(
  (a, b) => b[1].length - a[1].length,
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

  const emojiRows = sortedEmoji.map(([line, urls]) => {
    const escaped =
      line.length > MAX_LINE_LENGTH
        ? line.slice(0, MAX_LINE_LENGTH).replace(/\|/g, "\\|") + "..."
        : line.replace(/\|/g, "\\|");
    return [String(urls.length), escaped, urls.join(" ")];
  });
  out.push(
    ...formatTable(["Count", "Line", "Post(s)"], ["r", "l", "l"], emojiRows),
  );

  out.push("");
}

if (sortedPhrases.length > 0) {
  out.push(
    `### Slop phrases matched (${sortedPhrases.length} unique across ${postsWithPhrases} posts)`,
  );
  out.push("");

  const phraseRows = sortedPhrases.map(([phrase, urls]) => [
    String(urls.length),
    phrase,
    urls.join(" "),
  ]);
  out.push(
    ...formatTable(["Posts", "Phrase", "Post(s)"], ["r", "l", "l"], phraseRows),
  );

  out.push("");
}

if (totalIndicators === 0) {
  out.push("No slop indicators found in the scanned posts.");
}

for (const line of out) {
  console.log(line);
}

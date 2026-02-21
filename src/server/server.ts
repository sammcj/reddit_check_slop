import type { IncomingMessage, ServerResponse } from "node:http";
import { context, reddit } from "@devvit/web/server";
import type { UiResponse } from "@devvit/web/shared";
import { ApiEndpoint } from "../shared/api.ts";

// ---------------------------------------------------------------------------
// Configuration -- adjust these to change scan behaviour
// ---------------------------------------------------------------------------

/** Max mod log entries to fetch. Higher = further back in history. */
const MOD_LOG_LIMIT = 1500;

/** Entries per API page (max allowed by Reddit). */
const MOD_LOG_PAGE_SIZE = 100;

/** Truncation length for output lines in the results table. */
const MAX_LINE_LENGTH = 200;

/**
 * Matches lines starting with pictographic emoji (the colourful ones AI slop
 * uses). Uses Emoji_Presentation to avoid false positives on text-default
 * symbols like check marks, ballot boxes, card suits, and terminal chevrons.
 * Also matches any character rendered as emoji via a VS16 variation selector.
 */
const EMOJI_LINE_RE =
  /^\s*(?:\p{Emoji_Presentation}|[\p{Emoji}\u{200D}]\u{FE0F})/u;

/**
 * Case-insensitive phrases commonly found in AI-generated promotional posts.
 * Each entry is matched as a substring against the full post body. Add or
 * remove entries to tune detection for the subreddit's spam patterns.
 */
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

/** Compiled slop phrase patterns (case-insensitive). */
const SLOP_PHRASE_RES: readonly RegExp[] = SLOP_PHRASES.map(
  (p) => new RegExp(p, "i"),
);

/** Bot/system accounts to exclude (case-insensitive). Any username ending in
 *  "bot" is also excluded automatically -- see {@link isBot}. */
const BOT_USERNAMES = new Set([
  "automoderator",
  "botdefense",
  "anti-evil operations",
  "bot-bouncer",
]);

function isBot(username: string): boolean {
  const lower = username.toLowerCase();
  return BOT_USERNAMES.has(lower) || lower.endsWith("bot");
}

export async function serverOnRequest(
  req: IncomingMessage,
  rsp: ServerResponse,
): Promise<void> {
  try {
    await onRequest(req, rsp);
  } catch (err) {
    const msg = `server error; ${err instanceof Error ? err.stack : err}`;
    console.error(msg);
    writeJSON(500, { error: msg, status: 500 }, rsp);
  }
}

async function onRequest(
  req: IncomingMessage,
  rsp: ServerResponse,
): Promise<void> {
  const url = req.url;

  if (!url || url === "/") {
    writeJSON(404, { error: "not found", status: 404 }, rsp);
    return;
  }

  const endpoint = url as ApiEndpoint;

  let body: Record<string, unknown>;
  switch (endpoint) {
    case ApiEndpoint.ScanEmojiPatterns:
      body = await onScanEmojiPatterns();
      break;
    default:
      body = { error: "not found", status: 404 };
      break;
  }

  writeJSON("status" in body ? (body.status as number) : 200, body, rsp);
}

async function onScanEmojiPatterns(): Promise<UiResponse> {
  const subredditName = context.subredditName;
  if (!subredditName) {
    return {
      showToast: {
        text: "Could not determine subreddit name",
        appearance: "neutral",
      },
    };
  }

  console.log(`Scanning mod log for r/${subredditName}...`);

  // Fetch mod log entries for post removals (removelink = post removed by mod)
  const modActions = await reddit
    .getModerationLog({
      subredditName,
      type: "removelink",
      limit: MOD_LOG_LIMIT,
      pageSize: MOD_LOG_PAGE_SIZE,
    })
    .all();

  console.log(`Found ${modActions.length} removelink actions in mod log`);

  // Filter to human mods only
  const humanActions = modActions.filter((a) => !isBot(a.moderatorName));
  console.log(
    `${humanActions.length} actions by human mods (excluded ${modActions.length - humanActions.length} bot actions)`,
  );

  // Collect post bodies. Use target.body from mod action when available,
  // otherwise fetch the post directly.
  const postBodies = new Map<string, string>();
  let fetchErrors = 0;

  for (const action of humanActions) {
    const postId = action.target?.id;
    if (!postId || postBodies.has(postId)) continue;

    const body = action.target?.body;
    if (body) {
      postBodies.set(postId, body);
      continue;
    }

    // Fall back to fetching the post
    try {
      const post = await reddit.getPostById(postId as `t3_${string}`);
      if (post.body) {
        postBodies.set(postId, post.body);
      }
    } catch {
      fetchErrors++;
    }
  }

  console.log(
    `Collected body text from ${postBodies.size} posts (${fetchErrors} fetch errors)`,
  );

  // Extract emoji-prefixed lines and slop phrases from each post
  const emojiCounts = new Map<string, number>();
  const phraseCounts = new Map<string, number>();
  let postsWithEmoji = 0;
  let postsWithPhrases = 0;

  for (const body of postBodies.values()) {
    const lines = body.split("\n");
    let postHadEmoji = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !EMOJI_LINE_RE.test(trimmed)) continue;

      postHadEmoji = true;
      emojiCounts.set(trimmed, (emojiCounts.get(trimmed) || 0) + 1);
    }

    if (postHadEmoji) postsWithEmoji++;

    // Check full body for slop phrases
    let postHadPhrase = false;
    for (const [i, re] of SLOP_PHRASE_RES.entries()) {
      if (re.test(body)) {
        postHadPhrase = true;
        const phrase = SLOP_PHRASES[i] as string;
        phraseCounts.set(phrase, (phraseCounts.get(phrase) || 0) + 1);
      }
    }
    if (postHadPhrase) postsWithPhrases++;
  }

  // Sort by frequency descending
  const sortedEmoji = [...emojiCounts.entries()].sort((a, b) => b[1] - a[1]);
  const sortedPhrases = [...phraseCounts.entries()].sort(
    (a, b) => b[1] - a[1],
  );

  const totalIndicators = sortedEmoji.length + sortedPhrases.length;

  // Build markdown output
  const lines: string[] = [
    `## Slop scan results for mod-removed posts on r/${subredditName}`,
    "",
    `- **Mod log entries scanned:** ${modActions.length} (${humanActions.length} by human mods)`,
    `- **Unique posts with body text:** ${postBodies.size}`,
    `- **Posts with emoji-prefixed lines:** ${postsWithEmoji}`,
    `- **Posts with slop phrases:** ${postsWithPhrases}`,
    "",
  ];

  // Emoji results
  if (sortedEmoji.length > 0) {
    lines.push(`### Emoji-prefixed lines (${sortedEmoji.length} unique)`);
    lines.push("");
    lines.push("| Count | Line |");
    lines.push("|------:|------|");

    for (const [line, count] of sortedEmoji) {
      const escaped =
        line.length > MAX_LINE_LENGTH
          ? line.slice(0, MAX_LINE_LENGTH).replace(/\|/g, "\\|") + "..."
          : line.replace(/\|/g, "\\|");
      lines.push(`| ${count} | ${escaped} |`);
    }

    lines.push("");
  }

  // Phrase results
  if (sortedPhrases.length > 0) {
    lines.push(
      `### Slop phrases matched (${sortedPhrases.length} unique across ${postsWithPhrases} posts)`,
    );
    lines.push("");
    lines.push("| Posts | Phrase |");
    lines.push("|------:|--------|");

    for (const [phrase, count] of sortedPhrases) {
      lines.push(`| ${count} | ${phrase} |`);
    }

    lines.push("");
  }

  if (totalIndicators === 0) {
    lines.push("No slop indicators found in the scanned posts.");
  }

  // Log full results to console (viewable via `devvit logs`)
  for (const line of lines) {
    console.log(line);
  }

  return {
    showToast: {
      text: `Scan complete: ${sortedEmoji.length} emoji patterns, ${sortedPhrases.length} slop phrases across ${postBodies.size} posts. Check devvit logs for full results.`,
      appearance: "success",
    },
  };
}

function writeJSON(
  status: number,
  json: Record<string, unknown>,
  rsp: ServerResponse,
): void {
  const body = JSON.stringify(json);
  const len = Buffer.byteLength(body);
  rsp.writeHead(status, {
    "Content-Length": len,
    "Content-Type": "application/json",
  });
  rsp.end(body);
}

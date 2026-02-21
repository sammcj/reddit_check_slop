import type { IncomingMessage, ServerResponse } from "node:http";
import { context, reddit } from "@devvit/web/server";
import type { UiResponse } from "@devvit/web/shared";
import { ApiEndpoint } from "../shared/api.ts";
import {
  EMOJI_LINE_RE,
  MAX_LINE_LENGTH,
  SLOP_PHRASES,
  SLOP_PHRASE_RES,
  formatTable,
} from "../shared/rules.ts";

// ---------------------------------------------------------------------------
// Configuration -- adjust these to change scan behaviour
// ---------------------------------------------------------------------------

/** Max mod log entries to fetch. Higher = further back in history. */
const MOD_LOG_LIMIT = 1500;

/** Entries per API page (max allowed by Reddit). */
const MOD_LOG_PAGE_SIZE = 100;

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
  interface PostHit {
    postId: string;
    url: string;
    emojiLines: string[];
    matchedPhrases: string[];
  }

  const emojiCounts = new Map<string, number>();
  const phraseCounts = new Map<string, number>();
  const postHits: PostHit[] = [];
  let postsWithEmoji = 0;
  let postsWithPhrases = 0;

  for (const [postId, body] of postBodies.entries()) {
    const lines = body.split("\n");
    const hit: PostHit = {
      postId,
      url: `https://reddit.com/r/${subredditName}/comments/${postId.replace("t3_", "")}/`,
      emojiLines: [],
      matchedPhrases: [],
    };

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !EMOJI_LINE_RE.test(trimmed)) continue;

      hit.emojiLines.push(trimmed);
      emojiCounts.set(trimmed, (emojiCounts.get(trimmed) || 0) + 1);
    }

    if (hit.emojiLines.length > 0) postsWithEmoji++;

    // Check full body for slop phrases
    for (const [i, re] of SLOP_PHRASE_RES.entries()) {
      if (re.test(body)) {
        const phrase = SLOP_PHRASES[i] as string;
        hit.matchedPhrases.push(phrase);
        phraseCounts.set(phrase, (phraseCounts.get(phrase) || 0) + 1);
      }
    }
    if (hit.matchedPhrases.length > 0) postsWithPhrases++;

    if (hit.emojiLines.length > 0 || hit.matchedPhrases.length > 0) {
      postHits.push(hit);
    }
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

    const emojiRows = sortedEmoji.map(([line, count]) => {
      const escaped =
        line.length > MAX_LINE_LENGTH
          ? line.slice(0, MAX_LINE_LENGTH).replace(/\|/g, "\\|") + "..."
          : line.replace(/\|/g, "\\|");
      return [String(count), escaped];
    });
    lines.push(...formatTable(["Count", "Line"], ["r", "l"], emojiRows));

    lines.push("");
  }

  // Phrase results
  if (sortedPhrases.length > 0) {
    lines.push(
      `### Slop phrases matched (${sortedPhrases.length} unique across ${postsWithPhrases} posts)`,
    );
    lines.push("");

    const phraseRows = sortedPhrases.map(([phrase, count]) => [
      String(count),
      phrase,
    ]);
    lines.push(...formatTable(["Posts", "Phrase"], ["r", "l"], phraseRows));

    lines.push("");
  }

  // Per-post breakdown with URLs
  if (postHits.length > 0) {
    lines.push(`### Triggered posts (${postHits.length})`);
    lines.push("");

    for (const hit of postHits) {
      const indicators = hit.emojiLines.length + hit.matchedPhrases.length;
      lines.push(`**${hit.url}** (${indicators} indicators)`);
      if (hit.emojiLines.length > 0) {
        lines.push(`- Emoji lines: ${hit.emojiLines.length}`);
      }
      if (hit.matchedPhrases.length > 0) {
        lines.push(`- Phrases: ${hit.matchedPhrases.join(", ")}`);
      }
      lines.push("");
    }
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

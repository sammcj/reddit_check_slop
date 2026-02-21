/**
 * Slop detection rules -- shared between the Devvit server and local tooling.
 *
 * Phrase list and config values are loaded from rules.json at the project root.
 * The emoji regex stays in code because JSON can't represent RegExp.
 *
 * This file must NOT import from @devvit/web or any Devvit runtime module, so
 * that tools/example.ts can use it outside the Devvit environment.
 */

import rulesJSON from "../../rules.json" with { type: "json" };

/** Truncation length for output lines in the results table. */
export const MAX_LINE_LENGTH = 200;

/**
 * Matches lines starting with pictographic emoji (the colourful ones AI slop
 * uses). Uses Emoji_Presentation to avoid false positives on text-default
 * symbols like check marks, ballot boxes, card suits, and terminal chevrons.
 * Also matches any character rendered as emoji via a VS16 variation selector.
 */
export const EMOJI_LINE_RE: RegExp =
  /^\s*(?:\p{Emoji_Presentation}|[\p{Emoji}\u{200D}]\u{FE0F})/u;

/**
 * Case-insensitive phrases commonly found in AI-generated promotional posts.
 * Each entry is matched as a substring (or regex pattern) against the full
 * post body. Edit rules.json to add or remove entries.
 */
export const SLOP_PHRASES: readonly string[] = rulesJSON.slopPhrases;

/** Compiled slop phrase patterns (case-insensitive). */
export const SLOP_PHRASE_RES: readonly RegExp[] = SLOP_PHRASES.map(
  (p) => new RegExp(p, "i"),
);

/**
 * Builds a padded markdown table. Each column is sized to the widest cell.
 * `align` per column: "r" for right-align, "l" (default) for left-align.
 */
export function formatTable(
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

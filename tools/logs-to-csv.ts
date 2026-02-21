#!/usr/bin/env node
/**
 * Parses saved devvit log output and writes the table data to CSV.
 *
 * Usage: npm run logs:csv <logfile> [outfile]
 *
 * If outfile is omitted, writes to stdout.
 *
 * The log lines may arrive out of order (devvit logs streams async), so we
 * collect all markdown table rows and section headings, then reconstruct the
 * tables by matching rows to the most recently seen heading.
 */

import { readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: npm run logs:csv <logfile> [outfile]");
  process.exit(1);
}

const logFile = args[0]!;
const outFile = args[1];

const raw = readFileSync(logFile, "utf-8");
const rawLines = raw.split("\n");

// Strip the devvit logs prefix if present (timestamp + app name).
// Lines from `devvit logs` look like:
//   [timestamp] [app] actual content
// But the format varies, so we just try to find our markdown content.
function stripLogPrefix(line: string): string {
  // Remove ANSI escape codes
  const clean = line.replace(/\x1b\[[0-9;]*m/g, "");
  // If the line contains a pipe-delimited table row, extract from first |
  const pipeIdx = clean.indexOf("|");
  if (pipeIdx >= 0 && clean.trim().startsWith("|")) {
    return clean.trim();
  }
  // For heading/summary lines, look for markdown markers
  if (clean.includes("###") || clean.includes("- **")) {
    const hashIdx = clean.indexOf("#");
    const dashIdx = clean.indexOf("- **");
    const start = Math.min(
      hashIdx >= 0 ? hashIdx : Infinity,
      dashIdx >= 0 ? dashIdx : Infinity,
    );
    if (start < Infinity) return clean.slice(start).trim();
  }
  return clean.trim();
}

interface TableRow {
  section: string;
  cells: string[];
}

const rows: TableRow[] = [];
let currentSection = "unknown";

for (const rawLine of rawLines) {
  const line = stripLogPrefix(rawLine);

  // Detect section headings
  if (line.startsWith("### Emoji")) {
    currentSection = "emoji";
    continue;
  }
  if (line.startsWith("### Slop phrases")) {
    currentSection = "phrases";
    continue;
  }

  // Skip separator rows (|---...) and header rows
  if (!line.startsWith("|") || /^\|\s*-/.test(line)) continue;

  // Parse table row: | cell1 | cell2 | ... |
  const cells = line
    .split("|")
    .slice(1, -1) // drop leading/trailing empty from split
    .map((c) => c.trim());

  // Skip header rows (contain "Count", "Line", "Posts", "Phrase", "Post(s)")
  if (
    cells.some(
      (c) =>
        c === "Count" || c === "Line" || c === "Posts" ||
        c === "Phrase" || c === "Post(s)",
    )
  ) {
    continue;
  }

  if (cells.length >= 2) {
    rows.push({ section: currentSection, cells });
  }
}

if (rows.length === 0) {
  console.error("No table data found in log file.");
  process.exit(1);
}

// Build CSV
function csvEscape(s: string): string {
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

const csvLines: string[] = ["type,count,match,posts"];

for (const row of rows) {
  const type = row.section === "emoji" ? "emoji_line" : "slop_phrase";
  const count = row.cells[0] ?? "";
  const match = row.cells[1] ?? "";
  const posts = row.cells[2] ?? "";
  csvLines.push(
    [type, count, csvEscape(match), csvEscape(posts)]
      .join(","),
  );
}

const csv = csvLines.join("\n") + "\n";

if (outFile) {
  writeFileSync(outFile, csv);
  console.error(`Wrote ${rows.length} rows to ${outFile}`);
} else {
  process.stdout.write(csv);
}

# check-slop

A [Devvit](https://developers.reddit.com/) app that scans a subreddit's mod log for removed posts and looks for signs of AI-generated spam ("slop"). It detects both emoji-prefixed lines and common promotional phrases. Results are logged to the Devvit console for review.

## What it does

1. Fetches `removelink` entries from the subreddit mod log (posts removed by mods).
2. Filters out actions by known bots (AutoModerator, BotDefense, anti-evil operations, bot-bouncer and any username ending in `bot`).
3. Reads the body text of each removed post.
4. Extracts lines that start with pictographic emoji (the colourful kind AI slop uses -- not text symbols like check marks or terminal chevrons).
5. Scans post bodies for common AI slop phrases ("game changer", "excited to share", "without further ado", etc.).
6. Outputs markdown summary tables to the Devvit log showing emoji lines by frequency and phrase match counts.

## Data access

The app requests **moderator** scope. It reads:

- **Mod log** -- `removelink` actions only.
- **Post bodies** -- the text content of removed posts.

The app does **NOT**:

- Take any action against users, posts, or comments (no removals, bans, or reports).
- Send, read, or access private messages or chat.
- Post, comment, or reply to any subreddit.
- Modify any subreddit settings or rules.
- Send data to any external service, API, or third party.
- Store or persist any data between runs.

The only user-facing output is a toast notification confirming the scan finished. All results go to the Devvit server log, visible only to mods via `devvit logs`.

## Configuration

Tuneable constants live in a `CONFIG` block at the top of `src/server/server.ts`:

| Constant            | Default                                                              | Purpose                                                                                                          |
| ------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `MOD_LOG_LIMIT`     | `1500`                                                               | Max mod log entries to fetch (controls how far back the scan reaches)                                            |
| `MOD_LOG_PAGE_SIZE` | `100`                                                                | Entries per API page                                                                                             |
| `MAX_LINE_LENGTH`   | `200`                                                                | Truncation length for output lines in the results table                                                          |
| `BOT_USERNAMES`     | `automoderator`, `botdefense`, `anti-evil operations`, `bot-bouncer` | Accounts excluded from results (case-insensitive). Usernames ending in `bot` are also excluded automatically.    |
| `EMOJI_LINE_RE`     | See source                                                           | Regex matching lines starting with pictographic emoji (uses `Emoji_Presentation` to avoid false positives on text symbols) |
| `SLOP_PHRASES`      | See source                                                           | List of case-insensitive phrases to search for in post bodies (e.g. "game changer", "excited to share") |

## Usage

### Install

```sh
npm install
```

### Develop locally

```sh
npm run dev
```

This starts `devvit playtest` against the dev subreddit configured in `devvit.json`.

### Trigger a scan

In the subreddit, open the mod menu (three-dot / kebab menu at the subreddit level) and select **Scan removed posts for emoji slop**. The app runs server-side and shows a toast when complete.

### View results

```sh
devvit logs <subreddit-name>
```

Results are printed as a markdown table in the log output.

### Build and deploy

```sh
npm run build    # compile with esbuild
npm run deploy   # build + devvit upload
npm run launch   # build + upload + devvit publish
```

### Uninstall

Remove the app from the subreddit via the Reddit mod tools or the Devvit dashboard.

## Licence

BSD-3-Clause. See [LICENSE](LICENSE).

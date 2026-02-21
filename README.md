# check-slop

A [Devvit](https://developers.reddit.com/) app that scans a subreddit's mod log for removed posts and looks for signs of AI-generated spam ("slop"). It detects both emoji-prefixed lines and common promotional phrases. Results are logged to the Devvit console for review.

It does **not** take any actions, it's only for reporting / generating lists of potential slop indicators. It's designed to be a starting point for mods to identify common patterns in AI-generated spam and then use that information to configure their moderation tools.

## What it does

1. Fetches `removelink` entries from the subreddit mod log (posts removed by mods).
2. Filters out actions by known bots (AutoModerator, BotDefense, anti-evil operations, bot-bouncer and any username ending in `bot`).
3. Reads the body text of each removed post.
4. Extracts lines that start with pictographic emoji (the colourful kind AI slop uses -- not text symbols like check marks or terminal chevrons).
5. Scans post bodies for common AI slop phrases ("game changer", "excited to share", "without further ado", etc.).
6. Outputs markdown summary tables to the Devvit log showing emoji lines by frequency and phrase match counts.

- [check-slop](#check-slop)
  - [What it does](#what-it-does)
  - [Data access](#data-access)
  - [Configuration](#configuration)
  - [Usage](#usage)
  - [Example Output](#example-output)
  - [Contributing](#contributing)
  - [Licence](#licence)

## Data access

The app requests **moderator** scope as it _reads_:

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

### Detection rules -- [`rules.json`](./rules.json)

Edit `rules.json` at the project root to tune what the scanner looks for. Both the Devvit app and the local example runner (`npm run example`) read from this file.

| Key           | Purpose                                                                            |
| ------------- | ---------------------------------------------------------------------------------- |
| `slopPhrases` | Array of case-insensitive phrases (or regex patterns) matched against post bodies. |

The emoji-line regex (`EMOJI_LINE_RE`) lives in `src/shared/rules.ts` because JSON can't represent RegExp.

### Server settings -- `src/server/server.ts`

| Constant            | Default                                                              | Purpose                                                                                                       |
| ------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `MOD_LOG_LIMIT`     | `1500`                                                               | Max mod log entries to fetch (controls how far back the scan reaches).                                        |
| `MOD_LOG_PAGE_SIZE` | `100`                                                                | Entries per API page.                                                                                         |
| `BOT_USERNAMES`     | `automoderator`, `botdefense`, `anti-evil operations`, `bot-bouncer` | Accounts excluded from results (case-insensitive). Usernames ending in `bot` are also excluded automatically. |

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
npm run logs <subreddit-name>
```

Results are printed as a markdown table in the log output.

### Run detection locally against test data

```sh
npm run example
```

Runs the same emoji and phrase detection logic against synthesised posts in `test_data/`. Prints per-post results (which indicators fired) and an aggregate summary to the terminal. Useful for tuning detection rules without deploying to Reddit.

Test data files:

- `test_data/example_slop_posts.md` -- posts that should trigger detection (emoji-heavy promos, subtle phrase slop, listicles, etc.)
- `test_data/example_real_posts.md` -- posts that should pass cleanly (tech questions, comparisons, changelogs, opinions)

Posts are separated by `---` markers within each file.

### Build and deploy

```sh
npm run build    # compile with esbuild
npm run deploy   # build + devvit upload
npm run launch   # build + upload + devvit publish
```

### Uninstall

Remove the app from the subreddit via the Reddit mod tools or the Devvit dashboard.

## Example Output

Generated with `npm run example`:

```
## Slop scan results for example test data

- **Posts scanned:** 12
- **Posts with emoji-prefixed lines:** 3
- **Posts with slop phrases:** 7

### Emoji-prefixed lines (19 unique)

| Count | Line                                                          |
| ----: | ------------------------------------------------------------- |
|     1 | 🔥 Automate your entire workflow in seconds                    |
|     1 | 🚀 State-of-the-art language model fine-tuning                 |
|     1 | 💡 Built-in RAG pipeline with zero config                      |
|     1 | ✨ Seamlessly integrates with Slack, Notion, and 50+ tools     |
|     1 | 🎯 Enterprise-grade security out of the box                    |
|     1 | 🌟 50% faster inference                                        |
|     1 | 🔧 Seamlessly integrates with your existing ML pipeline        |
|     1 | 📊 Best-in-class benchmarks on MMLU and HumanEval              |
|     1 | 🛡️ Enterprise-grade model governance                           |
|     1 | 1️⃣ CodePilot Pro -- AI pair programming that actually works    |
|     1 | 2️⃣ DataMesh AI -- comprehensive data pipeline automation       |

### Slop phrases matched (31 unique across 7 posts)

| Posts | Phrase                    |
| ----: | ------------------------- |
|     3 | enterprise-grade          |
|     3 | seamlessly integrat       |
|     3 | state-of-the-art          |
|     2 | excited to share          |
|     2 | game-changer              |
|     2 | without further ado       |
|     2 | cutting-edge              |
|     2 | deep dive                 |
|     2 | explore how               |
|     2 | production-ready          |
|     2 | best-in-class             |
|     2 | next-gen                  |
|     2 | revolutionize             |
|     2 | happy to announce         |
|     1 | comprehensive platform    |
|     1 | comprehensive guide       |
|     1 | comprehensive suite       |
|     1 | delve into                |
|     1 | harness the power         |
|     1 | in this article           |
|     1 | robust and scalable       |

**https://reddit.com/r/example/comments/fake003/** (8 indicators)
- Phrases: cutting-edge, explore how, groundbreaking, happy to announce, leverage the power, our research, revolutionize, state-of-the-art

**https://reddit.com/r/example/comments/fake004/** (18 indicators)
- Emoji lines: 10
- Phrases: best-in-class, enterprise-grade, game-changer, next-gen, production-ready, seamlessly integrat, unleash the power, without further ado

**https://reddit.com/r/example/comments/fake005/** (3 indicators)
- Phrases: comprehensive solution, excited to share, pleased to announce

**https://reddit.com/r/example/comments/fake011/** (1 indicators)
- Phrases: deep dive
```

## Contributing

- Git repo: https://github.com/sammcj/reddit_check_slop

## Licence

BSD-3-Clause. See [LICENSE](LICENSE).

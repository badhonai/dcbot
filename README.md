# Free-first Web3 Discord assistant

An informational community member, **not a moderator**. No administrator permissions, wallet connections, transaction signing, or trading. Built with Discord.js and public market APIs. Optional Groq integration preserves the original public AI chat.

## Commands

| Command | Purpose |
| --- | --- |
| `/help` | Commands, privacy, data sources and limitations |
| `/ask question:… project:…` | Search curated project docs; return matching excerpts and sources |
| `/official project:…` | Owner-approved project links |
| `/price token:BTC` | Latest USD price, 24h change/volume, market cap, timestamps |
| `/price token:btc-bitcoin` | Resolve a token using its exact CoinPaprika ID |
| `/pair chain:ethereum address:…` | Up to five base-token pools for a **token** contract, ordered by liquidity |
| `/newpairs chain:solana` | Up to eight recently created pools; NOT verified new projects |
| `/explain term:slippage` | Curated Web3 glossary without AI costs |

Supported chain names: `ethereum` (also `eth`), `solana`, `base`, `bsc`, `arbitrum`, `polygon`, `optimism`, `avalanche`.

### Private, temporary results

All slash results are **ephemeral**: visible only to the person invoking the command. Long results use Previous/Next buttons, not public message spam. Dismiss deletes the response. The bot attempts automatic deletion after 10 minutes while it remains online. Discord display behavior and application restarts can prevent exact deletion timing. Ephemeral is not end-to-end encryption, and does not prevent screenshots.

Pagination is owner-checked and process-local, so buttons expire on restart. There are at most 200 active private result sessions; oldest sessions are dismissed when capacity is reached. Results are capped at 20,000 characters. Errors never fall back to a public channel message.

**Ordinary mentions/replies remain public.** Discord does not support ephemeral responses to normal messages. Use slash commands for private results.

## Setup

Use Node.js **22+**.

```sh
npm ci
cp .env.example .env
# Fill in Discord token, application ID and target guild ID.
# Set your channel IDs in config.json.
npm test
npm run deploy:commands
npm start
```

`DISCORD_TOKEN` is needed to run the bot. `DISCORD_APPLICATION_ID` and `DISCORD_GUILD_ID` are needed to deploy commands. Run deployment per target guild, and again after command changes. It **replaces the application's entire guild command set**, including removing the old `/uns`. It does not remove any separately deployed global commands; remove those separately if your installation has them.

Install using `bot` and `applications.commands` scopes. Grant only View Channel, Send Messages, and Read Message History for the existing public chat behavior. Threads may require Send Messages in Threads. Enable Message Content Intent for public chat in the developer portal. **No Administrator or Manage Messages permission is required.** Commands are restricted to configured channels; list thread IDs explicitly.

### Optional AI chat

Set `GROQ_API_KEY` to enable public mention/reply AI chat. To customize the prompt:

```sh
cp system-prompt.example.txt system-prompt.txt
```

Without a private prompt the example is used. Without a Groq key, the Web3 slash commands still work and mentions direct members to `/help`. The inherited model identifier in `config.json` is not validated; set a model currently available in your Groq account before enabling chat. Never commit `.env` or your private prompt.

## Add verified project knowledge

No real project was supplied, so `knowledge/projects.json` starts empty. `/ask` and `/official` explain that configuration is needed rather than inventing a project.

1. Use `knowledge/projects.example.json` as a template for `knowledge/projects.json`.
2. Replace the placeholder ID, name, and URLs with your real project's official information.
3. Copy approved text into a file such as `knowledge/projects/overview.md`.
4. Set each document's `file`, original HTTPS `source`, and actual `updatedAt` review date.
5. Restart the bot. Multiple projects are supported; use `project:<id>` to choose one.

`/ask` uses local keyword-ranked excerpts, **not AI-generated synthesis** or embeddings. It costs no AI tokens and quotes sources rather than making unsupported claims. The owner is responsible for approving accurate sources and keeping them fresh. Sources are not downloaded or automatically verified; the bot does not certify project safety. Search currently favors English keywords; no semantic or multilingual search is claimed.

## Free services and limits

- **CoinPaprika:** token search and market quotes. No API key configured in this implementation.
- **DEX Screener:** token pools, liquidity, FDV and trading data.
- **GeckoTerminal:** recent pool feed, not every launch and not a verified-project directory.
- **Local JSON/Markdown:** project knowledge. Curated local glossary. No database or embedding subscription.
- **Optional Groq:** only existing public AI chat; account quotas and terms apply.

No paid market API subscription is required by this code. Public API policies and availability can change; there is no guarantee of unlimited usage, commercial rights for all uses, real-time prices, or free hosting. Check current provider terms before deployment. Run on your own always-on computer to avoid a hosting subscription.

Market responses are cached for 60 seconds, discovery for 90 seconds, token searches for one hour. A conservative per-provider request scheduler, request coalescing, 12-second HTTP timeouts, 429 cooldowns, a five-second per-user cooldown, and a three-command concurrency limit reduce usage. Limits are **per process**, not distributed. Missing values are shown as N/A, not invented zeros. Market queries go to external providers; slash questions stay in local document search and do not enter public AI history.

## Structure

```text
src/
  index.js                    Wiring, login and shutdown
  config/                     Environment and runtime validation
  ai/                         Optional public-chat Groq adapter
  conversation/               In-memory public history and channel queue
  discord/
    commands.js               Seven slash-command definitions
    handlers.js               Existing public mention/reply handling
    web3-handler.js           Private commands, cooldowns and help
    private-replies.js        Ephemeral pagination, ownership and expiry
  features/
    knowledge.js              Local curated project search and official links
    market.js                 Market queries, chain mapping and formatting
    glossary.js               Curated educational answers
  integrations/public-api.js  Public HTTP requests, cache and pacing
  utils/                      Discord-sized text splitting
knowledge/                    Owner-reviewed local project content
scripts/deploy-commands.js    Explicit per-guild registration
test/                        Offline tests
docs/                        Review, roadmap, feature implementation notes
.github/workflows/test.yml   Node 22 CI
```

Run `npm test` for offline tests. See [implementation details](docs/WEB3.md) and [scaling roadmap](docs/SCALING.md). The [earlier refactor review](docs/REVIEW.md) is historical; `/uns` has since been removed.

## Clean console logs

All application and command-deployment logs use a shared, dependency-free logger:

```text
2026-10-24T10:00:00.000Z  INFO   app             Starting Web3 assistant  |  node=v22.23.0
2026-10-24T10:00:00.010Z  INFO   app             Configuration loaded  |  channels=3  aiChat=disabled  projects=1
2026-10-24T10:00:00.020Z  INFO   app             Connecting to Discord
2026-10-24T10:00:01.000Z  INFO   app             Bot online  |  bot=ExampleBot  guilds=1  commands=7  slashReplies=private
```

Examples are illustrative, not live status. Timestamps are UTC ISO 8601. Levels and component columns are aligned. Warnings/errors go to stderr; other levels go to stdout. Hosting platforms may merge these streams in a slightly different order.

Configure `.env`:

```dotenv
LOG_LEVEL=info
LOG_FORMAT=pretty
```

- `info` (default): startup, readiness, reconnect/resume, shutdown, warnings and errors. No per-message chatter.
- `debug`: also show command completion times, provider responses and cache hits. No command arguments or message contents.
- `warn`, `error`, or `silent`: progressively less output. Invalid levels fall back to `info`.
- `LOG_FORMAT=json`: one structured record per line, with typed metadata under `fields`, for log collectors. Other formats use readable text.

Errors show safe type/status/code metadata and actionable hints, not raw SDK payloads or stack traces. Sensitive metadata fields and configured credential values are redacted; nested objects are omitted and control characters stripped. **Do not deliberately pass secrets or user text to the logger**: redaction is defense in depth, not a guarantee of detecting every possible secret. Debug mode does not disable redaction.

These settings govern application logs, not npm installation output, Node runtime warnings or hosting-provider output. No log-file dependency, paid service, ANSI colors or decorative banners are required.

## Remaining operational boundaries

Deploy **one process** today. Public AI conversation history and private page sessions are volatile; restart clears them. The original public chat observes non-bot messages in allowed channels, even without a mention; tell members this. Public chat context sent to Groq contains display names and message text when AI is enabled. No attachment ingestion, message edit/delete synchronization, durable history, shared quota limits, or distributed coordination is implemented. No financial recommendations or token safety guarantees.

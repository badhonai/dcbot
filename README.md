# Free-first Web3 Discord assistant

An informational community member, **not a moderator**. No administrator permissions, wallet connections, transaction signing, or trading. Built with Discord.js and public market APIs. Optional Groq integration preserves the original public AI chat.

## Commands

| Command | Purpose |
| --- | --- |
| `/help` | Commands, privacy, data sources and limitations |
| `/ask question:… project:…` | Search curated project docs; return matching excerpts and sources |
| `/official project:…` | Owner-approved project links |
| `/price token:BTC` | Fresh Coinbase Exchange USD last-trade quote; no bot cache |
| `/price token:btc-bitcoin mode:market` | Delayed aggregate market stats from CoinPaprika |
| `/pair chain:ethereum address:…` | Up to five base-token pools for a **token** contract, ordered by liquidity |
| `/newpairs chain:solana` | Up to eight recently created pools; NOT verified new projects |
| `/explain term:slippage` | Curated Web3 glossary without AI costs |

Supported chain names: `ethereum` (also `eth`), `solana`, `base`, `bsc`, `arbitrum`, `polygon`, `optimism`, `avalanche`.

### Private, temporary results

All slash results are **ephemeral**: visible only to the person invoking the command. Results use compact Discord embed cards. Multi-page results show Back/Next buttons; single-page results show only Dismiss. No public message spam. Dismiss deletes the response. The bot attempts automatic deletion after 10 minutes while it remains online. Discord display behavior and application restarts can prevent exact deletion timing. Ephemeral is not end-to-end encryption, and does not prevent screenshots.

Pagination is owner-checked and process-local, so buttons expire on restart. There are at most 200 active private result sessions; oldest sessions are dismissed when capacity is reached. Text fallback input is capped at 20,000 characters; structured results are capped at 20 cards. Cards keep complete records together instead of splitting them mid-sentence. Errors never fall back to a public channel message.

**Ordinary mentions/replies remain public.** Discord does not support ephemeral responses to normal messages. Use slash commands for private results.

## Natural-language requests and fresh quotes

In allowed channels, members can ask directly:

```text
Member: whats the live btc price?
Bot:    [typing…]
Bot:    BTC: $80,532.63
        Coinbase · trade 2s ago
```

Illustrative value only. The displayed value comes from a fresh exchange request, never AI memory. The bot rejects trades older than 30 seconds, missing timestamps and invalid prices. If the exchange is unavailable, the product is unlisted, or trading is too quiet to meet the freshness check, it says so instead of presenting delayed data as live. A fresh REST request is **not** a tick-by-tick stream or a guaranteed executable price. The quote is Coinbase's USD last trade, not a market-wide average. Prices can change immediately afterward.

Supported symbol requests are attempted as Coinbase `<SYMBOL>-USD` products, with aliases for common names (Bitcoin/BTC, Ethereum/ETH, Solana/SOL, etc.). Not every token is listed. For broader coverage and aggregate statistics use `/price token:<CoinPaprika ID> mode:market`; that data is clearly marked as delayed and is never an automatic live-price fallback.

Common price, pool-discovery, glossary, pool-address and official-link requests are recognized locally without AI tokens. For less obvious requests **addressed to the bot by mention/reply**, optional Groq function calling chooses one validated read-only action. It needs a tool-capable model available in your account. Unsupported AI routing falls back to ordinary chat; it does not generate or execute invented tools. Simple English requests work without Groq. Ambiguous requests ask for clarification.

Set `naturalLanguageCommands` to `false` in `config.json` to require a mention/reply for public chat requests; slash commands are unaffected. Otherwise explicit recognized requests can trigger a response without mentioning the bot. Ordinary unrelated messages do not trigger AI calls. Both paths stay restricted to configured channels, with bounded tool concurrency and public-request cooldowns.

### Short follow-ups and minimal price replies

After a price request, a short follow-up such as `Ar eth er?`, `and ETH?`, or `what about Solana?` fetches a **new quote** instead of asking general AI to repeat a stored value. Implicit context is scoped to the same user/channel and expires after two minutes. Replying directly to a recognizable bot price message can restore the action type after a restart; it never reuses the number from that message.

Public live-price replies contain only a bold price plus a small plain-text source/freshness line. There is no URL to generate a large website card, and embeds are explicitly suppressed. Numeric quote results and internal freshness metadata are not added to general AI chat history. The existing public-request cooldown still applies.

**Natural-language message replies are public**, including the typing indicator. They cannot be ephemeral. Use slash commands for private results. Public pool/doc results show the first card with a slash-command hint for additional pages. AI tool-selection requests, when used, send the triggering text to Groq; public conversation handling already uses the configured history policy.

## Clean command layout

- **Help:** one short command menu, with privacy/source details on a second page.
- **Price:** a fresh exchange quote by default. Optional `mode:market` shows delayed 24h change, volume and market cap using compact totals.
- **Pools:** one complete pool per card, ranked by liquidity; copyable token contract and clickable source title.
- **Recent pools:** two entries per page, with short risk labels and chart links.
- **Project docs:** one matching excerpt per page, capped at 650 characters, with its source and review date. Truncated excerpts end with an ellipsis; use the source for full context.
- **Official links:** labeled clickable links, up to six per page.
- **Glossary and errors:** short, consistent cards without repeated paragraphs.

Slash-menu descriptions are short; network and glossary options use dropdown choices instead of long instruction strings.

Privacy/expiry/page status lives in the footer instead of the main text. Timestamps use Discord's local/relative rendering where possible. Source links and risk labels are retained. **Embed Links** permission is recommended; without it the bot falls back to private text. No administrator/moderation permissions are needed.

## Setup

Use Node.js **22+**.

```sh
npm ci
cp .env.example .env
# Fill in the Discord bot token. Server IDs are not needed for automatic registration.
# Set your channel IDs in config.json.
npm test
npm start
```

`DISCORD_TOKEN` is enough for startup command registration. After connecting, the bot checks **every joined server**, registers missing/changed commands and skips unchanged command sets. A new-server event also triggers registration. A failure in one server is logged without blocking the others. No application ID or server ID is needed for this automatic mode.

Registration **replaces this application's entire guild command set**, including removing the old `/uns`. It does not modify other bots' commands or separately deployed global commands. Remove any old global commands separately. Changes to server command permissions remain controlled by Discord/server settings.

### Multiple servers and manual deployment

Normal use: install the bot in each server with `bot` and `applications.commands` scopes, update the code, and restart. Look for **Command sync complete**, with server/update/unchanged/failure counts. A connection log alone is not a registration confirmation.

The optional `npm run deploy:commands` script also discovers all joined servers by default. It can run without a live gateway connection. To target a subset manually:

```dotenv
DISCORD_GUILD_IDS=123456789012345678,234567890123456789
```

These are **server IDs**, not channel IDs. `DISCORD_GUILD_IDS` takes precedence over the legacy single `DISCORD_GUILD_ID`. `DISCORD_APPLICATION_ID` is optional: the script discovers it from the authenticated bot when omitted. These optional IDs only restrict the manual script, not automatic startup registration.

The shared `config.json` channel allowlist still controls where replies are permitted. Add the relevant channels from **each server**. Commands may appear elsewhere but will respond with a private channel-disabled notice. If they do not appear after a successful sync, refresh Discord and check installation scopes, Use Application Commands permission and Server Settings → Integrations restrictions.

Install using `bot` and `applications.commands` scopes. Grant only View Channel, Send Messages, Embed Links, and Read Message History for the existing public chat behavior. Threads may require Send Messages in Threads. Enable Message Content Intent for public chat in the developer portal. **No Administrator or Manage Messages permission is required.** Commands are restricted to configured channels; list thread IDs explicitly.

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

- **Coinbase Exchange:** uncached public USD ticker snapshots for supported exchange products. Latest trade must be no older than 30 seconds.
- **CoinPaprika:** token search and delayed aggregate market stats via `mode:market`. No API key configured in this implementation.
- **DEX Screener:** token pools, liquidity, FDV and trading data.
- **GeckoTerminal:** recent pool feed, not every launch and not a verified-project directory.
- **Local JSON/Markdown:** project knowledge. Curated local glossary. No database or embedding subscription.
- **Optional Groq:** only existing public AI chat; account quotas and terms apply.

No paid market API subscription is required by this code. Public API policies and availability can change; there is no guarantee of unlimited usage, commercial rights for all uses, real-time prices, or free hosting. Check current provider terms before deployment. Run on your own always-on computer to avoid a hosting subscription.

Live exchange quotes bypass the bot cache (`no-store`) and share only concurrent in-flight requests. Other market responses are cached for 60 seconds, discovery for 90 seconds, and token searches for one hour. A conservative per-provider request scheduler, request coalescing, 12-second HTTP timeouts, 429 cooldowns, a five-second per-user cooldown, and a three-command concurrency limit reduce usage. Limits are **per process**, not distributed. Missing values are shown as N/A, not invented zeros. Market queries go to external providers; slash questions stay in local document search and do not enter public AI history.

## Structure

```text
src/
  index.js                    Wiring, login and shutdown
  config/                     Environment and runtime validation
  ai/                         Optional public-chat Groq adapter
  conversation/               In-memory public history and channel queue
  discord/
    commands.js               Seven slash-command definitions
    command-sync.js           Per-server command synchronization
    handlers.js               Existing public mention/reply handling
    web3-handler.js           Private commands, cooldowns and help
    private-replies.js        Private embed cards, pagination and expiry
  features/
    knowledge.js              Local curated project search and official links
    market.js                 Quote/market queries, chain mapping and formatting
    live-quotes.js            Fresh exchange quote validation
    actions.js                Shared read-only tool validation/execution
    glossary.js               Curated educational answers
  integrations/public-api.js  Public HTTP requests, cache and pacing
  utils/                      Discord-sized text splitting
knowledge/                    Owner-reviewed local project content
scripts/deploy-commands.js    Optional multi-server registration
test/                        Offline tests
docs/                        Review, roadmap, feature implementation notes
.github/workflows/test.yml   Node 22 CI
```

Run `npm test` for offline tests. See [implementation details](docs/WEB3.md) and [scaling roadmap](docs/SCALING.md). The [earlier refactor review](docs/REVIEW.md) is historical; `/uns` has since been removed.

## Clean console logs

The default is a **mobile-friendly, 48-character-wide format**, without padded component columns or long inline metadata:

```text
[09:37:07] INFO  Starting Web3 assistant
  Date: 2026-10-24 UTC
  Node.js: v24.22.1
[09:37:07] INFO  Settings ready
  Channels: 3
  AI chat: enabled
  Projects: 0
[09:37:07] INFO  Project docs not added yet
  Setup: knowledge/projects.json
[09:37:08] INFO  Connected to Discord
  Bot: ExampleBot#0000
  Guilds: 2
  Slash replies: private
[09:37:09] INFO  [command-sync] Command sync
    complete
  Servers: 2
  Updated: 0
  Unchanged: 2
  Failed: 0
```

Example only, not live status. Compact timestamps are UTC `HH:mm:ss`; startup includes the UTC date. Component names appear for non-app logs. Long messages and details wrap with indentation at `LOG_WIDTH`, including unbroken strings. Missing optional project docs are informational, not a warning. Connecting messages appear only at debug level. The Discord ready listener uses the supported `clientReady` event, and ephemeral interactions use `MessageFlags.Ephemeral`, avoiding those deprecated API forms without suppressing runtime warnings.

Configure `.env`:

```dotenv
LOG_LEVEL=info
LOG_FORMAT=compact
LOG_WIDTH=48
```

- `compact` (default): narrow console format. The old `pretty` setting is an alias, so existing installations also receive the mobile-friendly layout.
- `wide`: the previous full ISO timestamp and aligned desktop format.
- `json`: one structured record per line with full ISO timestamps and typed metadata under `fields`, for log collectors; no wrapping.
- `LOG_WIDTH`: compact line width from 32 to 120 characters; default 48. Choose a smaller width if your host's font still causes wrapping. Character counts are not exact pixel/display-cell measurements for every Unicode glyph.
- `LOG_LEVEL=info` (default): startup, readiness, reconnect/resume, shutdown, warnings and errors. No per-message chatter.
- `debug`: also command completion times, provider responses and cache hits. No command arguments or message contents.
- `warn`, `error`, or `silent`: progressively less output. Invalid levels fall back to `info`.

Warnings/errors go to stderr; other levels go to stdout. Hosting platforms may merge these streams in a slightly different order.

Errors show safe type/status/code metadata and actionable hints, not raw SDK payloads or stack traces. Sensitive metadata fields and configured credential values are redacted; nested objects are omitted and control characters stripped. **Do not deliberately pass secrets or user text to the logger**: redaction is defense in depth, not a guarantee of detecting every possible secret. Debug mode does not disable redaction.

These settings govern application logs, not npm installation output, Node runtime warnings or hosting-provider output. No log-file dependency, paid service, ANSI colors or decorative banners are required.

## Remaining operational boundaries

Deploy **one process** today. Public AI conversation history and private page sessions are volatile; restart clears them. The original public chat observes non-bot messages in allowed channels, even without a mention; tell members this. Public chat context sent to Groq contains display names and message text when AI is enabled. No attachment ingestion, message edit/delete synchronization, durable history, shared quota limits, or distributed coordination is implemented. No financial recommendations or token safety guarantees.

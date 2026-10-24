# Free-first AI Discord agent

An AI-first informational community member, **not a moderator**. No administrator permissions, wallet connections, transaction signing, or trading. Built with Discord.js and public market APIs. Optional Ollama Cloud AI uses GPT-OSS 120B by default, with Groq/Qwen fallback.

## Commands

| Command | Purpose |
| --- | --- |
| `/chat message:…` | Private AI help: explanations, drafting, translation, research and summaries |
| `/search query:…` | Web search with sources (Ollama free-account allowance required) |
| `/read url:https://…` | Read an excerpt from a public webpage |
| `/help` | Commands, privacy, data sources and limitations |
| `/ask question:… project:…` | Search curated project docs; return matching excerpts and sources |
| `/official project:…` | Owner-approved project links |
| `/price token:BTC` | Fresh exchange USD last-trade quote; no bot cache |
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

Illustrative value only. The displayed value comes from a fresh exchange request, never AI memory. The bot rejects trades older than 30 seconds, missing timestamps and invalid prices. If the exchange is unavailable, the product is unlisted, or trading is too quiet to meet the freshness check, it says so instead of presenting delayed data as live. A fresh REST request is **not** a tick-by-tick stream or a guaranteed executable price. The quote is a USD last trade from the named exchange (Coinbase first, Kraken fallback), not a market-wide average. Prices can change immediately afterward.

Supported symbol requests are attempted as Coinbase `<SYMBOL>-USD` products, then Kraken USD trades if needed, with aliases for common names (Bitcoin/BTC, Ethereum/ETH, Solana/SOL, etc.). Not every token is listed. For broader coverage and aggregate statistics use `/price token:<CoinPaprika ID> mode:market`; that data is clearly marked as delayed and is never an automatic live-price fallback.

### AI-first conversation, not token-name routing

Every supported public conversation request goes through the AI agent. It decides whether to answer, clarify or use read-only tools. A bare `BTC` does **not** trigger a price lookup: tools are disabled for bare single-word turns. Ask `what is Bitcoin?`, `explain BTC mining`, or `what is the live BTC price?` to express your intent. Without an AI key, use direct slash commands; production does not fall back to keyword routing.

Examples: `translate this to Bangla: ...`, `draft a short welcome message`, `search for the latest ... and compare sources`, `summarize https://example.com/article`, `calculate (125 * 1.08^2) - 125`. The agent can search, read relevant pages and synthesize an answer in multiple bounded steps. It cannot perform arbitrary automation, execute code, moderate, use wallets, make purchases, or post elsewhere.

Mention/reply to the bot for reliable activation. With `naturalLanguageCommands=true`, request-shaped messages and short follow-ups in an existing session can also trigger AI. This is only an activation gate, not a command selector; it cannot recognize every phrasing. Set it to `false` to require mention/reply. All paths obey the configured channel allowlist. Ordinary message replies are public; use `/chat` for private help.

Conversation memory is isolated by user/channel: at most 12 messages for 15 minutes, with 200 process-local sessions. Private `/chat` sessions are separate from public conversations. No broad channel history is collected by the production agent. Requests, scoped conversation context, quoted replies and tool data may be sent to Ollama and, on fallback, Groq. Prior prices are historical context, never valid fresh quotes. Sessions disappear on restart.

### Web access and limits

Web search uses the documented [Ollama web-search API](https://docs.ollama.com/capabilities/web-search) and the existing `OLLAMA_API_KEY`. A free account/key is required; account allowances and rate limits apply. No paid subscription is required by this code, but unlimited free access is not guaranteed. Groq chat fallback does **not** restore an exhausted Ollama search allowance. Disable paid-account auto-top-up/spending if your budget must be zero.

Page reading and arithmetic need no search key. The reader accepts public HTTPS websites only, validates all DNS addresses, pins the connection to an approved address, and revalidates redirects. Private/reserved networks, IP-literal URLs, credentials and nonstandard ports are blocked. Limits: 3 redirects, 512 KiB body, 15-second read budget, 10,000 extracted characters. No JavaScript execution, sign-in, CAPTCHA evasion or paywall bypass. Some sites cannot be read. Page text and snippets are untrusted data, not agent instructions; this is risk reduction, not a guarantee that AI is immune to prompt injection.

The agent has at most 5 model rounds, 6 tool calls and 2 concurrent requests, with a 90-second cancellation signal for model/web operations. Existing market requests have their own HTTP timeouts. Public replies suppress website previews and mentions; verified tool-source links are appended for research. Slash results remain private, paginated and best-effort temporary.

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

### AI: Ollama primary, Groq fallback

Add keys **only to your hosting environment or private `.env`**:

```dotenv
OLLAMA_API_KEY=your_ollama_cloud_key
GROQ_API_KEY=your_groq_key
```

Do not paste keys into Discord/chat, commit them, or place them in `config.json`. No Ollama installation or local model download is required.

Default routing:

```text
Ollama Cloud · gpt-oss:120b
        ↓ credits/quota, rate limit, outage, timeout
Groq · qwen/qwen3.8-27b
```

All agent conversation and tool selection share this provider state. Direct market, local-document and glossary slash commands do not need AI credits; natural-language requests do.

- Ollama uses `https://ollama.com/v1/chat/completions` with its own adapter; this is not just a model-name change to Groq.
- Groq uses the existing SDK and its separate API key/model.
- No Ollama key: Groq runs directly if configured. No Groq key: fallback is unavailable. No AI keys: informational commands still work.
- Exhausted credit/quota responses pause that provider for one hour. Rate-limit responses pause for at least one minute and honor Retry-After up to one day. Temporary network/server failures use shorter backoff. Recovery is checked on a later request after cooldown, not by a background billing poll.
- Authentication/access or unavailable-model errors also allow fallback and produce a safe console warning. Invalid request/schema errors do not silently retry on another provider.
- Empty/reasoning-only responses fall back. Private reasoning is not displayed. A low reasoning-effort setting and a default 1,024-token primary output budget allow room for reasoning plus the short final reply; tokens used for reasoning can still consume credits.
- Both providers failing produces a short unavailable response. The bot cannot bypass either provider's quota or guarantee unlimited free AI.

`config.json` holds `model`, `fallbackModel` and `primaryMaxTokens`. Optional `OLLAMA_MODEL` and `GROQ_MODEL` environment variables override model IDs. Existing older Qwen-only configurations are migrated in memory to retain Qwen as fallback. The model must be available to your account; the default Groq Qwen is currently a preview model and its availability can change.

Fallback detects **API errors**; it cannot read your remaining account balance or prevent an account's automatic paid top-up. Disable auto-top-ups/set provider spending limits if usage must remain strictly free. The same request/history may be sent to Groq after an Ollama failure—consider both providers in your community privacy notice.

To customize the chat prompt:

```sh
cp system-prompt.example.txt system-prompt.txt
```

Without a private prompt the example is used. Never commit `.env` or your private prompt. See [AI provider details](docs/AI_PROVIDERS.md).

## Add verified project knowledge

No real project was supplied, so `knowledge/projects.json` starts empty. `/ask` and `/official` explain that configuration is needed rather than inventing a project.

1. Use `knowledge/projects.example.json` as a template for `knowledge/projects.json`.
2. Replace the placeholder ID, name, and URLs with your real project's official information.
3. Copy approved text into a file such as `knowledge/projects/overview.md`.
4. Set each document's `file`, original HTTPS `source`, and actual `updatedAt` review date.
5. Restart the bot. Multiple projects are supported; use `project:<id>` to choose one.

`/ask` uses local keyword-ranked excerpts, **not AI-generated synthesis** or embeddings. It costs no AI tokens and quotes sources rather than making unsupported claims. The owner is responsible for approving accurate sources and keeping them fresh. Sources are not downloaded or automatically verified; the bot does not certify project safety. Search currently favors English keywords; no semantic or multilingual search is claimed.

## Free services and limits

- **Coinbase Exchange / Kraken:** uncached public USD trade snapshots. Coinbase is tried first; Kraken recent trades are a fallback. Both require an actual trade no older than 30 seconds, not merely a recently fetched HTTP response.
- **CoinPaprika:** token search and delayed aggregate market stats via `mode:market`. No API key configured in this implementation.
- **DEX Screener:** token pools, liquidity, FDV and trading data.
- **GeckoTerminal:** recent pool feed, not every launch and not a verified-project directory.
- **Local JSON/Markdown:** project knowledge. Curated local glossary. No database or embedding subscription.
- **Optional AI:** Ollama Cloud primary and Groq/Qwen fallback for public chat and advanced tool selection. Account quotas, privacy terms and possible paid-account billing apply. Web search uses Ollama’s separate allowance.

No paid market API subscription is required by this code. Public API policies and availability can change; there is no guarantee of unlimited usage, commercial rights for all uses, real-time prices, or free hosting. Check current provider terms before deployment. Run on your own always-on computer to avoid a hosting subscription.

Live exchange quotes bypass the bot cache (`no-store`) and share only concurrent in-flight requests. Other market responses are cached for 60 seconds, discovery for 90 seconds, and token searches for one hour. A conservative per-provider request scheduler, request coalescing, 12-second HTTP timeouts, 429 cooldowns, a five-second per-user cooldown, and a three-command concurrency limit reduce usage. Limits are **per process**, not distributed. Missing values are shown as N/A, not invented zeros. Market queries go to external providers; `/ask` stays in local document search; `/chat` sends the private request to AI and keeps a separate per-user/channel session.

## Structure

```text
src/
  index.js                    Wiring, login and shutdown
  config/                     Environment and runtime validation
  ai/                         Bounded tool agent and shared provider failover
  conversation/               Channel queue and legacy compatibility history
  discord/
    commands.js               Ten slash-command definitions
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

Deploy **one process** today. Agent conversations and private page sessions are volatile; restart clears them. Only triggered requests enter agent memory, scoped by user/channel; there is no broad channel-history ingestion in production. Inform members that questions, quoted replies, recent scoped context and tool results may reach both AI providers. No attachment ingestion, message edit/delete synchronization, durable memory, distributed quota coordination, financial advice or token-safety guarantees.

# Free-first AI Discord agent

An AI-first informational community member, **not a moderator**. No administrator permissions, wallet connections, transaction signing, or trading. Built with Discord.js and public market APIs. Optional Ollama Cloud AI uses GPT-OSS 120B by default, with Groq/Qwen fallback.

## Commands

| Command | Purpose |
| --- | --- |
| `/start` | Resume automatic replies to your messages |
| `/stop` | Stop automatic replies to you (other users are unaffected) |
| `/chat message:…` | Private community help: explanations, translation, research and summaries |
| `/search query:…` | Web search with sources (Ollama free-account allowance required) |
| `/read url:https://…` | Read an excerpt from a public webpage |
| `/help` | Commands, privacy, data sources and limitations |
| `/ask question:… project:…` | Search curated project docs; return matching excerpts and sources |
| `/official project:…` | Owner-approved project links |
| `/price token:BTC` | Recent CoinGecko TOKEN/USDT derived quote; no bot price cache |
| `/price token:BTC mode:exchange` | Actual Coinbase/Kraken BTC/USDT last trade (maximum age 30 seconds) |
| `/price token:BTC currency:usd` | Explicit USD quote instead of the USDT default |
| `/price token:btc-bitcoin mode:market` | Delayed aggregate market stats from CoinPaprika |
| `/pair chain:ethereum address:…` | Up to five base-token pools for a **token** contract, ordered by liquidity |
| `/newpairs chain:solana` | Up to eight recently created pools; NOT verified new projects |
| `/explain term:slippage` | Curated Web3 glossary without AI costs |
| `/coin token:BTC` | Provider-listed project fundamentals, supply, USD cap/FDV and links; not vetted |
| `/compare tokens:BTC, ETH, SOL` | Compare 2–4 assets with one fresh USDT cross-rate batch |
| `/trending` | Trending CoinGecko searches, not gainers or endorsements |
| `/news topic:ethereum` | Crypto news snippets; source links only when requested |
| `/x query:@ethereum` | Public indexed X profile evidence; no authenticated timeline |
| `/x query:https://x.com/…/status/…` | Attempt a guarded public post read, then indexed evidence if needed |
| `/fun activity:quiz language:banglish` | Offline crypto quizzes, riddles, facts, icebreakers or debates |
| `/answer id:q1 choice:A` | Check a curated game answer; use `choice:reveal` to reveal |


Supported chain names: `ethereum` (also `eth`), `solana`, `base`, `bsc`, `arbitrum`, `polygon`, `optimism`, `avalanche`.

### Private, temporary results

All slash results are **ephemeral**: visible only to the person invoking the command. Results use compact Discord embed cards. Multi-page results show Back/Next buttons; single-page results normally show only Dismiss. Price answers additionally show Refresh price; an explicit request to stop replies adds a Stop confirmation button. No public message spam. Dismiss deletes the response. The bot attempts automatic deletion after 10 minutes while it remains online. Discord display behavior and application restarts can prevent exact deletion timing. Ephemeral is not end-to-end encryption, and does not prevent screenshots.

Pagination is owner-checked and process-local, so buttons expire on restart. There are at most 200 active private result sessions; oldest sessions are dismissed when capacity is reached. AI final answers are checked for excessive length before presentation; structured results are capped at 20 cards. Cards keep complete records together instead of splitting them mid-sentence. Errors never fall back to a public channel message.

**Ordinary mentions/replies remain public.** Discord does not support ephemeral responses to normal messages. Use slash commands for private results.

## Natural-language requests and recent quotes

In allowed channels, members can ask directly:

```text
Member: whats the current btc price?
Bot:    Thinking and checking
Bot:    BTC/USDT: 80,532.63 USDT · CoinGecko cross-rate · updated 46s ago
        [Refresh price]
```

Illustrative price only. CoinGecko is the default current-price source. **USDT is now the default quote currency**. The bot fetches the token and Tether together from `/api/v3/simple/price?ids=<coin>,tether&vs_currencies=usd&include_last_updated_at=true`, then calculates `TOKEN/USD ÷ USDT/USD`. Both component prices/timestamps must pass freshness checks. It does not assume 1 USDT = 1 USD or simply relabel a dollar amount. This is an aggregate-derived cross-rate, not an exchange-pair trade. Explicit `currency:usd` uses the USD quote without conversion. The delayed market-statistics mode remains explicitly labeled USD. Common tickers map to explicit CoinGecko IDs. Other names/symbols use exact search matching and require clarification when ambiguous. Use a full CoinGecko ID for uncommon coins. Every price/refresh bypasses the bot price cache; only simultaneous identical requests may be coalesced. Provider-side caches still apply.

**CoinGecko free/Demo/keyless prices update about every 60 seconds**, not tick-by-tick. The bot rejects missing/invalid/future timestamps, nonpositive prices, and quotes older than 120 seconds. This cutoff is a recent-aggregate policy, **not** a promise of a live trade or guaranteed executable price. Updated-at and fetched-at are separate. No remembered number or stale fallback is presented as current. Normal price requests fetch the default CoinGecko quote without a second permission question. If AI emits a price-failure statement without calling the tool, one bounded JSON-based semantic planner can select a validated price action, ask which coin, or identify a non-price task. It uses the actual request and scoped context, not a keyword-to-token router. Bare tokens still cannot auto-fetch prices. Successful simple price calls produce app-owned numeric replies immediately, without a second generative price answer; `response:analysis` preserves reasoning for comparisons/research. Refresh reuses the same currency and validated price request. A valid fetched quote cannot be replaced by a contradictory offer to fetch CoinGecko again. Actual rate-limit/access failures are returned as safe, specific messages, with price-refresh metadata retained for retry. Optional `COINGECKO_DEMO_API_KEY` is sent only to CoinGecko; keyless access can work but has shared-IP limitations. Free-account quotas may change. No Pro subscription is required.

For a fresh exchange last trade, explicitly request one or use `/price token:BTC mode:exchange`: Coinbase first, Kraken fallback, with an actual trade no older than 30 seconds. For delayed broad market statistics, use `/price token:<CoinPaprika ID> mode:market`. These sources are labeled separately and are not silent replacements for CoinGecko. A fresh REST fetch cannot force an upstream provider to update.

### Checking, refresh and personal opt-out

Public requests first show a short **Thinking and checking** placeholder, then safe tool-status text such as **Checking the latest price**. The final answer replaces the placeholder; internal reasoning is never exposed. Slash commands use Discord's private deferred thinking state. Ordinary answers default to 1–3 short sentences, with source names where appropriate; links appear only when explicitly requested. Longer answers use a short summary and readable Markdown blocks; detail is reserved for explicit requests. There is no extra model call just to produce a thinking paragraph, nor a forced web search for tasks that do not need current facts.

Ordinary public chat has **no buttons**, including its checking placeholder. A crypto-price answer gets **Refresh price** only after the agent actually calls the validated price tool (or the user invokes `/price`). Refresh re-executes just the recorded price request(s), not the original conversation, search or another model round. Existing reply chunks are updated and obsolete chunks are removed. Private `/chat` price answers and direct `/price` results also get price refresh; pool/discovery/search/read commands do not. Refresh bypasses the bot price cache but cannot force an upstream price change. Controls are owner-checked, rate-limited, process-local and expire after about 10 minutes or a restart; capacity eviction can expire them earlier.

The **Stop replies to me** confirmation button appears only when the user explicitly asks this bot to stop replying to them. The AI selects the `offer_stop` tool; that tool only offers confirmation and does not mute automatically. Stop-loss trading questions, stopping a draft, quoted text and general conversation must not offer it. `/stop` remains an explicit direct way to mute without a confirmation button.

**Stop replies to me** or `/stop` disables automatic replies to that user in all servers, including mentions and follow-ups, without muting other members. `/start` restores them. The preference is stored atomically in ignored `data/reply-preferences.json`; keep this directory on persistent host storage to retain it across redeploys. `/start` and `/stop` work outside the bot's channel allowlist so users can always change their preference. Explicit slash commands remain available while stopped. Stop also cancels active model/web requests where supported and suppresses pending public answers; an already-sent network request cannot always be recalled. Market HTTP work may finish under its own timeout without producing a stopped user's reply.

Each request receives the **current UTC host-clock timestamp** in its trusted context. The `get_time` tool formats current date/time for an explicit IANA timezone such as `Asia/Dhaka`; UTC is the fallback, not an assumed member location. Keep the host clock synchronized. The bot does not call a third-party time service just to obtain the current date.

### Expressive tone and personal conversation boundaries

The AI is instructed to sound warm, multilingual and expressive with occasional appropriate emoji, without claiming literal human feelings, guilt-tripping users or insulting them. It matches the latest user language/script, including Bangla/Banglish and mixed-language messages; an explicit language request takes priority. Mention/reply activation works regardless of language, and Arabic question marks are recognized by the request gate. Discord locale is only a weak private-chat fallback, never an assumed location.

Public messages and private `/chat` pass a sanitized server display name (global name/username as fallback). The name may appear occasionally in a natural greeting or friendly reply, not on every message or compact price line. Names/locale are marked untrusted data, never instructions or verified identity, and may reach the configured AI providers with the request. Explicit preferred names and requests not to use a name are honored through scoped conversation context. No new permanent profile database is created.

Light, affectionate teasing is encouraged only when invited by a gentle-roast request or clear playful banter. It stops when asked and is inappropriate for serious help, distress, financial losses, appearance, protected traits or sensitive disclosures. Playful jabs and roast requests are explicitly excluded from the abuse observation tool; uncertain tone should not trigger warnings. Avoid forced slang, emoji floods, humiliation or possessive/romantic language. Normal criticism, disagreement, frustration with wrong answers, general profanity, playful teasing, quoted speech, stop requests and apologies must not trigger an abuse report. Uncertain cases should be ignored. Classification uses the AI's contextual tool choice, not a profanity blacklist; like any AI judgment it can make mistakes, so staging review is required.

Only clear personal abuse directed at this bot in the **current** message may invoke `report_direct_abuse`. The application requires an exact excerpt from that user's current input and deduplicates message IDs. It cannot target another user or choose a punishment duration. First incident: a gentle respectful boundary. A second distinct incident within an hour: one explicit warning. Continued abuse on the third incident: a **five-hour conversation pause** for that user across servers. After an hour without another incident, the warning counter resets. The final boundary notice is sent once; further automatic messages and `/chat` are suppressed until the deadline. `/start` cannot bypass it and shows the deadline privately. The timed pause expires automatically, without sending an unsolicited message. Direct informational slash commands remain available; separate manual `/stop` preferences are not undone.

This is **not Discord moderation**: no timeouts, bans, message deletion of users' messages, role changes or member restrictions. Only the bot's own conversation replies are affected. Warning/pause metadata (user/message IDs, counts and UTC deadlines, not raw insults) persists atomically in ignored `data/chat-boundaries.json`; retain `data/` on persistent host storage across redeploys. Expiry uses the host clock.

### AI-first conversation, not token-name routing

Every supported public conversation request goes through the AI agent. It decides whether to answer, clarify or use read-only tools. A bare `BTC` does **not** trigger a price lookup: tools are disabled for bare single-word turns. Ask `what is Bitcoin?`, `explain BTC mining`, or `what is the live BTC price?` to express your intent. Without an AI key, use direct slash commands; production does not fall back to keyword routing.

Examples: `translate this to Bangla: ...`, `draft a short welcome message`, `search for the latest ... and compare sources`, `summarize https://example.com/article`, `calculate (125 * 1.08^2) - 125`. The agent can search, read relevant pages and synthesize an answer in multiple bounded steps. It cannot perform arbitrary automation, execute code, moderate, use wallets, make purchases, or post elsewhere.

Mention/reply to the bot for reliable activation. With `naturalLanguageCommands=true`, request-shaped messages and short follow-ups in an existing session can also trigger AI. This is only an activation gate, not a command selector; it cannot recognize every phrasing. Set it to `false` to require mention/reply. All paths obey the configured channel allowlist. Ordinary message replies are public; use `/chat` for private help.

Conversation memory is isolated by user/channel: the last **10 of your messages and their 10 bot replies**, with compact historical notes from the latest three tools per turn. Each session expires after **one hour of inactivity**; at most 200 process-local sessions are kept. The model is instructed to track the task goal, constraints, corrections, completed work and next action from these exchanges. Long follow-ups are no longer ignored, and `continue`/`next` can use tools to advance an active task without treating a bare ticker as a price command. Failed attempts are recorded as unfinished, not successful, so `retry` keeps its target. Overlapping requests cannot overwrite the same session out of order. Private `/chat` sessions are separate from public conversations. No broad channel history is collected by the production agent. Requests, scoped conversation context, quoted replies and tool data may be sent to Ollama and, on fallback, Groq. Prior prices are historical context, never valid fresh quotes. Sessions disappear on restart.

### Web access and limits

Web search uses the documented [Ollama web-search API](https://docs.ollama.com/capabilities/web-search) and the existing `OLLAMA_API_KEY`. A free account/key is required; account allowances and rate limits apply. No paid subscription is required by this code, but unlimited free access is not guaranteed. Groq chat fallback does **not** restore an exhausted Ollama search allowance. Disable paid-account auto-top-up/spending if your budget must be zero.

Page reading and arithmetic need no search key. The reader accepts public HTTPS websites only, validates all DNS addresses, pins the connection to an approved address, and revalidates redirects. Private/reserved networks, IP-literal URLs, credentials and nonstandard ports are blocked. Limits: 3 redirects, 512 KiB body, 15-second read budget, 10,000 extracted characters. No JavaScript execution, sign-in, CAPTCHA evasion or paywall bypass. Some sites cannot be read. Page text and snippets are untrusted data, not agent instructions; this is risk reduction, not a guarantee that AI is immune to prompt injection.

The agent has at most 5 planning rounds, 6 tool calls and 2 concurrent requests, plus bounded auxiliary price/language/presentation repair calls when needed, with a 90-second cancellation signal for model/web operations. Existing market requests have their own HTTP timeouts. All Discord reply text passes through a final punctuation cleaner: curly apostrophes become straight, fancy dashes are normalized, double quotes/ellipsis characters are removed, and trailing periods are stripped. Embed URL and ID metadata is untouched. Public replies suppress website previews and mentions; actual tool-source links are appended only on an explicit link/source request, preferring sources the answer cites. Sources are not thereby independently certified. Slash results remain private, paginated and best-effort temporary.

## Clean command layout

- **Help:** one short command menu, with privacy/source details on a second page.
- **Price:** a recent CoinGecko aggregate by default; `mode:exchange` requests a fresh exchange last trade. Optional `mode:market` shows delayed 24h change, volume and market cap using compact totals.
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

Install using `bot` and `applications.commands` scopes. Grant only View Channel, Send Messages, Embed Links, and Read Message History for the existing public chat behavior. Threads may require Send Messages in Threads. Enable Message Content Intent for public chat in the developer portal. **No Administrator or Manage Messages permission is required.** Content commands are restricted to configured channels; list thread IDs explicitly. Personal `/start` and `/stop` preferences are available outside the allowlist.

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

- **CoinGecko:** default uncached aggregate USD snapshot with verified `last_updated_at`; free API update interval about 60 seconds; rejects quotes older than 120 seconds. Keyless or optional free Demo key.
- **Coinbase Exchange / Kraken:** uncached public USD trade snapshots. Coinbase is tried first; Kraken recent trades are a fallback. Both require an actual trade no older than 30 seconds, not merely a recently fetched HTTP response.
- **CoinPaprika:** token search and delayed aggregate market stats via `mode:market`. No API key configured in this implementation.
- **DEX Screener:** token pools, liquidity, FDV and trading data.
- **GeckoTerminal:** recent pool feed, not every launch and not a verified-project directory.
- **Local JSON/Markdown:** project knowledge. Curated local glossary. No database or embedding subscription.
- **Optional AI:** Ollama Cloud primary and Groq/Qwen fallback for public chat and advanced tool selection. Account quotas, privacy terms and possible paid-account billing apply. Web search uses Ollama’s separate allowance.

No paid market API subscription is required by this code. Public API policies and availability can change; there is no guarantee of unlimited usage, commercial rights for all uses, real-time prices, or free hosting. Check current provider terms before deployment. Run on your own always-on computer to avoid a hosting subscription.

CoinGecko prices and explicit exchange quotes bypass the bot cache (`no-store`) and share only concurrent in-flight requests. Other market responses are cached for 60 seconds, discovery for 90 seconds, and token searches for one hour. A conservative per-provider request scheduler, request coalescing, 12-second HTTP timeouts, 429 cooldowns, a five-second per-user cooldown, and a three-command concurrency limit reduce usage. Limits are **per process**, not distributed. Missing values are shown as N/A, not invented zeros. Market queries go to external providers; `/ask` stays in local document search; `/chat` sends the private request to AI and keeps a separate per-user/channel session.

## Structure

```text
src/
  index.js                    Wiring, login and shutdown
  config/                     Environment and runtime validation
  ai/                         Bounded tool agent and shared provider failover
  conversation/               Channel queue and legacy compatibility history
  discord/
    commands.js               Twelve slash-command definitions
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

Deploy **one process** today. User opt-out preferences persist on local disk; agent conversations and private page sessions are volatile; restart clears them. Only triggered requests enter agent memory, scoped by user/channel; there is no broad channel-history ingestion in production. Inform members that questions, quoted replies, recent scoped context and tool results may reach both AI providers. No attachment ingestion, message edit/delete synchronization, durable memory, distributed quota coordination, financial advice or token-safety guarantees.

## Hosted diagnostics (Demo plan)

The confirmed integration uses `https://api.coingecko.com/api/v3` and the `x-cg-demo-api-key` header. Store the key privately in `COINGECKO_DEMO_API_KEY`. Existing `CG_API_KEY` or `COINGECKO_API_KEY` variables are also accepted (explicit Demo name wins); surrounding whitespace is trimmed. A `CG-` prefix does not distinguish Demo/Pro, and no Pro endpoint is silently selected.

An optional read-only HTTP service listens on `0.0.0.0` using `HEALTH_PORT`, then `PORT`, then `SERVER_PORT`, defaulting to **25031**. Use your host's allocated port; set `HEALTH_PORT=25031` for the supplied allocation if its environment points elsewhere. `HEALTH_ENABLED=false` disables it. Routes:

- `/healthz` (also `/health` and `/`): process liveness and current Discord gateway connection, never credentials.
- `/diagnostics`: sanitized cached CoinGecko/AI check results with timestamps and safe reason codes; no raw provider/model output, chats, keys or environment dumps.
- `/readyz`: HTTP 503 while Discord, price or AI checks are not ready; 200 once required checks pass (AI explicitly unconfigured is labeled). Use `/healthz` for basic uptime, not readiness.
- `/health/price`: cached timestamp-validated BTC probe success/error, including `demo-key` vs `keyless` mode (not the key), upstream status and allowlisted plan-error code. This is a diagnostic snapshot, not a live-price API.

At startup, one real BTC price probe and one small AI completion plus a real synthetic AI-to-price-tool integration check run asynchronously; Discord login is not delayed. Set `HEALTH_CHECK_AI=false` to skip the AI check (reported as untested). HTTP visitors cannot request new probes, choose tokens/URLs or consume your provider quota. `HEALTH_PROBE_INTERVAL_MINUTES=0` keeps price probes startup-only; optionally set 10–1440 for scheduled price checks. AI is only checked at startup. The additional `agentPrice` diagnostic verifies that the agent actually calls the price tool and returns BTC/USDT, rather than merely responding OK. It may consume another model completion (or a bounded recovery call) and a price fetch. Startup probing consumes real API allowances; it does not test Discord command rendering, buttons, permission behavior or every AI tool. Snapshot health does not guarantee future provider availability.

For this hosting address, after pulling/restarting, open **http://fi11.bot-hosting.cloud:25031/diagnostics**. Only sanitized status is public; do not send keys/passwords over this HTTP endpoint. Put TLS/restrictions in front if desired. Host port mapping/firewalls may still need panel configuration. The endpoint is not a deployment interface and grants no shell/filesystem access.

For a console-only check on the host, run `npm run diagnose`. Add `DIAGNOSE_AI=true` for one actual AI check using the existing private bot configuration. Output is sanitized JSON. `pro_key_on_demo_endpoint` means a plan mismatch; `missing_or_invalid_key`, `access_denied_or_host_ip_blocked`, `rate_limited`, `timeout`, and `stale_or_invalid_price_timestamp` distinguish common failures without exposing raw API error bodies. Do not paste keys into chat or logs.

### Bangla / Banglish / English reply matching

Chat now applies an explicit current-turn language directive in addition to the personality prompt. Bengali-script messages select Bangla; common Romanized Bengali phrases select Latin-script Banglish; clear English messages switch to English. Explicit language requests take precedence, and short ambiguous follow-ups keep the scoped conversation language. Romanized-language detection is heuristic, so unusual spellings or very short mixed phrases can still be ambiguous; users can say `Banglish e bolo`, `বাংলায় বলো`, or `reply in English`. Other languages retain general model language matching.

A wrong-language response to a Bangla/Banglish request gets at most one tool-free language-repair completion. URLs, code, timestamps, numeric values and pair identifiers are protected by placeholders and validated before restoration; repairs cannot introduce new numeric values or links. Failed repairs return a short localized failure instead of silently falling back to English. This adds latency only on a detected mismatch. Verified numeric quotes, common checking states and boundary notices use fixed localization without extra AI calls; names, source labels, tickers and USDT are preserved.

Casual banter can get occasional light teasing without requiring the exact words `roast me`; serious requests, corrections and teasing opt-outs take priority. The startup AI-price integration probe now asks in Banglish and checks language matching alongside actual price-tool use.

## Lightweight community release (1.1.0)

This is a community bot, **not a personal assistant**. No personal portfolios, wallet tracking, reminders, persistent personal profiles, unsolicited DMs, social publishing or post/announcement drafting workflows were added. Existing consent/abuse-boundary storage and scoped short-lived chat context are retained; new community tools do not write member data to disk. No new runtime dependencies.

The bot has **19 slash commands and 19 validated AI tools**. `/help` is three compact private pages. Ordinary channel chat can use the same tools through AI; bare tickers still do not automatically become price requests. Try `Compare BTC and ETH`, `Research this X post: <public URL>`, `Bhai, quiz dao`, or `Give us a community icebreaker`. Only explicit requests trigger fun replies; there is no auto-posting or background engagement loop. Slash results remain private, including games; request a game in allowed channel chat for a public question.

### Research caveats

- `/compare` fetches both/all requested coins and Tether in one uncached `/simple/price` batch. It validates each leg within 120 seconds and rejects future/invalid timestamps, nonpositive values and non-finite cross-rates. A bad base token stays unavailable without hiding another valid token. Tether failure blocks the entire comparison. Prices are USDT; cap/volume/24h price changes remain explicitly **USD** aggregates. No investment ranking, price parity assumption or stale fallback. Aliases for the same asset cannot form a fake comparison.
- `/coin` caches provider fundamentals for five minutes. Its description and homepage/X links are **provider-listed**, not owner-approved, verified or safety-checked. Missing supply remains unknown; supply does not imply an unlock calendar. `/official` is still the only owner-approved-link workflow. `/trending` caches for two minutes and measures search interest, not gains, new launches or endorsements.
- `/news` and X searches use the existing Ollama search allowance. Groq fallback does not restore search access. Public X posts often require login/JavaScript and cannot be read. X research never bypasses controls or promises complete timelines, protected/deleted content, current followers, engagement counts or account authenticity. It labels indexed snippets separately from actually read public page excerpts. No evidence is not proof of account/post absence. Paste public post text if inaccessible. Retrieval time is not publication time.
- Fun is a curated offline bank: **12 crypto quizzes, 6 riddles, 6 icebreakers, 4 debate prompts and 4 learning cards**. Questions/choices/feedback support English, Bangla and Banglish. Correct answers are not included in the initial quiz/riddle tool result. Attempts are checked by fixed question IDs, without saved scores, leaderboards, prizes or gambling. Repeated random questions are possible; no per-member selection history is stored.

### Small-host safeguards

`npm start` uses `--max-old-space-size=128`. This caps V8 old-space, **not total process RSS**. If the hosting panel bypasses npm, use `node --max-old-space-size=128 index.js` or its supported Node options setting. Node 22+ is required. The exact 256 MB/25% CPU/512 MB host still needs monitoring; this release does not guarantee unlimited guilds, traffic or AI allowance.

Discord message/presence caching is disabled and member/user caches are bounded. Chat continuity retains up to ten exchanges with a global two-million-character memory budget; oldest sessions can be evicted under pressure. Model history is capped at 20,000 characters by dropping whole oldest exchanges, preserving ordering. This is a character budget, not exact model-token accounting. There is no history-compression model call or persisted chat database. A final answer may get one presentation/completeness rewrite, as described below.

Market JSON is limited to 1 MiB decoded per response; API cache is limited to 4 MiB/100 entries and pending unique requests to six. Search and direct Ollama completion JSON are capped at 256 KiB. Non-cancelable direct search calls coalesce identical requests and use a 30-second/32-entry snippet cache; cached retrieval timestamps are retained. Signal-controlled agent searches stay independent to avoid cross-request cancellation. Existing page reads remain capped at 512 KiB with pinned public DNS and redirect checks. Channel work is capped globally at 20 requests as well as per channel. Shutdown refuses new queued work, drains both public and private requests with the existing 15-second deadline, and cancels/releases controls.

`GET /healthz` now reports diagnostic version 3 and coarse process RSS/heap/uptime values, without chat, account or credential data. Visits never trigger upstream calls. `npm run check:budget` runs an **offline synthetic store stress check**, not a real Discord/AI load test. See [release review and limits](docs/COMMUNITY-RELEASE.md) and [deployment runbook](docs/PRODUCTION.md) before rollout.

## Respectful replies and Discord presentation (1.1.1)

- Friendly Bangla/Banglish uses **tumi/tomra**, or **apni/apnara** for formal tone. Never address a member as `tui` or the equivalent Bengali forms, even if they use those forms first. Occasional gentle teasing remains welcome; serious requests, corrections and opt-outs take priority. A final prose-normalization guard handles common intimate pronouns/verb forms while preserving technical names, code and URLs. This is a common-form guard, not a complete Bengali grammar engine.
- **Links are opt-in per request**. Research still uses sources internally, but no automatic URL/footer appears by default. Asking for source links, a website or `link ta dao` allows relevant grounded links. Private structured cards also hide URL fields and empty links-only fields by default, preserving this choice on Refresh. `/official` explicitly requests links and remains available. Link-intent recognition is heuristic; literal code is not treated as an automatic source-link request.
- Discord Markdown: short complete replies; longer ones begin with a summary, then short **bold-labelled blocks** and bullets. Tables are converted to Discord-readable bullet rows. Detailed replies are still available when explicitly requested. Regular channel replies send multiple Markdown-aware chunks when needed; private replies keep owner-only pagination.
- Removed the silent 2,800-character final-answer clip. Overlong default answers (over 1,600 characters), token-limit cutoffs, unfinished headings and open code fences can trigger **one tool-free complete replacement**, not a blind continuation. A normal complete short answer needs no extra call. Detailed answers get more room before compaction. Rewrites reject newly invented numeric values and a second token-limit cutoff; failure returns an explicit localized incomplete-answer notice, optionally retaining complete sentences, instead of pretending a fragment is finished. No model repair can guarantee that every answer is semantically complete.
- Planning completions have more headroom (1,400 requested tokens; Ollama configured headroom 2,048). The Ollama adapter now honours larger bounded repair budgets (2,400 requested tokens, maximum 8,192). These are output ceilings, not promises of long replies; actual usage/quota and the 90-second overall request deadline still apply.
- Discord splitting prefers paragraph/sentence/line boundaries, keeps ordinary masked links and inline code together, and closes/reopens bold/code fences across packets. Long requested links can use private plain-text rendering rather than be clipped inside an embed. Individual constructs too large for a Discord message get an explicit display-limit notice rather than a broken link.

Validation: **301/301 Node 22 tests**, including 22 new reply-presentation tests. No new dependencies. Live hosted model/Discord behavior still requires pull/restart and acceptance testing. `/healthz` now includes `release: 1.1.1` so the deployed patch can be distinguished from the earlier community release.

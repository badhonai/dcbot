> **Current architecture:** production uses the AI-first bounded agent described in [README](../README.md#ai-first-conversation-not-token-name-routing), with twelve private slash commands including `/chat`, `/search`, `/read`, `/start`, `/stop`. Historical routing/follow-up sections below describe superseded releases. The legacy router remains only for compatibility tests; production never falls back to it.

# Web3 implementation notes

## Delivered

Seven informational slash commands with deferred ephemeral acknowledgements. Normal result rendering uses an owner-bound, random-ID session with compact embed-card pages, conditional navigation buttons, Dismiss, and a best-effort 10-minute delete timer. No result is published via a normal channel send or webhook fallback. Session data is capped at 200 active responses. Discord failures may leave an already delivered ephemeral response visible; timers cannot run while the process is offline. A generic error response can remain until the user dismisses it.

`/uns` was removed from source and guild registration. The bot never moderates members or requests privileged wallet access. Existing public mention/reply chat is retained and clearly distinguished from private commands.

## Knowledge trust model

`knowledge/projects.json` is an owner-curated registry. Each local Markdown document has an HTTPS source and review date. The loader checks paths stay within the knowledge directory and refuses malformed metadata. Retrieval ranks paragraphs by unique matching English keywords. Up to four matching excerpts are displayed, each capped at 650 characters. No semantic model, embedding API, external crawling, or AI-generated project facts are used. This design is conservative and free, but synonym matching and complex inference are limited. A lexical match is not a guarantee that an excerpt answers every part of a question. Source approval is a human responsibility, not a claim of independent verification.

No actual project has been configured. Example files are inactive. Replace placeholders and add reviewed content before expecting real project answers.

## Market providers

- CoinPaprika `/v1/search` resolves names/symbols, requiring an exact match among the returned active results. Multiple exact matches produce selectable IDs as text rather than guessing. `/v1/tickers/{id}` returns USD quotes. Search coverage is provider-limited, not a universal token registry.
- DEX Screener `/token-pairs/v1/{chain}/{token}` returns pools. The bot displays only pools where the requested token is the base token, preserving the meaning of the returned base-token USD price. Quote-only pools are deliberately excluded. Up to five pools are sorted by reported USD liquidity. Solana address comparison is case-sensitive; EVM comparison is case-insensitive.
- GeckoTerminal `/api/v2/networks/{network}/new_pools` returns a limited recent pool feed. Network aliases are mapped explicitly; the bot shows up to eight pools. Pool creation is NOT project creation, endorsement, or a safety check.

All money formatting handles missing values as N/A. Sources and fetch timestamps are included; CoinPaprika's own quote update timestamp is included when present. Quotes are snapshots, not an executable trade quote. Public endpoint usage must comply with changing provider terms and limits.

## Validation

107 offline tests pass on Node 22 (including embed layout/limits, mobile-format, ready-event and multi-guild command-sync regression checks). Tests cover the original public chat modules plus command definitions, provider caching/coalescing, 429 cooldown, token resolution, address validation, discovery warnings, knowledge retrieval and empty configuration, glossary, ephemeral acknowledgement, pagination ownership/navigation/dismissal/expiry, cooldowns, and private error handling. JavaScript syntax checks pass.

Live public HTTP smoke checks succeeded for CoinPaprika search/ticker, DEX Screener WETH pools, and GeckoTerminal Ethereum new pools from this workspace. These do not guarantee future availability or all-chain coverage. Live Discord command deployment, ephemeral rendering, gateway login, and Groq chat have not been tested without credentials. Staging-guild testing remains necessary.

## Deployment checklist

1. Use Node 22+, `npm ci`, and configure the Discord bot token and channel IDs from each target server.
2. Populate real approved project documents, or leave empty to explicitly refuse unsupported knowledge questions.
3. Run `npm test`, then start in staging; confirm the per-server command-sync result. Startup syncs every joined guild, so use a separate staging application if production registration must remain untouched.
4. Confirm two accounts cannot see each other's slash results; check long help pagination, Dismiss, ten-minute expiry, and restart behavior.
5. Test `/price`, ambiguous token symbols, `/pair`, `/newpairs`, provider outages, invalid inputs, and channel restrictions.
6. Set a currently supported Groq model only if enabling public AI chat.
7. Start one instance; check logs and provider usage. Do not grant moderation/admin permissions.

## Console logging update

Shared `src/utils/logger.js` handles readable/JSON formatting, severity filtering, UTC timestamps, field bounds, control-character removal and credential redaction. All application `console.*` calls have been replaced. Bot startup, readiness, reconnect/resume, deployment and shutdown now use consistent component-scoped records. Normal command completions and cache hits are debug-only; expected input/setup failures do not generate error-level noise. Provider errors retain safe status metadata without raw responses. Logging tests cover formatting, severity/child inheritance, JSON integrity, redaction, injection resistance, bounds, silence/fallback levels, safe error metadata and severity routing.

### Mobile console follow-up

Default output is now compact with a 48-character line width, indented details, and short UTC times. `pretty` is an alias for compact; the previous desktop layout is opt-in as `wide`. Long lines wrap deliberately instead of relying on the browser. Optional missing knowledge is no longer a warning. Discord startup uses `Events.ClientReady`; ephemeral replies use `MessageFlags.Ephemeral`. No deprecation warnings are globally suppressed. Docker/npm/hosting-daemon text remains controlled by the hosting panel, not the application logger.

## Multi-server command registration

Startup now syncs guild commands across the gateway guild cache. New `guildCreate` events trigger the same synchronizer. The ready connection log no longer claims that a local command count means registration succeeded. Sync compares normalized current definitions before writing, ignores Discord-added IDs/version/default fields, serializes the startup server list, coalesces concurrent requests per application/server, logs per-server failures and a summary, and drains pending registration during bounded shutdown. Manual deployment supports comma-separated IDs or paginated all-server discovery with only the bot token. This app owns and replaces its guild command set; old global registrations are not modified.

Nine additional offline tests cover multiple guilds, unchanged definitions, changed definitions, isolated permission failures, duplicate events, shutdown, legacy-command removal, pagination and empty server lists. Real Discord registration remains untested here without the bot's Discord token. Installation scopes and Discord-side permissions can still prevent discovery/use; a code change cannot bypass them.

## Compact command cards

All seven commands now return structured embed pages with consistent titles, compact fields, source links and short footers. Help has a short overview plus a second details page. A pool occupies one complete page; recent pools are grouped two per page. Knowledge excerpts are capped at 650 characters and link to originals, rather than showing four full passages in one message. Source/review metadata and uncertainty are retained. Large financial totals use compact notation; price precision is handled separately. Missing data remains N/A.

Single-page results show only Dismiss. Multi-page results show Back, Next and Dismiss. Private, owner-checked interactions and best-effort ten-minute deletion remain. Errors and cooldowns use the same card styling; deferred errors now also get expiry. Cards are bounded below Discord embed limits; plain-text fallback handles missing Embed Links permission. No new dependency, paid API, or model call is introduced. Nine additional offline tests cover help length, button visibility, whole-card navigation, number/date formatting, per-pool cards, two-entry discovery pages, embed limits permission fallback, and short slash descriptions/dropdown choices. Real Discord visual rendering still needs a staging check.

The slash picker also uses short descriptions, network choices and glossary-term choices. Registration compares choice name/value pairs, ignoring Discord-added localization defaults so unchanged commands are not rewritten unnecessarily.

## Fresh exchange quotes and natural-language tool routing

`/price` now defaults to live mode: a fresh Coinbase Exchange product ticker request with TTL zero and fetch `no-store`. Completed live responses are not cached. Concurrent identical requests may share one in-flight result. A timestamped positive numeric last-trade price is required; last trades older than 30 seconds or more than five seconds in the future are rejected. Exchange availability/coverage and time since the last actual trade remain external constraints. The implementation does not claim tick streaming, guaranteed execution, or an aggregate market price. `mode:market` explicitly retains the older CoinPaprika aggregate stats with the existing delay labeling; there is no silent delayed fallback for live requests.

The public message handler recognizes common explicit English requests locally and routes them through the same action executor used by slash commands. It sends/renews typing during work, then returns a short authoritative quote or one compact information card. Non-trigger chatter still does not produce an AI call. Setting `naturalLanguageCommands=false` disables unmentioned automatic requests. Mention/reply requests may use one optional Groq function-selection call for less obvious intents. AI-generated prose is ignored by routing; only validated tool names and argument schemas reach an allowlisted executor. Actual prices bypass generative AI. The public AI prompt adds a no-invented-live-data rule; live numeric results are kept out of general AI history. The shared executor caps active read-only tools at three and validates argument types/lengths/keys/enums. Public requests have a five-second user cooldown.

Natural messages cannot be ephemeral. Slash requests remain private; public responses keep mentions disabled. No trading, wallet or moderation actions exist. Sixteen additional offline tests cover freshness/rejection, disabled caching, unlisted/down exchanges, terse output, local intents/clarification, optional AI selection/failure, validation, concurrency, typing order, public channel restrictions, configuration and cooldowns. Live Discord rendering and Groq tool support still require staging verification with the actual bot/model credentials.

## Price-reply cleanup and contextual follow-ups

Public price replies now use two short lines with plain-text provenance. Removed the Coinbase URL and set `SuppressEmbeds` so no website preview appears. Follow-ups such as “Ar eth er?”, “and ETH?” and “what about Solana?” reuse only the previous action type and perform another fresh quote request. Implicit action context is bounded, scoped by channel/user, and expires after two minutes. A fetched reference is trusted only when authored by this bot; a recognizable old public price reply restores the action type without reading/reusing its numeric quote. User cooldowns still apply.

Quote values, ISO trade/fetch timestamps and internal retention instructions are no longer placed in assistant conversation history. This removes the source of the bookkeeping paragraph seen in the screenshot; regular AI gets an additional instruction not to narrate internal metadata. Seven regression tests cover follow-up interpretation, avoiding unrelated topics, exact compact formatting/preview suppression, the BTC-to-ETH conversation, reference-based context restoration, history separation and context isolation/expiry. Actual mobile Discord rendering remains a host-side verification step.

## SUI/Banglish routing and exchange failover

The parser now extracts a single candidate after removing price/question/connective words, including Banglish `er`, `ar`, `r` and `koto`. This fixes “SUI er price” becoming an ER request. Short price follow-ups accept ticker-shaped candidates rather than only the initial alias list; ambiguity and unrelated glossary terms are rejected. The AI explain tool now has the same term enum as the actual glossary, preventing token names from reaching the “Choose a term” path.

Coinbase SUI-USD was reachable in the workspace smoke check; the screenshot alone cannot establish whether the deployed failure was parsing, venue availability or freshness. Added a bounded Kraken recent-trades fallback for Coinbase errors, stale data or missing products. Kraken's trade timestamp—not the HTTP response time—must pass the same 30-second freshness guard. Quote currency remains USD (not a silent USDT substitution). USD volume/statistics are not inferred from the trade response. Successful fallback labels the actual venue in public replies and private cards. Both venues failing yields one concise public message; no stale/delayed quote is substituted. Product-not-found HTTP logs are debug-only; 429s retain warnings/cooldowns.

Eight new regression tests cover Banglish token extraction, non-alias follow-ups, glossary tool restrictions, valid Kraken fallback, not querying fallback unnecessarily, rejecting stale/error fallbacks, venue labels/concise failures and the screenshot's SUI follow-up after a restarted context. Live SUI routing and a fresh Coinbase quote succeeded in the workspace; Kraken's response shape was checked live and fallback is tested with fixtures. Real host connectivity and venue freshness can still vary.

## Ollama primary with Groq fallback

Added a shared model client for both chat and tool selection. Default model is Ollama Cloud `gpt-oss:120b`; Groq `qwen/qwen3.8-27b` is the fallback. Keys are read from the host only. The Ollama OpenAI-compatible adapter sends `max_tokens`, tools and low reasoning effort; it deliberately omits the unsupported `tool_choice` field and does not forward the Groq-specific `max_completion_tokens` parameter. No new dependency is required. Provider calls have explicit timeouts; Groq SDK retries are disabled to avoid extra failed quota requests before failover.

Cooldown state is shared per process. API quota/credit errors, rate limits, authentication/access errors, missing models, transient errors, and empty completions trigger bounded fallback; schema errors do not. Failed providers are skipped until a later request can retry after cooldown. Recovery probes are coalesced and clean recovery is logged. Logs contain provider/reason/timing metadata, not raw error payloads, credentials, prompts or reasoning. No account-balance polling, paid credit purchase or automatic top-up is implemented; provider-side billing settings still control possible charges.

Fifteen new offline tests cover primary choice, exhausted-credit fallback/cooldown, Retry-After, recovery, error classification, non-retryable schemas, reasoning-only responses, tool-call fallback/shared state, both providers down, Ollama payload compatibility, quota responses, malformed JSON, missing credentials and model/key configuration. Live authenticated Ollama and Groq calls were not tested because no AI credentials were supplied. See `AI_PROVIDERS.md` for deployment and policy details.

## Current checking, personal controls and CoinGecko release

Replaced the production default price source with CoinGecko recent aggregates (free API ~60-second updates, 120-second age cutoff). Exchange mode retains the original Coinbase/Kraken 30-second validation; no silent source fallback. Added a host-clock timezone tool/current-request timestamp, concise conversational instructions, and a single compact preferred citation.

Public reply placeholders show safe checking/tool statuses before being edited into the answer. Owner-bound Refresh now appears only for price answers and reruns their recorded price tools without another AI round. Ordinary chat and non-price data commands do not show Refresh. Stop confirmation appears only after an explicit personal stop request; clicking it opts a user out globally and suppresses/cancels their pending public work where supported; `/start` resumes. Preferences persist atomically in ignored local `data/` storage. Buttons expire, have cooldowns and do not grant moderation permissions. See README for scope, deployment and cache caveats.

An actual keyless CoinGecko BTC request succeeded in this workspace, returning a timestamp-validated aggregate aged 46 seconds. No real Discord rendering/clicks or authenticated Ollama/Groq calls were performed; those still require host-side staging checks. Offline tests cover price freshness/ambiguity, clock/timezones, scoped opt-out/restart persistence, in-flight cancellation, button ownership/expiry/cooldowns, long-message refresh, private refresh and command integration.

Reference: https://docs.coingecko.com/reference/simple-price (free/Demo/keyless 60-second update frequency and `include_last_updated_at`).

### Contextual controls correction

Removed always-on Stop/Refresh buttons from normal replies and checking placeholders. Added the validated, non-mutating `offer_stop` tool so AI interprets explicit personal stop requests in context. The owner must still click to confirm; `/start` and `/stop` remain unchanged. Bare BTC still cannot trigger price tools; bare `stop` only exposes the confirmation tool. Public/private AI price responses retain just price-refresh controls, with the recorded validated price arguments reused directly on refresh. Hidden/forged button actions cannot activate an unoffered public capability. New regression tests verify ordinary chat, price-only buttons, stop-only confirmation, non-price slash results, scoped tool metadata and bare-stop tool restriction.

## Ten-exchange task memory

Replaced the old six-exchange/15-minute chat window with ten user messages and ten matching assistant replies per scoped session, expiring after an hour of inactivity. Compact notes retain the latest three completed tool calls per turn and a bounded source list. Earlier tool data/prices are explicitly historical and untrusted; current requests still need fresh tools. Failed requests retain an unfinished-task marker, long follow-ups are accepted, and continuation words may call tools without loosening the bare-token guard. Per-session exclusion prevents concurrent completions from overwriting the context out of order. Public/private session isolation, capacity bounds and restart clearing remain.

## Expressive style and warning-first conversation pauses

Added a contextual AI observation tool for clear direct personal abuse, with exact-current-message evidence and message-ID deduplication. The application owns thresholds: a gentle first boundary, one warning on the second incident within an hour, then a five-hour personal conversation pause on continued abuse. Ordinary criticism, wrong-answer complaints, jokes, third-party/quoted speech and uncertain cases are explicitly exempt. No Discord moderation action exists. Tone can use appropriate emotion/emoji without claiming actual human feelings or guilt-tripping.

Public/private AI chat is suppressed while paused; `/start` cannot bypass the deadline. Direct informational slash commands remain usable. The triggering final notice is delivered, pending unrelated public chat output is suppressed, and public price refresh cannot circumvent the pause. Atomic `data/chat-boundaries.json` stores IDs/counts/deadlines without raw insult text. Timed pauses survive process restart on persistent disk and expire without timers or unsolicited messages. Mocked tests cover thresholds, expiry, persistence, duplicate/fabricated evidence, isolation, public final-notice delivery, unaffected criticism flow, private/start guards and tool argument restrictions. No authenticated model classification or Discord UI staging test was performed.

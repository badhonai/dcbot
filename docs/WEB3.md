# Web3 implementation notes

## Delivered

Seven informational slash commands with deferred ephemeral acknowledgements. Normal result rendering uses an owner-bound, random-ID session with 1,800-character pages, navigation buttons, Dismiss, and a best-effort 10-minute delete timer. No result is published via a normal channel send or webhook fallback. Session data is capped at 200 active responses. Discord failures may leave an already delivered ephemeral response visible; timers cannot run while the process is offline. A generic error response can remain until the user dismisses it.

`/uns` was removed from source and guild registration. The bot never moderates members or requests privileged wallet access. Existing public mention/reply chat is retained and clearly distinguished from private commands.

## Knowledge trust model

`knowledge/projects.json` is an owner-curated registry. Each local Markdown document has an HTTPS source and review date. The loader checks paths stay within the knowledge directory and refuses malformed metadata. Retrieval ranks paragraphs by unique matching English keywords. Up to four matching excerpts are displayed, each capped at 2,400 characters. No semantic model, embedding API, external crawling, or AI-generated project facts are used. This design is conservative and free, but synonym matching and complex inference are limited. A lexical match is not a guarantee that an excerpt answers every part of a question. Source approval is a human responsibility, not a claim of independent verification.

No actual project has been configured. Example files are inactive. Replace placeholders and add reviewed content before expecting real project answers.

## Market providers

- CoinPaprika `/v1/search` resolves names/symbols, requiring an exact match among the returned active results. Multiple exact matches produce selectable IDs as text rather than guessing. `/v1/tickers/{id}` returns USD quotes. Search coverage is provider-limited, not a universal token registry.
- DEX Screener `/token-pairs/v1/{chain}/{token}` returns pools. The bot displays only pools where the requested token is the base token, preserving the meaning of the returned base-token USD price. Quote-only pools are deliberately excluded. Up to five pools are sorted by reported USD liquidity. Solana address comparison is case-sensitive; EVM comparison is case-insensitive.
- GeckoTerminal `/api/v2/networks/{network}/new_pools` returns a limited recent pool feed. Network aliases are mapped explicitly; the bot shows up to eight pools. Pool creation is NOT project creation, endorsement, or a safety check.

All money formatting handles missing values as N/A. Sources and fetch timestamps are included; CoinPaprika's own quote update timestamp is included when present. Quotes are snapshots, not an executable trade quote. Public endpoint usage must comply with changing provider terms and limits.

## Validation

38 offline tests pass on Node 22 (including nine shared-logger tests). Tests cover the original public chat modules plus command definitions, provider caching/coalescing, 429 cooldown, token resolution, address validation, discovery warnings, knowledge retrieval and empty configuration, glossary, ephemeral acknowledgement, pagination ownership/navigation/dismissal/expiry, cooldowns, and private error handling. JavaScript syntax checks pass.

Live public HTTP smoke checks succeeded for CoinPaprika search/ticker, DEX Screener WETH pools, and GeckoTerminal Ethereum new pools from this workspace. These do not guarantee future availability or all-chain coverage. Live Discord command deployment, ephemeral rendering, gateway login, and Groq chat have not been tested without credentials. Staging-guild testing remains necessary.

## Deployment checklist

1. Use Node 22+, `npm ci`, and configure Discord credentials and channel IDs.
2. Populate real approved project documents, or leave empty to explicitly refuse unsupported knowledge questions.
3. Run `npm test`, then deploy commands to a staging guild.
4. Confirm two accounts cannot see each other's slash results; check long help pagination, Dismiss, ten-minute expiry, and restart behavior.
5. Test `/price`, ambiguous token symbols, `/pair`, `/newpairs`, provider outages, invalid inputs, and channel restrictions.
6. Set a currently supported Groq model only if enabling public AI chat.
7. Start one instance; check logs and provider usage. Do not grant moderation/admin permissions.

## Console logging update

Shared `src/utils/logger.js` handles readable/JSON formatting, severity filtering, UTC timestamps, field bounds, control-character removal and credential redaction. All application `console.*` calls have been replaced. Bot startup, readiness, reconnect/resume, deployment and shutdown now use consistent component-scoped records. Normal command completions and cache hits are debug-only; expected input/setup failures do not generate error-level noise. Provider errors retain safe status metadata without raw responses. Logging tests cover formatting, severity/child inheritance, JSON integrity, redaction, injection resistance, bounds, silence/fallback levels, safe error metadata and severity routing.

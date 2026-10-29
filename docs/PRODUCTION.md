# Small-host deployment and recovery

Target: Discord-only community bot, Node 22+, 256 MB RAM / 25% CPU / 512 MB disk. The CPU percentage is provider-specific. Low traffic and cloud AI are assumed; there is no capacity/SLA guarantee.

## Deploy

1. Back up the ignored `data/` directory to private persistent storage. It contains existing consent/abuse boundaries, not newly introduced personal profiles. Never commit `.env`, API keys, chat data or host backups.
2. Pull the intended `main` release. Use a separate staging Discord application if production-wide command registration must not change during testing.
3. Check `node --version` is 22+. Install with `npm ci --omit=dev --no-audit --no-fund`. Avoid installing AstrBot, local AI, browsers or frontend tooling. Keep npm caches/logs within the host disk quota; do not run unbounded log retention.
4. Keep existing `DISCORD_TOKEN`, optional `OLLAMA_API_KEY`/`GROQ_API_KEY` and the explicitly selected free CoinGecko Demo key. New tools require no new keys. News/X search need Ollama search allowance; Groq chat fallback cannot replace that service.
5. Start **one** instance with `npm start`, or panel command `node --max-old-space-size=128 index.js`. Do not launch overlapping instances on the same token. V8 old-space cap does not cap RSS; do not allocate all 256 MB to V8.
6. Preserve the five configured channels and the persistent `data/` mount. No administrator/moderation privileges are needed. Existing Message Content intent must be enabled in Discord for normal-message chat.

## Acceptance checks after restart

- Startup log: 19 slash commands / 19 AI tools; command-sync summary succeeds in each joined server. Local definitions alone do not prove registration succeeded.
- `GET /healthz`: diagnostic version **3**, release **1.1.2**, Discord connected, reasonable RSS/heap. `GET /diagnostics`: cached startup status. `GET /readyz`: ready after the probes finish. No endpoint visit makes upstream calls. AI checks may be disabled or degraded by quota/provider problems.
- In an allowed channel, invoke `/help` (three pages), `/price token:BTC`, `/compare tokens:BTC, ETH`, `/coin token:BTC`, `/trending`, `/news topic:ethereum`, `/x query:@ethereum`, `/fun activity:quiz language:banglish`, then `/answer` using the displayed question ID. Confirm `/x` reports limited/unavailable evidence truthfully if search/public reading fails.
- Use a second account to confirm private results/buttons cannot be used by another member. Check Back/Next, Dismiss, best-effort expiry and plain-text fallback without Embed Links. Buttons expire on restart by design.
- Test a public request: `Bhai, quiz dao`; then an answer attempt. Verify same-language short conversation, actual question ID, no early answer disclosure, no unsolicited games, no mention pings or large website unfurls. Try Bangla and English separately; mocked tests do not prove live model behavior.
- Verify `/stop` and `/start` retain their previous scope and persistence. Existing five-hour abuse pauses remain application-owned, not server moderation. New research must not infer facts when sources fail.
- Monitor RSS over normal activity and provider latency. The synthetic 119 MiB result excludes real guild caches, network/AI traffic and host overhead. If memory approaches the host ceiling, reduce traffic/use slash tools or upgrade; do not promise unlimited guilds. Check the panel's actual allocation/oom reports too.

## Failure handling

- Provider 429/quota: wait for cooldown; do not repeatedly refresh. Prices fail closed, without stale/USDT-parity fallback. Metadata/discovery caches conserve allowance.
- Missing project knowledge: `/ask` and `/official` must report it, not fabricate approved links. `/coin` links remain provider-listed only.
- X unavailable: paste public post text or use a readable public article. No logins, scraping proxies, protected-post access or invented metrics.
- Shutdown: SIGTERM/SIGINT stop intake and drain public queue, private interactions, command sync and health server. A 15-second deadline may interrupt longer work. Restarted buttons and in-memory history are not durable.
- Rollback: stop the instance, check out a previously deployed good release, reinstall using its lockfile, then restart. Retain the ignored `data/` mount. Startup will restore that release's guild-command set; do not delete consent data to work around problems.

## Maintenance

Run tests/audits in CI or a development environment rather than loading the 256 MB production process. `npm test` runs offline tests; `npm run check:budget` is an offline synthetic resource regression check, not a host load test. Keep Node and pinned dependencies patched, rotate leaked keys, and review provider free-plan changes. This release adds no personal-assistant features, auto-posting, background market monitoring, dashboard or new durable member database.

### Reply-style acceptance for 1.1.1

After deployment, try a playful Banglish message using intimate phrasing; the bot should respond respectfully with tumi/apni, not mirror tui. Ask for a researched summary: no URLs by default. Then ask `source links dao`: relevant source links may appear. `/official` explicitly requests approved links. Test a longer explanation: a summary plus short Markdown sections/bullets, no giant table or cut-off final fragment. Public chunks should keep code fences/bold readable; private results remain paginated. A completion rewrite can use extra AI allowance, and if it fails the response must state the limitation rather than imply the answer is complete. No mocked test establishes perfect live model tone or completeness.

### Compact-view acceptance for 1.1.2 (supersedes 1.1.1 link/display defaults)

Ask for a long explanation in public chat and `/chat`. Check initial raw message text stays below 400 characters; click More, Back/Next where needed, then Less. Expanding must not search or call AI again, and public expansion must not create additional messages. Test another member cannot use the controls; old/restarted controls expire. Refresh a price after expanding and confirm the view collapses to the new quote summary.

Ask a researched public question: links may now appear as short masked labels by default. Repeat with `without links` and verify opt-out. Simulate an inaccessible public page/model outage in staging; confirm one bounded search fallback and honest source listings if AI remains unavailable. No fallback should leak private-network URLs, credentials or protected content, override safety/consent, or turn stale web numbers into current USDT quotes. Search quota failure is still a real limitation, not something to hide with fabricated results.

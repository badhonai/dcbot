# Community release review — 2026-10-29

## Upstream review and license

Reference: https://github.com/AstrBotDevs/AstrBot

Repository-wide inventory/text scan covered 1,877 files; all 759 Python source files were AST-parsed successfully. The scanned master archive was approximately 6.8 MiB compressed / 21.6 MiB expanded. Tree inventory SHA: `abf683071952375ec36baa4cad6b6f3d9c9bb03f` (tree hash, not a release guarantee). Relevant modules were inspected in more detail:

- `astrbot/core/agent/context/{manager,truncator}.py`: bounded, ordered context handling
- `astrbot/core/utils/session_lock.py`: session isolation and serialization
- `astrbot/core/pipeline/rate_limit_check/stage.py`: bounded request handling
- `astrbot/core/agent/tool_executor.py`: explicit tool execution interface
- `astrbot/core/provider/manager.py`: provider orchestration
- `astrbot/builtin_stars/astrbot/group_chat_context.py`: community-chat context design
- `astrbot/core/pipeline/waking_check/stage.py`: explicit activation rather than unsolicited engagement
- `astrbot/core/persona_mgr.py`: persona separation
- `astrbot/core/cron/manager.py`: scheduler complexity, deliberately excluded

This is a repository-wide static survey plus targeted design review, **not an exhaustive correctness/security audit of every line**, nor an audit of the external plugin marketplace. Upstream code was not run or installed. AstrBot is AGPL-3.0; no upstream source, assets, plugins or copied implementations were included. New JS implementations use design ideas only and do not claim AstrBot compatibility.

## Adopted lightweight ideas

Bounded context, isolated conversation ordering, strict tool registry, request backpressure, retained cloud-provider failover, restrained community personality and explicit activation. These extend existing dcbot controls rather than embedding AstrBot. Crypto research and the curated fun bank are independent implementations for this community, not claimed upstream AstrBot features.

## Deliberately excluded

Python service, dashboard/frontend build, plugin loader, MCP servers, code/shell execution, Docker sandbox, vector DB/embeddings, local models, browser automation, audio/video processing, scheduler, background polling, personal reminders/profiles/portfolios, wallet access, transactions, moderation powers, public polls/leaderboards and automatic social publishing/drafting. No new Discord intents, elevated permissions, paid API subscriptions or runtime npm dependencies.

## Added member-facing tools

| Workflow | Source / implementation | Honest limitation |
|---|---|---|
| Token fundamentals | CoinGecko coin endpoint | Provider-listed description/links, not verified; five-minute cache; USD metrics |
| 2–4 token comparison | Batched CoinGecko simple-price with Tether reference | Recent USDT cross-rates, not executable ticks; USD cap/vol/24h stats |
| Trending discovery | CoinGecko trending-search endpoint | Search interest, not gainers, safety checks or new launches |
| Crypto news | Existing public web-search service | Snippets, incomplete coverage, date verification needed |
| Public X research | Guarded explicit-post reading plus search fallback | Often inaccessible; no authenticated API/timeline or reliable social metrics |
| Community games | 12 quizzes, 6 riddles | Curated answer checking, no scores/history/prizes |
| Community starters | 6 icebreakers, 4 debates, 4 facts | Static educational/fun bank, not real-time market claims |

All seven new workflows have private slash entry points and validated AI tools. Games need no API key or AI when invoked directly. Regular allowed-channel requests can produce public AI replies. No unsolicited posting. Fun text and choices support English, Bangla and Banglish. Existing global cleaner, mention suppression, channel allowlist, multi-guild sync, personal opt-out and abuse boundaries are retained.

## Validation

- 279/279 Node 22 tests passed at release validation, including 57 new tests for research, games, limits and interaction wiring. Existing 222-test coverage was retained; command/help expectations were updated for the expanded registry. A timestamp-sensitive diagnostic assertion was replaced with an exact sanitized-key assertion.
- npm production dependency audit reported **zero known advisories** at review time, not a guarantee of no vulnerabilities.
- Live **keyless workspace** checks succeeded for comparison (BTC/ETH in USDT), trending (7 entries) and Bitcoin fundamentals. Details: `community-live-smoke.json`. This does not establish host availability or future provider access.
- Offline Node 22 synthetic library/store stress under 128 MiB V8 old-space: **119 MiB observed peak RSS**, 30 MiB heap used, bounded history/cache. Details: `community-budget-smoke.json`; reproduce with `npm run check:budget`. This is NOT a real Discord/guild/AI traffic benchmark and is NOT a 256 MB host guarantee.
- Installed runtime dependencies were approximately 41 MiB in this workspace; source/git add a few MiB. Node binaries, OS, npm cache, logs and hosting-panel overhead are outside that measurement.
- Live X/search/model-language behavior, Discord registration/rendering and constrained-host operation of this release are **not verified until deployment**. Offline model tests use mocked completions. AI tone/language heuristics are not perfect semantic guarantees.

## Production gate

Follow `PRODUCTION.md`. Deploy one instance, retain existing ignored consent data, check command sync and diagnostic version 3, exercise the new private commands and a channel quiz, and monitor RSS/cooldowns. Do not label the hosted rollout verified from workspace tests alone.

# Review and restructuring report

> Historical record of the first refactor. The subsequent Web3 release removes `/uns`, adds seven informational private commands, makes Groq optional, and increases the test suite to 29. See `WEB3.md` and the current README for current behavior.

## Scope

Reviewed the cloned repository's `index.js`, `ai.js`, configuration, dependency manifest/lockfile, environment template, and ignore rules. The original implementation consisted of two JavaScript modules and had no README or automated tests. Changes exist only in this workspace; nothing has been committed or pushed upstream.

## Findings and actions

| Priority | Original finding | Action / remaining constraint |
| --- | --- | --- |
| High | Concurrent handlers could mutate one channel's context while a completion was in flight | Per-channel queue serializes message handling and command mutations; provider requests use history snapshots |
| High | Rejected typing/reply operations could escape the async event handler | Handler-level containment, safe failure replies, client error listener |
| High | Provider error text was sent to Discord | Generic user-facing messages; logs retain limited error metadata, not secrets or conversation text |
| High | Any channel member could invoke destructive `/uns` | Require Manage Messages; this is an intentional behavior change |
| Medium | Deletion removed the last assistant entry regardless of actual deleted message | Bind assistant chunks to Discord message IDs and remove the exact entry |
| Medium | `/uns` could miss the interaction acknowledgement deadline | Defer before queueing/fetching; failures have a guarded reply path |
| Medium | Model-generated mentions could notify members/roles | Disable mention parsing on replies |
| Medium | Missing credentials, invalid chunk lengths, and missing private prompt were poorly documented | Startup validation, root-relative files, environment/prompt examples and setup instructions |
| Medium | Slash commands redeployed to every cached guild on startup | Separate explicit per-guild deployment script; REST bulk replacement semantics documented |
| Medium | AI provider and history were module globals | Inject provider adapter, history store, queue, and logger dependencies |
| Medium | No tests or automation | 15 offline tests plus Node 22 GitHub Actions workflow |
| Medium | No pending-work bound, explicit timeout, or shutdown flow | Bounded per-channel queues, configured SDK timeout/one retry, bounded shutdown drain |
| Low | Closed reasoning tags were stripped, but truncated tags could leak reasoning text | Strip from opening think tag through closing tag or end of response; not a general confidentiality guarantee |

## Preserved behavior

Channel allowlist; mention/reply triggers; observation of non-trigger messages; per-channel bounded context; Groq provider; configured model, channels, temperature, 300 output-token default; reply splitting; `/uns` checks only the latest 50 messages.

## Intentional changes

- `/uns` now requires moderation permission and answers explicitly outside enabled channels.
- Commands are not automatically registered at startup. Deploy separately for each guild.
- Overloaded channels drop new work with a warning rather than growing a pending-work backlog.
- Error messages do not enter AI context. No raw provider errors are shown to members.
- Private prompt must still be supplied, but a starter example and clear setup are now included.
- `ai.js` was replaced with focused internal modules; it was not a documented public API. Root `index.js` remains a launcher.

## Validation

- 15 offline tests cover history bounds/isolation/deletion, ordered queues, overload and recovery, splitting, reasoning cleanup, provider request construction, empty output, missing credentials, message triggers, safe mentions, error containment, and `/uns` authorization/deletion.
- JavaScript syntax checks passed.
- `npm audit --omit=dev` reported zero known vulnerabilities at execution time. This is not a security certification; the existing dependency versions were retained.
- Live login, guild permissions, slash-command deployment, and Groq model availability were **not tested** without credentials.
- Fake provider/Discord objects validate orchestration, not live SDK/API compatibility under all conditions.

## Outstanding risks

No global/user rate limiting or token-based input budgets; no persistence or distributed coordination; no full-response deletion for chunked output; no message edit/delete synchronization; no prompt-injection defense guarantee; no load test, operational metrics, or privacy retention policy. Context is bounded by entry count rather than token size. User-controlled display names and content remain untrusted input. Model availability and provider parameters must be checked before deployment. Review these before production growth, rather than treating the refactor as production-scale certification.

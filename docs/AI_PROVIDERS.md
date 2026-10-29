# AI provider deployment

## Defaults

| Role | Provider | API model ID | Private environment key |
| --- | --- | --- | --- |
| Primary | Ollama Cloud | `gpt-oss:120b` | `OLLAMA_API_KEY` |
| Fallback | Groq | `qwen/qwen3.8-27b` | `GROQ_API_KEY` |

The same model client serves normal agent chat and multi-step tool selection. Actual prices come from CoinGecko by default (recent aggregate, not a tick feed), with an explicit Coinbase/Kraken exchange mode, never model memory. Public message replies stay public; slash-command privacy is unchanged.

## Enable on your host

1. Create an Ollama Cloud API key in your account settings.
2. Set `OLLAMA_API_KEY` and the existing `GROQ_API_KEY` as private hosting variables or in your ignored `.env`.
3. Pull the latest code and restart. No model download or Ollama daemon is needed.
4. Confirm the console reports `AI providers ready`, primary `ollama`, model `gpt-oss:120b`, fallback `groq`.
5. Test ordinary chat and an advanced tool-selection request in staging. Normal-language price questions use AI; direct `/price` bypasses AI and does not prove the model connection works.

Never put credentials in public Discord messages, repository files, issue/PR text or a downloadable ZIP. This release includes no real API keys. If only one key is configured, only that provider can answer AI requests.

Optional `OLLAMA_MODEL` and `GROQ_MODEL` variables override `config.json`. `primaryMaxTokens` controls the Ollama output/reasoning budget (128–8192, default 1024). The bounded agent requests 700 completion tokens per Groq round; legacy chat adapters retain their configured limits. Keep the primary budget high enough to produce a final answer; GPT-OSS reasoning can consume budget/credits before visible text. We read final content/tool calls, not reasoning fields.

## Failure behavior

- **Credit/quota response:** immediate fallback; failed provider paused one hour.
- **429 rate limit:** immediate fallback; paused at least one minute, extended by Retry-After (capped at one day).
- **401/403 or missing model (404):** immediate fallback; paused five minutes. Fix the key/access/model setting.
- **Timeout/network failure:** fallback and a short pause.
- **Server/malformed response/empty or reasoning-only completion:** fallback with short pause.
- **Bad request/schema:** surfaced as a safe failure, not hidden by sending the same bad request elsewhere.
- **Both providers blocked:** no retry loop or invented answer; regular commands that do not need AI remain usable.

A new request after cooldown can probe the primary. There is no automatic balance query or reliable distinction between every provider-specific quota response. Ordinary 429s are treated conservatively as rate limits unless the provider explicitly describes a quota/usage-credit limit. Cooldowns are volatile and process-local; restart resets them. Ollama and Groq have independent timeouts, so a request that times out before falling back can take longer than one configured timeout. Live provider responses may evolve; authenticated staging checks are required.

Fallback may send the same question/history to both providers. Update community privacy expectations accordingly. No billing purchase is initiated by the bot, but **existing paid-account billing or auto-top-up can still incur charges**. Disable automatic top-ups and enforce account spending limits if the budget must be zero.

## References checked during implementation

- [Ollama Cloud](https://docs.ollama.com/cloud): API key setup and direct hosted access.
- [Ollama OpenAI compatibility](https://docs.ollama.com/api/openai-compatibility): cloud base URL, supported chat fields, tools/reasoning and unsupported `tool_choice`.
- [Groq supported models](https://console.groq.com/docs/models): model ID availability; Qwen is a preview model and can change.

The implementation was validated with mocked provider responses and the full offline test suite, not real account credentials or actual exhausted-credit events.

## Agent web tools

See [AI-first conversation and web limits](../README.md#ai-first-conversation-not-token-name-routing). `OLLAMA_API_KEY` is also used for the official `https://ollama.com/api/web_search` endpoint. Free-account search allowance is separate from model-provider fallback; there is no Groq search fallback. Protected public HTTPS page reading and the arithmetic parser do not require a search key. Tool decisions are AI-first, not the legacy deterministic router. Direct slash tools remain available without AI when their own dependencies permit.

The agent receives current UTC time per request and can call `get_time` for an explicit timezone. Public Checking status is application-owned, not private chain-of-thought or a guarantee of correctness. Stop can cancel in-flight model/web calls through their abort signals; existing market calls retain their own timeout. Default prose is short, using the primary model and only the tool rounds actually needed rather than a second review-model pass.

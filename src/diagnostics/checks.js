const { CoinGeckoQuotes } = require('../features/coingecko-quotes');
function readDemoKey(env = process.env) {
    // Demo plan is explicitly selected; never infer Pro from a CG- prefix.
    return [env.COINGECKO_DEMO_API_KEY, env.CG_API_KEY, env.COINGECKO_API_KEY].find(value => typeof value === 'string' && value.trim())?.trim() || '';
}
function failure(error) {
    const status = Number.isInteger(error?.status) ? error.status : undefined;
    const providerCode = [10002, 10003, 10005, 10010, 10011].includes(error?.providerCode) ? error.providerCode : undefined;
    let reason = 'network_or_provider_error';
    if (providerCode === 10010) reason = 'pro_key_on_demo_endpoint';
    else if (providerCode === 10011) reason = 'demo_key_on_pro_endpoint';
    else if (providerCode === 10005) reason = 'endpoint_not_in_plan';
    else if (status === 401 || providerCode === 10002 || providerCode === 10003) reason = 'missing_or_invalid_key';
    else if (status === 403) reason = 'access_denied_or_host_ip_blocked';
    else if (status === 429 || error?.code === 'PROVIDER_COOLDOWN') reason = 'rate_limited';
    else if (error?.code === 'STALE_QUOTE') reason = 'stale_or_invalid_price_timestamp';
    else if (['AbortError', 'TimeoutError'].includes(error?.name)) reason = 'timeout';
    else if (error?.name === 'SyntaxError') reason = 'invalid_provider_json';
    return { status: 'error', reason, httpStatus: status, providerCode };
}
async function checkPrice(api, { key = '', now = Date.now } = {}) {
    const checkedAt = new Date(now()).toISOString();
    try {
        const quote = await new CoinGeckoQuotes(api, { now }).get('BTC');
        return { status: 'ok', auth: key ? 'demo-key' : 'keyless', checkedAt, source: 'CoinGecko', currency: quote.currency, basis: quote.derived ? 'derived_cross_rate' : 'usd_aggregate', quoteAgeSeconds: quote.ageSeconds, freshnessValidated: true };
    } catch (error) { return { ...failure(error), auth: key ? 'demo-key' : 'keyless', checkedAt }; }
}
async function checkAi(client, { now = Date.now } = {}) {
    const checkedAt = new Date(now()).toISOString();
    if (!client) return { status: 'not_configured', checkedAt };
    try {
        const response = await client.chat.completions.create({ messages: [{ role: 'user', content: 'Reply with OK only. Do not use tools.' }], max_completion_tokens: 32, temperature: 0 }, { signal: AbortSignal.timeout(20000) });
        if (!response.choices?.[0]?.message?.content?.trim()) throw new Error('No final answer');
        return { status: 'ok', checkedAt };
    } catch (error) { return { ...failure(error), checkedAt }; }
}
async function checkAgentPrice(client, actions, config, { now = Date.now } = {}) {
    const checkedAt = new Date(now()).toISOString();
    if (!client) return { status: 'not_configured', checkedAt };
    let attempted = false; let quote;
    try {
        const { createAgent } = require('../ai/agent');
        const agent = createAgent({ client, actions, config, now, logger: { debug() {} } });
        const answer = await agent.respond('Bhai, BTC er price koto? USDT e bolo.', { sessionKey: 'diagnostic-price', signal: AbortSignal.timeout(25000), onTool: (intent, output) => { if (intent.command === 'price') { attempted = true; quote = output?.quote; } } });
        if (!attempted) return { status: 'error', reason: 'agent_did_not_call_price', checkedAt };
        if (!quote) return { status: 'error', reason: 'price_tool_failed', toolUsed: true, checkedAt };
        if (quote.currency !== 'USDT' || !answer.includes('BTC/USDT')) return { status: 'error', reason: 'wrong_quote_currency_or_answer', toolUsed: true, checkedAt };
        if (!/second age update/.test(answer)) return { status: 'error', reason: 'language_mismatch', toolUsed: true, checkedAt };
        return { status: 'ok', toolUsed: true, currency: 'USDT', language: 'banglish', languageMatched: true, checkedAt };
    } catch (error) { return { ...failure(error), toolUsed: attempted, checkedAt }; }
}
module.exports = { readDemoKey, failure, checkPrice, checkAi, checkAgentPrice };

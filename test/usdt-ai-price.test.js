const { test } = require('node:test');
const assert = require('node:assert/strict');
const { CoinGeckoQuotes } = require('../src/features/coingecko-quotes');
const { LiveQuotes } = require('../src/features/live-quotes');
const { createAgent } = require('../src/ai/agent');
const { recoveredPrice } = require('../src/ai/price-plan');
const { checkAgentPrice } = require('../src/diagnostics/checks');
const NOW = Date.parse('2026-10-29T06:00:00Z');
const response = content => ({ choices: [{ message: { content } }] });
function cg(data) { const urls = []; return { urls, quotes: new CoinGeckoQuotes({ get: async (url, ttl) => { urls.push({ url, ttl }); return { data, fetchedAt: new Date(NOW).toISOString() }; } }, { now: () => NOW }) }; }
const entry = price => ({ usd: price, last_updated_at: (NOW - 10000) / 1000 });
test('USDT default is a real cross-rate, not a relabeled USD number', async () => {
    const f = cg({ bitcoin: entry(100), tether: entry(0.8) }); const quote = await f.quotes.get('BTC');
    assert.equal(quote.price, 125); assert.equal(quote.currency, 'USDT'); assert.equal(quote.derived, true);
    assert.match(f.urls[0].url, /bitcoin%2Ctether/); assert.equal(f.urls[0].ttl, 0);
    assert.match(quote.methodology, /divided by USDT\/USD/);
});
test('USDT conversion rejects missing, stale, zero, negative or invalid Tether data', async () => {
    for (const tether of [undefined, entry(0), entry(-1), entry(NaN), { ...entry(1), last_updated_at: (NOW - 121000) / 1000 }]) await assert.rejects(cg({ bitcoin: entry(100), tether }).quotes.get('BTC'), { code: 'STALE_QUOTE' });
});
test('cross-rate freshness is the age of the older component', async () => {
    const quote = await cg({ bitcoin: entry(100), tether: { ...entry(1), last_updated_at: (NOW - 90000) / 1000 } }).quotes.get('BTC');
    assert.equal(quote.ageSeconds, 90);
});
test('USD stays available explicitly and Tether/USDT is exactly one', async () => {
    const usd = cg({ bitcoin: entry(100) }); assert.equal((await usd.quotes.get('BTC', { currency: 'usd' })).currency, 'USD');
    assert.ok(!usd.urls[0].url.includes('tether')); assert.equal((await cg({ tether: entry(0.95) }).quotes.get('USDT')).price, 1);
});
test('exchange mode requests the real USDT pair rather than relabeling a USD trade', async () => {
    let url;
    const quotes = new LiveQuotes({ get: async request => { url = request; return { data: { price: '100', time: new Date(NOW - 1000).toISOString() }, fetchedAt: new Date(NOW).toISOString() }; } }, { now: () => NOW });
    const quote = await quotes.get('BTC', { currency: 'usdt' }); assert.match(url, /BTC-USDT\/ticker/); assert.equal(quote.currency, 'USDT');
});
test('JSON semantic fallback recovers an AI price request when function calling is skipped', async () => {
    let calls = 0; let modelCalls = 0; const observed = [];
    const agent = createAgent({ config: {}, now: () => NOW, logger: { debug() {} },
        actions: { execute: async intent => { calls++; assert.equal(intent.command, 'price'); assert.equal(intent.args.currency, 'usdt'); return { quote: { symbol: 'BTC', price: 125, currency: 'USDT', kind: 'aggregate', ageSeconds: 10, source: 'CoinGecko cross-rate' } }; } },
        client: { chat: { completions: { create: async () => ++modelCalls === 1 ? response('BTC price unavailable right now. Try again in a minute.') : response(JSON.stringify({ command: 'price', args: { token: 'BTC', currency: 'usdt', mode: 'live', response: 'quote' } })) } } } });
    const answer = await agent.respond('What is the BTC price?', { onTool: (intent, output) => observed.push({ intent, output }) });
    assert.match(answer, /BTC\/USDT/); assert.match(answer, /125 USDT/); assert.ok(!answer.includes('$')); assert.equal(calls, 1); assert.equal(modelCalls, 2); assert.equal(observed.length, 1);
});
test('simple price tools produce an app-owned answer without another generative price response', async () => {
    let calls = 0;
    const agent = createAgent({ config: {}, logger: { debug() {} }, actions: { execute: async () => ({ quote: { symbol: 'BTC', price: 100, currency: 'USDT', kind: 'aggregate', ageSeconds: 3, source: 'CoinGecko cross-rate' } }) }, client: { chat: { completions: { create: async () => { calls++; return { choices: [{ message: { tool_calls: [{ id: 'q', function: { name: 'price', arguments: '{"token":"BTC","currency":"usdt"}' } }] } }] }; } } } } });
    assert.match(await agent.respond('BTC price please'), /100 USDT/); assert.equal(calls, 1);
});
test('recovery never permits shell tools, invalid currencies or fabricated pair syntax', () => {
    for (const content of ['{"command":"run_shell","args":{"command":"whoami"}}', '{"command":"price","args":{"token":"BTC","currency":"eur"}}', '{"command":"price","args":{"token":"https://evil.example"}}']) assert.equal(recoveredPrice(response(content)), null);
    assert.deepEqual(recoveredPrice(response('{"command":"none"}')), { notPrice: true });
    assert.deepEqual(recoveredPrice(response('{"command":"clarify","question":"Which coin?"}')), { clarification: 'Which coin?' });
});
test('startup integration probe verifies actual AI price tool execution and USDT answer', async () => {
    const client = { chat: { completions: { create: async () => ({ choices: [{ message: { tool_calls: [{ id: 'q', function: { name: 'price', arguments: '{"token":"BTC","currency":"usdt"}' } }] } }] }) } } };
    const result = await checkAgentPrice(client, { execute: async () => ({ quote: { symbol: 'BTC', price: 100, currency: 'USDT', kind: 'aggregate', ageSeconds: 1, source: 'CoinGecko' } }) }, {});
    assert.equal(result.status, 'ok'); assert.equal(result.toolUsed, true); assert.equal(result.currency, 'USDT'); assert.ok(!JSON.stringify(result).includes('100'));
});

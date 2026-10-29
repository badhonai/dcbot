const { test } = require('node:test');
const assert = require('node:assert/strict');
const { CoinGeckoQuotes, coinInput } = require('../src/features/coingecko-quotes');
const { checkAgentPrice } = require('../src/diagnostics/checks');
const { MarketService } = require('../src/features/market');
const { recoveredPrice } = require('../src/ai/price-plan');
const now = Date.parse('2026-10-29T10:00:00Z');
const q = { symbol: 'BTC', currency: 'USDT', price: 100, kind: 'aggregate', ageSeconds: 5, source: 'CoinGecko' };
const model = args => ({ chat: { completions: { create: async () => ({ choices: [{ message: { tool_calls: [{ id: 'p', function: { name: 'price', arguments: JSON.stringify(args) } }] } }] }) } } });
test('common AI pair spellings normalize without changing the default real USDT cross-rate', async () => {
 for (const token of ['BTC/USDT', ' BTC-USDT ', '$BTC', 'BTCUSDT']) {
  let calls = 0;
  const quotes = new CoinGeckoQuotes({ get: async url => { calls++; assert.match(url, /bitcoin%2Ctether/); return { data: { bitcoin: { usd: 100, last_updated_at: now / 1000 - 5 }, tether: { usd: 0.8, last_updated_at: now / 1000 - 5 } } }; } }, { now: () => now });
  const quote = await quotes.get(token); assert.equal(quote.symbol, 'BTC'); assert.equal(quote.price, 125); assert.equal(quote.currency, 'USDT'); assert.equal(calls, 1);
 }
});
test('pair currency mismatches fail before network access instead of mislabelling USD as USDT', async () => {
 const quotes = new CoinGeckoQuotes({ get: async () => assert.fail('must not fetch') });
 await assert.rejects(quotes.get('BTC/USD'), { code: 'LIVE_UNAVAILABLE' });
 await assert.rejects(quotes.get('BTC/USDT', { currency: 'usd' }), { code: 'LIVE_UNAVAILABLE' });
 assert.equal(coinInput('unknown-usdt'), 'unknown-usdt'); assert.equal(coinInput('bitcoin'), 'bitcoin');
 assert.equal(coinInput('USDT'), 'usdt');
});
test('semantic price recovery accepts validated pair form but not currency conflicts or other pairs', () => {
 const r = args => recoveredPrice({ choices: [{ message: { content: JSON.stringify({ command: 'price', args }) } }] });
 assert.equal(r({ token: 'BTC/USDT', currency: 'usdt' }).intent.args.token, 'btc');
 assert.equal(r({ token: 'BTC/USD', currency: 'usdt' }), null);
 assert.equal(r({ token: 'BTC/ETH' }), null); assert.equal(r({ token: 'https://example.com' }), null);
});
test('market unavailability preserves only safe stable reason metadata', async () => {
 for (const [code, reason] of [['STALE_QUOTE', 'stale_or_invalid_price_timestamp'], ['LIVE_UNAVAILABLE', 'token_not_resolved']]) {
  const m = new MarketService({}, { liveQuotes: { get: async () => { throw Object.assign(new Error('Known safe unavailable notice'), { code }); } } });
  const r = await m.price('BTC'); assert.equal(r.failureReason, reason); assert.equal(r.liveUnavailable, true);
 }
});
test('integration diagnostics expose stale/input distinctions and sanitized selection, not quote values', async () => {
 for (const failureReason of ['stale_or_invalid_price_timestamp', 'token_not_resolved']) {
  const result = await checkAgentPrice(model({ token: 'BTC/USDT', currency: 'usdt' }), { execute: async () => ({ liveUnavailable: true, failureReason, pages: [{ description: 'Unavailable' }] }) }, {}, { now: () => now });
  assert.equal(result.reason, failureReason); assert.equal(result.toolUsed, true); assert.equal(result.selection.tokenShape, 'pair_or_quote_suffix'); assert.equal(result.selection.currency, 'usdt'); assert.equal(result.quote, undefined);
 }
});
test('integration diagnostics retain provider rejection reason even though agent safely catches the tool exception', async () => {
 const result = await checkAgentPrice(model({ token: 'BTC' }), { execute: async () => { throw Object.assign(new Error('SECRET response and key'), { status: 429 }); } }, {}, { now: () => now });
 assert.equal(result.reason, 'rate_limited'); assert.equal(result.httpStatus, 429); assert.equal(result.toolUsed, true); assert.ok(!JSON.stringify(result).includes('SECRET'));
});
test('market stats selected for a current quote are flagged rather than reported as provider failure', async () => {
 const result = await checkAgentPrice(model({ token: 'BTC', mode: 'market' }), { execute: async () => ({ pages: [{ description: 'USD market stats' }] }) }, {}, { now: () => now });
 assert.equal(result.reason, 'non_quote_mode_selected'); assert.equal(result.selection.mode, 'market');
});
test('integration probe passes only with a genuine quote and matching Banglish answer', async () => {
 const result = await checkAgentPrice(model({ token: 'BTC/USDT', currency: 'usdt' }), { execute: async () => ({ quote: q }) }, {}, { now: () => now });
 assert.equal(result.status, 'ok'); assert.equal(result.languageMatched, true); assert.equal(result.currency, 'USDT'); assert.equal(result.selection, undefined); assert.equal(result.price, undefined);
});

test('host-style Banglish probe recovers when the primary model skips its tool call', async () => {
 const responses = ['Bhai, Bitcoin popular ekta cryptocurrency', JSON.stringify({ command: 'price', args: { token: 'BTC', currency: 'usdt' } })];
 let calls = 0;
 const client = { chat: { completions: { create: async () => ({ choices: [{ message: { content: responses.shift() || 'unexpected extra call' } }] }) } } };
 const result = await checkAgentPrice(client, { execute: async intent => { calls++; assert.equal(intent.command, 'price'); return { quote: q }; } }, {}, { now: () => now });
 assert.equal(result.status, 'ok'); assert.equal(result.languageMatched, true); assert.equal(calls, 1); assert.equal(responses.length, 0);
});
test('semantic review gate supports price phrasing but does not select a token itself', () => {
 const { needsPriceReview } = require('../src/ai/price-plan');
 for (const input of ['BTC er price koto?', 'BTC er daam koto', 'বিটকয়েনের দাম কত?', 'বিটকয়েনের মূল্য কত?', 'What is the BTC quote?', 'BTC rate please']) assert.equal(needsPriceReview(input), true);
 assert.equal(needsPriceReview('hello friend'), false); assert.equal(needsPriceReview('BTC'), false);
});

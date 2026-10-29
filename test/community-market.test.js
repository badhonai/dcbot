const { test } = require('node:test');
const assert = require('node:assert/strict');
const { CommunityMarket, providerLink } = require('../src/features/community-market');
const NOW = Date.parse('2026-10-29T10:00:00Z');
const row = (usd, age = 10) => ({ usd, last_updated_at: NOW / 1000 - age, usd_24h_change: 3, usd_market_cap: 10000, usd_24h_vol: 500 });
function fixture(data) { const calls = []; return { service: new CommunityMarket({ get: async (...args) => { calls.push(args); return { data, fetchedAt: new Date(NOW).toISOString() }; } }, { now: () => NOW }), calls }; }
test('comparison uses one uncached batch and genuine Tether cross-rate', async () => {
 const { service, calls } = fixture({ bitcoin: row(100), ethereum: row(20), tether: row(0.8) });
 const result = await service.compare('BTC, ETH');
 assert.equal(calls.length, 1); assert.equal(calls[0][1], 0); assert.match(calls[0][0], /bitcoin%2Cethereum%2Ctether/);
 assert.equal(result.quotes[0].price, 125); assert.equal(result.quotes[1].price, 25); assert.equal(result.quotes[0].currency, 'USDT');
 assert.match(JSON.stringify(result.pages), /24h \(USD\)/); assert.equal(result.quotes[0].marketCapUsd, 10000);
});
test('comparison refuses stale, missing, zero and future Tether rather than USD parity', async () => {
 for (const tether of [undefined, row(1, 121), row(0), row(1, -6), row(NaN)]) {
  const r = await fixture({ bitcoin: row(100), ethereum: row(20), tether }).service.compare('BTC, ETH');
  assert.equal(r.quotes, undefined); assert.match(r.pages[0].description, /No USD-parity/);
 }
});
test('a stale base token fails independently without hiding another good quote', async () => {
 const r = await fixture({ bitcoin: row(100, 121), ethereum: row(20), tether: row(1) }).service.compare('BTC, ETH');
 assert.equal(r.quotes[0].unavailable, true); assert.equal(r.quotes[1].price, 20);
});
test('comparison bounds tokens, rejects same-asset aliases and deduplicates input', async () => {
 for (const input of ['BTC', 'BTC,ETH,SOL,SUI,BNB', 'BTC,bitcoin']) {
  const f = fixture({}); const r = await f.service.compare(input); assert.equal(r.quotes, undefined); assert.equal(f.calls.length, 0);
 }
 const f = fixture({ bitcoin: row(1), ethereum: row(2), tether: row(1) });
 assert.equal((await f.service.compare('BTC, btc, ETH')).quotes.length, 2);
});
test('ambiguous tickers do not silently select the first provider project', async () => {
 const f = fixture({ coins: [{ id: 'one', symbol: 'ABC' }, { id: 'two', symbol: 'ABC' }] });
 await assert.rejects(f.service.compare('ABC, BTC'), /Multiple CoinGecko/);
});
test('trending is bounded and labelled interest, not endorsement or gainers', async () => {
 const f = fixture({ coins: Array.from({ length: 12 }, (_, i) => ({ item: { id: `coin-${i}`, symbol: 'XYZ', name: '@everyone', market_cap_rank: null } })) });
 const r = await f.service.trending(); assert.equal(r.results.length, 7); assert.match(r.pages[0].footer.text, /not gainers/); assert.equal(r.results[0].rank, null); assert.equal(f.calls[0][1], 120000);
 assert.ok(!r.results[0].name.includes('@'));
});
test('empty and malformed trending data do not invent discoveries', async () => {
 for (const data of [{}, { coins: [{ item: { id: '../secret' } }] }]) assert.equal((await fixture(data).service.trending()).results, undefined);
});
test('coin fundamentals keep unknown supply unknown, and provider links unverified', async () => {
 const f = fixture({ id: 'bitcoin', name: 'Bitcoin', description: { en: '<p>Project description</p>' }, links: { homepage: ['https://bitcoin.org', 'https://127.0.0.1'], twitter_screen_name: 'bitcoin' }, market_data: { market_cap: { usd: 100 }, fully_diluted_valuation: { usd: 150 } } });
 const r = await f.service.coin('BTC'); assert.equal(r.metrics.circulatingSupply, null); assert.equal(r.metrics.maxSupply, null); assert.deepEqual(r.links.homepage, ['https://bitcoin.org/']); assert.equal(r.links.x, 'https://x.com/bitcoin'); assert.ok(!r.description.includes('<p>')); assert.match(r.note, /NOT owner-approved/); assert.match(r.pages[0].footer.text, /may lag/);
});
test('provider response identity mismatch is rejected', async () => {
 await assert.rejects(fixture({ id: 'ethereum' }).service.coin('BTC'), /different token/);
});
test('listed link validator blocks credentials, local IPs and insecure URLs', () => {
 for (const url of ['http://example.com', 'https://a:b@example.com', 'https://127.0.0.1', 'https://internal.local']) assert.equal(providerLink(url), null);
 assert.equal(providerLink('https://example.com/docs'), 'https://example.com/docs');
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { LiveQuotes } = require('../src/features/live-quotes');
const { MarketService } = require('../src/features/market');
const { detectIntent, detectPriceFollowUp, extractPriceToken } = require('../src/ai/intent-router');
const { validateIntent } = require('../src/features/actions');
const { createHandlers } = require('../src/discord/handlers');
const { createIntentRouter } = require('../src/ai/intent-router');
const { HistoryStore } = require('../src/conversation/history-store');
const { ChannelQueue } = require('../src/conversation/channel-queue');
const NOW = Date.parse('2026-10-24T10:30:00Z');
const previous = { command: 'price', args: { token: 'SOL', mode: 'live' } };
const kraken = price => ({ error: [], result: { SUIUSD: [[price, '1', NOW / 1000 - 2, 'b', 'l', '', 123]], last: 'cursor' } });
test('Banglish possessives are never mistaken for the ticker ER', () => {
    for (const text of ['Sui er price', 'SUI er price koto?', 'price of SUI', 'ar sui er dam koto', 'whats the price of SUI?']) {
        assert.equal(detectIntent(text).args.token, 'SUI');
    }
    assert.equal(extractPriceToken('SUI er price'), 'SUI');
});
test('short follow-ups handle tickers beyond the alias list', () => {
    for (const symbol of ['SUI', 'APT', 'SEI', 'NEAR']) {
        assert.equal(detectPriceFollowUp(`${symbol} er ?`, previous).args.token, symbol);
        assert.equal(detectPriceFollowUp(`and ${symbol}?`, previous).args.token, symbol);
    }
    assert.equal(detectPriceFollowUp('thanks', previous), null);
    assert.equal(detectPriceFollowUp('slippage?', previous), null);
    assert.equal(detectPriceFollowUp('SUI and APT?', previous), null);
});
test('SUI cannot be sent to a glossary tool by AI selection', () => {
    assert.equal(validateIntent({ command: 'explain', args: { term: 'SUI' } }), null);
    assert.ok(validateIntent({ command: 'explain', args: { term: 'slippage' } }));
});
test('Kraken supplies a validated fresh USD trade if Coinbase fails', async () => {
    const calls = [];
    const quotes = new LiveQuotes({ get: async (url, ttl) => {
        calls.push([url, ttl]);
        if (url.includes('coinbase')) throw new Error('temporarily unavailable');
        return { data: kraken('0.9422'), fetchedAt: new Date(NOW).toISOString() };
    } }, { now: () => NOW });
    const quote = await quotes.get('SUI');
    assert.equal(quote.symbol, 'SUI'); assert.equal(quote.source, 'Kraken'); assert.equal(quote.price, 0.9422); assert.equal(quote.ageSeconds, 2);
    assert.equal(calls.length, 2); assert.ok(calls.every(([, ttl]) => ttl === 0));
    assert.match(calls[1][0], /Trades\?pair=SUIUSD&count=1/);
});
test('Kraken is not queried when the first venue has a fresh trade', async () => {
    let calls = 0;
    const quotes = new LiveQuotes({ get: async () => { calls++; return { data: { price: '0.94', time: new Date(NOW - 1000).toISOString() }, fetchedAt: new Date(NOW).toISOString() }; } }, { now: () => NOW });
    assert.equal((await quotes.get('SUI')).sourceLabel, 'Coinbase'); assert.equal(calls, 1);
});
test('fallback rejects stale trades and API errors instead of inventing a price', async () => {
    for (const data of [kraken('0.94'), { error: ['EQuery:Unknown asset pair'] }]) {
        if (data.result) data.result.SUIUSD[0][2] = NOW / 1000 - 120;
        const quotes = new LiveQuotes({ get: async url => {
            if (url.includes('coinbase')) throw new Error('down');
            return { data, fetchedAt: new Date(NOW).toISOString() };
        } }, { now: () => NOW });
        await assert.rejects(quotes.get('SUI'), /No fresh SUI quote available/);
    }
});
test('live cards name the actual venue and failures are concise', async () => {
    const quotes = new LiveQuotes({ get: async url => {
        if (url.includes('coinbase')) throw new Error('down');
        return { data: kraken('0.9422'), fetchedAt: new Date(NOW).toISOString() };
    } }, { now: () => NOW });
    const result = await new MarketService({}, { liveQuotes: quotes }).price('SUI');
    assert.match(result.pages[0].footer.text, /Kraken/); assert.ok(!result.pages[0].footer.text.includes('Coinbase'));
    const failed = new MarketService({}, { liveQuotes: new LiveQuotes({ get: async () => { throw new Error('down'); } }) });
    const notice = await failed.price('SUI');
    assert.equal(notice.liveUnavailable, true); assert.ok(notice.pages[0].description.length < 100);
});
test('the screenshot SUI follow-up fetches a quote even with no local alias/history', async () => {
    const sent = []; const intents = [];
    const handlers = createHandlers({ client: { user: { id: 'bot' } }, config: { channels: ['a'], maxResponseLength: 1600 }, queue: new ChannelQueue(10), history: new HistoryStore(13), router: createIntentRouter(),
        actions: { execute: async intent => { intents.push(intent); return { quote: { symbol: 'SUI', price: 0.9422, sourceLabel: 'Kraken', ageSeconds: 2 } }; } },
        ai: { respond: async () => { throw new Error('General AI must not handle this price request'); } }, logger: { debug() {}, error() {}, warn() {} } });
    await handlers.onMessage({ channelId: 'a', author: { id: 'person', bot: false }, content: 'Sui er ?', mentions: { has: () => true }, reference: { messageId: 'old-price' },
        channel: { sendTyping: async () => {}, messages: { fetch: async () => ({ author: { id: 'bot' }, content: '**SOL: $101.28**' }) } },
        reply: async payload => { sent.push(payload); return { id: 'new-price' }; } });
    assert.equal(intents[0].args.token, 'SUI'); assert.match(sent[0].content, /SUI: \$0.9422/); assert.match(sent[0].content, /Kraken/); assert.equal(sent[0].embeds, undefined);
});

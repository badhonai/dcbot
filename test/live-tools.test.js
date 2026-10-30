const { test } = require('node:test');
const assert = require('node:assert/strict');
const { LiveQuotes, resolveSymbol } = require('../src/features/live-quotes');
const { MarketService } = require('../src/features/market');
const { PublicApi } = require('../src/integrations/public-api');
const { detectIntent, createIntentRouter } = require('../src/ai/intent-router');
const { Actions, validateIntent } = require('../src/features/actions');
const { createHandlers } = require('../src/discord/handlers');
const { HistoryStore } = require('../src/conversation/history-store');
const { ChannelQueue } = require('../src/conversation/channel-queue');
const quiet = { debug() {}, info() {}, warn() {}, error() {} };
const NOW = Date.parse('2026-10-24T10:00:00Z');
const fresh = { price: '80532.63', time: '2026-10-24T09:59:58Z' };
function live(data = fresh) {
    const calls = [];
    const quotes = new LiveQuotes({ get: async (...args) => { calls.push(args); return { data, fetchedAt: new Date(NOW).toISOString() }; } }, { now: () => NOW });
    return { quotes, calls };
}
test('live quote uses the exchange ticker with caching disabled', async () => {
    const { quotes, calls } = live(); const q = await quotes.get('bitcoin');
    assert.equal(q.symbol, 'BTC'); assert.equal(q.price, 80532.63); assert.equal(q.ageSeconds, 2);
    assert.equal(calls[0][0], 'https://api.exchange.coinbase.com/products/BTC-USD/ticker'); assert.equal(calls[0][1], 0);
});
test('old trades are rejected instead of mislabeled live', async () => {
    const { quotes } = live({ price: '80000', time: '2026-10-24T09:55:00Z' });
    await assert.rejects(quotes.get('BTC'), error => error.code === 'STALE_QUOTE');
});
test('bad prices, missing timestamps and implausible future timestamps fail closed', async () => {
    for (const data of [{ ...fresh, price: 'NaN' }, { ...fresh, price: '-1' }, { price: '12' }, { ...fresh, time: '2026-10-24T11:00:00Z' }]) {
        await assert.rejects(live(data).quotes.get('BTC'), error => error.code === 'STALE_QUOTE');
    }
});
test('unsupported tickers or API failures never silently substitute delayed data', async () => {
    const quotes = new LiveQuotes({ get: async () => { throw new Error('secret error'); } });
    await assert.rejects(quotes.get('BTC'), error => error.code === 'LIVE_UNAVAILABLE' && !error.message.includes('secret'));
    assert.equal(resolveSymbol('btc-bitcoin'), 'BTC'); assert.equal(resolveSymbol('bad/address'), null);
});
test('TTL zero bypasses existing cache and never stores a live response', async () => {
    let now = NOW; let count = 0;
    const url = 'https://api.exchange.coinbase.com/products/BTC-USD/ticker';
    const api = new PublicApi({ now: () => now, logger: quiet, fetchFn: async (_, options) => {
        assert.equal(options.cache, 'no-store'); count++; return { ok: true, json: async () => fresh };
    } });
    api.cache.set(url, { value: { data: { price: 'old' } }, expires: now + 60000 });
    await api.get(url, 0); now += 1000; await api.get(url, 0);
    assert.equal(count, 2); assert.equal(api.cache.get(url).value.data.price, 'old');
});
test('price defaults to a fresh short card and exposes authoritative quote data', async () => {
    const { quotes } = live(); const market = new MarketService({}, { liveQuotes: quotes });
    const result = await market.price('BTC');
    assert.equal(result.quote.symbol, 'BTC'); assert.equal(result.pages.length, 1);
    assert.equal(result.pages[0].description, '**80,532.63 USDT**'); assert.ok(!result.pages[0].fields);
});
test('failed live pricing returns a notice, not fabricated or delayed values', async () => {
    const market = new MarketService({}, { liveQuotes: live({ ...fresh, time: '2026-01-01' }).quotes });
    const result = await market.price('BTC');
    assert.equal(result.pages[0].title, 'Live quote unavailable'); assert.equal(result.quote, undefined);
});
test('common natural price questions resolve locally with no AI tokens', () => {
    for (const question of ['whats the live btc price?', 'BTC price', 'price of bitcoin', 'how much is ETH?', 'show me the price of $SOL']) {
        const intent = detectIntent(question); assert.equal(intent.command, 'price'); assert.equal(intent.args.mode, 'live');
    }
    assert.equal(detectIntent('price of PEPE').args.token, 'PEPE');
});
test('ambiguous, historical and future questions do not invent live answers', () => {
    assert.ok(detectIntent('what is the price?').clarification);
    assert.ok(detectIntent('BTC and ETH price?').clarification);
    assert.equal(detectIntent('what was BTC price yesterday?'), null);
    assert.equal(detectIntent('what will BTC price be next year?'), null);
    assert.equal(detectIntent('good morning everyone'), null);
});
test('other information intents map to read-only actions', () => {
    assert.equal(detectIntent('new pools on solana').command, 'newpairs');
    assert.equal(detectIntent('what is slippage?').command, 'explain');
    assert.equal(detectIntent('show official links').command, 'official');
    assert.ok(detectIntent('show new pools').clarification);
    const address = '0x' + '1'.repeat(40);
    assert.deepEqual(detectIntent(`show pools ethereum ${address}`).args, { chain: 'ethereum', address });
});
test('AI routing validates function name and arguments and ignores generated prose', async () => {
    const router = createIntentRouter({ config: { model: 'test' }, logger: quiet, client: { chat: { completions: { create: async () => ({ choices: [{ message: { content: 'invented price', tool_calls: [{ function: { name: 'ask', arguments: '{"question":"project fees"}' } }] } }] }) } } } });
    assert.deepEqual(await router.resolve('Tell me about project fees'), { command: 'ask', args: { question: 'project fees' } });
    assert.equal(validateIntent({ command: 'executeTrade', args: {} }), null);
    assert.equal(validateIntent({ command: '__proto__', args: {} }), null);
    assert.equal(validateIntent({ command: 'price', args: { token: 'BTC', url: 'https://evil.example' } }), null);
    assert.equal(validateIntent({ command: 'price', args: { token: 'BTC', mode: 'invented' } }), null);
});
test('routing provider failures fall back without exposing an error or making tool claims', async () => {
    const router = createIntentRouter({ client: { chat: { completions: { create: async () => { throw new Error('provider failed'); } } } }, config: {}, logger: quiet });
    assert.equal(await router.resolve('Hello there'), null);
});
test('executor bounds concurrency and releases capacity on failure', async () => {
    let release; const gate = new Promise(resolve => { release = resolve; });
    const actions = new Actions({ market: { price: async () => { await gate; throw new Error('expected'); } }, knowledge: {} });
    const pending = Array.from({ length: 3 }, () => actions.execute({ command: 'price', args: { token: 'BTC' } }));
    await assert.rejects(actions.execute({ command: 'price', args: { token: 'ETH' } }), error => error.code === 'BOT_BUSY');
    release(); await Promise.allSettled(pending); assert.equal(actions.active, 0);
});
function chatFixture({ enabled = true } = {}) {
    const sent = []; const events = []; let tools = 0; let aiCalls = 0;
    const quotes = live().quotes;
    const handlers = createHandlers({ client: { user: { id: 'bot' } }, config: { channels: ['a'], maxResponseLength: 1600, naturalLanguageCommands: enabled },
        history: new HistoryStore(13), queue: new ChannelQueue(10), router: createIntentRouter(),
        actions: { execute: async intent => { tools++; return new MarketService({}, { liveQuotes: quotes }).price(intent.args.token); } },
        ai: { respond: async () => { aiCalls++; return 'normal chat'; } }, logger: quiet });
    const message = { id: 'm', content: 'whats the live btc price?', channelId: 'a', author: { id: 'u', bot: false, displayName: 'Person' }, mentions: { has: () => enabled }, channel: { sendTyping: async () => events.push('typing') }, reply: async payload => { events.push('reply'); sent.push(payload); return { id: 'response' }; } };
    return { handlers, message, sent, events, counts: () => ({ tools, aiCalls }) };
}
test('mentioned live-price request types first and replies briefly without an AI-made price', async () => {
    const f = chatFixture(); await f.handlers.onMessage(f.message);
    assert.deepEqual(f.events, ['typing', 'reply']); assert.deepEqual(f.counts(), { tools: 1, aiCalls: 0 });
    assert.match(f.sent[0].content, /BTC: \$80,532/); assert.ok(f.sent[0].content.length < 180);
    assert.deepEqual(f.sent[0].allowedMentions.parse, []);
});
test('natural-language mode can be disabled for messages without a mention', async () => {
    const f = chatFixture({ enabled: false }); await f.handlers.onMessage(f.message); assert.equal(f.sent.length, 0);
});
test('natural requests respect channel scope, bot filtering and cooldowns', async () => {
    const f = chatFixture(); f.message.channelId = 'b'; await f.handlers.onMessage(f.message);
    f.message.channelId = 'a'; f.message.author.bot = true; await f.handlers.onMessage(f.message);
    assert.equal(f.sent.length, 0);
    f.message.author.bot = false; await f.handlers.onMessage(f.message); await f.handlers.onMessage(f.message);
    assert.equal(f.sent.length, 1); assert.equal(f.counts().tools, 1);
});

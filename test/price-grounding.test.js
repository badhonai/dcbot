const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createAgent } = require('../src/ai/agent');
const { groundedQuote, priceDetour, safePriceFailure } = require('../src/ai/price-grounding');
const text = content => ({ choices: [{ message: { content } }] });
const tool = () => ({ choices: [{ message: { tool_calls: [{ id: 'price', function: { name: 'price', arguments: JSON.stringify({ token: 'BTC' }) } }] } }] });
const bad = "I can't pull a live price right now. Would you like a recent delayed price from CoinGecko instead?";
const quote = { symbol: 'BTC', price: 12345, ageSeconds: 25, kind: 'aggregate', source: 'CoinGecko' };
function setup(outputs, execute) {
    let requests = 0; const observed = [];
    const agent = createAgent({ config: {}, logger: { debug() {} }, actions: { execute }, client: { chat: { completions: { create: async () => { requests++; return outputs.shift() || text(bad); } } } } });
    return { agent, observed, requests: () => requests };
}
test('a successful current quote cannot be replaced with an offer to fetch CoinGecko again', async () => {
    const f = setup([tool(), text(bad)], async () => ({ quote }));
    const answer = await f.agent.respond('What is the current BTC price?');
    assert.match(answer, /12,345/); assert.match(answer, /CoinGecko/); assert.match(answer, /updated 25s ago/); assert.ok(!answer.includes('Would you like'));
});
test('unsupported price refusal gets one bounded AI tool-selection correction, not keyword execution', async () => {
    let calls = 0; const f = setup([text(bad), tool(), text('BTC is $12,345 from CoinGecko')], async intent => { assert.equal(intent.command, 'price'); calls++; return { quote }; });
    await f.agent.respond('Current BTC price please'); assert.equal(calls, 1); assert.equal(f.requests(), 3);
});
test('a refusing model cannot create an unbounded correction loop or automatic tool execution', async () => {
    let calls = 0; const f = setup([text(bad), text(bad)], async () => { calls++; });
    await f.agent.respond('Current BTC price please'); assert.equal(calls, 0); assert.equal(f.requests(), 2);
});
test('actual provider rate limits surface honestly without exposing API error bodies', async () => {
    const f = setup([tool(), text(bad)], async () => { throw Object.assign(new Error('secret API key raw error'), { status: 429 }); });
    const observed = []; const answer = await f.agent.respond('Current BTC price?', { onTool: (intent, result) => observed.push({ intent, result }) });
    assert.match(answer, /rate limited/); assert.ok(!answer.includes('secret')); assert.ok(!answer.includes('Would you like')); assert.equal(observed[0].intent.command, 'price');
});
test('missing or stale quotes cannot become a grounded current price', () => {
    assert.equal(groundedQuote({ ...quote, ageSeconds: 121 }), ''); assert.equal(groundedQuote({ ...quote, price: NaN }), '');
    assert.equal(groundedQuote({ ...quote, fetchedAt: '2020-01-01T00:00:00Z' }), '');
    assert.match(safePriceFailure({ status: 401 }), /key and plan/); assert.equal(priceDetour('Which coin would you like?'), false);
});
test('a bare token still does not trigger a current price or corrective tool call', async () => {
    let calls = 0; const f = setup([text(bad)], async () => { calls++; return { quote }; });
    await f.agent.respond('BTC'); assert.equal(calls, 0); assert.equal(f.requests(), 1);
});

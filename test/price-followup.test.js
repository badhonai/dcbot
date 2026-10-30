const { test } = require('node:test');
const assert = require('node:assert/strict');
const { MessageFlags } = require('discord.js');
const { createIntentRouter, detectPriceFollowUp } = require('../src/ai/intent-router');
const { createHandlers } = require('../src/discord/handlers');
const { HistoryStore } = require('../src/conversation/history-store');
const { ChannelQueue } = require('../src/conversation/channel-queue');
const previous = { command: 'price', args: { token: 'BTC', mode: 'live' } };
const quiet = { debug() {}, error() {}, warn() {} };
function fixture() {
    let time = 1000000;
    let aiCalls = 0;
    const toolCalls = []; const sent = []; const history = new HistoryStore(13);
    const handlers = createHandlers({ client: { user: { id: 'bot' } }, config: { channels: ['a', 'b'], maxResponseLength: 1600 }, history, queue: new ChannelQueue(10), router: createIntentRouter(), now: () => time, logger: quiet,
        actions: { execute: async intent => {
            toolCalls.push(intent);
            return { quote: { symbol: intent.args.token, sourceLabel: 'Coinbase', price: intent.args.token === 'ETH' ? 2930 : 80500, ageSeconds: 1, tradedAt: '2026-10-24T10:00:00Z', fetchedAt: '2026-10-24T10:00:01Z' } };
        } }, ai: { respond: async () => { aiCalls++; return 'Ordinary chat'; } } });
    const message = { id: 'input', channelId: 'a', author: { id: 'person', displayName: 'Person', bot: false }, content: 'Btc er price koto ?', mentions: { has: () => true }, channel: { sendTyping: async () => {}, messages: { fetch: async () => ({ author: { id: 'bot' }, content: '**BTC: $80,500**' }) } }, reply: async payload => { sent.push(payload); return { id: 'sent-' + sent.length }; } };
    return { ...handlers, message, toolCalls, sent, history, advance: ms => { time += ms; }, aiCalls: () => aiCalls };
}
test('short English and Banglish follow-ups reuse the action, not the old value', () => {
    for (const input of ['Ar eth er ?', 'and ETH?', 'what about ethereum?', 'SOL?', 'ar doge er', 'how about BTC then?']) {
        const intent = detectPriceFollowUp(input, previous);
        assert.equal(intent.command, 'price'); assert.equal(intent.args.mode, 'live');
    }
    assert.equal(detectPriceFollowUp('Ar eth er ?', previous).args.token, 'ETH');
});
test('follow-up detection needs price context and does not hijack unrelated topics', () => {
    assert.equal(detectPriceFollowUp('Ar eth er ?', null), null);
    assert.equal(detectPriceFollowUp('Ar eth er ?', { command: 'explain', args: {} }), null);
    assert.equal(detectPriceFollowUp('ETH staking rewards?', previous), null);
    assert.equal(detectPriceFollowUp('ETH price yesterday?', previous), null);
    assert.equal(detectPriceFollowUp('BTC and ETH?', previous), null);
});
test('price output contains no URL preview and explicitly suppresses embeds', async () => {
    const f = fixture(); await f.onMessage(f.message);
    const reply = f.sent[0];
    assert.equal(reply.content, '**BTC: $80,500**\n-# Coinbase · USD · trade 1s ago');
    assert.equal(reply.flags, MessageFlags.SuppressEmbeds);
    assert.ok(!/https?:|historical snapshot|last trade|fetched|2026-/.test(reply.content));
    assert.equal(reply.embeds, undefined);
});
test('the screenshot BTC-to-ETH conversation produces a second clean tool response', async () => {
    const f = fixture(); await f.onMessage(f.message); f.advance(6000);
    f.message.content = 'Ar eth er ?'; f.message.reference = { messageId: 'sent-1' };
    await f.onMessage(f.message);
    assert.equal(f.toolCalls.length, 2); assert.equal(f.toolCalls[1].args.token, 'ETH');
    assert.equal(f.sent[1].content, '**ETH: $2,930**\n-# Coinbase · USD · trade 1s ago');
    assert.equal(f.aiCalls(), 0);
});
test('replying to a fetched bot quote restores price context without an in-memory session', async () => {
    const f = fixture(); f.message.content = 'Ar eth er ?'; f.message.reference = { messageId: 'old-bot-price' };
    await f.onMessage(f.message);
    assert.equal(f.toolCalls[0].args.token, 'ETH'); assert.equal(f.aiCalls(), 0);
});
test('fresh numeric quotes and internal bookkeeping never enter general AI history', async () => {
    const f = fixture(); await f.onMessage(f.message);
    assert.ok(f.history.get('a').every(entry => entry.role !== 'assistant'));
    const text = JSON.stringify(f.history.get('a'));
    assert.ok(!text.includes('80500')); assert.ok(!text.includes('historical snapshot')); assert.ok(!text.includes('fetched'));
});
test('implicit follow-up context is isolated by user/channel and expires', async () => {
    const f = fixture(); await f.onMessage(f.message); f.advance(6000);
    f.message.content = 'Ar eth er ?'; f.message.author.id = 'another'; await f.onMessage(f.message);
    assert.equal(f.toolCalls.length, 1);
    f.message.author.id = 'person'; f.message.channelId = 'b'; await f.onMessage(f.message);
    assert.equal(f.toolCalls.length, 1);
    f.message.channelId = 'a'; f.advance(120001); await f.onMessage(f.message);
    assert.equal(f.toolCalls.length, 1);
});

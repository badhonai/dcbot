const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path');
const { ChatBoundaries, FIVE_HOURS } = require('../src/preferences/chat-boundaries');
const { ReplyPreferences } = require('../src/preferences/reply-preferences');
const { PublicControls } = require('../src/discord/public-controls');
const { createHandlers } = require('../src/discord/handlers');
const { createWeb3Handler } = require('../src/discord/web3-handler');
const { createAgent, AGENT_RULES } = require('../src/ai/agent');
const { Actions } = require('../src/features/actions');
const { ChannelQueue } = require('../src/conversation/channel-queue');
const quiet = { error() {}, debug() {}, warn() {} };
const text = 'You are a worthless idiot';
const report = (store, id, owner = '123') => store.record(owner, id, text, 'worthless idiot');
test('one gentle boundary, one warning, then precisely five hours of personal silence', () => {
    let now = 100000; const store = new ChatBoundaries(undefined, { now: () => now });
    assert.equal(report(store, '1').paused, false); assert.match(report(store, '2').reply, /If it continues/);
    const third = report(store, '3'); assert.equal(third.paused, true); assert.equal(third.until, now + FIVE_HOURS);
    assert.equal(store.pausedUntil('456'), 0); assert.equal(report(store, '4'), null);
    now += FIVE_HOURS; assert.equal(store.pausedUntil('123'), 0); assert.equal(report(store, '5').paused, false);
});
test('message duplicates, fabricated evidence and another user cannot inflate a counter', () => {
    const store = new ChatBoundaries(); report(store, '1'); report(store, '1');
    assert.equal(store.entries.get('123').count, 1);
    assert.equal(store.record('123', '2', 'Your answer is incorrect', 'worthless idiot'), null);
    assert.equal(store.record('123', '2', text, ''), null); assert.equal(store.entries.get('123').count, 1);
    report(store, '2', '456'); assert.equal(store.entries.get('456').count, 1);
});
test('old incidents expire after one hour without another incident', () => {
    let now = 0; const store = new ChatBoundaries(undefined, { now: () => now }); report(store, '1'); report(store, '2');
    now += 60 * 60000 + 1; assert.equal(report(store, '3').paused, false); assert.equal(store.entries.get('123').count, 1);
});
test('five-hour deadline survives process restart without extending it', t => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chat-boundary-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const file = path.join(dir, 'boundaries.json'); let now = 1000;
    const store = new ChatBoundaries(file, { now: () => now }); report(store, '1'); report(store, '2'); report(store, '3');
    now += 3000; const restored = new ChatBoundaries(file, { now: () => now }); assert.equal(restored.pausedUntil('123'), 1000 + FIVE_HOURS);
    assert.equal(fs.readFileSync(file, 'utf8').includes('worthless'), false);
});
test('rules explicitly protect criticism, jokes, quotes and uncertainty', () => {
    for (const phrase of ['Respect criticism', 'playful consensual teasing', 'If uncertain, do not report', 'CURRENT user message', 'without pretending to have human feelings']) assert.ok(AGENT_RULES.includes(phrase), phrase);
});
function agentReporting() {
    return createAgent({ config: {}, actions: new Actions({}), logger: quiet,
        client: { chat: { completions: { create: async () => ({ choices: [{ message: { tool_calls: [{ id: 'abuse', function: { name: 'report_direct_abuse', arguments: JSON.stringify({ evidence: 'worthless idiot' }) } }] } }] }) } } } });
}
test('public pipeline delivers the third-message boundary once, then suppresses further chat', async () => {
    const boundaries = new ChatBoundaries(); const preferences = new ReplyPreferences(); const agent = agentReporting();
    const controls = new PublicControls({ boundaries, preferences }); const sent = [];
    const handler = createHandlers({ config: { channels: ['c'] }, client: { user: { id: '999' } }, agent, preferences, boundaries, controls, queue: new ChannelQueue(10), logger: quiet });
    for (let i = 1; i <= 4; i++) await handler.onMessage({ id: String(i), author: { id: '123', bot: false }, channelId: 'c', content: text, mentions: { has: () => true }, channel: { sendTyping: async () => {} },
        reply: async payload => { const item = { payload, edit: async update => { item.payload = { ...item.payload, ...update }; }, delete: async () => { item.deleted = true; } }; sent.push(item); return item; } });
    assert.equal(sent.length, 3); assert.match(sent[1].payload.content, /If it continues/); assert.match(sent[2].payload.content, /stepping away/);
    assert.deepEqual(sent[2].payload.components, []); assert.ok(boundaries.pausedUntil('123')); assert.equal(preferences.isMuted('123'), false);
});
test('normal criticism with no reported abuse never changes boundary state', async () => {
    const boundaries = new ChatBoundaries(); let calls = 0;
    const handler = createHandlers({ config: { channels: ['c'] }, client: { user: { id: '999' } }, boundaries, queue: new ChannelQueue(10),
        agent: { hasSession: () => true, respond: async () => { calls++; return 'You’re right, let me fix that 🙂'; } } });
    for (let i = 0; i < 4; i++) await handler.onMessage({ id: String(i), author: { id: '123', bot: false }, channelId: 'c', content: 'That price is wrong, fix it', mentions: { has: () => true }, channel: { sendTyping: async () => {} }, reply: async () => {} });
    assert.equal(calls, 4); assert.equal(boundaries.entries.size, 0);
});
test('/start and private AI chat cannot bypass a five-hour pause', async () => {
    const boundaries = new ChatBoundaries(); report(boundaries, '1'); report(boundaries, '2'); report(boundaries, '3');
    const preferences = new ReplyPreferences(); let calls = 0; const replies = [];
    const handler = createWeb3Handler({ config: { channels: ['c'] }, boundaries, preferences, logger: quiet,
        agent: { respond: async () => { calls++; } }, replies: { send: async (_i, result) => replies.push(result) } });
    for (const commandName of ['start', 'chat']) await handler({ commandName, user: { id: '123' }, channelId: 'c', isChatInputCommand: () => true, deferReply: async () => {} });
    assert.equal(calls, 0); assert.ok(replies.every(reply => reply.includes('paused'))); assert.ok(boundaries.pausedUntil('123'));
});
test('price refresh cannot bypass a pause created after the original price response', async () => {
    const boundaries = new ChatBoundaries(); const preferences = new ReplyPreferences(); let calls = 0;
    const controls = new PublicControls({ boundaries, preferences, actions: { execute: async () => { calls++; } } });
    const message = { author: { id: '123' }, reply: async () => ({ edit: async () => {} }) };
    await controls.run(message, async (_p, _s, onTool) => { onTool({ command: 'price', args: { token: 'BTC' } }, {}); return 'BTC quote'; });
    report(boundaries, '1'); report(boundaries, '2'); report(boundaries, '3');
    await controls.onButton({ customId: `agent:${[...controls.sessions.keys()][0]}:refresh`, user: { id: '123' }, reply: async () => {} }); assert.equal(calls, 0);
});
test('observation tool cannot select another user or arbitrary pause duration', async () => {
    const actions = new Actions({});
    await assert.rejects(actions.execute({ command: 'report_direct_abuse', args: { evidence: 'idiot', user: '456', hours: '100' } }));
    assert.deepEqual(await actions.execute({ command: 'report_direct_abuse', args: { evidence: 'idiot' } }), { observation: true });
});

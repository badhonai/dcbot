const { test } = require('node:test');
const assert = require('node:assert/strict');
const { SessionMemory } = require('../src/ai/session-memory');
const { createAgent } = require('../src/ai/agent');
const { createHandlers } = require('../src/discord/handlers');
const { ChannelQueue } = require('../src/conversation/channel-queue');
const done = content => ({ choices: [{ message: { content } }] });
const tool = (name, args) => ({ choices: [{ message: { tool_calls: [{ id: 'call', function: { name, arguments: JSON.stringify(args) } }] } }] });
function client(create) { return { chat: { completions: { create } } }; }
test('last ten user messages and their ten replies are retained in chronological order', () => {
    const memory = new SessionMemory();
    for (let i = 0; i < 12; i++) memory.append('channel:user', { user: `Request ${i}`, answer: `Answer ${i}` });
    const messages = memory.transcript('channel:user'); assert.equal(messages.length, 20);
    assert.deepEqual(messages.slice(0, 2).map(message => message.content), ['Request 2', 'Answer 2']);
    assert.equal(messages.at(-1).content, 'Answer 11'); assert.deepEqual(memory.transcript('channel:someone-else'), []);
});
test('agent receives the complete ten prior exchanges, not only one or two answers', async () => {
    let request;
    const agent = createAgent({ config: {}, actions: {}, client: client(async input => { request = input; return done('Acknowledged'); }) });
    for (let i = 0; i < 11; i++) await agent.respond(`Task message ${i}`, { sessionKey: 'a:u' });
    const users = request.messages.filter(message => message.role === 'user').map(message => message.content);
    assert.equal(users.length, 11); assert.equal(users[0], 'Task message 0'); assert.equal(users.at(-1), 'Task message 10');
    await agent.respond('Next message', { sessionKey: 'a:u' });
    assert.ok(!request.messages.some(message => message.content === 'Task message 0'));
    assert.ok(request.messages.some(message => message.content === 'Task message 1'));
});
test('tool notes preserve bounded completed-step evidence and are labeled historical/untrusted', async () => {
    let count = 0; let request;
    const agent = createAgent({ config: {}, actions: { execute: async () => ({ result: 'Completed comparison step; next draft recommendation', content: 'x'.repeat(50000) }) }, client: client(async input => {
        request = input; return ++count === 1 ? tool('calculate', { expression: '2+2' }) : done('Step completed');
    }) });
    await agent.respond('Complete the first calculation'); await agent.respond('What should we do next?');
    const note = request.messages.find(message => message.content?.includes('Historical tool notes'));
    assert.ok(note); assert.match(note.content, /UNTRUSTED/); assert.match(note.content, /next draft recommendation/); assert.ok(note.content.length < 1000);
});
test('continue can use tools for the active task but bare BTC still cannot auto-price', async () => {
    let request;
    const agent = createAgent({ config: {}, actions: {}, client: client(async input => { request = input; return done('Continuing the task'); }) });
    await agent.respond('Help me research a project'); await agent.respond('continue'); assert.ok(request.tools);
    await agent.respond('BTC'); assert.equal(request.tools, undefined);
});
test('a valid price on continue is not overwritten by the ambiguous bare-token guard', async () => {
    let round = 0;
    const agent = createAgent({ config: {}, actions: { execute: async () => ({ quote: { price: 123 } }) }, client: client(async input => {
        if (input.messages[0].content.startsWith('You classify')) return done('{"command":"none"}');
        round++; return round === 2 ? tool('price', { token: 'BTC' }) : done(round === 3 ? 'BTC: $123 from the new fetch' : 'Ready for the next step');
    }) });
    await agent.respond('When I say next, fetch a new BTC price'); assert.match(await agent.respond('next'), /\$123/);
});
test('task context lasts an hour of inactivity, is bounded and expires explicitly', () => {
    let now = 0; const memory = new SessionMemory({ now: () => now, maxSessions: 2 });
    memory.append('a', { user: 'Task', answer: 'Working' }); now = 16 * 60000; assert.equal(memory.has('a'), true);
    memory.append('b', { user: 'Task b', answer: 'Working' }); memory.append('c', { user: 'Task c', answer: 'Working' });
    assert.equal(memory.has('a'), false); now += 60 * 60000; assert.equal(memory.has('b'), false);
});
test('long follow-ups are processed in an active conversation instead of silently ignored', async () => {
    let calls = 0;
    const handlers = createHandlers({ config: { channels: ['a'], maxResponseLength: 1600 }, client: { user: { id: 'bot' } }, queue: new ChannelQueue(10),
        agent: { hasSession: () => true, respond: async () => { calls++; return 'Updated the task'; } } });
    await handlers.onMessage({ author: { id: 'u', bot: false }, channelId: 'a', content: 'Use these constraints for the task: ' + 'details '.repeat(80), mentions: { has: () => false }, channel: { sendTyping: async () => {} }, reply: async () => {} });
    assert.equal(calls, 1);
});
test('failed task requests are retained so retry refers to the failed task, not an older one', async () => {
    let request; let count = 0;
    const agent = createAgent({ config: {}, actions: {}, client: client(async input => { request = input; if (++count === 1) throw new Error('Provider down'); return done('Retrying your draft'); }) });
    await assert.rejects(agent.respond('Draft a welcome message with these requirements'));
    await agent.respond('retry'); assert.ok(request.messages.some(message => message.content === 'Draft a welcome message with these requirements'));
    assert.ok(request.messages.some(message => message.content?.includes('could not be completed'))); assert.ok(request.tools);
});
test('historical source URLs can be recalled without falsely appending them as fresh research', async () => {
    let count = 0;
    const agent = createAgent({ config: {}, actions: { execute: async () => ({ url: 'https://example.com/article', title: 'Article', content: 'Useful information' }) }, client: client(async () => {
        count++; return count === 1 ? tool('read_page', { url: 'https://example.com/article' }) : done(count === 2 ? 'I read the article' : 'The previous link was https://example.com/article');
    }) });
    await agent.respond('Read this article https://example.com/article');
    const answer = await agent.respond('Repeat that source link'); assert.match(answer, /https:\/\/example.com\/article/); assert.ok(!answer.includes('Sources:'));
});
test('overlapping requests cannot overwrite the same session out of order', async () => {
    let finish;
    const agent = createAgent({ config: {}, actions: {}, client: client(async () => new Promise(resolve => { finish = resolve; })) });
    const first = agent.respond('Work on the task', { sessionKey: 'same' });
    assert.match(await agent.respond('Continue it', { sessionKey: 'same' }), /previous request/);
    finish(done('First result')); await first; assert.equal(agent.hasSession('same'), true);
});
test('rapid follow-ups in an established task are not silently dropped by the cooldown', async () => {
    let calls = 0;
    const handlers = createHandlers({ config: { channels: ['a'], maxResponseLength: 1600 }, now: () => 1000, client: { user: { id: 'bot' } }, queue: new ChannelQueue(10),
        agent: { hasSession: () => true, respond: async () => { calls++; return 'Continuing'; } } });
    const message = { author: { id: 'u', bot: false }, channelId: 'a', content: 'continue', mentions: { has: () => false }, channel: { sendTyping: async () => {} }, reply: async () => {} };
    await handlers.onMessage(message); await handlers.onMessage(message); assert.equal(calls, 2);
});

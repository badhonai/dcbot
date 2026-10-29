const { test } = require('node:test');
const assert = require('node:assert/strict');
const { MessageFlags } = require('discord.js');
const { createAgent, finalText } = require('../src/ai/agent');
const { createHandlers } = require('../src/discord/handlers');
const { ChannelQueue } = require('../src/conversation/channel-queue');
const { calculate } = require('../src/features/calculator');
const quiet = { debug() {}, info() {}, warn() {}, error() {} };
const response = content => ({ choices: [{ message: { content } }] });
const call = (name, args, id = 'call-1') => ({ id, type: 'function', function: { name, arguments: JSON.stringify(args) } });
const tools = (...tool_calls) => ({ choices: [{ message: { content: null, tool_calls } }] });
function fixture(outputs) {
    const requests = []; const executed = [];
    const client = { chat: { completions: { create: async (request, options) => {
        requests.push({ request, options });
        const item = outputs.shift(); return typeof item === 'function' ? item(request) : item;
    } } } };
    const agent = createAgent({ client, config: { model: 'gpt-oss:120b' }, logger: quiet,
        actions: { execute: async intent => {
            executed.push(intent);
            if (intent.command === 'web_search') return { results: [{ title: 'Source', url: 'https://example.com/news', content: 'Source snippet' }], untrusted: true };
            if (intent.command === 'read_page') return { title: 'Source', url: intent.args.url, content: 'Actual page information', untrusted: true };
            return { result: 4 };
        } } });
    return { agent, requests, executed };
}
test('bare BTC goes through AI but cannot invoke a price tool', async () => {
    const f = fixture([request => { assert.equal(request.tools, undefined); return response('Do you want an overview of Bitcoin, its price, or news?'); }]);
    assert.match(await f.agent.respond('BTC'), /overview/); assert.equal(f.executed.length, 0);
});
test('a bare ticker cannot produce an invented price even if the model attempts it', async () => {
    const f = fixture([response('BTC is $80,000 right now')]);
    const answer = await f.agent.respond('btc');
    assert.match(answer, /What would you like to know/); assert.ok(!answer.includes('$80,000'));
});
test('AI interprets the actual question instead of a token-name shortcut', async () => {
    const f = fixture([response('Bitcoin uses proof of work; miners propose blocks that nodes validate.')]);
    const answer = await f.agent.respond('Explain how BTC mining works');
    assert.match(answer, /proof of work/); assert.equal(f.executed.length, 0); assert.ok(f.requests[0].request.tools);
});
test('agent can search, read, then synthesize with actual sources', async () => {
    const f = fixture([tools(call('web_search', { query: 'project update' })), tools(call('read_page', { url: 'https://example.com/news' })), response('The source reports a project update. [Read it](https://example.com/news)')]);
    const answer = await f.agent.respond('Find and summarize the latest project update and include source links');
    assert.deepEqual(f.executed.map(i => i.command), ['web_search', 'read_page']);
    assert.match(answer, /Sources:/); assert.match(answer, /https:\/\/example.com\/news/);
    assert.equal(f.requests[2].request.messages.filter(m => m.role === 'tool').length, 2);
});
test('unvalidated function names and arguments never execute', async () => {
    const f = fixture([tools(call('run_shell', { command: 'rm -rf /' })), response('I cannot run shell commands.')]);
    assert.match(await f.agent.respond('Run a shell command'), /cannot/); assert.equal(f.executed.length, 0);
});
test('tool errors are supplied as safe failures, not raw payloads', async () => {
    let count = 0;
    const agent = createAgent({ config: {}, logger: quiet, client: { chat: { completions: { create: async request => ++count === 1 ? tools(call('read_page', { url: 'https://example.com' })) : (assert.ok(!JSON.stringify(request).includes('secret-token')), response('I could not access the page.')) } } }, actions: { execute: async () => { throw new Error('secret-token'); } } });
    assert.match(await agent.respond('Read this page'), /could not/);
});
test('planning is bounded and repeated tool requests cannot loop forever', async () => {
    let requests = 0; let executions = 0;
    const agent = createAgent({ config: {}, logger: quiet, client: { chat: { completions: { create: async () => { requests++; return tools(call('calculate', { expression: '1+1' })); } } } }, actions: { execute: async () => { executions++; return { result: 2 }; } } });
    await agent.respond('Do some arithmetic'); assert.ok(requests <= 5); assert.ok(executions <= 6);
});
test('source formatter removes invented citations and only appends known links', () => {
    const answer = finalText('Fact [fake](https://invented.example/a). https://evil.example/', [{ url: 'https://example.com', title: 'Real' }]);
    assert.ok(!answer.includes('invented.example')); assert.ok(!answer.includes('evil.example')); assert.match(answer, /https:\/\/example.com/);
});
test('conversation state is scoped by user/channel session key', async () => {
    const f = fixture([response('First answer'), response('Second answer'), response('Separate answer')]);
    await f.agent.respond('First question', { sessionKey: 'a:user1' });
    await f.agent.respond('Follow-up?', { sessionKey: 'a:user1' });
    await f.agent.respond('Question?', { sessionKey: 'a:user2' });
    assert.ok(f.requests[1].request.messages.some(m => m.content === 'First answer'));
    assert.ok(!f.requests[2].request.messages.some(m => m.content === 'First answer'));
});
test('AI outages do not fall back to keyword-based execution', async () => {
    const agent = createAgent({ client: null, config: {}, actions: { execute: () => { throw new Error('must not run'); } } });
    assert.match(await agent.respond('BTC'), /not configured or available/);
});
test('request signal propagates to model requests', async () => {
    const f = fixture([response('Hello')]); await f.agent.respond('Hi there'); assert.ok(f.requests[0].options.signal instanceof AbortSignal);
});
test('arithmetic has precedence and no code execution', () => {
    assert.equal(calculate('2 + 3 * 4').result, 14); assert.equal(calculate('-2^2').result, -4);
    assert.equal(calculate('(100 * 1.1^2) - 100').result, 21);
    assert.throws(() => calculate('process.exit()')); assert.throws(() => calculate('1/0')); assert.throws(() => calculate('2^1000'));
});
test('production message path uses the agent, not legacy token routing', async () => {
    const sent = []; let asked;
    const handlers = createHandlers({ client: { user: { id: 'bot' } }, config: { channels: ['a'], maxResponseLength: 1600 }, queue: new ChannelQueue(10), agent: { hasSession: () => false, respond: async (input, context) => { asked = { input, context }; return 'What would you like to know about BTC?'; } }, router: { detect: () => { throw new Error('legacy router must not run'); } }, logger: quiet });
    await handlers.onMessage({ author: { id: 'u', bot: false }, channelId: 'a', content: 'BTC', mentions: { has: () => true }, channel: { sendTyping: async () => {} }, reply: async payload => sent.push(payload) });
    assert.equal(asked.input, 'BTC'); assert.match(sent[0].content, /What would/); assert.equal(sent[0].flags, MessageFlags.SuppressEmbeds); assert.deepEqual(sent[0].allowedMentions.parse, []);
});
test('private agent and web slash commands defer ephemerally and stay private', async () => {
    const { createWeb3Handler } = require('../src/discord/web3-handler');
    for (const command of ['chat', 'search', 'read']) {
        let deferred; let delivered; let sessionKey;
        const handler = createWeb3Handler({ config: { channels: ['a'] }, logger: quiet,
            replies: { send: async (_interaction, result) => { delivered = result; } },
            agent: { respond: async (_input, context) => { sessionKey = context.sessionKey; return 'Private answer'; } },
            actions: { execute: async intent => intent.command === 'web_search' ? { results: [{ title: 'Found', url: 'https://example.com', content: 'A snippet' }] } : { title: 'Page', url: 'https://example.com', content: 'Page content' } } });
        await handler({ commandName: command, channelId: 'a', user: { id: 'u' }, isChatInputCommand: () => true,
            options: { getString: () => 'https://example.com' }, deferReply: async payload => { deferred = payload; } });
        assert.equal(deferred.flags, MessageFlags.Ephemeral); assert.ok(delivered);
        if (command === 'chat') assert.equal(sessionKey, 'private:a:u'); else assert.equal(delivered.pages.length, 1);
    }
});
test('new tool schemas and shared Actions executor validate and dispatch correctly', async () => {
    const { Actions, validateIntent } = require('../src/features/actions');
    const controller = new AbortController(); const called = [];
    const actions = new Actions({ web: { search: async (query, options) => { called.push(options.signal); return { query }; }, read: async (url, options) => { called.push(options.signal); return { url }; } } });
    assert.deepEqual(await actions.execute({ command: 'calculate', args: { expression: '2+2' } }), { expression: '2+2', result: 4 });
    await actions.execute({ command: 'web_search', args: { query: 'facts' } }, { signal: controller.signal });
    await actions.execute({ command: 'read_page', args: { url: 'https://example.com' } }, { signal: controller.signal });
    assert.ok(called.every(signal => signal === controller.signal));
    assert.equal(validateIntent({ command: 'web_search', args: { query: 'x'.repeat(501) } }), null);
    assert.equal(validateIntent({ command: 'read_page', args: { url: 'https://example.com', headers: 'private' } }), null);
});
test('provider failover forwards cancellation and does not retry an aborted request', async () => {
    const { createFailoverClient } = require('../src/ai/provider-client');
    const controller = new AbortController(); let fallback = 0;
    const client = createFailoverClient({ logger: quiet, providers: [
        { name: 'primary', model: 'a', client: { chat: { completions: { create: async (_request, options) => { assert.equal(options.signal, controller.signal); controller.abort(); throw Object.assign(new Error('cancelled'), { status: 503 }); } } } } },
        { name: 'fallback', model: 'b', client: { chat: { completions: { create: async () => { fallback++; return response('not called'); } } } } },
    ] });
    await assert.rejects(client.chat.completions.create({ messages: [] }, { signal: controller.signal })); assert.equal(fallback, 0);
});

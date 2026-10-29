const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { MessageFlags } = require('discord.js');
const { ReplyPreferences } = require('../src/preferences/reply-preferences');
const { PublicControls } = require('../src/discord/public-controls');
const { PrivateReplies } = require('../src/discord/private-replies');
const { createWeb3Handler } = require('../src/discord/web3-handler');
const { currentTime } = require('../src/features/current-time');
const { CoinGeckoQuotes } = require('../src/features/coingecko-quotes');
const { MarketService } = require('../src/features/market');
const { PublicApi } = require('../src/integrations/public-api');
const { createAgent } = require('../src/ai/agent');
const quiet = { warn() {}, error() {}, debug() {} };
const NOW = Date.parse('2026-10-29T12:30:00Z');
function preferenceFixture(t) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bot-preferences-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const file = path.join(dir, 'reply-preferences.json'); return { file, preferences: new ReplyPreferences(file) };
}
function publicMessage(owner = '123') {
    const messages = [];
    const message = { author: { id: owner }, reply: async payload => {
        const sent = { payload, edits: [], edit: async next => { sent.payload = { ...sent.payload, ...next }; sent.edits.push(next); }, delete: async () => { sent.deleted = true; } };
        messages.push(sent); return sent;
    } };
    return { message, messages };
}
function button(id, action, owner = '123') {
    const events = [];
    return { customId: `agent:${id}:${action}`, user: { id: owner }, events,
        deferReply: async payload => events.push(['deferReply', payload]), deferUpdate: async () => events.push(['deferUpdate']),
        reply: async payload => events.push(['reply', payload]), editReply: async payload => events.push(['editReply', payload]) };
}
test('opt-out is isolated per user and persists across restart', t => {
    const { file, preferences } = preferenceFixture(t);
    preferences.setMuted('123', true); assert.equal(preferences.isMuted('456'), false);
    assert.equal(new ReplyPreferences(file).isMuted('123'), true);
    preferences.setMuted('123', false); assert.equal(new ReplyPreferences(file).isMuted('123'), false);
});
test('invalid preference files fail closed instead of silently re-enabling replies', t => {
    const { file } = preferenceFixture(t); fs.writeFileSync(file, '{}'); assert.throws(() => new ReplyPreferences(file));
});
test('current date/time uses explicit timezone and rejects invalid zones', () => {
    const result = currentTime('Asia/Dhaka', () => NOW);
    assert.equal(result.utc, '2026-10-29T12:30:00.000Z'); assert.match(result.local, /18:30:00/);
    assert.throws(() => currentTime('not/a/timezone', () => NOW));
});
function cg(entry = { usd: 100, last_updated_at: (NOW - 60000) / 1000 }) {
    const urls = [];
    const quotes = new CoinGeckoQuotes({ get: async (url, ttl) => { urls.push({ url, ttl }); return { data: { bitcoin: entry, tether: { usd: 1, last_updated_at: NOW / 1000 } }, fetchedAt: new Date(NOW).toISOString() }; } }, { now: () => NOW });
    return { quotes, urls };
}
test('CoinGecko price requests include update time and bypass bot cache on every refresh', async () => {
    const { quotes, urls } = cg(); const first = await quotes.get('BTC'); await quotes.get('bitcoin');
    assert.equal(first.kind, 'aggregate'); assert.equal(first.ageSeconds, 60); assert.equal(first.source, 'CoinGecko');
    assert.equal(urls.length, 2); assert.ok(urls.every(item => item.ttl === 0 && item.url.includes('include_last_updated_at=true')));
});
test('CoinGecko rejects stale/missing/future timestamps and invalid numeric prices', async () => {
    for (const entry of [{ usd: 100 }, { usd: 0, last_updated_at: NOW / 1000 }, { usd: '100', last_updated_at: NOW / 1000 }, { usd: 100, last_updated_at: (NOW - 121000) / 1000 }, { usd: 100, last_updated_at: (NOW + 20000) / 1000 }]) await assert.rejects(cg(entry).quotes.get('BTC'), { code: 'STALE_QUOTE' });
});
test('unknown or ambiguous CoinGecko symbols are never silently picked', async () => {
    const quotes = new CoinGeckoQuotes({ get: async () => ({ data: { coins: [{ id: 'one', name: 'One', symbol: 'ABC' }, { id: 'two', name: 'Two', symbol: 'ABC' }] } }) });
    await assert.rejects(quotes.get('ABC'), /Multiple/); await assert.rejects(quotes.get('https://evil.example'), /CoinGecko ID/);
});
test('CoinGecko card labels aggregate update age instead of claiming a fresh exchange trade', async () => {
    const { quotes } = cg(); const result = await new MarketService({}, { liveQuotes: quotes }).price('BTC');
    assert.match(result.pages[0].footer.text, /Updated 60s ago/); assert.match(result.pages[0].footer.text, /60s updates/); assert.ok(!result.pages[0].footer.text.includes('Trade'));
});
test('CoinGecko demo key is only sent to its own fixed host', async () => {
    const headers = [];
    const api = new PublicApi({ coingeckoApiKey: 'fake-key', logger: quiet, fetchFn: async (_url, options) => { headers.push(options.headers); return { ok: true, json: async () => ({}) }; } });
    await api.get('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin', 0);
    await api.get('https://api.kraken.com/0/public/Trades?pair=XBTUSD', 0);
    assert.equal(headers[0]['x-cg-demo-api-key'], 'fake-key'); assert.equal(headers[1]['x-cg-demo-api-key'], undefined);
});
test('public replies show a checking status before replacing it with the actual answer', async () => {
    const preferences = new ReplyPreferences(); const controls = new PublicControls({ preferences });
    const { message, messages } = publicMessage(); let sawChecking = false;
    await controls.run(message, async progress => { sawChecking = messages[0].payload.content.includes('Thinking'); await progress('Checking the latest price...'); return 'BTC $100 from CoinGecko'; });
    assert.equal(sawChecking, true); assert.equal(messages.length, 1); assert.equal(messages[0].payload.content, 'BTC $100 from CoinGecko');
    assert.ok(messages[0].edits.some(edit => edit.content === 'Checking the latest price'));
    assert.equal(messages[0].payload.flags, MessageFlags.SuppressEmbeds);
});
test('price refresh is owner-only and fetches only the recorded price intent', async () => {
    let calls = 1;
    const controls = new PublicControls({ preferences: new ReplyPreferences(), now: () => NOW, actions: { execute: async intent => { assert.equal(intent.command, 'price'); return { pages: [{ description: `Answer ${++calls}` }] }; } } }); const { message, messages } = publicMessage();
    await controls.run(message, async (_progress, _signal, onTool) => { onTool({ command: 'price', args: { token: 'BTC' } }, {}); return 'Answer 1'; }); const id = [...controls.sessions.keys()][0];
    const intruder = button(id, 'refresh', '456'); await controls.onButton(intruder); assert.equal(calls, 1); assert.equal(intruder.events[0][1].flags, MessageFlags.Ephemeral);
    await controls.onButton(button(id, 'refresh')); assert.equal(calls, 2); assert.equal(messages[0].payload.content, 'Answer 2');
    await controls.onButton(button(id, 'refresh')); assert.equal(calls, 2);
});
test('Stop suppresses and cancels an in-flight answer, without muting others', async () => {
    const preferences = new ReplyPreferences(); const controls = new PublicControls({ preferences }); const { message, messages } = publicMessage();
    let finish; let signal;
    const running = controls.run(message, async (_progress, abort, onTool) => { onTool({ command: 'offer_stop', args: {} }, { confirmationRequired: true }); signal = abort; return new Promise(resolve => { finish = resolve; }); });
    // Initial reply resolves on the next microtask before the task starts.
    await Promise.resolve(); await Promise.resolve();
    const id = [...controls.sessions.keys()][0]; await controls.onButton(button(id, 'stop'));
    assert.equal(signal.aborted, true); finish('This must not be sent'); await running;
    assert.equal(preferences.isMuted('123'), true); assert.equal(preferences.isMuted('456'), false);
    assert.ok(!messages.some(sent => sent.payload.content === 'This must not be sent'));
    let called = false; await controls.run(message, async () => { called = true; }); assert.equal(called, false);
});
test('expired public controls cannot trigger work', async () => {
    let now = NOW; const controls = new PublicControls({ preferences: new ReplyPreferences(), now: () => now }); const { message } = publicMessage(); let count = 0;
    await controls.run(message, async () => `${++count}`); now += 600001;
    await controls.onButton(button([...controls.sessions.keys()][0], 'refresh')); assert.equal(count, 1);
});
test('refresh correctly replaces long replies and removes extra stale chunks', async () => {
    const controls = new PublicControls({ preferences: new ReplyPreferences(), actions: { execute: async () => ({ pages: [{ description: 'Short new answer' }] }) } }); const { message, messages } = publicMessage();
    await controls.run(message, async (_progress, _signal, onTool) => { onTool({ command: 'price', args: { token: 'BTC' } }, {}); return 'A'.repeat(3000); });
    assert.equal(messages.length, 2); await controls.onButton(button([...controls.sessions.keys()][0], 'refresh'));
    assert.equal(messages[0].payload.content, 'Short new answer'); assert.equal(messages[1].deleted, true);
});
test('/start and /stop are private and work even outside conversation channels', async () => {
    const preferences = new ReplyPreferences(); const sent = [];
    const handler = createWeb3Handler({ config: { channels: [] }, preferences, replies: { send: async (_interaction, result) => sent.push(result) }, logger: quiet });
    for (const commandName of ['stop', 'start']) {
        await handler({ commandName, user: { id: '123' }, channelId: 'other', isChatInputCommand: () => true, deferReply: async options => assert.equal(options.flags, MessageFlags.Ephemeral) });
        assert.equal(preferences.isMuted('123'), commandName === 'stop');
    }
    assert.equal(sent.length, 2);
});
test('private price refresh reruns its fetch and preserves ephemeral session ownership', async () => {
    const preferences = new ReplyPreferences(); const replies = new PrivateReplies({ preferences }); const edits = [];
    const interaction = { user: { id: '123' }, editReply: async payload => edits.push(payload), deleteReply: async () => {} };
    let fetched = 0; const id = await replies.send(interaction, 'First price', { refresh: async () => `New price ${++fetched}`, showStop: true });
    const click = button(id, 'refresh'); click.customId = `private:${id}:refresh`; await replies.onButton(click);
    assert.equal(fetched, 1); assert.match(edits.at(-1).embeds[0].description, /New price 1/);
    const stop = button(id, 'stop'); stop.customId = `private:${id}:stop`; await replies.onButton(stop); assert.equal(preferences.isMuted('123'), true);
    replies.destroy();
});
test('agent gets actual request time, concise instructions, and a timezone tool', async () => {
    let request;
    const agent = createAgent({ config: {}, now: () => NOW, actions: {}, client: { chat: { completions: { create: async input => { request = input; return { choices: [{ message: { content: 'Hello' } }] }; } } } } });
    await agent.respond('Hello there'); assert.match(request.messages[0].content, /2026-10-29T12:30:00.000Z/);
    assert.match(request.messages[0].content, /1–3 short/); assert.ok(request.tools.some(tool => tool.function.name === 'get_time'));
});
test('muted users cannot trigger production message AI, reference fetches or typing', async () => {
    const { createHandlers } = require('../src/discord/handlers');
    const { ChannelQueue } = require('../src/conversation/channel-queue');
    const preferences = new ReplyPreferences(); preferences.setMuted('123', true);
    let calls = 0;
    const handlers = createHandlers({ config: { channels: ['channel'] }, client: { user: { id: '999' } }, preferences,
        queue: new ChannelQueue(10), agent: { hasSession: () => true, respond: async () => { calls++; } } });
    await handlers.onMessage({ author: { id: '123', bot: false }, channelId: 'channel', content: 'BTC price?', reference: { messageId: 'old' },
        mentions: { has: () => true }, channel: { messages: { fetch: async () => { calls++; } }, sendTyping: async () => { calls++; } } });
    assert.equal(calls, 0);
});
test('external Stop cancellation propagates into the actual agent model call', async () => {
    const controller = new AbortController(); let called = false;
    const agent = createAgent({ config: {}, actions: {}, client: { chat: { completions: { create: async (_request, options) => {
        called = true; return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
    } } } } });
    const work = agent.respond('Read current news', { signal: controller.signal });
    assert.equal(called, true); controller.abort(); await assert.rejects(work, /aborted/);
});
test('private controls stay within Discord five-button row limit', async () => {
    const replies = new PrivateReplies({ preferences: new ReplyPreferences() });
    const row = replies.controls('id', 0, 3, { owner: '123', refresh: async () => {}, showStop: true })[0].toJSON();
    assert.equal(row.components.length, 5); replies.destroy();
});
test('stopping through preferences cancels all that user active public tasks only', async () => {
    const preferences = new ReplyPreferences(); const controls = new PublicControls({ preferences }); const signals = [];
    const finishes = [];
    const task = async (_progress, signal) => { signals.push(signal); return new Promise(resolve => finishes.push(resolve)); };
    const a = controls.run(publicMessage('123').message, task);
    const b = controls.run(publicMessage('456').message, task);
    await Promise.resolve(); await Promise.resolve(); preferences.setMuted('123', true);
    assert.equal(signals[0].aborted, true); assert.equal(signals[1].aborted, false);
    finishes.forEach(finish => finish('Done')); await Promise.all([a, b]);
});
test('ordinary public chat has no Stop or Refresh buttons, including its checking placeholder', async () => {
    const controls = new PublicControls({ preferences: new ReplyPreferences() }); const { message, messages } = publicMessage();
    await controls.run(message, async () => 'Hello there');
    assert.deepEqual(messages[0].payload.components, []);
    assert.ok(messages[0].edits.every(edit => !edit.components?.length));
    const id = [...controls.sessions.keys()][0]; await controls.onButton(button(id, 'stop'));
    assert.equal(controls.preferences.isMuted('123'), false);
});
test('a crypto price answer has only Refresh price, and a stop request has only Stop', async () => {
    for (const command of ['price', 'offer_stop']) {
        const controls = new PublicControls({ preferences: new ReplyPreferences() }); const { message, messages } = publicMessage();
        await controls.run(message, async (_progress, _signal, onTool) => {
            onTool({ command, args: command === 'price' ? { token: 'BTC' } : {} }, { confirmationRequired: true }); return 'Answer';
        });
        const buttons = messages[0].payload.components[0].toJSON().components;
        assert.deepEqual(buttons.map(item => item.label), [command === 'price' ? 'Refresh price' : 'Stop replies to me']);
    }
});
test('default private cards have neither Stop nor Refresh, while price refresh is opt-in', () => {
    const replies = new PrivateReplies({ preferences: new ReplyPreferences() });
    const labels = state => replies.controls('id', 0, 1, { owner: '123', ...state })[0].toJSON().components.map(item => item.label);
    assert.deepEqual(labels({}), ['Dismiss']);
    assert.deepEqual(labels({ refresh: async () => {} }), ['Refresh price', 'Dismiss']);
    assert.deepEqual(labels({ showStop: true }), ['Stop replies to me', 'Dismiss']); replies.destroy();
});
test('non-price slash commands no longer receive a refresh or stop button', async () => {
    for (const commandName of ['search', 'read', 'pair', 'newpairs', 'chat']) {
        let options;
        const handler = createWeb3Handler({ config: { channels: ['channel'] }, logger: quiet,
            replies: { send: async (_interaction, _result, flags) => { options = flags; } }, agent: { respond: async () => 'Hello' },
            actions: { execute: async intent => intent.command === 'web_search' ? { results: [] } : intent.command === 'read_page' ? { title: 'Page', content: 'Text', url: 'https://example.com' } : { pages: [{ title: 'Pools' }] } } });
        await handler({ commandName, user: { id: '123' }, channelId: 'channel', isChatInputCommand: () => true, deferReply: async () => {}, options: { getString: () => 'https://example.com' } });
        assert.equal(options.refresh, undefined); assert.equal(options.showStop, false);
    }
});
test('private AI chat exposes contextual controls through actual tool execution metadata', async () => {
    for (const command of ['price', 'offer_stop']) {
        let flags;
        const handler = createWeb3Handler({ config: { channels: ['channel'] }, logger: quiet,
            replies: { send: async (_interaction, _result, options) => { flags = options; } },
            agent: { respond: async (_text, options) => { options.onTool({ command, args: command === 'price' ? { token: 'BTC' } : {} }, { confirmationRequired: true }); return 'Answer'; } } });
        await handler({ commandName: 'chat', user: { id: '123' }, channelId: 'channel', isChatInputCommand: () => true, deferReply: async () => {}, options: { getString: () => 'request' } });
        assert.equal(typeof flags.refresh, command === 'price' ? 'function' : 'undefined'); assert.equal(flags.showStop, command === 'offer_stop');
    }
});
test('bare stop is allowed only the confirmation tool, while BTC still has no tools', async () => {
    let request; let intent;
    const agent = createAgent({ config: {}, actions: { execute: async chosen => { intent = chosen; return { confirmationRequired: true }; } }, client: { chat: { completions: { create: async input => {
        request = input;
        return { choices: [{ message: input.messages.some(m => m.role === 'tool') ? { content: 'Click Stop to confirm' } : { tool_calls: [{ id: 'stop', function: { name: 'offer_stop', arguments: '{}' } }] } }] };
    } } } } });
    const observed = [];
    await agent.respond('stop', { onTool: (tool, output) => observed.push({ tool, output }) });
    assert.deepEqual(request.tools.map(tool => tool.function.name), ['offer_stop']); assert.equal(intent.command, 'offer_stop'); assert.equal(observed[0].output.confirmationRequired, true);
});

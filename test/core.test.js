const { test } = require('node:test');
const assert = require('node:assert/strict');
const { HistoryStore } = require('../src/conversation/history-store');
const { ChannelQueue, QueueFullError } = require('../src/conversation/channel-queue');
const { splitMessage } = require('../src/utils/split-message');
const { cleanResponse, createAiService } = require('../src/ai/groq-service');
const { loadConfig } = require('../src/config');

test('histories are bounded, isolated, and returned as snapshots', () => {
    const store = new HistoryStore(2);
    store.add('a', 'user', 'one'); store.add('a', 'assistant', 'two', 'id'); store.add('a', 'user', 'three');
    assert.equal(store.get('a').length, 2);
    store.get('a')[0].content = 'mutated';
    assert.equal(store.get('a')[0].content, 'two');
    assert.deepEqual(store.get('b'), []);
    assert.equal(store.removeByMessageId('a', 'wrong'), false);
    assert.equal(store.removeByMessageId('a', 'id'), true);
    assert.deepEqual(store.get('a'), [{ role: 'user', content: 'three' }]);
});
test('queue serializes each channel but not unrelated channels', async () => {
    const queue = new ChannelQueue(3);
    const events = [];
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const first = queue.run('a', async () => { events.push(1); await gate; events.push(2); });
    const second = queue.run('a', async () => events.push(3));
    await queue.run('b', async () => events.push('b'));
    assert.deepEqual(events, [1, 'b']);
    release(); await Promise.all([first, second]); await queue.drain();
    assert.deepEqual(events, [1, 'b', 2, 3]);
    assert.equal(queue.channels.size, 0);
});
test('queue bounds pending work and recovers after failures', async () => {
    const queue = new ChannelQueue(1);
    const first = queue.run('a', async () => { throw new Error('expected'); });
    await assert.rejects(queue.run('a', async () => {}), QueueFullError);
    await assert.rejects(first, /expected/); await queue.drain();
    assert.equal(await queue.run('a', async () => 42), 42);
    await queue.drain();
});
test('splitting preserves text and respects Discord limits', () => {
    for (const text of ['hello\nworld\n', 'x'.repeat(5000), '😀'.repeat(2001)]) {
        const chunks = splitMessage(text, 1600);
        assert.equal(chunks.join(''), text);
        assert.ok(chunks.every(chunk => chunk.length <= 1600 && chunk.length > 0));
    }
    assert.throws(() => splitMessage('abc', 0));
});
test('reasoning cleanup handles closed and truncated tags', () => {
    assert.equal(cleanResponse('<think>secret</think> answer'), 'answer');
    assert.equal(cleanResponse('<think>unfinished'), '');
});
test('AI adapter constructs a provider request without mutating history', async () => {
    let request;
    const ai = createAiService({ chat: { completions: { create: async value => {
        request = value; return { choices: [{ message: { content: 'ok' } }] };
    } } } }, { model: 'test', systemPrompt: 'system', temperature: 0.7, maxCompletionTokens: 300 });
    const history = [{ role: 'user', content: 'hi' }];
    assert.equal(await ai.respond(history), 'ok');
    assert.equal(request.messages[0].role, 'system');
    assert.equal(history.length, 1);
    assert.equal(request.max_completion_tokens, 300);
});
test('AI adapter rejects empty responses', async () => {
    const ai = createAiService({ chat: { completions: { create: async () => ({ choices: [] }) } } }, {});
    await assert.rejects(ai.respond([]), /no usable text/);
});
test('configuration rejects missing credentials before connecting', () => {
    assert.throws(() => loadConfig({}), /DISCORD_TOKEN/);
    assert.equal(loadConfig({ DISCORD_TOKEN: 'test' }).groqApiKey, undefined);
});

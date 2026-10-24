const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createFailoverClient, createOllamaClient, failurePolicy, createModelClient } = require('../src/ai/provider-client');
const { createAiService } = require('../src/ai/groq-service');
const { createIntentRouter } = require('../src/ai/intent-router');
const { loadConfig } = require('../src/config');
const quiet = { info() {}, warn() {}, debug() {}, error() {} };
const answer = content => ({ choices: [{ message: { content } }] });
const provider = (name, model, create) => ({ name, model, client: { chat: { completions: { create } } } });
function setup(primaryCall, fallbackCall) {
    let time = 1000000;
    const calls = [];
    const client = createFailoverClient({ logger: quiet, now: () => time, providers: [
        provider('ollama', 'gpt-oss:120b', async request => { calls.push(['ollama', request]); return primaryCall(request); }),
        provider('groq', 'qwen/qwen3.8-27b', async request => { calls.push(['groq', request]); return fallbackCall(request); }),
    ] });
    return { client, calls, advance: ms => { time += ms; } };
}
test('uses Ollama by default and binds the primary model', async () => {
    const f = setup(() => answer('primary'), () => answer('fallback'));
    assert.equal((await f.client.chat.completions.create({ model: 'ignored' })).choices[0].message.content, 'primary');
    assert.equal(f.calls.length, 1); assert.equal(f.calls[0][1].model, 'gpt-oss:120b');
});
test('exhausted credits switch immediately to Groq and pause Ollama for an hour', async () => {
    const f = setup(() => { throw Object.assign(new Error('Credits exhausted'), { status: 402 }); }, () => answer('fallback'));
    await f.client.chat.completions.create({}); await f.client.chat.completions.create({});
    assert.deepEqual(f.calls.map(c => c[0]), ['ollama', 'groq', 'groq']);
    assert.equal(f.calls[1][1].model, 'qwen/qwen3.8-27b');
    f.advance(3600001); await f.client.chat.completions.create({}); assert.equal(f.calls[3][0], 'ollama');
});
test('rate limiting respects retry-after without repeatedly hitting the primary', async () => {
    const f = setup(() => { throw Object.assign(new Error('busy'), { status: 429, headers: new Headers({ 'retry-after': '120' }) }); }, () => answer('fallback'));
    await f.client.chat.completions.create({}); f.advance(61000); await f.client.chat.completions.create({});
    assert.equal(f.calls.filter(c => c[0] === 'ollama').length, 1);
    f.advance(60000); await f.client.chat.completions.create({}); assert.equal(f.calls.filter(c => c[0] === 'ollama').length, 2);
});
test('automatically returns to the primary after recovery', async () => {
    let down = true;
    const f = setup(() => { if (down) throw Object.assign(new Error('down'), { status: 503 }); return answer('recovered'); }, () => answer('fallback'));
    await f.client.chat.completions.create({}); down = false; f.advance(30001);
    assert.equal((await f.client.chat.completions.create({})).choices[0].message.content, 'recovered');
    assert.deepEqual(f.calls.map(c => c[0]), ['ollama', 'groq', 'ollama']);
});
test('auth, missing-model, timeout and server failures have bounded fallback policies', () => {
    for (const status of [401, 403, 404, 408, 500, 502, 503]) assert.ok(failurePolicy({ status }));
    assert.equal(failurePolicy({ name: 'TimeoutError' }).reason, 'network_or_timeout');
    assert.equal(failurePolicy({ status: 400, message: 'Insufficient credit balance' }).reason, 'credits_or_quota');
    assert.equal(failurePolicy({ status: 400, message: 'Invalid schema' }), null);
});
test('request errors do not trigger a second-provider request', async () => {
    const f = setup(() => { throw Object.assign(new Error('Invalid schema'), { status: 400 }); }, () => answer('fallback'));
    await assert.rejects(f.client.chat.completions.create({}), error => error.status === 400); assert.equal(f.calls.length, 1);
});
test('empty and reasoning-only responses fall back rather than displaying hidden thoughts', async () => {
    for (const content of ['', '<think>private reasoning</think>']) {
        const f = setup(() => ({ choices: [{ message: { content, reasoning: 'private reasoning' } }] }), () => answer('visible answer'));
        assert.equal((await f.client.chat.completions.create({})).choices[0].message.content, 'visible answer');
    }
});
test('tool calls are valid responses and fallback applies to tool selection too', async () => {
    const f = setup(() => { throw Object.assign(new Error('quota'), { status: 402 }); }, () => ({ choices: [{ message: { content: null, tool_calls: [{ function: { name: 'ask', arguments: '{"question":"project fees"}' } }] } }] }));
    const router = createIntentRouter({ client: f.client, config: { model: 'gpt-oss:120b' }, logger: quiet });
    assert.equal((await router.resolve('Tell me about project fees')).command, 'ask');
    assert.equal(f.calls[1][0], 'groq'); assert.ok(f.calls[1][1].tools);
});
test('chat and routing share the same primary cooldown state', async () => {
    const f = setup(() => { throw Object.assign(new Error('quota'), { status: 402 }); }, request => request.tools ? { choices: [{ message: { content: null, tool_calls: [{ function: { name: 'ask', arguments: '{"question":"fees"}' } }] } }] } : answer('hello'));
    const config = { model: 'gpt-oss:120b', systemPrompt: 'system', maxCompletionTokens: 300 };
    assert.equal(await createAiService(f.client, config).respond([{ role: 'user', content: 'hello' }]), 'hello');
    await createIntentRouter({ client: f.client, config, logger: quiet }).resolve('Tell me about project fees');
    assert.deepEqual(f.calls.map(c => c[0]), ['ollama', 'groq', 'groq']);
});
test('both providers failing produces a generic unavailable error without credentials', async () => {
    const f = setup(() => { throw Object.assign(new Error('secret-primary'), { status: 503 }); }, () => { throw Object.assign(new Error('secret-fallback'), { status: 429 }); });
    await assert.rejects(f.client.chat.completions.create({}), error => error.code === 'AI_UNAVAILABLE' && !error.message.includes('secret'));
    await assert.rejects(f.client.chat.completions.create({}), /temporarily unavailable/); assert.equal(f.calls.length, 2);
});
test('Ollama adapter maps supported fields and omits tool_choice/max_completion_tokens', async () => {
    let sent;
    const client = createOllamaClient({ apiKey: 'not-a-real-key', fetchFn: async (url, options) => {
        sent = { url, ...options }; return { ok: true, json: async () => answer('ok') };
    } });
    await client.chat.completions.create({ model: 'gpt-oss:120b', messages: [{ role: 'user', content: 'hello' }], max_completion_tokens: 300, tools: [{ type: 'function' }], tool_choice: 'auto' });
    const body = JSON.parse(sent.body);
    assert.equal(sent.url, 'https://ollama.com/v1/chat/completions'); assert.equal(body.model, 'gpt-oss:120b');
    assert.equal(body.max_tokens, 1024); assert.equal(body.reasoning_effort, 'low'); assert.equal(body.stream, false);
    assert.equal(body.tool_choice, undefined); assert.equal(body.max_completion_tokens, undefined); assert.ok(body.tools);
    assert.equal(sent.headers.Authorization, 'Bearer not-a-real-key');
});
test('HTTP quota errors are classified without logging raw response details', async () => {
    const client = createOllamaClient({ apiKey: 'fake', fetchFn: async () => ({ ok: false, status: 429, headers: new Headers(), json: async () => ({ error: 'Monthly usage limit reached' }) }) });
    await assert.rejects(client.chat.completions.create({}), error => failurePolicy(error).reason === 'credits_or_quota');
});
test('malformed successful HTTP response is treated as a retryable upstream failure', async () => {
    const client = createOllamaClient({ apiKey: 'fake', fetchFn: async () => ({ ok: true, json: async () => { throw new SyntaxError('bad JSON'); } }) });
    await assert.rejects(client.chat.completions.create({}), error => error.status === 502);
});
test('missing AI keys preserves local commands and returns no model client', () => {
    assert.equal(createModelClient({}, { logger: quiet }), null);
});
test('configuration defaults and host overrides separate primary and fallback credentials/models', () => {
    const defaults = loadConfig({ DISCORD_TOKEN: 'test' });
    assert.equal(defaults.model, 'gpt-oss:120b'); assert.equal(defaults.fallbackModel, 'qwen/qwen3.8-27b');
    const config = loadConfig({ DISCORD_TOKEN: 'test', OLLAMA_API_KEY: 'primary', GROQ_API_KEY: 'backup', OLLAMA_MODEL: 'custom-primary', GROQ_MODEL: 'custom-backup' });
    assert.equal(config.ollamaApiKey, 'primary'); assert.equal(config.groqApiKey, 'backup');
    assert.equal(config.model, 'custom-primary'); assert.equal(config.fallbackModel, 'custom-backup');
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { boundedJson } = require('../src/integrations/bounded-json');
const { PublicApi } = require('../src/integrations/public-api');
const { WebService } = require('../src/features/web');
const { SessionMemory } = require('../src/ai/session-memory');
const { ChannelQueue, QueueFullError } = require('../src/conversation/channel-queue');
const quiet = { debug() {}, info() {}, warn() {} };
test('decoded JSON stream is capped even without a content-length header', async () => {
 await assert.rejects(boundedJson(new Response('x'.repeat(1000)), 100), /size limit/);
 assert.deepEqual(await boundedJson(new Response('{"safe":true}'), 100), { safe: true });
});
test('JSON rejects declared oversize, invalid data and excessive multibyte text', async () => {
 await assert.rejects(boundedJson(new Response('{}', { headers: { 'content-length': '9999' } }), 100), /size limit/);
 await assert.rejects(boundedJson(new Response('not json'), 100), SyntaxError);
 await assert.rejects(boundedJson({ json: async () => ({ text: 'ক'.repeat(50) }) }, 100), /size limit/);
});
test('public API rejects insecure, credential-bearing and alternate-port provider URLs', async () => {
 const api = new PublicApi();
 for (const url of ['http://api.coingecko.com/api/v3/ping', 'https://u:p@api.coingecko.com/api/v3/ping', 'https://api.coingecko.com:8443/api/v3/ping']) await assert.rejects(api.get(url), /Unsupported/);
});
test('API cache is byte bounded and evicts before growth, oversized entries stay uncached', async () => {
 let now = 0;
 const api = new PublicApi({ now: () => now, maxCacheBytes: 1500, logger: quiet, fetchFn: async () => ({ ok: true, json: async () => ({ text: 'a'.repeat(600) }) }) });
 for (let i = 0; i < 8; i++) { await api.get(`https://api.coingecko.com/${i}`); now += 3000; }
 assert.ok(api.cacheBytes <= 1500); assert.equal(api.cache.size, 2);
 const tiny = new PublicApi({ maxCacheBytes: 10, logger: quiet, fetchFn: api.fetch }); await tiny.get('https://api.coingecko.com/huge'); assert.equal(tiny.cache.size, 0);
});
test('API coalesces duplicates before enforcing pending limit and releases failed work', async () => {
 let done; const api = new PublicApi({ maxPending: 1, logger: quiet, fetchFn: async () => new Promise(resolve => { done = resolve; }) });
 const a = api.get('https://api.coingecko.com/a'); const b = api.get('https://api.coingecko.com/a');
 await assert.rejects(api.get('https://api.coingecko.com/b'), { code: 'BOT_BUSY' });
 done({ ok: true, json: async () => ({}) }); await Promise.all([a, b]); assert.equal(api.pending.size, 0);
});
test('search deduplicates and briefly caches snippets, with immutable returned snapshots', async () => {
 let calls = 0; let now = 0;
 const web = new WebService({ apiKey: 'test', now: () => now, fetchFn: async () => { calls++; return { ok: true, json: async () => ({ results: [{ title: 'T', url: 'https://example.com', content: 'Evidence' }] }) }; } });
 await Promise.all([web.search('topic'), web.search('topic')]); assert.equal(calls, 1);
 const a = await web.search('topic'); a.results[0].content = 'Mutated'; assert.equal((await web.search('topic')).results[0].content, 'Evidence');
 now = 31000; await web.search('topic'); assert.equal(calls, 2);
});
test('search rejects oversized payloads and failures never poison cache', async () => {
 const web = new WebService({ apiKey: 'test', fetchFn: async () => new Response(JSON.stringify({ results: [], junk: 'a'.repeat(300000) })) });
 await assert.rejects(web.search('topic'), /size limit/); assert.equal(web.cache.size, 0); assert.equal(web.pending.size, 0);
});
test('session store retains snapshots and enforces a global character budget', () => {
 const m = new SessionMemory({ maxChars: 2500 });
 for (let i = 0; i < 15; i++) m.append(String(i), { user: 'u'.repeat(400), answer: 'a'.repeat(400) });
 assert.ok(m.chars <= 2500); assert.ok(m.sessions.size < 15); assert.equal(m.has('0'), false);
 const turn = m.get('14'); turn[0].user = 'mutated'; assert.ok(m.get('14')[0].user !== 'mutated');
});
test('context budgeting discards whole oldest exchanges, never orphaning a reply', () => {
 const m = new SessionMemory({ contextChars: 1000 });
 for (let i = 0; i < 10; i++) m.append('x', { user: `${i}:` + 'u'.repeat(150), answer: 'a'.repeat(150) });
 assert.equal(m.get('x').length, 10); const out = m.transcript('x'); assert.ok(out.reduce((n, v) => n + v.content.length, 0) <= 1000);
 assert.equal(out[0].role, 'user'); assert.equal(out.at(-1).role, 'assistant'); assert.match(out.at(-2).content, /^9:/);
});
test('expired sessions release budget and excessive individual turns fail closed', () => {
 let now = 0; const m = new SessionMemory({ now: () => now, ttlMs: 10 });
 m.append('a', { user: 'Hello', answer: 'Hi' }); now = 11; assert.equal(m.has('a'), false); assert.equal(m.chars, 0);
 const tiny = new SessionMemory({ maxChars: 10 }); tiny.append('a', { user: 'hello', answer: 'hi' }); assert.equal(tiny.sessions.size, 0);
});
test('channel queue bounds total cross-channel work and refuses work during shutdown', async () => {
 const q = new ChannelQueue(10, { maxTotal: 2 }); let finish;
 const a = q.run('a', () => new Promise(resolve => { finish = resolve; })); const b = q.run('b', async () => {});
 await assert.rejects(q.run('c', async () => {}), QueueFullError); await b; q.close();
 await assert.rejects(q.run('d', async () => {}), QueueFullError); finish(); await a; await q.drain(); assert.equal(q.total, 0);
});
test('public control shutdown aborts active work and releases its process-local stores', () => {
 const { PublicControls } = require('../src/discord/public-controls'); const c = new AbortController();
 const controls = new PublicControls({ preferences: {} }); controls.sessions.set('x', { abort: c }); controls.cooldowns.set('u', 999); controls.destroy();
 assert.equal(c.signal.aborted, true); assert.equal(controls.sessions.size, 0); assert.equal(controls.cooldowns.size, 0);
});

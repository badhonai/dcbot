const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readDemoKey, checkPrice, checkAi } = require('../src/diagnostics/checks');
const { healthPort, createHealthServer } = require('../src/diagnostics/health-server');
const { PublicApi } = require('../src/integrations/public-api');
const quiet = { info() {}, warn() {}, debug() {} };
test('Demo key aliases load privately with whitespace removed and explicit name wins', () => {
    assert.equal(readDemoKey({ CG_API_KEY: '  secret-key\n' }), 'secret-key');
    assert.equal(readDemoKey({ COINGECKO_API_KEY: 'other' }), 'other');
    assert.equal(readDemoKey({ COINGECKO_DEMO_API_KEY: 'explicit', CG_API_KEY: 'different' }), 'explicit');
    assert.equal(readDemoKey({ COINGECKO_DEMO_API_KEY: ' ', CG_API_KEY: 'fallback' }), 'fallback');
    assert.equal(readDemoKey({}), '');
});
test('allocated port is validated and supports hosting panel environment variables', () => {
    assert.equal(healthPort({}), 25031); assert.equal(healthPort({ SERVER_PORT: '25031' }), 25031);
    assert.equal(healthPort({ HEALTH_PORT: '1234', PORT: '99' }), 1234);
    for (const input of ['abc', '-1', '65536', '25031/path']) assert.throws(() => healthPort({ PORT: input }));
});
test('provider plan mismatch codes survive safely but raw bodies and secrets do not', async () => {
    const api = new PublicApi({ coingeckoApiKey: 'secret-key', logger: quiet, fetchFn: async () => ({ ok: false, status: 401, json: async () => ({ status: { error_code: 10010, error_message: 'secret-key is a Pro key' } }) }) });
    const result = await checkPrice(api, { key: 'secret-key' });
    assert.equal(result.reason, 'pro_key_on_demo_endpoint'); assert.equal(result.providerCode, 10010); assert.equal(result.auth, 'demo-key');
    assert.ok(!JSON.stringify(result).includes('secret-key')); assert.ok(!JSON.stringify(result).includes('error_message'));
});
test('price diagnostics distinguish quota, access and stale prices', async () => {
    for (const [error, reason] of [[{ status: 429 }, 'rate_limited'], [{ status: 403 }, 'access_denied_or_host_ip_blocked'], [{ code: 'PROVIDER_COOLDOWN' }, 'rate_limited'], [{ name: 'TimeoutError' }, 'timeout'], [{ name: 'SyntaxError' }, 'invalid_provider_json']]) {
        const result = await checkPrice({ get: async () => { throw error; } }); assert.equal(result.reason, reason);
    }
    const result = await checkPrice({ get: async () => ({ data: { bitcoin: { usd: 100 } } }) }); assert.equal(result.reason, 'stale_or_invalid_price_timestamp');
});
test('AI diagnostic makes one bounded request and never returns generated text', async () => {
    let calls = 0;
    const result = await checkAi({ chat: { completions: { create: async (_request, options) => { calls++; assert.ok(options.signal instanceof AbortSignal); return { choices: [{ message: { content: 'secret text' } }] }; } } } });
    assert.equal(result.status, 'ok'); assert.equal(calls, 1); assert.ok(!JSON.stringify(result).includes('secret text'));
    assert.equal((await checkAi(null)).status, 'not_configured');
});
test('health routes are read-only cached snapshots and cannot be used to spend API quota', async t => {
    let priceCalls = 0; let aiCalls = 0; let discord = false;
    const health = createHealthServer({ logger: quiet, discordReady: () => discord,
        checkPrice: async () => { priceCalls++; return { status: 'ok', auth: 'demo-key', checkedAt: '2026-10-29T00:00:00Z' }; }, checkAi: async () => { aiCalls++; return { status: 'ok' }; } });
    const address = await health.start({ port: 0 }); t.after(() => health.stop()); await health.probe();
    const url = `http://127.0.0.1:${address.port}`;
    assert.equal((await fetch(`${url}/healthz`)).status, 200); assert.equal((await fetch(`${url}/readyz`)).status, 503);
    discord = true; assert.equal((await fetch(`${url}/readyz`)).status, 200);
    for (let i = 0; i < 5; i++) {
        const response = await fetch(`${url}/diagnostics?target=https://example.com&token=do-not-echo`);
        const data = await response.json(); assert.equal(data.price.auth, 'demo-key'); assert.ok(!JSON.stringify(data).includes('do-not-echo'));
        assert.equal(response.headers.get('cache-control'), 'no-store');
    }
    assert.equal(priceCalls, 1); assert.equal(aiCalls, 1);
    assert.equal((await fetch(`${url}/health/price`)).status, 200);
    assert.equal((await fetch(`${url}/unknown`)).status, 404);
    assert.equal((await fetch(`${url}/diagnostics`, { method: 'POST' })).status, 405);
    const head = await fetch(`${url}/healthz`, { method: 'HEAD' }); assert.equal(await head.text(), '');
});
test('price probe failures do not crash liveness and only expose safe reason codes', async t => {
    const health = createHealthServer({ logger: quiet, checkPrice: async () => { throw new Error('secret'); }, checkAi: async () => ({ status: 'not_configured' }) });
    const address = await health.start({ port: 0 }); t.after(() => health.stop()); await health.probe();
    const base = `http://127.0.0.1:${address.port}`;
    assert.equal((await fetch(`${base}/healthz`)).status, 200);
    const result = await fetch(`${base}/health/price`); assert.equal(result.status, 503); assert.ok(!(await result.text()).includes('secret'));
});

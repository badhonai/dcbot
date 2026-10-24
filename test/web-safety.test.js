const { test } = require('node:test');
const assert = require('node:assert/strict');
const { publicUrl, isPublicAddress, resolvePublic, pinnedLookup, readPublicPage, extractPage } = require('../src/integrations/safe-page');
const { WebService } = require('../src/features/web');
const lookup = async () => [{ address: '93.184.216.34', family: 4 }];
test('web reader rejects private targets, credentials, HTTP and nonstandard ports', () => {
    for (const url of ['http://example.com', 'https://localhost', 'https://127.0.0.1', 'https://[::1]', 'https://user:pass@example.com', 'https://example.com:8080', 'file:///etc/passwd', 'https://service.internal']) assert.throws(() => publicUrl(url));
    assert.equal(publicUrl('https://example.com/a#part').href, 'https://example.com/a');
});
test('private/reserved/mapped network ranges are blocked', () => {
    for (const ip of ['127.0.0.1','10.1.2.3','169.254.169.254','192.168.1.1','172.16.1.1','100.64.0.1','0.0.0.0','224.0.0.1','::1','fc00::1','fe80::1','::ffff:127.0.0.1','64:ff9b::a9fe:a9fe']) assert.equal(isPublicAddress(ip), false, ip);
    assert.equal(isPublicAddress('8.8.8.8'), true);
});
test('DNS resolution rejects mixed public/private results', async () => {
    await assert.rejects(resolvePublic('example.com', async () => [{ address: '8.8.8.8', family: 4 }, { address: '127.0.0.1', family: 4 }]));
});
test('pinned lookup never resolves DNS again during the HTTP connection', () => {
    const pinned = pinnedLookup({ address: '93.184.216.34', family: 4 });
    pinned('ignored.example', {}, (error, address, family) => { assert.equal(error, null); assert.equal(address, '93.184.216.34'); assert.equal(family, 4); });
});
test('redirects are revalidated and cannot reach a private host', async () => {
    let calls = 0;
    await assert.rejects(readPublicPage('https://example.com', { lookup, request: async () => { calls++; return { redirect: 'https://127.0.0.1/private' }; } }));
    assert.equal(calls, 1);
});
test('redirects cannot use a public name that resolves privately', async () => {
    let requests = 0;
    await assert.rejects(readPublicPage('https://example.com', { lookup: async host => host === 'example.com' ? lookup() : [{ address: '169.254.169.254', family: 4 }], request: async () => { requests++; return { redirect: 'https://metadata.example/path' }; } }));
    assert.equal(requests, 1);
});
test('reader extracts text without executing scripts or loading resources', () => {
    const result = extractPage('<html><title>Example</title><body><nav>noise</nav><main><h1>Article</h1><p>Useful facts.</p><script>secret()</script></main></body></html>', 'text/html', 'https://example.com');
    assert.equal(result.title, 'Example'); assert.match(result.content, /Useful facts/); assert.ok(!result.content.includes('secret')); assert.ok(!result.content.includes('noise'));
});
test('web search uses the existing Ollama key and limits/filter results', async () => {
    let request;
    const web = new WebService({ apiKey: 'fake-key', fetchFn: async (url, options) => { request = { url, ...options }; return { ok: true, json: async () => ({ results: [{ title: 'Good', url: 'https://example.com', content: 'Snippet' }, { title: 'Bad', url: 'https://127.0.0.1', content: 'no' }] }) }; } });
    const found = await web.search('query');
    assert.equal(found.results.length, 1); assert.equal(found.untrusted, true);
    assert.equal(request.url, 'https://ollama.com/api/web_search'); assert.equal(JSON.parse(request.body).max_results, 5);
});
test('search cannot invent results when key is missing or allowance fails', async () => {
    await assert.rejects(new WebService().search('query'), /needs OLLAMA_API_KEY/);
    let calls = 0;
    const web = new WebService({ apiKey: 'fake', fetchFn: async () => { calls++; return { ok: false, status: 429 }; } });
    await assert.rejects(web.search('query')); await assert.rejects(web.search('query')); assert.equal(calls, 1);
});
test('reader output is bounded and redirect loops stop', async () => {
    await assert.rejects(readPublicPage('https://example.com', { lookup, request: async () => ({ redirect: '/again' }) }), /Too many/);
    assert.equal(extractPage('x'.repeat(20000), 'text/plain', 'https://example.com').content.length, 10000);
});
test('DNS wait respects cancellation before any connection', async () => {
    const controller = new AbortController(); let connections = 0;
    const work = readPublicPage('https://example.com', { signal: controller.signal, lookup: () => new Promise(() => {}), request: async () => { connections++; } });
    controller.abort(); await assert.rejects(work); assert.equal(connections, 0);
});
test('HTTPS transport rejects both declared and streamed oversized bodies', async t => {
    const https = require('node:https'); const { PassThrough } = require('node:stream'); const { EventEmitter } = require('node:events');
    for (const declared of [true, false]) {
        let stream;
        const patch = t.mock.method(https, 'get', (_url, options, callback) => {
            assert.equal(options.agent, false); assert.equal(options.family, 4); assert.equal(options.headers['Accept-Encoding'], 'identity');
            const request = new EventEmitter();
            queueMicrotask(() => {
                stream = new PassThrough(); stream.statusCode = 200; stream.headers = { 'content-type': 'text/html', ...(declared ? { 'content-length': '9999999' } : {}) };
                callback(stream); if (!declared) stream.end(Buffer.alloc(512 * 1024 + 1));
            }); return request;
        });
        await assert.rejects(readPublicPage('https://example.com', { lookup }), /large|limit/); assert.equal(stream.destroyed, true); patch.mock.restore();
    }
});

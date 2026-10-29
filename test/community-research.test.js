const { test } = require('node:test');
const assert = require('node:assert/strict');
const { CommunityResearch, xTarget, xSource } = require('../src/features/community-research');
const quiet = { search: async () => ({ results: [] }), read: async () => { throw new Error('not readable'); } };
test('X target parser normalizes handles and post URLs without tracking parameters', () => {
 assert.equal(xTarget('@Ethereum').url, 'https://x.com/Ethereum');
 assert.equal(xTarget('https://twitter.com/ethereum/status/12345?s=20#foo').url, 'https://x.com/ethereum/status/12345');
 assert.equal(xTarget('Ethereum ecosystem').type, 'topic');
});
test('X parser rejects arbitrary URLs, credentials, login routes and host spoofing', () => {
 for (const input of ['https://x.com.evil.com/user', 'https://user:pass@x.com/u', 'https://127.0.0.1', 'https://x.com/i/status/1234', 'https://x.com/login', 'http://x.com/user', 'https://x.com/u/lists/123']) assert.throws(() => xTarget(input), input);
});
test('profile evidence must use the exact account path, not prefix lookalikes', () => {
 const t = xTarget('@abc'); assert.equal(xSource('https://x.com/abc/status/123', t), true);
 for (const url of ['https://x.com/abcd/status/123', 'https://x.com/other/status/123', 'https://evil.com/abc']) assert.equal(xSource(url, t), false);
});
test('post evidence must match the exact post and account', () => {
 const t = xTarget('https://x.com/abc/status/123'); assert.equal(xSource('https://twitter.com/abc/status/123', t), true); assert.equal(xSource('https://x.com/abc/status/1234', t), false);
});
test('X research explicitly labels snippets, drops unrelated accounts and invents no metrics', async () => {
 const s = new CommunityResearch({ ...quiet, search: async () => ({ results: [{ title: 'Account', url: 'https://x.com/abc', content: 'Indexed evidence' }, { url: 'https://x.com/abcd', content: 'Unrelated' }] }) });
 const r = await s.x('@abc'); assert.equal(r.results.length, 1); assert.equal(r.access, 'indexed_snippets'); assert.match(r.limitations, /NOT post publication/); assert.equal(r.followers, undefined); assert.equal(r.untrusted, true);
});
test('a readable public post avoids an unnecessary search call', async () => {
 let searches = 0;
 const s = new CommunityResearch({ read: async url => ({ url, title: 'Public post', content: 'A readable public post excerpt. '.repeat(4) }), search: async () => { searches++; throw new Error(); } });
 const r = await s.x('https://x.com/abc/status/123'); assert.equal(r.access, 'public_page_excerpt'); assert.equal(searches, 0);
});
test('login-only/redirected pages are never passed off as a fetched post', async () => {
 for (const page of [{ url: 'https://x.com/abc/status/123', content: 'Log in to X to see this post. '.repeat(10) }, { url: 'https://x.com/login', content: 'Generic content '.repeat(10) }]) {
  const s = new CommunityResearch({ ...quiet, read: async () => page }); const r = await s.x('https://x.com/abc/status/123'); assert.equal(r.access, 'unavailable'); assert.deepEqual(r.results, []);
 }
});
test('empty X evidence never asserts the account does not exist', async () => {
 const r = await new CommunityResearch(quiet).x('@abc'); assert.equal(r.access, 'unavailable'); assert.match(r.pages[0].description, /does not prove/);
});
test('missing search quota/key gives a truthful bounded limitation with no raw error', async () => {
 const r = await new CommunityResearch({ ...quiet, search: async () => { throw new Error('SECRET_KEY'); } }).x('@abc');
 assert.equal(r.access, 'unavailable'); assert.match(r.pages[0].description, /OLLAMA_API_KEY/); assert.ok(!JSON.stringify(r).includes('SECRET_KEY'));
});
test('aborted X requests propagate cancellation rather than starting a fallback search', async () => {
 const c = new AbortController(); c.abort();
 const s = new CommunityResearch({ ...quiet, read: async () => { throw c.signal.reason; }, search: async () => { assert.fail('must not search'); } });
 await assert.rejects(s.x('https://x.com/abc/status/123', { signal: c.signal }), { name: 'AbortError' });
});
test('news uses retrieval date as query context, not a fabricated publication date', async () => {
 let q; const s = new CommunityResearch({ search: async query => { q = query; return { results: [{ title: 'Report', url: 'https://example.com', content: 'Reported claim' }], fetchedAt: '2026-10-29T12:00:00Z', untrusted: true }; } }, { now: () => Date.parse('2026-10-29') });
 const r = await s.news('Ethereum'); assert.match(q, /Ethereum crypto news recent 2026-10-29/); assert.match(r.note, /NOT publication/); assert.equal(r.pages[0].timestamp, '2026-10-29T12:00:00.000Z');
});
test('empty news search returns no invented headlines', async () => {
 const r = await new CommunityResearch(quiet).news(); assert.equal(r.results.length, 0); assert.match(r.pages[0].description, /No headline was invented/);
});

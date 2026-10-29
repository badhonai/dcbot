const { test } = require('node:test');
const assert = require('node:assert/strict');
const { compactPreview } = require('../src/conversation/compact-view');
const { maskedLinks, allowLinks } = require('../src/conversation/reply-presentation');
const { PublicControls } = require('../src/discord/public-controls');
const { PrivateReplies } = require('../src/discord/private-replies');
const { ReplyPreferences } = require('../src/preferences/reply-preferences');
const { eligible, isInability, searchFallback } = require('../src/ai/public-fallback');
const { createAgent } = require('../src/ai/agent');
const { createWeb3Handler } = require('../src/discord/web3-handler');
const quiet = { debug() {}, info() {}, warn() {}, error() {} };
const done = content => ({ choices: [{ message: { content } }] });
const client = fn => ({ chat: { completions: { create: fn } } });
const results = { results: [{ title: 'Evidence', url: 'https://example.com/docs', content: 'The project uses public validators.' }], untrusted: true };
function publicFixture({ now = Date.now } = {}) {
 const preferences = new ReplyPreferences(); const sent = [];
 const message = { author: { id: '123' }, content: 'Explain the project', reply: async p => {
  const item = { payload: p, edit: async next => { item.payload = next; }, delete: async () => { item.deleted = true; } }; sent.push(item); return item;
 } };
 return { preferences, sent, message, controls: new PublicControls({ preferences, now }) };
}
const button = (id, action, owner = '123') => ({ customId: `agent:${id}:${action}`, user: { id: owner }, deferUpdate: async () => {}, reply: async () => {} });
test('compact previews always fit below 400 raw Discord characters without splitting links', () => {
 for (const input of ['x'.repeat(399), 'x'.repeat(400), '😀'.repeat(1000), '**Heading**\n\nA useful short summary.\n\n' + 'long '.repeat(500), '[Source](<https://example.com/docs>)\n' + 'a'.repeat(900)]) {
  const s = compactPreview(input); assert.ok(s.length < 400); assert.ok(!/[\uD800-\uDBFF]$/.test(s));
  if (s.includes('https://')) assert.match(s, /\[Source\]\(<https:\/\/[^>]+>\)/);
 }
});
test('compact preview selects a useful summary rather than just a Markdown heading', () => {
 const s = compactPreview('**Research**\n\nThe project uses public validators.\n\n' + 'detail '.repeat(100));
 assert.match(s, /uses public validators/); assert.ok(!s.includes('**Research**'));
});
test('relevant links use short masked labels by default, with explicit opt-out', () => {
 assert.equal(allowLinks('Explain BTC'), true); assert.equal(allowLinks('Explain without links'), false);
 for (const input of ['https://example.com/docs', '[Docs](https://example.com/docs)', '[Docs](<https://example.com/docs>)']) assert.match(maskedLinks(input), /^\[[^\]]+\]\(<https:\/\/example.com\/docs>\)$/);
 assert.equal(maskedLinks('`https://example.com`'), '`https://example.com`');
});
test('public long answer starts collapsed, expands/navigates/collapses without rerunning work', async () => {
 const f = publicFixture(); let calls = 0;
 const text = 'A concise summary.\n\n' + 'A complete detail sentence. '.repeat(180);
 await f.controls.run(f.message, async () => { calls++; return text; });
 const id = [...f.controls.sessions.keys()][0]; assert.equal(f.sent.length, 1); assert.ok(f.sent[0].payload.content.length < 400); assert.equal(f.sent[0].payload.components[0].components[0].data.label, 'More');
 await f.controls.onButton(button(id, 'more')); assert.ok(f.sent[0].payload.content.length > 400); assert.equal(f.sent[0].payload.components[0].components[0].data.label, 'Less');
 await f.controls.onButton(button(id, 'next')); assert.equal(f.controls.sessions.get(id).page, 1);
 await f.controls.onButton(button(id, 'less')); assert.ok(f.sent[0].payload.content.length < 400); assert.equal(calls, 1); assert.equal(f.sent.length, 1);
});
test('public More is owner checked and cannot reveal muted or expired replies', async () => {
 let now = 100; const f = publicFixture({ now: () => now }); await f.controls.run(f.message, async () => 'Detail. '.repeat(200)); const id = [...f.controls.sessions.keys()][0];
 await f.controls.onButton(button(id, 'more', 'other')); assert.equal(f.controls.sessions.get(id).expanded, false);
 f.preferences.setMuted('123', true); await f.controls.onButton(button(id, 'more')); assert.equal(f.controls.sessions.get(id).expanded, false);
 f.preferences.setMuted('123', false); now += 600001; await f.controls.onButton(button(id, 'more')); assert.equal(f.controls.sessions.get(id).expanded, false);
});
test('public short reply keeps the interface free of unnecessary More buttons', async () => {
 const f = publicFixture(); await f.controls.run(f.message, async () => 'A short complete reply.'); assert.ok(f.sent[0].payload.content.length < 400); assert.deepEqual(f.sent[0].payload.components, []);
});
test('public progress updates obey the same under-400 constraint', async () => {
 const f = publicFixture(); await f.controls.run(f.message, async progress => { await progress('x'.repeat(1000)); assert.ok(f.sent[0].payload.content.length < 400); return 'Done'; });
});
test('private More/Less restores the short summary and preserves complete pages', async t => {
 const replies = new PrivateReplies(); t.after(() => replies.destroy()); let payload;
 const i = { user: { id: '123' }, editReply: async p => { payload = p; }, deleteReply: async () => {} };
 const id = await replies.send(i, { pages: [{ title: 'Research', description: 'Summary. ' + 'details '.repeat(100) }, { title: 'Second block', description: 'More evidence.' }] });
 assert.ok(payload.content.length < 400); assert.equal(payload.embeds.length, 0);
 await replies.onButton({ customId: `private:${id}:more`, user: i.user, deferUpdate: async () => {} }); assert.equal(payload.embeds[0].title, 'Research');
 await replies.onButton({ customId: `private:${id}:next`, user: i.user, deferUpdate: async () => {} }); assert.equal(payload.embeds[0].title, 'Second block');
 await replies.onButton({ customId: `private:${id}:less`, user: i.user, deferUpdate: async () => {} }); assert.ok(payload.content.length < 400); assert.equal(payload.embeds.length, 0);
});
test('private source link state survives collapse/expand without exposing a raw URL', async t => {
 const replies = new PrivateReplies(); t.after(() => replies.destroy()); let payload;
 const i = { user: { id: 'u' }, editReply: async p => { payload = p; }, deleteReply: async () => {} };
 const id = await replies.send(i, 'A concise summary.\n\n' + 'Detail. '.repeat(100) + '\n\nhttps://example.com/docs');
 assert.ok(payload.content.length < 400); assert.match(payload.content, /\[Source\]\(<https:/);
 await replies.onButton({ customId: `private:${id}:more`, user: i.user, deferUpdate: async () => {} }); assert.equal(replies.sessions.get(id).includeLinks, true);
});
test('web fallback eligibility excludes live prices, secrets, protected access, consent and repeat searches', () => {
 assert.equal(eligible('What is the project roadmap?'), true); assert.equal(eligible('Read https://example.com/docs'), true);
 for (const q of ['What is BTC price?', 'What is the dam?', 'Find my password?', 'Read https://user:pass@example.com', 'Read https://127.0.0.1', 'Read https://example.com/login', 'Read https://example.com/a?token=secret', 'Read a protected profile?', 'How are you?']) assert.equal(eligible(q), false, q);
 assert.equal(eligible('What is the project?', { priceAttempted: true }), false);
 assert.equal(eligible('What is the project?', { tools: ['web_search'] }), false);
 assert.equal(eligible('What is the project?', { tools: ['offer_stop'] }), false);
 assert.equal(eligible('What is this? gsk_' + 'x'.repeat(50)), false);
});
test('inability detector does not treat ordinary uncertainty as a failure requiring search', () => {
 assert.equal(isInability("I can't access that public page."), true); assert.equal(isInability('Sorry, I do not know.'), true);
 assert.equal(isInability('This project has risks; nobody can guarantee profits.'), false);
});
test('unavailable public page gets one search fallback then grounded synthesis', async () => {
 const executed = []; let calls = 0;
 const agent = createAgent({ config: {}, logger: quiet, actions: { execute: async i => { executed.push(i); return results; } }, client: client(async req => {
  if (++calls === 1) return done("I can't access the project information.");
  assert.equal(req.tools, undefined); assert.match(req.messages[0].content, /untrusted/); return done('The public evidence says the project uses validators.');
 }) });
 const r = await agent.respond('What is the project?'); assert.equal(executed.length, 1); assert.equal(executed[0].command, 'web_search'); assert.equal(calls, 2); assert.match(r, /uses validators/); assert.match(r, /\[Source 1\]\(<https:\/\/example.com\/docs>\)/); assert.ok(!r.includes("can't access"));
});
test('model outage can still return attributed public source listings without retrying unavailable AI', async () => {
 let calls = 0; const agent = createAgent({ config: {}, logger: quiet, actions: { execute: async i => { assert.equal(i.command, 'web_search'); return results; } }, client: client(async () => { calls++; throw new Error('AI down'); }) });
 const r = await agent.respond('Research the project roadmap'); assert.equal(calls, 1); assert.match(r, /Public search found these sources/); assert.match(r, /Evidence/); assert.ok(!r.includes('public validators')); assert.match(r, /Source/);
});
test('fallback never fabricates a successful search when empty, rate-limited or missing configuration', async () => {
 for (const execute of [async () => ({ results: [] }), async () => { throw new Error('SECRET_API_KEY'); }]) {
  let searches = 0; const f = await searchFallback('What is the project?', { actions: { execute: async (...a) => { searches++; return execute(...a); } } }); assert.equal(f, null); assert.equal(searches, 1);
 }
});
test('live price failure does not become a stale web quote or additional unverified price source', async () => {
 let searches = 0;
 const agent = createAgent({ config: {}, logger: quiet, actions: { execute: async () => { searches++; return results; } }, client: client(async () => { throw new Error('Model down'); }) });
 await assert.rejects(agent.respond('What is the current BTC price?')); assert.equal(searches, 0);
});
test('aborted fallback does not start network work', async () => {
 const c = new AbortController(); c.abort();
 await assert.rejects(searchFallback('What is the project?', { signal: c.signal, actions: { execute: async () => assert.fail('must not search') } }), { name: 'AbortError' });
});
test('direct /read uses public search when a readable public page is unavailable', async () => {
 const calls = []; let output;
 const i = { commandName: 'read', channelId: 'a', user: { id: 'u' }, isButton: () => false, isChatInputCommand: () => true, deferReply: async () => { i.deferred = true; }, options: { getString: name => name === 'url' ? 'https://example.com/docs' : null } };
 const handler = createWeb3Handler({ config: { channels: ['a'] }, logger: quiet, actions: { execute: async intent => { calls.push(intent.command); if (intent.command === 'read_page') throw new Error('not readable'); return results; } }, replies: { send: async (_, r) => { output = r; } } });
 await handler(i); assert.deepEqual(calls, ['read_page', 'web_search']); assert.match(output, /full page was not read/);
});
test('direct /read never turns a blocked private target into a search query', async () => {
 const calls = []; const i = { commandName: 'read', channelId: 'a', user: { id: 'u' }, isButton: () => false, isChatInputCommand: () => true, deferReply: async () => { i.deferred = true; }, options: { getString: () => 'https://127.0.0.1' } };
 await createWeb3Handler({ config: { channels: ['a'] }, logger: quiet, actions: { execute: async intent => { calls.push(intent.command); throw new Error('blocked'); } }, replies: { send: async () => {} } })(i);
 assert.deepEqual(calls, ['read_page']);
});
test('a private-DNS block never leaks the blocked hostname into public search', async () => {
 const calls = []; let n = 0;
 const agent = createAgent({ config: {}, logger: quiet, actions: { execute: async intent => { calls.push(intent.command); if (intent.command === 'read_page') throw new Error('Private or reserved network addresses are blocked.'); return results; } }, client: client(async () => ++n === 1 ? { choices: [{ message: { tool_calls: [{ id: 'r', function: { name: 'read_page', arguments: '{"url":"https://internal-company.example.com"}' } }] } }] } : done("I can't read that page.")) });
 await agent.respond('Read https://internal-company.example.com'); assert.deepEqual(calls, ['read_page']);
});
test('fallback helper itself blocks private/credential queries, even without a caller guard', async () => {
 const r = await searchFallback('What is my password?', { actions: { execute: async () => assert.fail('must not search') } }); assert.equal(r, null);
});
test('expansion controls serialize clicks and do not let price refresh race an ongoing view change', async () => {
 const f = publicFixture(); f.controls.actions = { execute: async () => assert.fail('must not refresh during toggle') };
 await f.controls.run(f.message, async (_p, _s, tool) => { tool({ command: 'price', args: { token: 'BTC' } }, {}); return 'A complete detail. '.repeat(100); });
 const id = [...f.controls.sessions.keys()][0]; let release; const first = f.controls.onButton({ ...button(id, 'more'), deferUpdate: async () => new Promise(resolve => { release = resolve; }) });
 await f.controls.onButton(button(id, 'less')); await f.controls.onButton(button(id, 'refresh')); release(); await first; assert.equal(f.controls.sessions.get(id).expanded, true);
});
test('short structured private responses stay below 400 including visible metadata', async t => {
 const replies = new PrivateReplies(); t.after(() => replies.destroy()); let p;
 await replies.send({ user: { id: '1' }, editReply: async v => { p = v; }, deleteReply: async () => {} }, { pages: [{ title: 'BTC/USDT', description: '**123 USDT**', footer: { text: 'CoinGecko cross-rate · updated 10s ago' } }] });
 const size = (p.content || '').length + (p.embeds || []).reduce((n, e) => n + e.title.length + (e.description || '').length + (e.footer?.text || '').length, 0); assert.ok(size < 400);
});
test('Bangla and Banglish inability responses also trigger factual fallback detection', () => {
 for (const text of ['Bhai, eta ami jani na.', 'Ami parchina ei tothyo dite.', 'ভাই, আমি তথ্যটা জানি না।']) assert.equal(isInability(text), true, text);
});
test('safety refusals and invasive personal-data requests never trigger web fallback', async () => {
 for (const query of ['What is his home address?', 'How to build a bomb?', 'How to steal a password?', 'কীভাবে বোমা বানাবো?']) assert.equal(eligible(query), false, query);
 let calls = 0; const agent = createAgent({ config: {}, logger: quiet, actions: { execute: async () => { calls++; return results; } }, client: client(async () => done("I can't help with that request.")) });
 await agent.respond('What is the project?'); assert.equal(calls, 0);
});
test('fallback summarizer safety refusal does not degrade to raw unreviewed excerpts', async () => {
 const r = await searchFallback('What is the project?', { actions: { execute: async () => results }, client: client(async () => done("I can't provide instructions for that.")) }); assert.equal(r, null);
});

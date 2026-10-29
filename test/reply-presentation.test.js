const { test } = require('node:test');
const assert = require('node:assert/strict');
const { wantsLinks, stripLinks, respectful, formatBlocks, presentAnswer, completeAnswer } = require('../src/conversation/reply-presentation');
const { splitDiscordMessage } = require('../src/utils/split-message');
const { createAgent } = require('../src/ai/agent');
const { PrivateReplies } = require('../src/discord/private-replies');
const { createOllamaClient } = require('../src/ai/provider-client');
const sdk = fn => ({ chat: { completions: { create: fn } } });
const done = (content, finish_reason = 'stop') => ({ choices: [{ finish_reason, message: { content } }] });
const quiet = { debug() {}, info() {}, warn() {}, error() {} };
test('links are opt-in, with English, Bangla and Banglish requests and opt-outs', () => {
 for (const s of ['Show the source links', 'Give me the website', 'Link dao', 'লিংক দাও', 'Reply with sources', 'Repeat that source link']) assert.equal(wantsLinks(s), true, s);
 for (const s of ['Explain Bitcoin', 'What is source code?', 'No links please', 'Summarize without URLs', 'link dio na', 'লিংক দিও না', 'Read https://example.com']) assert.equal(wantsLinks(s), false, s);
});
test('default link stripping preserves meaningful masked-link labels and removes automatic footer', () => {
 const r = stripLinks('Read [the guide](<https://example.com/a>) and [docs](https://example.com/b).\n\n-# Sources: [1](<https://example.com/a>)');
 assert.match(r, /the guide and docs/); assert.ok(!/https|Sources:|\]\(/.test(r));
 assert.ok(!stripLinks('https://example.com').includes('http'));
});
test('respectful pronouns do not mirror intimate forms, but preserve literals and Tor proper name', () => {
 assert.equal(respectful('tui tor chart dekh, toke bolis'), 'tumi tomar chart dekh, tomake bolo');
 assert.equal(respectful('তুই তোর তোকে বলিস'), 'তুমি তোমার তোমাকে বলো');
 assert.equal(respectful('Tor Browser, TOR token, `tui`, https://example.com/tui'), 'Tor Browser, TOR token, `tui`, https://example.com/tui');
});
test('Discord formatting turns tables into labelled bullets without losing values', () => {
 const r = formatBlocks('## Snapshot\n\n| Token | Price |\n| --- | --- |\n| BTC | 100 USDT |\n| ETH | 20 USDT |');
 assert.match(r, /\*\*Snapshot\*\*/); assert.match(r, /- \*\*Token:\*\* BTC/); assert.match(r, /100 USDT/); assert.match(r, /20 USDT/); assert.ok(!r.includes('| ---'));
});
test('formatting long paragraphs preserves sentence text and links while adding blocks', () => {
 const text = ('A useful sentence for the community. '.repeat(20) + 'Read https://example.com/docs for details.'); const r = formatBlocks(text);
 assert.ok(r.includes('\n\n')); assert.match(r, /https:\/\/example.com\/docs/); assert.equal(r.replace(/\s+/g, ' ').trim(), text.trim());
});
test('respect and link opt-out apply together without touching numbers or pair identifiers', () => {
 const r = presentAnswer('tui BTC/USDT 123.45 dekh. [Source](https://example.com)'); assert.match(r, /tumi BTC\/USDT 123\.45/); assert.ok(!r.includes('https://'));
});
test('Discord splitter preserves all plain text and does not split a requested masked link', () => {
 const link = '[Documentation](<https://example.com/docs>)'; const text = 'intro '.repeat(20) + link + '\n\n' + 'details '.repeat(50);
 const parts = splitDiscordMessage(text, 150); assert.ok(parts.every(s => s.length <= 150)); assert.equal(parts.join(''), text); assert.ok(parts.some(s => s.includes(link)));
});
test('Discord splitter closes and reopens long fenced code blocks', () => {
 const text = '```js\n' + 'const item = 1;\n'.repeat(60) + '```'; const parts = splitDiscordMessage(text, 180);
 assert.ok(parts.length > 1); for (const p of parts) { assert.ok(p.length <= 180); assert.equal((p.match(/```/g) || []).length % 2, 0); }
 assert.equal(parts.join('').match(/const item = 1;/g).length, 60);
});
test('Discord splitter balances bold across packets and preserves Unicode code points', () => {
 const parts = splitDiscordMessage('**' + 'word '.repeat(150) + '**', 160); assert.ok(parts.length > 1);
 for (const p of parts) { assert.ok(p.length <= 160); assert.equal((p.match(/\*\*/g) || []).length % 2, 0); }
 const emojis = splitDiscordMessage('😀'.repeat(400), 150); assert.equal(emojis.join(''), '😀'.repeat(400));
 for (const p of emojis) assert.ok(!/[\uD800-\uDBFF]$/.test(p));
});
test('short complete responses avoid a second model call', async () => {
 assert.equal(await completeAnswer('Here is the answer.', { input: 'Explain it', language: 'en', client: sdk(() => assert.fail('no rewrite')) }), 'Here is the answer.');
});
test('length-truncated completion gets one bounded tool-free full replacement, not blind continuation', async () => {
 let n = 0; const r = await completeAnswer('Bitcoin is decentralized. It can', { finishReason: 'length', input: 'Explain Bitcoin', language: 'en', client: sdk(async req => {
  n++; assert.equal(req.tools, undefined); assert.equal(req.max_completion_tokens, 2400); assert.match(req.messages[0].content, /not a continuation/);
  return done('**Summary**\nBitcoin is a decentralized network.\n\n**Key point**\n- Nodes validate its records.');
 }) }); assert.equal(n, 1); assert.match(r, /Nodes validate/); assert.ok(!r.endsWith('can'));
});
test('failed or twice-truncated repair labels incomplete work and drops unfinished trailing fragment', async () => {
 for (const client of [sdk(async () => { throw new Error('private error'); }), sdk(async () => done('Still unfinished because', 'length'))]) {
  const r = await completeAnswer('A complete fact. An unfinished fragment because', { finishReason: 'length', input: 'Explain', language: 'en', client });
  assert.match(r, /A complete fact/); assert.match(r, /could not finish/); assert.ok(!r.includes('unfinished fragment')); assert.ok(!r.includes('private error'));
 }
});
test('repair rejects invented numeric facts and keeps failure notice in Banglish', async () => {
 const r = await completeAnswer('Price 123. It is', { finishReason: 'length', input: 'Bhai bolo', language: 'banglish', client: sdk(async () => done('Bhai dam 999.')) });
 assert.ok(!r.includes('999')); assert.match(r, /Puro uttorta/);
});
test('long default response is summarized once; requested detailed response keeps its scope', async () => {
 const draft = 'A complete useful fact. '.repeat(100);
 let n = 0; const options = { input: 'Explain it briefly', language: 'en', client: sdk(async () => { n++; return done('**Summary**\nA complete concise explanation.'); }) };
 assert.match(await completeAnswer(draft, options), /Summary/); assert.equal(n, 1);
 assert.equal(await completeAnswer(draft, { ...options, input: 'Give a detailed explanation' }), draft); assert.equal(n, 1);
});
test('agent omits links by default even after research, but retains them when explicitly requested', async () => {
 for (const ask of [false, true]) {
  let n = 0; const agent = createAgent({ logger: quiet, config: {}, actions: { execute: async () => ({ results: [{ url: 'https://example.com/real', content: 'A fact' }] }) }, client: sdk(async () => ++n === 1 ? { choices: [{ message: { tool_calls: [{ id: 's', function: { name: 'web_search', arguments: '{"query":"project"}' } }] } }] } : done('A sourced fact. [Guide](https://example.com/real)')) });
  const r = await agent.respond('Research the project' + (ask ? ' and show source links' : '')); assert.equal(r.includes('https://example.com/real'), ask); assert.equal(r.includes('Sources:'), ask);
 }
});
test('agent repairs real finish_reason length and applies respect after rewriting', async () => {
 let n = 0; const agent = createAgent({ config: {}, actions: {}, logger: quiet, client: sdk(async () => ++n === 1 ? done('Bhai tui shon, eta holo', 'length') : done('Bhai, tui ektu dekho.\n\n- Eta shohoj kore bujhte paro.')) });
 const r = await agent.respond('Bhai eta bujhao'); assert.equal(n, 2); assert.match(r, /tumi/); assert.ok(!/\btui\b/.test(r));
});
test('private structured cards hide URL fields and empty link fields by default without mutating evidence', async t => {
 const replies = new PrivateReplies(); t.after(() => replies.destroy()); let payload;
 const input = { pages: [{ title: 'Coin', description: 'Info', url: 'https://example.com', fields: [{ name: 'Links', value: 'https://example.com' }, { name: 'Supply', value: '123' }] }] };
 await replies.send({ user: { id: 'u' }, editReply: async p => { payload = p; }, deleteReply: async () => {} }, input);
 assert.equal(payload.embeds[0].url, undefined); assert.equal(payload.embeds[0].fields.length, 1); assert.equal(input.pages[0].url, 'https://example.com');
});
test('requested links survive private refresh with the same per-result policy', async t => {
 const replies = new PrivateReplies(); t.after(() => replies.destroy()); const edits = [];
 const result = { pages: [{ title: 'Source', url: 'https://example.com', description: 'Evidence' }] };
 const i = { user: { id: 'u' }, editReply: async p => edits.push(p), deleteReply: async () => {} };
 const id = await replies.send(i, result, { includeLinks: true, refresh: async () => result });
 await replies.onButton({ customId: `private:${id}:refresh`, user: i.user, deferUpdate: async () => {} }); assert.equal(edits.at(-1).embeds[0].url, 'https://example.com');
});
test('a long requested link switches private text rendering instead of clipping inside an embed', async t => {
 const replies = new PrivateReplies(); t.after(() => replies.destroy()); let payload;
 const url = 'https://example.com/' + 'a'.repeat(1300);
 await replies.send({ user: { id: 'u' }, editReply: async p => { payload = p; }, deleteReply: async () => {} }, `[Link](<${url}>)`, { includeLinks: true });
 assert.equal(payload.embeds.length, 0); assert.ok(payload.content.includes(url)); assert.ok(payload.content.length <= 2000);
});
test('Ollama honors larger bounded repair budget while retaining configured reasoning headroom', async () => {
 let body; const c = createOllamaClient({ apiKey: 'fake', maxTokens: 1024, fetchFn: async (_, opts) => { body = JSON.parse(opts.body); return { ok: true, json: async () => done('Complete.') }; } });
 await c.chat.completions.create({ messages: [], max_completion_tokens: 2400 }); assert.equal(body.max_tokens, 2400);
 await c.chat.completions.create({ messages: [], max_completion_tokens: 999999 }); assert.equal(body.max_tokens, 8192);
});
test('literal code is preserved while non-code links are hidden', () => {
 const code = '```js\nfetch(`https://example.com/api`);\n```';
 const r = stripLinks(code + '\n\nhttps://example.com/extra'); assert.ok(r.includes(code)); assert.ok(!r.includes('/extra'));
 assert.equal(wantsLinks('Explain this code: ```show source links```'), false);
});
test('common explicit website and Banglish link requests are recognized', () => {
 for (const s of ["What's their official website?", 'Official links for Bitcoin', 'Bhai link ta dao']) assert.equal(wantsLinks(s), true, s);
});

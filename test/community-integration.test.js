const { test } = require('node:test');
const assert = require('node:assert/strict');
const { MessageFlags, EmbedBuilder, Client, Options } = require('discord.js');
const { Actions } = require('../src/features/actions');
const { CommunityFun } = require('../src/features/community-fun');
const { PrivateReplies } = require('../src/discord/private-replies');
const { createWeb3Handler, HELP } = require('../src/discord/web3-handler');
const { createAgent, finalText } = require('../src/ai/agent');
const quiet = { debug() {}, info() {}, warn() {}, error() {} };
for (const [name, args, tool] of [
 ['coin', { token: 'BTC' }, 'coin'], ['compare', { tokens: 'BTC, ETH' }, 'compare'], ['trending', {}, 'trending'], ['x', { query: '@ethereum' }, 'x_research'], ['news', { topic: 'Ethereum' }, 'news'], ['fun', { activity: 'quiz' }, 'fun'], ['answer', { id: 'q1', choice: 'A' }, 'answer'],
]) test(`/${name} acknowledges ephemerally before tool work, uses private bounded results`, async t => {
 const events = []; const edits = []; const replies = new PrivateReplies(); t.after(() => replies.destroy());
 const i = { commandName: name, channelId: 'allowed', user: { id: 'member' }, isButton: () => false, isChatInputCommand: () => true,
  options: { getString: key => args[key] || null }, deferReply: async payload => { events.push('deferred'); assert.equal(payload.flags, MessageFlags.Ephemeral); i.deferred = true; }, editReply: async payload => edits.push(payload), deleteReply: async () => {} };
 const handler = createWeb3Handler({ config: { channels: ['allowed'] }, replies, logger: quiet, actions: { execute: async intent => { assert.equal(events[0], 'deferred'); events.push('tool'); assert.equal(intent.command, tool); assert.deepEqual(intent.args, args); return new CommunityFun({ pick: () => 0 }).fun('quiz'); } } });
 await handler(i); assert.deepEqual(events, ['deferred', 'tool']); assert.equal(edits.length, 1); assert.equal(edits[0].allowedMentions.parse.length, 0); assert.doesNotThrow(() => new EmbedBuilder(edits[0].embeds[0]).toJSON());
});
test('new community commands cannot run outside the existing channel allowlist', async () => {
 let text;
 const handler = createWeb3Handler({ config: { channels: ['allowed'] }, actions: { execute: async () => assert.fail('must not execute') }, replies: { send: async (_, r) => { text = JSON.stringify(r); } }, logger: quiet });
 await handler({ commandName: 'fun', channelId: 'other', user: { id: 'u' }, isButton: () => false, isChatInputCommand: () => true, deferReply: async p => assert.equal(p.flags, MessageFlags.Ephemeral) });
 assert.match(text, /Use a bot channel/);
});
test('new service errors are never leaked into a public fallback or raw response', async () => {
 let result; const i = { commandName: 'coin', channelId: 'a', user: { id: 'u' }, isButton: () => false, isChatInputCommand: () => true, options: { getString: () => 'BTC' }, deferReply: async () => { i.deferred = true; } };
 await createWeb3Handler({ config: { channels: ['a'] }, actions: { execute: async () => { throw new Error('SECRET_PRIVATE_HEADER'); } }, replies: { send: async (_, r) => { result = JSON.stringify(r); } }, logger: quiet })(i);
 assert.match(result, /service is unavailable/); assert.ok(!result.includes('SECRET'));
});
test('normalization preserves actual multi-source citations, without invented source links', () => {
 const sources = [{ url: 'https://example.com/a' }, { url: 'https://example.com/b' }];
 const r = finalText('Compare https://example.com/a and https://example.com/b, not https://invented.com/', sources);
 assert.match(r, /\[1\].*\[2\]/); assert.ok(!r.includes('invented.com'));
});
test('Banglish agent game calls inherit the language selected for the actual user turn', async () => {
 let calls = 0; let seen;
 const agent = createAgent({ config: {}, logger: quiet, actions: new Actions({ fun: { fun: (activity, language) => { seen = language; return { questionId: 'q1', question: 'Wallet e ashole ki thake?' }; } } }), client: { chat: { completions: { create: async () => ++calls === 1 ? { choices: [{ message: { tool_calls: [{ id: 'q', function: { name: 'fun', arguments: '{"activity":"quiz"}' } }] } }] } : { choices: [{ message: { content: 'Bhai, wallet e ashole ki thake? ID q1' } }] } } } } });
 assert.match(await agent.respond('Bhai, quiz dao'), /Bhai/); assert.equal(seen, 'banglish');
});
test('AI is instructed to keep unavailable X evidence unavailable, not invent profile facts', async () => {
 let n = 0;
 const agent = createAgent({ config: {}, logger: quiet, actions: { execute: async () => ({ access: 'unavailable', results: [], limitations: 'No authenticated X API or follower count.' }) }, client: { chat: { completions: { create: async req => {
  if (++n === 1) return { choices: [{ message: { tool_calls: [{ id: 'x', function: { name: 'x_research', arguments: '{"query":"@example"}' } }] } }] };
  assert.match(req.messages[0].content, /Never invent protected\/deleted posts/); assert.match(req.messages.at(-1).content, /unavailable/);
  return { choices: [{ message: { content: 'Public evidence was unavailable. Paste the public post text so I can examine it.' } }] };
 } } } } }); assert.match(await agent.respond('Research the X profile @example'), /unavailable/);
});
test('small-host Discord cache configuration can instantiate without login or extra intents', async () => {
 const client = new Client({ intents: [], makeCache: Options.cacheWithLimits({ ...Options.DefaultMakeCacheSettings, MessageManager: 0, PresenceManager: 0, GuildMemberManager: { maxSize: 20 }, UserManager: { maxSize: 100 } }) });
 assert.equal(client.isReady(), false); await client.destroy(); assert.equal(HELP.pages.length, 3);
});
test('graceful shutdown drains an in-flight private command and refuses new work', async () => {
 let finish; let started; let executions = 0;
 const entered = new Promise(resolve => { started = resolve; });
 const handler = createWeb3Handler({ config: { channels: ['a'] }, logger: quiet, actions: { execute: async () => { executions++; started(); await new Promise(resolve => { finish = resolve; }); return { pages: [] }; } }, replies: { send: async () => {} } });
 const interaction = { commandName: 'trending', channelId: 'a', user: { id: 'u' }, isButton: () => false, isChatInputCommand: () => true, deferReply: async () => {}, options: { getString: () => null } };
 const first = handler(interaction); await entered; let drained = false; const done = handler.drain().then(() => { drained = true; });
 await handler(interaction); assert.equal(executions, 1); assert.equal(drained, false); finish(); await first; await done; assert.equal(drained, true);
});

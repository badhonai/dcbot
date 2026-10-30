const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHandlers } = require('../src/discord/handlers');
const { ChannelQueue } = require('../src/conversation/channel-queue');
const { HistoryStore } = require('../src/conversation/history-store');
const shipped = require('../config.json');
function fixture(legacy, { direct = false, everyone = false, role = false, replyTo, missing = false, active = true } = {}) {
 const events = [];
 const config = { channels: ['allowed'], naturalLanguageCommands: true, maxResponseLength: 1600 };
 const options = { client: { user: { id: 'bot' } }, config, queue: new ChannelQueue(10), logger: { error() {}, warn() {} }, now: () => 10000 };
 if (legacy) Object.assign(options, { history: new HistoryStore(13), router: { detect: () => { events.push('route'); return { command: 'price', args: { token: 'BTC' } }; } }, actions: { execute: async () => { events.push('tool'); return { pages: [{ title: 'Result', description: 'Verified result' }] }; } }, ai: { respond: async () => { events.push('ai'); return 'Result'; } } });
 else options.agent = { hasSession: () => active, respond: async () => { events.push('ai'); return 'Result'; } };
 const message = { id: 'message', channelId: 'allowed', author: { id: 'user', bot: false }, content: `${everyone ? '@everyone ' : ''}What is the BTC price?`,
  mentions: { has: (_user, opts = {}) => { assert.deepEqual(opts, { ignoreEveryone: true, ignoreRoles: true, ignoreRepliedUser: true }); return direct || (everyone && !opts.ignoreEveryone) || (role && !opts.ignoreRoles); } },
  channel: { sendTyping: async () => events.push('typing'), messages: { fetch: async () => { if (missing) throw new Error('deleted'); return { author: { id: replyTo }, content: 'Earlier message' }; } } }, reply: async () => { events.push('reply'); return { id: 'sent' }; } };
 if (replyTo || missing) message.reference = { messageId: 'earlier' };
 return { onMessage: createHandlers(options).onMessage, message, events };
}
for (const legacy of [false, true]) {
 const mode = legacy ? 'legacy' : 'agent';
 for (const [name, opts] of Object.entries({ ordinary: {}, everyone: { everyone: true }, role: { role: true }, otherReply: { replyTo: 'human' }, deletedReply: { missing: true }, massReplyToHuman: { everyone: true, replyTo: 'human' } })) {
  test(`${mode}: ${name} stays silent even with active context and old auto configuration`, async () => {
   const f = fixture(legacy, opts); await f.onMessage(f.message); assert.deepEqual(f.events, []);
  });
 }
 for (const [name, opts] of Object.entries({ direct: { direct: true }, botReply: { replyTo: 'bot' }, directAndEveryone: { direct: true, everyone: true }, botReplyAndEveryone: { replyTo: 'bot', everyone: true }, directAndDeletedReply: { direct: true, missing: true } })) {
  test(`${mode}: ${name} still activates`, async () => {
   const f = fixture(legacy, opts); await f.onMessage(f.message); assert.ok(f.events.includes('reply')); assert.equal(f.events.filter(event => event !== 'route')[0], 'typing');
  });
 }
 test(`${mode}: direct mention cannot bypass the channel allowlist`, async () => {
  const f = fixture(legacy, { direct: true }); f.message.channelId = 'removed'; await f.onMessage(f.message); assert.deepEqual(f.events, []);
 });
 test(`${mode}: here-only messages remain silent`, async () => {
  const f = fixture(legacy, { everyone: true }); f.message.content = '@here What is the BTC price?'; await f.onMessage(f.message); assert.deepEqual(f.events, []);
 });
}
test('shipped channel replacement keeps all other four channels and disables auto activation', () => {
 assert.deepEqual(shipped.channels, ['1563288188863254528', '1541473880546484305', '1565605265330536560', '1522845015305486406', '1563541898558308382']);
 assert.equal(shipped.naturalLanguageCommands, false);
});

for (const legacy of [false, true]) test(`${legacy ? 'legacy' : 'agent'}: real Discord mention parser rejects mass tags but accepts a direct user tag`, async () => {
 const { Client, MessageMentions } = require('discord.js');
 const client = new Client({ intents: [] });
 const bot = client.users._add({ id: '123456789012345678', username: 'Bot', discriminator: '0', bot: true });
 try {
  for (const content of ['@everyone What is BTC price?', '@here What is BTC price?', `<@${bot.id}> What is BTC price?`, `<@!${bot.id}> @everyone What is BTC price?`]) {
   const direct = content.includes('<@'); const f = fixture(legacy);
   f.message.content = content;
   // The handler's bot identity is deliberately passed through resolve(), as Discord does.
   f.message.mentions = new MessageMentions({ client, guild: null, content }, direct ? [bot] : [], [], !direct || content.includes('@everyone'), null, null);
   const actual = f.message.mentions;
   f.message.mentions = { has: (_bot, options) => actual.has(bot, options) };
   await f.onMessage(f.message);
   assert.equal(f.events.includes('reply'), direct, content);
   if (!direct) assert.deepEqual(f.events, []);
  }
 } finally { await client.destroy(); }
});

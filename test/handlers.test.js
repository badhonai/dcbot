const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHandlers } = require('../src/discord/handlers');
const { HistoryStore } = require('../src/conversation/history-store');
const { ChannelQueue } = require('../src/conversation/channel-queue');
function fixture(respond = async () => 'answer') {
    const history = new HistoryStore(13);
    const queue = new ChannelQueue(10);
    const sent = [];
    const handlers = createHandlers({ client: { user: { id: 'bot' } }, config: { channels: ['a'], maxResponseLength: 1600 }, history, queue,
        ai: { respond }, logger: { error() {}, warn() {} } });
    const message = { id: 'user-message', channelId: 'a', author: { bot: false, displayName: 'Person' }, content: 'hello',
        mentions: { has: () => true }, channel: { sendTyping: async () => {} },
        reply: async payload => { sent.push(payload); return { id: `sent-${sent.length}` }; } };
    return { ...handlers, history, queue, message, sent };
}
test('mention replies disable mentions and record sent message IDs', async () => {
    const f = fixture(); await f.onMessage(f.message);
    assert.equal(f.sent[0].content, 'answer');
    assert.deepEqual(f.sent[0].allowedMentions.parse, []);
    assert.equal(f.history.removeByMessageId('a', 'sent-1'), true);
});
test('non-trigger messages enter context without an AI call', async () => {
    const f = fixture(async () => { throw new Error('should not run'); });
    f.message.mentions.has = () => false;
    await f.onMessage(f.message);
    assert.equal(f.sent.length, 0); assert.equal(f.history.get('a').length, 1);
});
test('bots and disallowed channels are ignored', async () => {
    const f = fixture(); f.message.channelId = 'b'; await f.onMessage(f.message);
    f.message.channelId = 'a'; f.message.author.bot = true; await f.onMessage(f.message);
    assert.equal(f.sent.length, 0); assert.deepEqual(f.history.get('a'), []);
});
test('provider errors never expose internal error messages or enter AI context', async () => {
    const f = fixture(async () => { throw new Error('secret-value'); });
    await f.onMessage(f.message);
    assert.ok(!f.sent[0].content.includes('secret-value'));
    assert.equal(f.history.get('a').length, 1);
});
test('send failures are contained', async () => {
    const f = fixture(); f.message.reply = async () => { throw new Error('missing permission'); };
    await assert.doesNotReject(f.onMessage(f.message));
});

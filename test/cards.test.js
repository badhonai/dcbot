const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EmbedBuilder } = require('discord.js');
const { HELP } = require('../src/discord/web3-handler');
const { PrivateReplies } = require('../src/discord/private-replies');
const { MarketService, compactMoney } = require('../src/features/market');
const { card, pages, relativeTime } = require('../src/utils/cards');
const { explain } = require('../src/features/glossary');
const serialize = value => JSON.stringify(value);
function validate(embed) {
    assert.doesNotThrow(() => new EmbedBuilder(embed).toJSON());
    const textSize = (embed.title?.length || 0) + (embed.description?.length || 0) + (embed.footer?.text.length || 0) + (embed.fields || []).reduce((n,f) => n + f.name.length + f.value.length, 0);
    assert.ok(textSize < 4000, 'Card must remain below the Discord 6000-character limit');
}
function interaction() {
    const edits = [];
    return { user: { id: 'owner' }, edits, editReply: async payload => edits.push(payload), deleteReply: async () => {} };
}
test('help uses three short cards instead of a wall of text', () => {
    assert.equal(HELP.pages.length, 3);
    for (const page of HELP.pages) { validate(page); assert.ok(serialize(page).length < 1100); }
    assert.match(serialize(HELP), /@mention replies are public/);
});
test('single-card replies show only Dismiss, no redundant navigation', async t => {
    const replies = new PrivateReplies(); t.after(() => replies.destroy());
    const i = interaction(); await replies.send(i, explain('gas'));
    assert.equal(i.edits[0].components[0].components.length, 1);
    assert.equal(i.edits[0].components[0].components[0].data.label, 'Dismiss');
    assert.equal(i.edits[0].content, ''); validate(i.edits[0].embeds[0]);
    assert.match(i.edits[0].embeds[0].footer.text, /Only you/);
});
test('multi-card results navigate whole cards without slicing records', async t => {
    const replies = new PrivateReplies(); t.after(() => replies.destroy());
    const i = interaction(); const id = await replies.send(i, pages(card('Pool A', 'first'), card('Pool B', 'second')));
    assert.ok(i.edits[0].content.length < 400);
    assert.equal(i.edits[0].components[0].components[0].data.label, 'More');
    await replies.onButton({ customId: `private:${id}:more`, user: i.user, deferUpdate: async () => {} });
    assert.equal(i.edits[1].embeds[0].title, 'Pool A');
    await replies.onButton({ customId: `private:${id}:next`, user: i.user, deferUpdate: async () => {} });
    assert.equal(i.edits[2].embeds[0].title, 'Pool B');
    assert.match(i.edits[2].embeds[0].footer.text, /2\/2/);
});
test('numbers and dates stay concise without inventing missing values', () => {
    assert.equal(compactMoney(1234567890), '$1.23B');
    assert.equal(compactMoney(null), 'N/A');
    assert.equal(relativeTime('invalid date'), 'Unknown');
    assert.equal(relativeTime('2026-10-24T10:00:00Z'), '<t:1792836000:R>');
});
test('each pool gets one complete card with source and contract', async () => {
    const address = '0x' + '1'.repeat(40);
    const data = [1,2,3].map(n => ({ baseToken: { address, symbol: 'TOKEN' }, quoteToken: { symbol: 'USD' }, dexId: 'dex', pairAddress: 'pool' + n, liquidity: { usd: n * 1000 } }));
    const result = await new MarketService({ get: async () => ({ data }) }).pair('ethereum', address);
    assert.equal(result.pages.length, 3);
    assert.match(result.pages[0].url, /pool3$/);
    for (const page of result.pages) { validate(page); assert.match(serialize(page), new RegExp(address)); }
});
test('recent-pool cards contain at most two complete entries per page', async () => {
    const result = await new MarketService({ get: async () => ({ data: { data: Array.from({ length: 8 }, (_,i) => ({ attributes: { name: 'Pool ' + i, address: 'pool' + i } })) } }) }).newpairs('base');
    assert.equal(result.pages.length, 4);
    for (const page of result.pages) { assert.equal(page.fields.length, 2); validate(page); assert.match(page.description, /Unverified/); }
});
test('oversized card input is bounded before it reaches Discord', () => {
    const result = card('a'.repeat(500), 'b'.repeat(5000), { fields: Array.from({ length: 20 }, () => ({ name: 'field', value: 'x'.repeat(2000) })), footer: 'c'.repeat(1000) });
    validate(result); assert.ok(result.title.length <= 180); assert.ok(result.fields.length <= 8);
});
test('missing Embed Links permission falls back to bounded private text', async t => {
    const replies = new PrivateReplies(); t.after(() => replies.destroy());
    const i = interaction(); i.appPermissions = { has: () => false };
    await replies.send(i, HELP);
    assert.equal(i.edits[0].embeds.length, 0);
    assert.match(i.edits[0].content, /All results are private/); assert.ok(i.edits[0].content.length < 2000);
});

test('slash picker descriptions are short and network/term options use dropdowns', () => {
    const { commands } = require('../src/discord/commands');
    for (const command of commands) assert.ok(command.description.length <= 40);
    for (const name of ['pair', 'newpairs']) assert.equal(commands.find(c => c.name === name).options.find(o => o.name === 'chain').choices.length, 8);
    assert.equal(commands.find(c => c.name === 'explain').options[0].choices.length, 8);
});

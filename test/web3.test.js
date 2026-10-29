const { MessageFlags } = require('discord.js');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { PublicApi } = require('../src/integrations/public-api');
const { MarketService, money, addressFor } = require('../src/features/market');
const { KnowledgeService } = require('../src/features/knowledge');
const { PrivateReplies } = require('../src/discord/private-replies');
const { createWeb3Handler } = require('../src/discord/web3-handler');
const { commands } = require('../src/discord/commands');
const textOf = value => JSON.stringify(value);
const { explain } = require('../src/features/glossary');

test('nineteen community/information commands; no moderation command', () => {
    assert.deepEqual(commands.map(c => c.name), ['start','stop','chat','search','read','help','ask','official','price','pair','newpairs','explain','coin','compare','trending','x','news','fun','answer']);
});
test('public requests coalesce and cache; arbitrary hosts are rejected', async () => {
    let calls = 0;
    const api = new PublicApi({ fetchFn: async () => { calls++; return { ok: true, json: async () => ({ value: 42 }) }; } });
    const url = 'https://api.coinpaprika.com/v1/tickers/btc-bitcoin';
    const results = await Promise.all([api.get(url), api.get(url)]);
    assert.deepEqual(results[0], results[1]); await api.get(url);
    assert.equal(calls, 1);
    await assert.rejects(api.get('https://evil.example/'), /Unsupported provider/);
});
test('429 failures start a provider cooldown and do not enter cache', async () => {
    const api = new PublicApi({ fetchFn: async () => ({ ok: false, status: 429 }) });
    const url = 'https://api.coinpaprika.com/v1/coins';
    await assert.rejects(api.get(url), /rate limited/);
    await assert.rejects(api.get(url), /Provider busy/);
    assert.equal(api.cache.size, 0);
});
test('price ID returns deterministic provider values, attribution and timestamps', async () => {
    const service = new MarketService({ get: async () => ({ fetchedAt: '2026-10-24T10:00:00Z', data: { id: 'btc-bitcoin', name: 'Bitcoin', symbol: 'BTC', last_updated: 'then', quotes: { USD: { price: 100, market_cap: 1000 } } } }) });
    const result = await service.price('btc-bitcoin', { mode: 'market' });
    assert.match(textOf(result), /\$100/); assert.match(result.pages[0].url, /coinpaprika/); assert.equal(result.pages[0].timestamp, '2026-10-24T10:00:00.000Z');
});
test('ambiguous symbols return IDs instead of guessing a token', async () => {
    const service = new MarketService({ get: async () => ({ data: { currencies: [
        { id: 'foo-one', name: 'One', symbol: 'FOO', is_active: true }, { id: 'foo-two', name: 'Two', symbol: 'FOO', is_active: true },
    ] } }) });
    assert.match(textOf(await service.price('foo', { mode: 'market' })), /Multiple matches/);
});
test('unique symbol resolves to a ticker automatically', async () => {
    const urls = [];
    const service = new MarketService({ get: async url => {
        urls.push(url);
        return url.includes('/search') ? { data: { currencies: [{ id: 'btc-bitcoin', symbol: 'BTC', is_active: true }] } } :
            { data: { name: 'Bitcoin', quotes: { USD: { price: 1 } } } };
    } });
    assert.match(textOf(await service.price('BTC', { mode: 'market' })), /Bitcoin/); assert.equal(urls.length, 2);
});
test('unknown chains and malformed addresses are rejected before any request', async () => {
    const service = new MarketService({ get: () => { throw new Error('should not fetch'); } });
    await assert.rejects(service.pair('unknown', '0x123'), /Unsupported chain/);
    await assert.rejects(service.pair('ethereum', '0x123'), /Invalid token address/);
    assert.throws(() => addressFor('solana', '0x000'), /Invalid token/);
    assert.equal(money(null), 'N/A'); assert.equal(money('garbage'), 'N/A');
});
test('new pools are explicitly not endorsed projects', async () => {
    const service = new MarketService({ get: async () => ({ fetchedAt: 'now', data: { data: [{ attributes: { name: '@everyone *FAKE*', address: 'abc', reserve_in_usd: null } }] } }) });
    const text = await service.newpairs('ethereum');
    assert.match(textOf(text), /Unverified pools/); assert.match(textOf(text), /N\/A/); assert.ok(!textOf(text).includes('@everyone'));
});
test('knowledge requires configured sources and returns cited excerpts, not guesses', t => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dcbot-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    fs.writeFileSync(path.join(dir, 'doc.md'), 'Staking tokens requires a seven-day lock.\n\nUnrelated paragraph.');
    fs.writeFileSync(path.join(dir, 'projects.json'), JSON.stringify([{ id: 'demo', name: 'Demo', links: [{ label: 'Docs', url: 'https://example.com/docs' }], documents: [{ file: 'doc.md', source: 'https://example.com/docs', updatedAt: '2026-10-24' }] }]));
    const knowledge = new KnowledgeService(dir);
    assert.match(textOf(knowledge.ask(null, 'staking')), /seven-day/);
    assert.match(textOf(knowledge.ask('demo', 'staking')), /https:\/\/example.com\/docs/);
    assert.match(textOf(knowledge.ask('demo', 'unicorn')), /No matching passage/);
    assert.match(textOf(knowledge.official()), /Owner-approved/);
    assert.throws(() => knowledge.select('absent'), /Choose a project/);
});
test('default knowledge never pretends to know an unconfigured project', () => {
    const knowledge = new KnowledgeService(path.resolve(__dirname, '../knowledge'));
    assert.throws(() => knowledge.ask(null, 'tokenomics'), /No approved/);
});
test('curated glossary needs no model or external API', () => {
    assert.match(textOf(explain('market-cap')), /circulating supply/);
    assert.match(textOf(explain('unknown')), /Choose a term/);
});
function interaction(name = 'help', user = 'u') {
    const events = [];
    return { commandName: name, user: { id: user }, channelId: 'allowed', events,
        isChatInputCommand: () => true, isButton: () => false,
        options: { getString: () => 'btc-bitcoin' },
        deferReply: async function (payload) { this.deferred = true; events.push(['defer', payload]); },
        editReply: async payload => events.push(['edit', payload]),
        deleteReply: async () => events.push(['delete']),
        reply: async payload => events.push(['reply', payload]),
    };
}
test('private results paginate below Discord size limit and enforce owner', async t => {
    const replies = new PrivateReplies(); t.after(() => replies.destroy());
    const i = interaction(); const id = await replies.send(i, 'x'.repeat(6000));
    assert.ok(i.events[0][1].content.length < 400);
    await replies.onButton({ customId: `private:${id}:more`, user: i.user, deferUpdate: async () => {} });
    assert.ok(i.events[1][1].embeds[0].description.length <= 900);
    let denied;
    await replies.onButton({ customId: `private:${id}:next`, user: { id: 'other' }, reply: async p => { denied = p; } });
    assert.equal(denied.flags, MessageFlags.Ephemeral); assert.equal(replies.sessions.get(id).page, 0);
    await replies.onButton({ customId: `private:${id}:next`, user: i.user, deferUpdate: async () => {} });
    assert.equal(replies.sessions.get(id).page, 1);
    await replies.onButton({ customId: `private:${id}:close`, user: i.user, deferUpdate: async () => {} });
    assert.equal(replies.sessions.size, 0); assert.equal(i.events.at(-1)[0], 'delete');
});
test('private replies expire and attempt deletion', async t => {
    const replies = new PrivateReplies({ ttlMs: 10 }); t.after(() => replies.destroy());
    const i = interaction(); await replies.send(i, 'test');
    await new Promise(resolve => setTimeout(resolve, 25));
    assert.equal(replies.sessions.size, 0); assert.equal(i.events.at(-1)[0], 'delete');
});
test('help is deferred privately before result, with no public sends', async t => {
    const replies = new PrivateReplies(); t.after(() => replies.destroy());
    const handler = createWeb3Handler({ config: { channels: ['allowed'] }, replies, market: {}, knowledge: {} });
    const i = interaction(); await handler(i);
    assert.equal(i.events[0][0], 'defer'); assert.equal(i.events[0][1].flags, MessageFlags.Ephemeral);
    assert.ok(i.events[1][1].content.length < 400);
    assert.match(i.events[1][1].content, /All results are private/);
});
test('command failures remain private and never expose raw internals', async t => {
    const replies = new PrivateReplies(); t.after(() => replies.destroy());
    const handler = createWeb3Handler({ config: { channels: ['allowed'] }, replies, market: { price: async () => { throw new Error('secret-token'); } }, knowledge: {}, logger: { error() {} } });
    const i = interaction('price'); await handler(i);
    assert.equal(i.events[0][1].flags, MessageFlags.Ephemeral);
    assert.ok(!textOf(i.events[1][1]).includes('secret-token'));
    assert.equal(i.events[1][1].embeds[0].title, "Couldn't complete request");
});
test('rapid repeat commands get a private cooldown reply', async () => {
    const results = [];
    const handler = createWeb3Handler({ config: { channels: ['allowed'] }, replies: { send: async (_, text) => results.push(text) }, market: {}, knowledge: {} });
    await handler(interaction()); await handler(interaction());
    assert.match(textOf(results[1]), /cooldown/);
});

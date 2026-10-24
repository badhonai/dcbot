const { test } = require('node:test');
const assert = require('node:assert/strict');
const { GuildCommandSync, signature, discoverGuildIds } = require('../src/discord/command-sync');
const { commands } = require('../src/discord/commands');
const quiet = { debug() {}, info() {}, warn() {}, error() {} };
const APP = '123456789012345678';
const GUILD_A = '234567890123456789';
const GUILD_B = '345678901234567890';
function fixture(get = async () => []) {
    const calls = [];
    const sync = new GuildCommandSync({ commands, logger: quiet, rest: {
        get: async (...args) => { calls.push(['get', ...args]); return get(...args); },
        put: async (...args) => { calls.push(['put', ...args]); return commands; },
    } });
    return { sync, calls };
}
test('registers every unique server, not just a single configured ID', async () => {
    const { sync, calls } = fixture();
    const result = await sync.syncAll(APP, [GUILD_A, GUILD_B, GUILD_A]);
    assert.equal(result.servers, 2); assert.equal(result.updated, 2);
    assert.equal(calls.filter(call => call[0] === 'put').length, 2);
    assert.match(calls[1][1], new RegExp(`/guilds/${GUILD_A}/commands$`));
    assert.match(calls[3][1], new RegExp(`/guilds/${GUILD_B}/commands$`));
});
test('skips unchanged commands despite Discord-added IDs and default fields', async () => {
    const remote = commands.map(c => ({ ...c, id: 'remote', application_id: APP, version: '1', type: 1, nsfw: false, default_member_permissions: null,
        options: c.options?.map(o => ({ ...o, required: o.required ?? false, autocomplete: false, ...(o.choices ? { choices: o.choices.map(c => ({ ...c, name_localizations: null })) } : {}) })) }));
    const { sync, calls } = fixture(async () => remote.reverse());
    const result = await sync.syncGuild(APP, GUILD_A);
    assert.equal(result.status, 'unchanged'); assert.equal(calls.length, 1);
});
test('description and option changes are detected', () => {
    const changed = structuredClone(commands); changed[0].description = 'Updated help';
    assert.notEqual(signature(changed), signature(commands));
    const options = structuredClone(commands); options.find(c => c.name === 'price').options[0].max_length = 400;
    assert.notEqual(signature(options), signature(commands));
});
test('one inaccessible server does not prevent registration in other servers', async () => {
    const { sync } = fixture(async route => { if (route.includes(GUILD_A)) throw Object.assign(new Error('forbidden'), { status: 403 }); return []; });
    const result = await sync.syncAll(APP, [GUILD_A, GUILD_B]);
    assert.equal(result.failed, 1); assert.equal(result.updated, 1);
});
test('concurrent startup and join events share one server registration', async () => {
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const { sync, calls } = fixture(async () => { await gate; return []; });
    const first = sync.syncGuild(APP, GUILD_A); const second = sync.syncGuild(APP, GUILD_A);
    assert.equal(first, second); release(); await Promise.all([first, second]);
    assert.equal(calls.filter(c => c[0] === 'put').length, 1);
});
test('stop drains active work and prevents further registrations', async () => {
    const { sync, calls } = fixture();
    const active = sync.syncGuild(APP, GUILD_A); await sync.stop(); await active;
    const before = calls.length;
    assert.equal((await sync.syncGuild(APP, GUILD_B)).status, 'skipped'); assert.equal(calls.length, before);
});
test('obsolete commands are replaced in this application guild set', async () => {
    const { sync, calls } = fixture(async () => [{ name: 'uns', description: 'Old command' }]);
    await sync.syncGuild(APP, GUILD_A);
    const written = calls.find(c => c[0] === 'put')[2].body;
    assert.equal(written.length, 7); assert.ok(!written.some(c => c.name === 'uns'));
});
test('manual discovery pages past 200 bot servers', async () => {
    const queries = [];
    const page = Array.from({ length: 200 }, (_, i) => ({ id: String(100000000000000000n + BigInt(i)) }));
    const ids = await discoverGuildIds({ get: async (_, { query }) => { queries.push(query); return queries.length === 1 ? page : [{ id: GUILD_B }]; } });
    assert.equal(ids.length, 201); assert.equal(queries[1].get('after'), page[199].id);
});
test('empty bot server list is handled without writes', async () => {
    assert.deepEqual(await discoverGuildIds({ get: async () => [] }), []);
    const { sync, calls } = fixture(); assert.equal((await sync.syncAll(APP, [])).servers, 0); assert.equal(calls.length, 0);
});

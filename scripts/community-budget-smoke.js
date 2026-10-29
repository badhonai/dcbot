// Offline synthetic regression check, NOT a benchmark of real Discord traffic.
const fs = require('node:fs');
const path = require('node:path');
const { Client, Options } = require('discord.js');
require('../src/ai/provider-client');
require('../src/ai/agent');
require('../src/discord/web3-handler');
require('../src/features/community-market');
const { SessionMemory } = require('../src/ai/session-memory');
const { PublicApi } = require('../src/integrations/public-api');
const quiet = { debug() {}, info() {}, warn() {} };
(async () => {
    const client = new Client({ intents: [], makeCache: Options.cacheWithLimits({ ...Options.DefaultMakeCacheSettings, MessageManager: 0, PresenceManager: 0, GuildMemberManager: { maxSize: 20 }, UserManager: { maxSize: 100 } }) });
    const memory = new SessionMemory();
    for (let i = 0; i < 2000; i++) memory.append(`synthetic-${Math.floor(i / 10)}`, { user: `${i}:` + 'q'.repeat(2800), answer: 'a'.repeat(3500), tools: [{ tool: 'synthetic', result: 'r'.repeat(400) }] });
    let now = 0;
    const api = new PublicApi({ now: () => now, logger: quiet, fetchFn: async () => new Response(JSON.stringify({ text: 'x'.repeat(96000) })) });
    for (let i = 0; i < 100; i++) { await api.get(`https://api.coingecko.com/synthetic-${i}`, 3600000); now += 3000; }
    global.gc?.();
    const report = { checkedAt: new Date().toISOString(), node: process.version, profile: 'Offline synthetic store stress, imported production libraries, no gateway connection or live AI/network workload', rssMb: Math.round(process.memoryUsage().rss / 1048576), peakRssMb: Math.round(process.resourceUsage().maxRSS / 1024), heapUsedMb: Math.round(process.memoryUsage().heapUsed / 1048576), historyChars: memory.chars, retainedSessions: memory.sessions.size, cacheBytes: api.cacheBytes, cacheEntries: api.cache.size, limitsPassed: memory.chars <= 2000000 && api.cacheBytes <= 4194304, note: 'Not a 256 MB host guarantee. Actual guilds, traffic, OS, TLS and hosting agents need deployment monitoring.' };
    console.log(JSON.stringify(report, null, 2));
    if (process.env.WRITE_BUDGET_REPORT === 'true') fs.writeFileSync(path.resolve(__dirname, '../docs/community-budget-smoke.json'), JSON.stringify(report, null, 2) + '\n');
    await client.destroy();
    if (!report.limitsPassed) process.exitCode = 1;
})().catch(() => { console.error('Budget smoke failed; no credentials or chat content were printed.'); process.exitCode = 1; });

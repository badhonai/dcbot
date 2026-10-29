const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { Client, GatewayIntentBits, Events } = require('discord.js');
const { createModelClient } = require('./ai/provider-client');
const { loadConfig } = require('./config');
const { ChannelQueue } = require('./conversation/channel-queue');
const { Actions } = require('./features/actions');
const { createAgent } = require('./ai/agent');
const { WebService } = require('./features/web');
const { createHandlers } = require('./discord/handlers');
const { PublicApi } = require('./integrations/public-api');
const { MarketService } = require('./features/market');
const { KnowledgeService } = require('./features/knowledge');
const { ChatBoundaries } = require('./preferences/chat-boundaries');
const { ReplyPreferences } = require('./preferences/reply-preferences');
const { PublicControls } = require('./discord/public-controls');
const { PrivateReplies } = require('./discord/private-replies');
const { createWeb3Handler } = require('./discord/web3-handler');
const { commands } = require('./discord/commands');
const { GuildCommandSync } = require('./discord/command-sync');
const { readDemoKey, checkPrice, checkAi } = require('./diagnostics/checks');
const { healthPort, createHealthServer } = require('./diagnostics/health-server');
const { createLogger, errorDetails } = require('./utils/logger');
const log = createLogger('app');

async function main() {
    log.info('Starting Web3 assistant', { date: new Date().toISOString().slice(0, 10) + ' UTC', node: process.version });
    const config = loadConfig();
    const knowledge = new KnowledgeService(path.resolve(__dirname, '../knowledge'));
    log.info('Settings ready', { channels: config.channels.length, aiChat: config.ollamaApiKey || config.groqApiKey ? 'enabled' : 'disabled', projects: knowledge.projects.length });
    if (!knowledge.projects.length) log.info('Project docs not added yet', { setup: 'knowledge/projects.json' });
    const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
    const commandSync = new GuildCommandSync({ rest: client.rest, commands, logger: log.child('command-sync') });
    const queue = new ChannelQueue(config.maxPendingPerChannel);
    const preferences = new ReplyPreferences(path.resolve(__dirname, '../data/reply-preferences.json'));
    const boundaries = new ChatBoundaries(path.resolve(__dirname, '../data/chat-boundaries.json'));
    const replies = new PrivateReplies({ preferences });
    const demoKey = readDemoKey();
    const publicApi = new PublicApi({ logger: log.child('market-api'), coingeckoApiKey: demoKey });
    const market = new MarketService(publicApi);
    const web = new WebService({ apiKey: config.ollamaApiKey });
    const actions = new Actions({ market, knowledge, web });
    const controls = new PublicControls({ preferences, actions, boundaries, logger: log.child('controls') });
    const modelClient = createModelClient(config, { logger: log.child('ai') });
    const health = createHealthServer({ checkPrice: () => checkPrice(publicApi, { key: demoKey }), checkAi: () => checkAi(modelClient), discordReady: () => client.isReady(), logger: log.child('health') });
    if (process.env.HEALTH_ENABLED !== 'false') {
        const address = await health.start({ port: healthPort(), intervalMinutes: Number(process.env.HEALTH_PROBE_INTERVAL_MINUTES || 0), testAi: process.env.HEALTH_CHECK_AI !== 'false' });
        log.info('Health endpoint ready', { port: address.port, coinGeckoAuth: demoKey ? 'demo-key' : 'keyless', hint: 'GET /diagnostics · No API keys or chat content exposed' });
    }
    const agent = createAgent({ client: modelClient, actions, config, logger: log.child('agent') });
    const onInteraction = createWeb3Handler({ config, replies, actions, market, knowledge, agent, preferences, controls, boundaries, logger: log.child('commands') });
    const handlers = createHandlers({ client, config, queue, agent, preferences, controls, boundaries, logger: log.child('chat') });
    client.once(Events.ClientReady, () => {
        log.info('Connected to Discord', { bot: client.user.tag, guilds: client.guilds.cache.size, slashReplies: 'private' });
        commandSync.syncAll(client.user.id, client.guilds.cache.keys()).catch(error => {
            log.error('Command sync interrupted', errorDetails(error));
        });
    });
    const onGuildCreate = guild => {
        if (guild.available === false) return;
        commandSync.syncGuild(client.user.id, guild.id).catch(error => log.error('New server command sync failed', errorDetails(error)));
    };
    client.on(Events.GuildCreate, onGuildCreate);
    client.on('messageCreate', handlers.onMessage);
    client.on('interactionCreate', onInteraction);
    client.on('error', error => log.error('Discord client error', errorDetails(error)));
    client.on('shardReconnecting', shard => log.warn('Discord reconnecting', { shard }));
    client.on('shardResume', shard => log.info('Discord connection resumed', { shard }));
    let stopping = false;
    async function shutdown(signal) {
        if (stopping) return;
        stopping = true;
        log.info('Shutdown requested', { signal, pendingChannels: queue.channels.size });
        client.off(Events.GuildCreate, onGuildCreate);
        client.off('messageCreate', handlers.onMessage);
        client.off('interactionCreate', onInteraction);
        const deadline = setTimeout(() => {
            log.error('Shutdown deadline exceeded', { timeoutMs: 15000, hint: 'Pending work was interrupted' });
            replies.destroy(); client.destroy(); process.exit(1);
        }, 15000);
        deadline.unref();
        try {
            await Promise.all([queue.drain(), commandSync.stop(), health.stop()]); replies.destroy(); client.destroy();
            log.info('Shutdown complete');
        } catch (error) {
            log.error('Shutdown failed', errorDetails(error)); process.exitCode = 1;
        } finally { clearTimeout(deadline); }
    }
    process.once('SIGTERM', () => shutdown('SIGTERM'));
    process.once('SIGINT', () => shutdown('SIGINT'));
    log.debug('Connecting to Discord');
    try { await client.login(config.discordToken); }
    catch (error) { await health.stop(); replies.destroy(); client.destroy(); throw error; }
}
main().catch(error => {
    log.error('Startup failed', errorDetails(error));
    log.error('Setup required', { hint: 'Check .env, config.json and knowledge files; see README.md' });
    process.exitCode = 1;
});

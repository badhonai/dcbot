const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { Client, GatewayIntentBits, Events } = require('discord.js');
const Groq = require('groq-sdk');
const { loadConfig } = require('./config');
const { HistoryStore } = require('./conversation/history-store');
const { ChannelQueue } = require('./conversation/channel-queue');
const { createAiService } = require('./ai/groq-service');
const { createHandlers } = require('./discord/handlers');
const { PublicApi } = require('./integrations/public-api');
const { MarketService } = require('./features/market');
const { KnowledgeService } = require('./features/knowledge');
const { PrivateReplies } = require('./discord/private-replies');
const { createWeb3Handler } = require('./discord/web3-handler');
const { createLogger, errorDetails } = require('./utils/logger');
const log = createLogger('app');

async function main() {
    log.info('Starting Web3 assistant', { date: new Date().toISOString().slice(0, 10) + ' UTC', node: process.version });
    const config = loadConfig();
    const knowledge = new KnowledgeService(path.resolve(__dirname, '../knowledge'));
    log.info('Settings ready', { channels: config.channels.length, aiChat: config.groqApiKey ? 'enabled' : 'disabled', projects: knowledge.projects.length });
    if (!knowledge.projects.length) log.info('Project docs not added yet', { setup: 'knowledge/projects.json' });
    const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
    const queue = new ChannelQueue(config.maxPendingPerChannel);
    const replies = new PrivateReplies();
    const onInteraction = createWeb3Handler({ config, replies, logger: log.child('commands'),
        market: new MarketService(new PublicApi({ logger: log.child('market-api') })), knowledge });
    const handlers = createHandlers({ client, config, queue, logger: log.child('chat'),
        history: new HistoryStore(config.historyLength),
        ai: config.groqApiKey ? createAiService(new Groq({ apiKey: config.groqApiKey, timeout: config.requestTimeoutMs, maxRetries: 1 }), config)
            : { respond: async () => 'AI chat is not configured. Use /help for private Web3 commands.' } });
    client.once(Events.ClientReady, () => log.info('Online and ready', { bot: client.user.tag, guilds: client.guilds.cache.size, commands: 7, slashReplies: 'private' }));
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
        client.off('messageCreate', handlers.onMessage);
        client.off('interactionCreate', onInteraction);
        const deadline = setTimeout(() => {
            log.error('Shutdown deadline exceeded', { timeoutMs: 15000, hint: 'Pending work was interrupted' });
            replies.destroy(); client.destroy(); process.exit(1);
        }, 15000);
        deadline.unref();
        try {
            await queue.drain(); replies.destroy(); client.destroy();
            log.info('Shutdown complete');
        } catch (error) {
            log.error('Shutdown failed', errorDetails(error)); process.exitCode = 1;
        } finally { clearTimeout(deadline); }
    }
    process.once('SIGTERM', () => shutdown('SIGTERM'));
    process.once('SIGINT', () => shutdown('SIGINT'));
    log.debug('Connecting to Discord');
    try { await client.login(config.discordToken); }
    catch (error) { replies.destroy(); client.destroy(); throw error; }
}
main().catch(error => {
    log.error('Startup failed', errorDetails(error));
    log.error('Setup required', { hint: 'Check .env, config.json and knowledge files; see README.md' });
    process.exitCode = 1;
});

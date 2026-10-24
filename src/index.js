const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { Client, GatewayIntentBits } = require('discord.js');
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

async function main() {
    const config = loadConfig();
    const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
    const queue = new ChannelQueue(config.maxPendingPerChannel);
    const replies = new PrivateReplies();
    const onInteraction = createWeb3Handler({ config, replies,
        market: new MarketService(new PublicApi()),
        knowledge: new KnowledgeService(path.resolve(__dirname, '../knowledge')) });
    const handlers = createHandlers({ client, config, queue,
        history: new HistoryStore(config.historyLength),
        ai: config.groqApiKey ? createAiService(new Groq({ apiKey: config.groqApiKey, timeout: config.requestTimeoutMs, maxRetries: 1 }), config)
            : { respond: async () => 'AI chat is not configured. Use /help for private Web3 commands.' } });
    client.once('ready', () => console.info(`Logged in as ${client.user.tag}; ${config.channels.length} allowed channels`));
    client.on('messageCreate', handlers.onMessage);
    client.on('interactionCreate', onInteraction);
    client.on('error', error => console.error('Discord client error', { name: error.name }));
    let stopping = false;
    async function shutdown() {
        if (stopping) return;
        stopping = true;
        client.off('messageCreate', handlers.onMessage);
        client.off('interactionCreate', onInteraction);
        const deadline = setTimeout(() => { client.destroy(); process.exit(1); }, 15000);
        deadline.unref();
        await queue.drain();
        replies.destroy();
        client.destroy();
        clearTimeout(deadline);
    }
    process.once('SIGTERM', shutdown);
    process.once('SIGINT', shutdown);
    await client.login(config.discordToken);
}
main().catch(error => {
    console.error('Startup failed:', error.message);
    process.exitCode = 1;
});

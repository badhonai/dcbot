const { MessageFlags } = require('discord.js');
const { createLogger, errorDetails } = require('../utils/logger');
const { explain } = require('../features/glossary');
const HELP = `**Web3 assistant — help**
All slash-command results are private to you. Long results have Previous/Next buttons. Dismiss anytime; automatic deletion is attempted after 10 minutes while the bot is running.

**Project knowledge**
• /ask question:<question> project:<optional ID> — matching excerpts from curator-approved local documents, with sources and review dates. No invented project facts.
• /official project:<optional ID> — curator-approved links.

**Market data — no paid API key**
• /price token:BTC — latest available USD quote. Ambiguous symbols return exact IDs to choose from.
• /price token:btc-bitcoin — look up an exact CoinPaprika ID.
• /pair chain:ethereum address:<token contract> — up to five base-token pools ranked by liquidity. This takes a TOKEN address, not a pool address.
• /newpairs chain:solana — up to eight recently created pools from GeckoTerminal; not verified new projects or a complete launch feed.

**Learn**
• /explain term:slippage — curated Web3 glossary.
• /help — this guide.

**Chains**
ethereum, solana, base, bsc, arbitrum, polygon, optimism, avalanche

**Privacy and limits**
Slash questions do not enter channel conversation history. Market queries go to CoinPaprika, DEX Screener or GeckoTerminal. No wallet connection, trading, moderation or admin powers. Cached quotes can be delayed; providers have rate limits and may be unavailable. New pools can be scams. Not financial advice.

Normal @mention/reply conversations remain PUBLIC and use Groq when configured; Discord cannot make ordinary message replies ephemeral. For private information, use slash commands. The bot currently observes allowed-channel messages for public chat context.`;
function createWeb3Handler({ config, market, knowledge, replies, logger = createLogger('commands') }) {
    const cooldowns = new Map(); let active = 0;
    return async function onInteraction(interaction) {
        try {
            if (interaction.isButton?.() && interaction.customId.startsWith('private:')) {
                await replies.onButton(interaction); return;
            }
            if (!interaction.isChatInputCommand()) return;
            if (!['help','ask','official','price','pair','newpairs','explain'].includes(interaction.commandName)) return;
            if (!config.channels.includes(interaction.channelId)) {
                await interaction.reply({ content: 'Commands are enabled only in configured bot channels.', flags: MessageFlags.Ephemeral }); return;
            }
            // Acknowledge privately BEFORE external work. Every result/error stays on this interaction.
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const now = Date.now(); const user = interaction.user.id;
            if ((cooldowns.get(user) || 0) > now || active >= 3) {
                await replies.send(interaction, 'Bot busy or command cooldown active. Please try again in a few seconds.'); return;
            }
            if (cooldowns.size >= 1000) {
                for (const [id, until] of cooldowns) if (until <= now) cooldowns.delete(id);
                if (cooldowns.size >= 1000) cooldowns.delete(cooldowns.keys().next().value);
            }
            cooldowns.set(user, now + 5000); active++;
            const started = Date.now();
            try {
                const option = name => interaction.options.getString(name);
                let result;
                switch (interaction.commandName) {
                    case 'help': result = HELP; break;
                    case 'ask': result = knowledge.ask(option('project'), option('question')); break;
                    case 'official': result = knowledge.official(option('project')); break;
                    case 'price': result = await market.price(option('token')); break;
                    case 'pair': result = await market.pair(option('chain'), option('address')); break;
                    case 'newpairs': result = await market.newpairs(option('chain')); break;
                    case 'explain': result = explain(option('term')); break;
                }
                await replies.send(interaction, result);
                logger.debug?.('Command completed', { command: interaction.commandName, durationMs: Date.now() - started });
            } finally { active--; }
        } catch (error) {
            // Only explicitly approved user-facing failures are safe to disclose.
            const safe = /^(Unsupported chain|Invalid token address|Use a token name|No USD quote|Provider busy|Data provider unavailable|Choose a project|No approved project knowledge)/.test(error.message);
            const expectedInput = /^(Unsupported chain|Invalid token address|Use a token name|No USD quote|Choose a project|No approved project knowledge)/.test(error.message);
            if (expectedInput) logger.debug?.('Command needs different input or project setup', { command: interaction.commandName });
            else logger.error('Private command failed', { command: interaction.commandName, ...errorDetails(error) });
            const content = safe ? error.message : 'Could not complete that request. The data service may be unavailable; please try again later.';
            try {
                if (interaction.deferred || interaction.replied) await interaction.editReply({ content, components: [], allowedMentions: { parse: [] } });
                else await interaction.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
            } catch { /* Expired interaction or lost channel access. Never fall back to a public message. */ }
        }
    };
}
module.exports = { createWeb3Handler, HELP };

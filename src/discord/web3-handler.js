const { MessageFlags } = require('discord.js');
const { createLogger, errorDetails } = require('../utils/logger');
const { SPECS } = require('../features/actions');
const { explain } = require('../features/glossary');
const { card, pages, notice } = require('../utils/cards');
const HELP = pages(
    card('Command guide', 'Choose a command below. All results are private.', { fields: [
        { name: 'Markets', value: '`/price` Fresh exchange quote\n`/pair` Pools & liquidity\n`/newpairs` Recent pools (unverified)' },
        { name: 'Project & learning', value: '`/ask` Search approved docs\n`/official` Project links\n`/explain` Web3 glossary' },
        { name: 'Try it', value: '`/price token:BTC`\n`/explain term:slippage`' },
    ] }),
    card('Good to know', '', { fields: [
        { name: 'Privacy', value: 'Slash results: only you. Dismiss anytime. Auto-deletion is best effort while online.\nNormal @mention replies are public.' },
        { name: 'Networks', value: 'Ethereum · Solana · Base · BSC\nArbitrum · Polygon · Optimism · Avalanche' },
        { name: 'Sources & limits', value: 'CoinPaprika · DEX Screener · GeckoTerminal. Live quotes: Coinbase Exchange. Other data may lag.\nProject docs are owner-approved. No trading, wallet access or moderation. Pools are not safety-checked.' },
    ] }),
);
function createWeb3Handler({ config, market, knowledge, replies, actions, logger = createLogger('commands') }) {
    const cooldowns = new Map(); let active = 0;
    return async function onInteraction(interaction) {
        try {
            if (interaction.isButton?.() && interaction.customId.startsWith('private:')) {
                await replies.onButton(interaction); return;
            }
            if (!interaction.isChatInputCommand()) return;
            if (!['help','ask','official','price','pair','newpairs','explain'].includes(interaction.commandName)) return;
            // Acknowledge privately BEFORE external work. Every result/error stays on this interaction.
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            if (!config.channels.includes(interaction.channelId)) {
                await replies.send(interaction, notice('Use a bot channel', 'Commands are enabled in the configured channels only.')); return;
            }
            const now = Date.now(); const user = interaction.user.id;
            if ((cooldowns.get(user) || 0) > now || active >= 3) {
                await replies.send(interaction, notice('One moment', 'Bot busy or cooldown active. Try again in a few seconds.')); return;
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
                if (actions && interaction.commandName !== 'help') {
                    const args = Object.fromEntries(Object.keys(SPECS[interaction.commandName].properties).map(name => [name, option(name)]).filter(([, value]) => value));
                    result = await actions.execute({ command: interaction.commandName, args });
                } else switch (interaction.commandName) {
                    case 'help': result = HELP; break;
                    case 'ask': result = knowledge.ask(option('project'), option('question')); break;
                    case 'official': result = knowledge.official(option('project')); break;
                    case 'price': result = await market.price(option('token'), { mode: option('mode') || 'live' }); break;
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
            const content = safe ? error.message : 'The service is unavailable. Please try again shortly.';
            const response = notice('Couldn’t complete request', content);
            try {
                if (interaction.deferred || interaction.replied) await replies.send(interaction, response);
                else await interaction.reply({ embeds: response.pages, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
            } catch { /* Expired interaction or lost channel access. Never fall back to a public message. */ }
        }
    };
}
module.exports = { createWeb3Handler, HELP };

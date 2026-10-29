const { wantsLinks } = require('../conversation/reply-presentation');
const { localizeFixed } = require('../conversation/language');
const { discordProfile } = require('../conversation/personality');
const { replyClean } = require('../utils/clean-output');
const { MessageFlags } = require('discord.js');
const { createLogger, errorDetails } = require('../utils/logger');
const { SPECS } = require('../features/actions');
const COMMAND_NAMES = new Set(require('./commands').commands.map(c => c.name));
const { explain } = require('../features/glossary');
const { card, pages, notice, clip } = require('../utils/cards');
const HELP = pages(
    card('Command guide', 'Choose a command below. All results are private.', { fields: [
        { name: 'AI & web', value: '`/chat` Ask or give a small task\n`/search` Search with sources\n`/read` Read a webpage' },
        { name: 'Markets', value: '`/price` Recent CoinGecko quote\n`/pair` Pools & liquidity\n`/newpairs` Recent pools (unverified)' },
        { name: 'Project & learning', value: '`/ask` Search approved docs\n`/official` Project links\n`/explain` Web3 glossary' },
        { name: 'Your replies', value: '`/stop` Mute automatic replies to you\n`/start` Turn them back on' },
        { name: 'Try it', value: '`/price token:BTC`\n`/explain term:slippage`' },
    ] }),
    card('Community tools', 'Research and games, without personal profiles.', { fields: [
        { name: 'Community research', value: '`/coin` Token fundamentals\n`/compare` 2–4 token USDT comparison\n`/trending` Search interest\n`/news` Crypto news\n`/x` Public X evidence, not full timelines' },
        { name: 'Community fun', value: '`/fun` Quiz, riddle, fact, icebreaker or debate\n`/answer` Check an attempt using its question ID\nNo scores, gambling, profiles or automatic posts' },
    ] }),
    card('Good to know', '', { fields: [
        { name: 'Privacy', value: 'Slash results: only you. Dismiss anytime. Auto-deletion is best effort while online.\nNormal @mention replies are public.' },
        { name: 'Networks', value: 'Ethereum · Solana · Base · BSC\nArbitrum · Polygon · Optimism · Avalanche' },
        { name: 'Sources & limits', value: 'CoinPaprika · DEX Screener · GeckoTerminal. Quotes: CoinGecko (free API ~60s updates); exchange mode: Coinbase / Kraken. Other data may lag.\nProject docs are owner-approved. No trading, wallet access or moderation. Pools are not safety-checked.' },
    ] }),
);
function createWeb3Handler({ config, market, knowledge, replies, actions, agent, preferences, controls, boundaries, logger = createLogger('commands') }) {
    const cooldowns = new Map(); let active = 0;
    const pending = new Set(); let closing = false;
    const handle = async function onInteraction(interaction) {
        try {
            if (interaction.isButton?.() && interaction.customId.startsWith('agent:')) {
                try { if (controls) await controls.onButton(interaction); }
                catch (error) {
                    logger.error('Reply control failed', errorDetails(error));
                    const payload = { content: 'Could not update that control. Try /start or /stop, or ask again.', flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } };
                    try {
                        if (interaction.deferred || interaction.replied) await interaction.followUp(payload);
                        else await replyClean(interaction, payload);
                    } catch { /* Never send a public fallback for a failed control. */ }
                }
                return;
            }
            if (interaction.isButton?.() && interaction.customId.startsWith('private:')) {
                await replies.onButton(interaction); return;
            }
            if (!interaction.isChatInputCommand()) return;
            if (!COMMAND_NAMES.has(interaction.commandName)) return;
            // Acknowledge privately BEFORE external work. Every result/error stays on this interaction.
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            if (['start', 'stop'].includes(interaction.commandName)) {
                if (!preferences) throw new Error('Preferences unavailable');
                if (interaction.commandName === 'start' && boundaries?.pausedUntil(interaction.user.id)) {
                    await replies.send(interaction, `Our conversation is paused until <t:${Math.floor(boundaries.pausedUntil(interaction.user.id) / 1000)}:f>. It will resume automatically after the 5-hour pause.`); return;
                }
                preferences.setMuted(interaction.user.id, interaction.commandName === 'stop');
                await replies.send(interaction, interaction.commandName === 'stop' ? 'Automatic replies stopped for you. Use /start to resume.' : 'Automatic replies are on again for you.'); return;
            }
            if (!config.channels.includes(interaction.channelId)) {
                await replies.send(interaction, notice('Use a bot channel', 'Commands are enabled in the configured channels only.')); return;
            }
            if (interaction.commandName === 'chat' && boundaries?.pausedUntil(interaction.user.id)) {
                await replies.send(interaction, `Our conversation is paused until <t:${Math.floor(boundaries.pausedUntil(interaction.user.id) / 1000)}:f>. Please try again after that.`); return;
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
                const priceIntents = new Map(); let showStop = false; let boundaryNotice;
                const onTool = (intent, output) => {
                    if (intent.command === 'report_direct_abuse' && boundaries && interaction.id) {
                        const decision = boundaries.record(interaction.user.id, interaction.id, option('message') || '', intent.args.evidence);
                        if (decision?.paused) boundaryNotice = localizeFixed(decision.reply, agent?.languageFor?.(option('message') || '', `private:${interaction.channelId}:${interaction.user.id}`) || 'auto');
                        return decision ? { boundaryReply: decision.reply } : undefined;
                    }
                    if (intent.command === 'price') priceIntents.set(JSON.stringify(intent.args), intent);
                    if (intent.command === 'offer_stop' && output?.confirmationRequired) showStop = true;
                };
                const execute = async () => {
                    let result;
                    if (interaction.commandName === 'chat') {
                        result = agent ? await agent.respond(option('message'), { sessionKey: `private:${interaction.channelId}:${interaction.user.id}`, profile: discordProfile(interaction.member, interaction.user, interaction.locale), onTool }) : 'AI is not configured. Use /help for direct commands.';
                    } else if (interaction.commandName === 'search') {
                        const found = await actions.execute({ command: 'web_search', args: { query: option('query') } });
                        result = found.results.length ? pages(found.results.map(item => card(item.title || 'Search result', clip(item.content, 650), { url: item.url, footer: 'Web search snippet · Read the source for context' }))) : notice('No results', 'Try a different search query.');
                    } else if (interaction.commandName === 'read') {
                        const found = await actions.execute({ command: 'read_page', args: { url: option('url') } });
                        result = pages(card(found.title, clip(found.content || 'No readable text found.', 1000), { url: found.url, footer: 'Webpage excerpt · Use /chat to request a summary' }));
                    } else if (actions && interaction.commandName !== 'help') {
                        const command = interaction.commandName === 'x' ? 'x_research' : interaction.commandName;
                        const args = Object.fromEntries(Object.keys(SPECS[command].properties).map(name => [name, option(name)]).filter(([, value]) => value));
                        result = await actions.execute({ command, args });
                    } else switch (interaction.commandName) {
                        case 'help': result = HELP; break;
                        case 'ask': result = knowledge.ask(option('project'), option('question')); break;
                        case 'official': result = knowledge.official(option('project')); break;
                        case 'price': result = await market.price(option('token'), { mode: option('mode') || 'live', currency: option('currency') || 'usdt' }); break;
                        case 'pair': result = await market.pair(option('chain'), option('address')); break;
                        case 'newpairs': result = await market.newpairs(option('chain')); break;
                        case 'explain': result = explain(option('term')); break;
                    }
                    return result;
                };
                let result = await execute();
                if (interaction.commandName === 'chat' && boundaries?.pausedUntil(interaction.user.id) && result !== boundaryNotice) result = 'Our conversation is paused for 5 hours. Please try again after the pause ends.';
                const refresh = interaction.commandName === 'price' ? execute : priceIntents.size ? async () => {
                    const results = [];
                    for (const intent of priceIntents.values()) results.push(...(await actions.execute(intent)).pages);
                    return pages(results);
                } : undefined;
                const includeLinks = interaction.commandName === 'official' || wantsLinks([option('message'), option('question'), option('query')].filter(Boolean).join(' '));
                await replies.send(interaction, result, { refresh, showStop, includeLinks });
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
                else await replyClean(interaction, { embeds: response.pages, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
            } catch { /* Expired interaction or lost channel access. Never fall back to a public message. */ }
        }
    };
    const onInteraction = interaction => {
        if (closing) return Promise.resolve();
        const work = handle(interaction); pending.add(work);
        work.then(() => pending.delete(work), () => pending.delete(work));
        return work;
    };
    onInteraction.drain = async () => { closing = true; await Promise.allSettled([...pending]); };
    return onInteraction;
}
module.exports = { createWeb3Handler, HELP };

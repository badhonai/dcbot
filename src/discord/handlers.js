const { PermissionFlagsBits, MessageFlags } = require('discord.js');
const { clip } = require('../utils/cards');
const { createLogger, errorDetails } = require('../utils/logger');
const { splitMessage } = require('../utils/split-message');
const { QueueFullError } = require('../conversation/channel-queue');
const { money } = require('../features/market');
const safeMentions = { parse: [], repliedUser: false };

function createHandlers({ client, config, history, queue, ai, router, actions, logger = createLogger('chat'), now = Date.now }) {
    const allowed = new Set(config.channels);
    const cooldowns = new Map();
    const recentActions = new Map();
    const actionKey = message => `${message.channelId}:${message.author.id || message.author.displayName}`;
    function rememberAction(message, intent) {
        if (recentActions.size >= 1000) {
            for (const [key, value] of recentActions) if (value.expires <= now()) recentActions.delete(key);
            if (recentActions.size >= 1000) recentActions.delete(recentActions.keys().next().value);
        }
        recentActions.set(actionKey(message), { intent, expires: now() + 120000 });
    }
    async function onMessage(message) {
        if (!allowed.has(message.channelId) || message.author.bot) return;
        try {
            await queue.run(message.channelId, async () => {
                let shouldRespond = message.mentions.has(client.user);
                let referencedAction;
                if (message.reference?.messageId) {
                    try {
                        const reference = await message.channel.messages.fetch(message.reference.messageId);
                        if (reference.author.id === client.user.id) {
                            shouldRespond = true;
                            // A public price reply can restore action context after a restart.
                            if (/^(?:\*\*)?[A-Z0-9]{2,12}(?::| ·)\s*\$/.test(reference.content || '')) referencedAction = { command: 'price', args: { mode: 'live' } };
                        }
                    } catch { /* Deleted or inaccessible references are not triggers. */ }
                }
                const input = message.content.replace(/<@!?\d+>/g, '').trim();
                const recent = recentActions.get(actionKey(message));
                const previous = referencedAction || (recent?.expires > now() ? recent.intent : null);
                const followUp = router?.followUp?.(input, previous);
                const autoIntent = config.naturalLanguageCommands !== false ? (router?.detect(input) || followUp) : null;
                history.add(message.channelId, 'user', `[${message.author.displayName || message.author.username}]: ${message.content}`, message.id);
                if (!shouldRespond && !autoIntent) return;
                if (router && actions) {
                    const time = now(); const key = message.author.id || message.author.displayName;
                    if ((cooldowns.get(key) || 0) > time) return;
                    if (cooldowns.size >= 1000) {
                        for (const [id, expires] of cooldowns) if (expires <= time) cooldowns.delete(id);
                        if (cooldowns.size >= 1000) cooldowns.delete(cooldowns.keys().next().value);
                    }
                    cooldowns.set(key, time + 5000);
                }
                let typingTimer;
                try {
                    await message.channel.sendTyping();
                    typingTimer = setInterval(() => message.channel.sendTyping().catch(() => {}), 8000);
                    typingTimer.unref?.();
                    const intent = autoIntent || (shouldRespond ? followUp : null) || (shouldRespond && router ? await router.resolve(input) : null);
                    if (intent?.clarification) {
                        await message.reply({ content: intent.clarification, allowedMentions: safeMentions }); return;
                    }
                    if (intent && actions) {
                        const result = await actions.execute(intent);
                        let payload; let context;
                        if (result.quote) {
                            const q = result.quote;
                            context = null; // Do not feed quote values or internal freshness metadata back into AI chat.
                            payload = { content: `**${q.symbol}: ${money(q.price)}**\n-# ${q.sourceLabel || q.source || 'Exchange'} · USD · trade ${q.ageSeconds}s ago`, flags: MessageFlags.SuppressEmbeds };
                        } else if (result.liveUnavailable) {
                            payload = { content: result.pages[0].description, flags: MessageFlags.SuppressEmbeds };
                            context = null;
                        } else {
                            const first = result.pages[0];
                            payload = { embeds: [{ ...first, footer: { text: [first.footer?.text, result.pages.length > 1 ? `More: /${intent.command}` : ''].filter(Boolean).join(' · ') } }] };
                            context = `${first.title}: ${first.description || ''}`;
                            if (message.channel.permissionsFor?.(client.user)?.has(PermissionFlagsBits.EmbedLinks) === false) {
                                payload = { content: clip([`**${first.title}**`, first.description, ...(first.fields || []).map(f => `**${f.name}:** ${f.value}`), first.url ? `[Source](${first.url})` : ''].filter(Boolean).join('\n'), 1500) };
                            }
                        }
                        const sent = await message.reply({ ...payload, allowedMentions: safeMentions });
                        rememberAction(message, intent);
                        if (context) history.add(message.channelId, 'assistant', context, sent.id);
                        logger.debug?.('Natural-language tool completed', { command: intent.command });
                        return;
                    }
                    const response = await ai.respond(history.get(message.channelId));
                    for (const chunk of splitMessage(response, config.maxResponseLength)) {
                        const sent = await message.reply({ content: chunk, allowedMentions: safeMentions });
                        history.add(message.channelId, 'assistant', chunk, sent.id);
                    }
                } catch (error) {
                    logger.error('Response failed', { channelId: message.channelId, ...errorDetails(error) });
                    await message.reply({ content: error.status === 429 || error.code === 'BOT_BUSY' ? 'Busy right now. Please try again shortly.' : 'I couldn’t fetch that right now. Please try again.', allowedMentions: safeMentions });
                } finally { clearInterval(typingTimer); }
            });
        } catch (error) {
            if (error instanceof QueueFullError) logger.warn('Channel queue full', { channelId: message.channelId });
            else logger.error('Message handler failed', { channelId: message.channelId, ...errorDetails(error) });
        }
    }
    return { onMessage };
}
module.exports = { createHandlers };

const { localizeFixed } = require('../conversation/language');
const { discordProfile } = require('../conversation/personality');
const { replyClean } = require('../utils/clean-output');
const { MessageFlags } = require('discord.js');
const { splitDiscordMessage: splitMessage } = require('../utils/split-message');
const { createLogger, errorDetails } = require('../utils/logger');
const safeMentions = { parse: [], repliedUser: false };
function looksLikeRequest(text) {
    return /^(?:don't|do not)\s+(?:reply|respond|message|talk)\b/i.test(text) || /[?？؟]|https:\/\//i.test(text) || /^(?:quiz|riddle|trending|news|icebreaker|what|whats|how|why|when|where|who|can you|could you|please|explain|summari[sz]e|search|find|read|translate|write|draft|compare|calculate|check|tell|show|help|stop|unsubscribe|mute|pause)\b/i.test(text) || /\b(?:koto|ki|bolo|bolen|dam|daam)\b/i.test(text) || /(?:কুইজ|ধাঁধা|কী|কি|কেন|কত|বলুন|দেখাও|লিখে|খুঁজে)/u.test(text);
}
function createAgentMessageHandler({ client, config, queue, agent, preferences, controls, boundaries, logger = createLogger('chat'), now = Date.now }) {
    const allowed = new Set(config.channels); const cooldowns = new Map();
    return { async onMessage(message) {
        if (boundaries?.pausedUntil(message.author.id) || preferences?.isMuted(message.author.id) || message.author.bot || !allowed.has(message.channelId)) return;
        try {
            await queue.run(message.channelId, async () => {
                if (boundaries?.pausedUntil(message.author.id) || preferences?.isMuted(message.author.id)) return;
                const input = message.content.replace(/<@!?\d+>/g, '').trim();
                if (!input) return;
                let addressed = message.mentions.has(client.user, { ignoreEveryone: true, ignoreRoles: true, ignoreRepliedUser: true }); let reference = '';
                if (message.reference?.messageId) {
                    try {
                        const replied = await message.channel.messages.fetch(message.reference.messageId);
                        addressed ||= replied.author.id === client.user.id;
                        reference = replied.content || replied.embeds?.map(embed => [embed.title, embed.description].filter(Boolean).join('\n')).join('\n') || '';
                    } catch { /* Missing references do not manufacture context. */ }
                }
                const profile = discordProfile(message.member, message.author);
                const sessionKey = `${message.channelId}:${message.author.id}`;
                const followUp = agent.hasSession(sessionKey);
                if (!addressed) return;
                const time = now();
                if (!followUp && (cooldowns.get(sessionKey) || 0) > time) return;
                if (cooldowns.size >= 1000) {
                    for (const [key, until] of cooldowns) if (until <= time) cooldowns.delete(key);
                    if (cooldowns.size >= 1000) cooldowns.delete(cooldowns.keys().next().value);
                }
                cooldowns.set(sessionKey, time + 2000);
                let timer;
                try {
                    await message.channel.sendTyping();
                    timer = setInterval(() => message.channel.sendTyping().catch(() => {}), 8000); timer.unref?.();
                    const observe = onTool => (intent, output) => {
                        if (intent.command !== 'report_direct_abuse' || !boundaries || !message.id) { onTool?.(intent, output); return; }
                        const decision = boundaries.record(message.author.id, message.id, input, intent.args.evidence);
                        onTool?.(intent, { ...output, boundaryNotice: decision?.paused ? localizeFixed(decision.reply, agent.languageFor?.(input, sessionKey) || 'auto') : undefined });
                        return decision ? { boundaryReply: decision.reply } : undefined;
                    };
                    if (controls) {
                        await controls.run(message, (onProgress, signal, onTool) => agent.respond(input, { sessionKey, reference, profile, onProgress, signal, onTool: observe(onTool) }), config.maxResponseLength || 1900, { language: agent.languageFor?.(input, sessionKey) });
                        return;
                    }
                    const response = await agent.respond(input, { sessionKey, reference, profile, onTool: observe() });
                    for (const content of splitMessage(response, Math.min(config.maxResponseLength || 1900, 1900))) await replyClean(message, { content, flags: MessageFlags.SuppressEmbeds, allowedMentions: safeMentions });
                } catch (error) {
                    logger.error('Agent request failed', errorDetails(error));
                    if (boundaries?.pausedUntil(message.author.id) || preferences?.isMuted(message.author.id)) return;
                    await replyClean(message, { content: 'I couldn’t finish that request right now. Please try again shortly.', flags: MessageFlags.SuppressEmbeds, allowedMentions: safeMentions });
                } finally { clearInterval(timer); }
            });
        } catch (error) { logger.warn('Message work unavailable', { name: error.name }); }
    } };
}
module.exports = { createAgentMessageHandler, looksLikeRequest };

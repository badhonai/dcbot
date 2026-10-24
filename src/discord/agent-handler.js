const { MessageFlags } = require('discord.js');
const { splitMessage } = require('../utils/split-message');
const { createLogger, errorDetails } = require('../utils/logger');
const safeMentions = { parse: [], repliedUser: false };
function looksLikeRequest(text) {
    return /[?？]|https:\/\//i.test(text) || /^(?:what|whats|how|why|when|where|who|can you|could you|please|explain|summari[sz]e|search|find|read|translate|write|draft|compare|calculate|check|tell|show|help)\b/i.test(text) || /\b(?:koto|ki|bolo|bolen|dam|daam)\b/i.test(text) || /(?:কী|কি|কেন|কত|বলুন|দেখাও|লিখে|খুঁজে)/u.test(text);
}
function createAgentMessageHandler({ client, config, queue, agent, logger = createLogger('chat'), now = Date.now }) {
    const allowed = new Set(config.channels); const cooldowns = new Map();
    return { async onMessage(message) {
        if (message.author.bot || !allowed.has(message.channelId)) return;
        try {
            await queue.run(message.channelId, async () => {
                const input = message.content.replace(/<@!?\d+>/g, '').trim();
                if (!input) return;
                let addressed = message.mentions.has(client.user); let reference = '';
                if (message.reference?.messageId) {
                    try {
                        const replied = await message.channel.messages.fetch(message.reference.messageId);
                        addressed ||= replied.author.id === client.user.id;
                        reference = replied.content || replied.embeds?.map(embed => [embed.title, embed.description].filter(Boolean).join('\n')).join('\n') || '';
                    } catch { /* Missing references do not manufacture context. */ }
                }
                const sessionKey = `${message.channelId}:${message.author.id}`;
                const followUp = agent.hasSession(sessionKey) && input.length <= 160;
                if (!addressed && !(config.naturalLanguageCommands !== false && (looksLikeRequest(input) || followUp))) return;
                const time = now();
                if ((cooldowns.get(sessionKey) || 0) > time) return;
                if (cooldowns.size >= 1000) {
                    for (const [key, until] of cooldowns) if (until <= time) cooldowns.delete(key);
                    if (cooldowns.size >= 1000) cooldowns.delete(cooldowns.keys().next().value);
                }
                cooldowns.set(sessionKey, time + 2000);
                let timer;
                try {
                    await message.channel.sendTyping();
                    timer = setInterval(() => message.channel.sendTyping().catch(() => {}), 8000); timer.unref?.();
                    const response = await agent.respond(input, { sessionKey, reference });
                    for (const content of splitMessage(response, Math.min(config.maxResponseLength || 1900, 1900))) await message.reply({ content, flags: MessageFlags.SuppressEmbeds, allowedMentions: safeMentions });
                } catch (error) {
                    logger.error('Agent request failed', errorDetails(error));
                    await message.reply({ content: 'I couldn’t finish that request right now. Please try again shortly.', flags: MessageFlags.SuppressEmbeds, allowedMentions: safeMentions });
                } finally { clearInterval(timer); }
            });
        } catch (error) { logger.warn('Message work unavailable', { name: error.name }); }
    } };
}
module.exports = { createAgentMessageHandler, looksLikeRequest };

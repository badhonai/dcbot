const { createLogger, errorDetails } = require('../utils/logger');
const { splitMessage } = require('../utils/split-message');
const { QueueFullError } = require('../conversation/channel-queue');
const safeMentions = { parse: [], repliedUser: false };

function createHandlers({ client, config, history, queue, ai, logger = createLogger('chat') }) {
    const allowed = new Set(config.channels);
    async function onMessage(message) {
        if (!allowed.has(message.channelId) || message.author.bot) return;
        try {
            await queue.run(message.channelId, async () => {
                let shouldRespond = message.mentions.has(client.user);
                if (!shouldRespond && message.reference?.messageId) {
                    try {
                        const reference = await message.channel.messages.fetch(message.reference.messageId);
                        shouldRespond = reference.author.id === client.user.id;
                    } catch { /* Deleted or inaccessible references are not triggers. */ }
                }
                history.add(message.channelId, 'user', `[${message.author.displayName || message.author.username}]: ${message.content}`, message.id);
                if (!shouldRespond) return;
                try {
                    await message.channel.sendTyping();
                    const response = await ai.respond(history.get(message.channelId));
                    for (const chunk of splitMessage(response, config.maxResponseLength)) {
                        const sent = await message.reply({ content: chunk, allowedMentions: safeMentions });
                        history.add(message.channelId, 'assistant', chunk, sent.id);
                    }
                } catch (error) {
                    logger.error('Response failed', { channelId: message.channelId, ...errorDetails(error) });
                    await message.reply({ content: error.status === 429 ? '⏳ Rate limited. Please try again shortly.' : '⚠️ I could not respond. Please try again.', allowedMentions: safeMentions });
                }
            });
        } catch (error) {
            if (error instanceof QueueFullError) {
                // Drop overload without sending additional traffic into a saturated channel.
                logger.warn('Channel queue full', { channelId: message.channelId });
            } else logger.error('Message handler failed', { channelId: message.channelId, ...errorDetails(error) });
        }
    }
    return { onMessage };
}
module.exports = { createHandlers };

const { Client, GatewayIntentBits, REST, Routes } = require('discord.js');
const fs = require('fs');
require('dotenv').config();

const config = require('./config.json');
const ai = require('./ai');

let systemPrompt = '';
try {
    systemPrompt = fs.readFileSync(config.systemPromptFile, 'utf-8').trim();
    console.log(`Loaded system prompt from ${config.systemPromptFile}`);
} catch (err) {
    console.error(`Could not read ${config.systemPromptFile}:`, err.message);
    process.exit(1);
}

ai.init(config, systemPrompt);

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

const botMessageIds = new Set();

function splitMessage(text, maxLen = config.maxResponseLength) {
    if (text.length <= maxLen) return [text];
    const chunks = [];
    while (text.length > 0) {
        if (text.length <= maxLen) {
            chunks.push(text);
            break;
        }
        let splitAt = text.lastIndexOf('\n', maxLen);
        if (splitAt <= 0) splitAt = maxLen;
        chunks.push(text.slice(0, splitAt));
        text = text.slice(splitAt).trimStart();
    }
    return chunks;
}

function isAllowedChannel(channelId) {
    return config.channels.includes(channelId);
}

client.once('clientReady', async () => {
    console.log(`Logged in as ${client.user.tag}`);
    console.log(`Listening in ${config.channels.length} channel(s)`);

    const commands = [
        {
            name: 'uns',
            description: "Delete the bot's most recent message",
        },
    ];

    try {
        const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

        // Register slash command in ALL guilds the bot is in
        for (const guild of client.guilds.cache.values()) {
            await rest.put(
                Routes.applicationGuildCommands(client.user.id, guild.id),
                { body: commands }
            );
        }
        console.log('Slash commands registered');
    } catch (err) {
        console.error('Failed to register slash commands:', err);
    }
});

client.on('messageCreate', async (message) => {
    // Only listen in allowed channels
    if (!isAllowedChannel(message.channelId)) return;
    if (message.author.bot) return;

    const isMentioned = message.mentions.has(client.user);

    let isReplyToBot = false;
    if (message.reference?.messageId) {
        isReplyToBot = botMessageIds.has(message.reference.messageId);
        if (!isReplyToBot) {
            try {
                const refMsg = await message.channel.messages.fetch(message.reference.messageId);
                isReplyToBot = refMsg.author.id === client.user.id;
                if (isReplyToBot) botMessageIds.add(refMsg.id);
            } catch {}
        }
    }

    const shouldRespond = isMentioned || isReplyToBot;

    const userContent = `[${message.author.displayName}]: ${message.content}`;
    ai.addToHistory(message.channelId, 'user', userContent);

    if (!shouldRespond) return;

    await message.channel.sendTyping();

    const response = await ai.getResponse(message.channelId);

    const chunks = splitMessage(response);
    for (const chunk of chunks) {
        const sent = await message.reply(chunk);
        botMessageIds.add(sent.id);
        ai.addToHistory(message.channelId, 'assistant', chunk);

        if (botMessageIds.size > 500) {
            const first = botMessageIds.values().next().value;
            botMessageIds.delete(first);
        }
    }
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== 'uns') return;
    if (!isAllowedChannel(interaction.channelId)) return;

    try {
        const messages = await interaction.channel.messages.fetch({ limit: 50 });
        const lastBotMsg = messages.find(
            (m) => m.author.id === client.user.id && m.id !== interaction.id
        );

        if (!lastBotMsg) {
            await interaction.reply({
                content: 'No recent bot message found to delete.',
                ephemeral: true,
            });
            return;
        }

        await lastBotMsg.delete();
        botMessageIds.delete(lastBotMsg.id);
        ai.removeLastAssistant(interaction.channelId);

        await interaction.reply({
            content: 'Last message deleted.',
            ephemeral: true,
        });
    } catch (err) {
        console.error('/uns error:', err);
        await interaction.reply({
            content: 'Failed to delete message.',
            ephemeral: true,
        });
    }
});

client.login(process.env.DISCORD_TOKEN);
const { randomBytes } = require('node:crypto');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { cleanDiscordPayload, replyClean } = require('../utils/clean-output');
const { splitMessage } = require('../utils/split-message');
const safeMentions = { parse: [], repliedUser: false };
class PublicControls {
    constructor({ preferences, now = Date.now, logger = { warn() {} } }) {
        this.preferences = preferences; this.now = now; this.logger = logger; this.sessions = new Map(); this.cooldowns = new Map();
        preferences.on?.('change', (owner, muted) => {
            if (muted) for (const state of this.sessions.values()) if (state.owner === owner) state.abort?.abort();
        });
    }
    components(id, state) {
        return [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`agent:${id}:refresh`).setLabel('Refresh').setStyle(ButtonStyle.Secondary).setDisabled(state.busy),
            new ButtonBuilder().setCustomId(`agent:${id}:stop`).setLabel('Stop replies to me').setStyle(ButtonStyle.Secondary),
        )];
    }
    async run(message, task, maxLength = 1900) {
        const owner = message.author.id;
        if (this.preferences.isMuted(owner)) return;
        for (const [key, state] of this.sessions) if (state.expires <= this.now()) this.sessions.delete(key);
        if (this.sessions.size >= 200) this.sessions.delete(this.sessions.keys().next().value);
        const id = randomBytes(12).toString('hex');
        const state = { owner, task, message, maxLength, messages: [], busy: true, expires: this.now() + 600000 };
        this.sessions.set(id, state);
        try {
            state.messages.push(await replyClean(message, { content: 'Thinking and checking...', components: this.components(id, state), flags: MessageFlags.SuppressEmbeds, allowedMentions: safeMentions }));
            await this.execute(id, state);
        } catch (error) { this.sessions.delete(id); throw error; }
    }
    async execute(id, state) {
        const revision = this.preferences.revision(state.owner);
        state.abort = new AbortController();
        const valid = () => !this.preferences.isMuted(state.owner) && revision === this.preferences.revision(state.owner);
        const edit = payload => state.messages[0].edit(cleanDiscordPayload({ ...payload, flags: MessageFlags.SuppressEmbeds, allowedMentions: safeMentions }));
        let text;
        try {
            if (!valid()) throw new Error('Request stopped');
            text = await state.task(async content => {
                if (valid()) await edit({ content, components: this.components(id, state) });
            }, state.abort.signal);
        } catch {
            text = 'I couldn’t verify that right now. Please try again shortly.';
        } finally { state.busy = false; }
        if (!valid()) {
            await edit({ content: 'Request stopped. Use /start to enable automatic replies again.', components: [] }); return;
        }
        const chunks = splitMessage(text || 'No answer available.', Math.min(state.maxLength, 1900));
        for (let i = 0; i < chunks.length; i++) {
            if (!valid()) return;
            const payload = cleanDiscordPayload({ content: chunks[i], components: i === 0 ? this.components(id, state) : [], flags: MessageFlags.SuppressEmbeds, allowedMentions: safeMentions });
            if (state.messages[i]) await state.messages[i].edit(payload);
            else state.messages.push(await state.message.reply(payload));
        }
        for (const old of state.messages.splice(chunks.length)) await old.delete().catch(() => {});
    }
    async onButton(interaction) {
        const [, id, action] = interaction.customId.split(':');
        const state = this.sessions.get(id);
        if (!state || state.expires <= this.now() || state.owner !== interaction.user.id || !['refresh', 'stop'].includes(action)) {
            await replyClean(interaction, { content: 'This control expired or isn’t yours. Use /start or /stop to change your preference.', flags: MessageFlags.Ephemeral }); return;
        }
        if (action === 'stop') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            this.preferences.setMuted(state.owner, true);
            await interaction.editReply(cleanDiscordPayload({ content: 'Automatic replies stopped for you. Use /start to turn them back on.' }));
            await state.messages[0]?.edit(cleanDiscordPayload({ ...(state.busy ? { content: 'Request stopped. Use /start to resume.' } : {}), components: [] }))?.catch(() => {});
            return;
        }
        if (this.preferences.isMuted(state.owner) || state.busy || (this.cooldowns.get(state.owner) || 0) > this.now()) {
            await replyClean(interaction, { content: this.preferences.isMuted(state.owner) ? 'Replies are stopped. Use /start to resume.' : 'Already checking, or on cooldown. Try again shortly.', flags: MessageFlags.Ephemeral }); return;
        }
        state.busy = true;
        if (this.cooldowns.size >= 1000) for (const [key, until] of this.cooldowns) if (until <= this.now()) this.cooldowns.delete(key);
        this.cooldowns.set(state.owner, this.now() + 5000);
        try {
            await interaction.deferUpdate();
            await state.messages[0].edit(cleanDiscordPayload({ content: 'Checking again...', components: this.components(id, state) }));
            await this.execute(id, state);
        } finally { state.busy = false; }
    }
}
module.exports = { PublicControls };

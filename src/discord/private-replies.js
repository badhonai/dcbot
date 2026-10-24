const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { randomBytes } = require('node:crypto');
const { splitMessage } = require('../utils/split-message');
const safeMentions = { parse: [], repliedUser: false };
class PrivateReplies {
    constructor({ ttlMs = 10 * 60 * 1000, maxSessions = 200 } = {}) {
        this.ttlMs = ttlMs; this.maxSessions = maxSessions; this.sessions = new Map();
    }
    controls(id, page, count) {
        return [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`private:${id}:previous`).setLabel('Previous').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
            new ButtonBuilder().setCustomId(`private:${id}:next`).setLabel('Next').setStyle(ButtonStyle.Secondary).setDisabled(page === count - 1),
            new ButtonBuilder().setCustomId(`private:${id}:close`).setLabel('Dismiss').setStyle(ButtonStyle.Danger),
        )];
    }
    payload(id, session) {
        return { content: `${session.pages[session.page]}\n\n— ${session.page + 1}/${session.pages.length} · Private · Auto-dismiss ~10 min`,
            components: this.controls(id, session.page, session.pages.length), allowedMentions: safeMentions };
    }
    async send(interaction, text) {
        if (this.sessions.size >= this.maxSessions) {
            const [oldId, old] = this.sessions.entries().next().value;
            clearTimeout(old.timer); this.sessions.delete(oldId);
            old.interaction.deleteReply().catch(() => {});
        }
        const id = randomBytes(12).toString('hex');
        const pages = splitMessage(String(text).slice(0, 20000) || 'No results.', 1800);
        const session = { pages, page: 0, owner: interaction.user.id, interaction };
        this.sessions.set(id, session);
        session.timer = setTimeout(() => {
            this.sessions.delete(id);
            interaction.deleteReply().catch(() => {});
        }, this.ttlMs);
        session.timer.unref?.();
        try { await interaction.editReply(this.payload(id, session)); }
        catch (error) { clearTimeout(session.timer); this.sessions.delete(id); throw error; }
        return id;
    }
    async onButton(interaction) {
        const [, id, action] = interaction.customId.split(':');
        const session = this.sessions.get(id);
        if (!session || session.owner !== interaction.user.id) {
            await interaction.reply({ content: 'This private response expired or belongs to another user. Run the command again.', ephemeral: true });
            return;
        }
        if (!['previous', 'next', 'close'].includes(action)) return;
        await interaction.deferUpdate();
        if (action === 'close') {
            clearTimeout(session.timer); this.sessions.delete(id);
            await session.interaction.deleteReply(); return;
        }
        session.page = Math.max(0, Math.min(session.pages.length - 1, session.page + (action === 'next' ? 1 : -1)));
        await session.interaction.editReply(this.payload(id, session));
    }
    destroy() {
        for (const session of this.sessions.values()) clearTimeout(session.timer);
        this.sessions.clear();
    }
}
module.exports = { PrivateReplies };

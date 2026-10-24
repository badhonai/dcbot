const { cleanDiscordPayload, replyClean } = require('../utils/clean-output');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, PermissionFlagsBits } = require('discord.js');
const { randomBytes } = require('node:crypto');
const { splitMessage } = require('../utils/split-message');
const { card } = require('../utils/cards');
const safeMentions = { parse: [], repliedUser: false };
class PrivateReplies {
    constructor({ ttlMs = 10 * 60 * 1000, maxSessions = 200 } = {}) {
        this.ttlMs = ttlMs; this.maxSessions = maxSessions; this.sessions = new Map();
    }
    controls(id, page, count) {
        const buttons = [];
        if (count > 1) buttons.push(
            new ButtonBuilder().setCustomId(`private:${id}:previous`).setLabel('Back').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
            new ButtonBuilder().setCustomId(`private:${id}:next`).setLabel('Next').setStyle(ButtonStyle.Secondary).setDisabled(page === count - 1),
        );
        buttons.push(new ButtonBuilder().setCustomId(`private:${id}:close`).setLabel('Dismiss').setStyle(ButtonStyle.Secondary));
        return [new ActionRowBuilder().addComponents(buttons)];
    }
    payload(id, session) {
        const current = session.pages[session.page];
        const status = [session.pages.length > 1 ? `${session.page + 1}/${session.pages.length}` : '', 'Only you', `~${Math.round(this.ttlMs / 60000)} min`].filter(Boolean).join(' · ');
        if (session.plain) return { content: `${current.text}\n\n-# ${status}`, embeds: [], components: this.controls(id, session.page, session.pages.length), allowedMentions: safeMentions };
        return { content: '', embeds: [{ ...current, footer: { text: [current.footer?.text, status].filter(Boolean).join(' · ').slice(0, 300) } }],
            components: this.controls(id, session.page, session.pages.length), allowedMentions: safeMentions };
    }
    async send(interaction, text) {
        if (this.sessions.size >= this.maxSessions) {
            const [oldId, old] = this.sessions.entries().next().value;
            clearTimeout(old.timer); this.sessions.delete(oldId);
            old.interaction.deleteReply().catch(() => {});
        }
        const id = randomBytes(12).toString('hex');
        let pages = Array.isArray(text?.pages) && text.pages.length ? text.pages.slice(0, 20) :
            splitMessage(String(text || 'No results.').slice(0, 20000), 900).map(value => card('AI assistant', value));
        const plain = interaction.appPermissions?.has(PermissionFlagsBits.EmbedLinks) === false;
        if (plain) pages = pages.flatMap(page => {
            const body = [`**${page.title}**`, page.description, ...(page.fields || []).map(f => `**${f.name}**\n${f.value}`), page.url ? `[Source](${page.url})` : '', page.footer?.text, page.timestamp ? `Fetched: ${page.timestamp}` : ''].filter(Boolean).join('\n\n');
            return splitMessage(body, 1600).map(text => ({ text }));
        });
        const session = { pages, plain, page: 0, owner: interaction.user.id, interaction };
        this.sessions.set(id, session);
        session.timer = setTimeout(() => {
            this.sessions.delete(id);
            interaction.deleteReply().catch(() => {});
        }, this.ttlMs);
        session.timer.unref?.();
        try { await interaction.editReply(cleanDiscordPayload(this.payload(id, session))); }
        catch (error) { clearTimeout(session.timer); this.sessions.delete(id); throw error; }
        return id;
    }
    async onButton(interaction) {
        const [, id, action] = interaction.customId.split(':');
        const session = this.sessions.get(id);
        if (!session || session.owner !== interaction.user.id) {
            await replyClean(interaction, { content: 'This response expired or isn’t yours. Run the command again.', flags: MessageFlags.Ephemeral });
            return;
        }
        if (!['previous', 'next', 'close'].includes(action)) return;
        await interaction.deferUpdate();
        if (action === 'close') {
            clearTimeout(session.timer); this.sessions.delete(id);
            await session.interaction.deleteReply(); return;
        }
        session.page = Math.max(0, Math.min(session.pages.length - 1, session.page + (action === 'next' ? 1 : -1)));
        await session.interaction.editReply(cleanDiscordPayload(this.payload(id, session)));
    }
    destroy() {
        for (const session of this.sessions.values()) clearTimeout(session.timer);
        this.sessions.clear();
    }
}
module.exports = { PrivateReplies };

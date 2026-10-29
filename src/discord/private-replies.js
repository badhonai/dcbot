const { detectLanguage } = require('../conversation/language');
const { compactPreview, pageText } = require('../conversation/compact-view');
const { presentAnswer } = require('../conversation/reply-presentation');
const { cleanDiscordPayload, replyClean } = require('../utils/clean-output');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, PermissionFlagsBits } = require('discord.js');
const { randomBytes } = require('node:crypto');
const { splitDiscordMessage: splitMessage } = require('../utils/split-message');
const { card } = require('../utils/cards');
const safeMentions = { parse: [], repliedUser: false };
class PrivateReplies {
    constructor({ ttlMs = 10 * 60 * 1000, maxSessions = 200, preferences } = {}) {
        this.preferences = preferences; this.ttlMs = ttlMs; this.maxSessions = maxSessions; this.sessions = new Map();
    }
    controls(id, page, count, session = {}) {
        const buttons = [];
        if (session.expandable) buttons.push(new ButtonBuilder().setCustomId(`private:${id}:${session.expanded ? 'less' : 'more'}`).setLabel(session.expanded ? 'Less' : 'More').setStyle(ButtonStyle.Secondary));
        if (count > 1 && session.expanded) buttons.push(
            new ButtonBuilder().setCustomId(`private:${id}:previous`).setLabel('Back').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
            new ButtonBuilder().setCustomId(`private:${id}:next`).setLabel('Next').setStyle(ButtonStyle.Secondary).setDisabled(page === count - 1),
        );
        if (session.refresh) buttons.push(new ButtonBuilder().setCustomId(`private:${id}:refresh`).setLabel('Refresh price').setStyle(ButtonStyle.Secondary).setDisabled(Boolean(session.refreshing)));
        if (this.preferences && session.showStop) buttons.push(new ButtonBuilder().setCustomId(`private:${id}:stop`).setLabel(this.preferences.isMuted(session.owner) ? 'Replies stopped' : 'Stop replies to me').setStyle(ButtonStyle.Secondary).setDisabled(this.preferences.isMuted(session.owner)));
        buttons.push(new ButtonBuilder().setCustomId(`private:${id}:close`).setLabel('Dismiss').setStyle(ButtonStyle.Secondary));
        const rows = [];
        for (let i = 0; i < buttons.length; i += 5) rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
        return rows;
    }
    payload(id, session) {
        const current = session.pages[session.page];
        if (session.expandable && !session.expanded) return { content: session.summary, embeds: [], components: this.controls(id, 0, session.pages.length, session), allowedMentions: safeMentions };
        const status = [session.pages.length > 1 ? `${session.page + 1}/${session.pages.length}` : '', 'Only you', `~${Math.round(this.ttlMs / 60000)} min`].filter(Boolean).join(' · ');
        if (session.plain) return { content: `${current.text}\n\n-# ${status}`, embeds: [], components: this.controls(id, session.page, session.pages.length, session), allowedMentions: safeMentions };
        return { content: '', embeds: [{ ...current, footer: { text: [current.footer?.text, status].filter(Boolean).join(' · ').slice(0, 300) } }],
            components: this.controls(id, session.page, session.pages.length, session), allowedMentions: safeMentions };
    }
    makePages(interaction, text, { includeLinks = false } = {}) {
        let forcePlain = false;
        if (text?.pages) text = { ...text, pages: text.pages.map(page => {
            const copy = { ...page };
            for (const key of ['title', 'description']) if (copy[key]) copy[key] = presentAnswer(copy[key], { includeLinks });
            if (copy.fields) copy.fields = copy.fields.map(f => ({ ...f, value: presentAnswer(f.value, { includeLinks }) })).filter(f => f.value.trim());
            if (!includeLinks) { delete copy.url; delete copy.image; delete copy.thumbnail; }
            if (copy.footer?.text) copy.footer = { ...copy.footer, text: presentAnswer(copy.footer.text, { includeLinks }) };
            return copy;
        }) };
        else text = presentAnswer(String(text || 'No results.'), { includeLinks });
        const wide = typeof text === 'string' && [...text.matchAll(/\[[^\]\n]+\]\([^\n]+?\)|`[^`\n]+`|https?:\/\/[^\s<>]+/g)].some(m => m[0].length > 850);
        let stringPages;
        if (typeof text === 'string') { stringPages = splitMessage(text, wide ? 1800 : 900); forcePlain = stringPages.some(s => s.length > 1200); }

        let pages = Array.isArray(text?.pages) && text.pages.length ? text.pages.slice(0, 20) :
            (stringPages || splitMessage('No results.', 900)).map(value => forcePlain ? { text: value } : card('AI assistant', value));
        const plain = forcePlain || interaction.appPermissions?.has(PermissionFlagsBits.EmbedLinks) === false;
        if (plain) pages = pages.flatMap(page => {
            const body = page.text || [`**${page.title}**`, page.description, ...(page.fields || []).map(f => `**${f.name}**\n${f.value}`), page.url ? `[Source](${page.url})` : '', page.footer?.text, page.timestamp ? `Fetched: ${page.timestamp}` : ''].filter(Boolean).join('\n\n');
            return splitMessage(body, 1800).map(text => ({ text }));
        });
        return { pages, plain };
    }
    async send(interaction, text, { refresh, showStop = false, includeLinks = true } = {}) {
        if (this.sessions.size >= this.maxSessions) {
            const [oldId, old] = this.sessions.entries().next().value;
            clearTimeout(old.timer); this.sessions.delete(oldId);
            old.interaction.deleteReply().catch(() => {});
        }
        const id = randomBytes(12).toString('hex');
        const { pages, plain } = this.makePages(interaction, text, { includeLinks });
        const full = pages.map(pageText).join('\n\n');
        const expandable = pages.length > 1 || full.length + 50 >= 400;
        const summary = compactPreview(full, { limit: 399, language: detectLanguage(full) });
        const session = { expandable, expanded: false, summary, pages, plain, page: 0, owner: interaction.user.id, interaction, refresh, showStop, includeLinks, refreshAfter: 0 };
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
        if (action === 'stop' && this.preferences && session.showStop) {
            await interaction.deferUpdate(); this.preferences.setMuted(session.owner, true);
            await session.interaction.editReply(cleanDiscordPayload(this.payload(id, session))); return;
        }
        if (action === 'refresh' && session.refresh) {
            if (session.refreshing || session.refreshAfter > Date.now()) {
                await replyClean(interaction, { content: 'Already checking, or on cooldown. Try again shortly.', flags: MessageFlags.Ephemeral }); return;
            }
            session.refreshing = true; session.refreshAfter = Date.now() + 5000;
            try {
                await interaction.deferUpdate();
                await session.interaction.editReply(cleanDiscordPayload({ content: 'Checking latest data...', embeds: [], components: this.controls(id, session.page, session.pages.length, session), allowedMentions: safeMentions }));
                let result;
                try { result = await session.refresh(); }
                catch { result = { pages: [card('Refresh unavailable', 'Could not fetch recent data. Please try again shortly.')] }; }
                if (this.sessions.get(id) !== session) return;
                Object.assign(session, this.makePages(session.interaction, result, { includeLinks: session.includeLinks }), { page: 0, refreshing: false, expanded: false });
                const full = session.pages.map(pageText).join('\n\n');
                session.expandable = session.pages.length > 1 || full.length + 50 >= 400;
                session.summary = compactPreview(full, { language: detectLanguage(full) });
                await session.interaction.editReply(cleanDiscordPayload(this.payload(id, session)));
            } finally { session.refreshing = false; }
            return;
        }
        if (['more', 'less'].includes(action)) {
            if (!session.expandable || session.refreshing || session.toggling) { await replyClean(interaction, { content: 'That view is busy or unavailable. Try again shortly.', flags: MessageFlags.Ephemeral }); return; }
            session.toggling = true;
            const old = { expanded: session.expanded, page: session.page };
            try { await interaction.deferUpdate(); if (this.sessions.get(id) !== session) return; session.expanded = action === 'more'; session.page = 0; await session.interaction.editReply(cleanDiscordPayload(this.payload(id, session))); }
            catch (error) { Object.assign(session, old); throw error; }
            finally { session.toggling = false; }
            return;
        }
        if (!['previous', 'next', 'close'].includes(action)) return;
        if (['previous', 'next'].includes(action) && (!session.expanded || session.refreshing || session.toggling)) { await replyClean(interaction, { content: 'Expand this reply first, or wait for the current update.', flags: MessageFlags.Ephemeral }); return; }
        if (action === 'close') {
            await interaction.deferUpdate(); clearTimeout(session.timer); this.sessions.delete(id);
            await session.interaction.deleteReply(); return;
        }
        session.toggling = true;
        const oldPage = session.page;
        try {
            await interaction.deferUpdate(); if (this.sessions.get(id) !== session) return;
            session.page = Math.max(0, Math.min(session.pages.length - 1, session.page + (action === 'next' ? 1 : -1)));
            await session.interaction.editReply(cleanDiscordPayload(this.payload(id, session)));
        } catch (error) { session.page = oldPage; throw error; }
        finally { session.toggling = false; }
    }
    destroy() {
        for (const session of this.sessions.values()) clearTimeout(session.timer);
        this.sessions.clear();
    }
}
module.exports = { PrivateReplies };

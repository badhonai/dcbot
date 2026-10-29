const { detectLanguage, localizeFixed } = require('../conversation/language');
const { compactPreview } = require('../conversation/compact-view');
const { randomBytes } = require('node:crypto');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { cleanDiscordPayload, replyClean } = require('../utils/clean-output');
const { quoteMoney } = require('../features/market');
const { splitDiscordMessage: splitMessage } = require('../utils/split-message');
const safeMentions = { parse: [], repliedUser: false };
class PublicControls {
    constructor({ preferences, actions, boundaries, now = Date.now, logger = { warn() {} } }) {
        this.preferences = preferences; this.actions = actions; this.boundaries = boundaries; this.now = now; this.logger = logger; this.sessions = new Map(); this.cooldowns = new Map();
        preferences.on?.('change', (owner, muted) => {
            if (muted) for (const state of this.sessions.values()) if (state.owner === owner) state.abort?.abort();
        });
    }
    components(id, state) {
        if (this.boundaries?.pausedUntil(state.owner)) return [];
        const buttons = [];
        if (state.expandable) buttons.push(new ButtonBuilder().setCustomId(`agent:${id}:${state.expanded ? 'less' : 'more'}`).setLabel(state.expanded ? 'Less' : 'More').setStyle(ButtonStyle.Secondary).setDisabled(state.busy));
        if (state.expanded && state.fullPages?.length > 1) buttons.push(
            new ButtonBuilder().setCustomId(`agent:${id}:previous`).setLabel('Back').setStyle(ButtonStyle.Secondary).setDisabled(state.busy || state.page === 0),
            new ButtonBuilder().setCustomId(`agent:${id}:next`).setLabel('Next').setStyle(ButtonStyle.Secondary).setDisabled(state.busy || state.page === state.fullPages.length - 1));
        if (state.prices?.size) buttons.push(new ButtonBuilder().setCustomId(`agent:${id}:refresh`).setLabel('Refresh price').setStyle(ButtonStyle.Secondary).setDisabled(state.busy));
        if (state.stopRequested) buttons.push(new ButtonBuilder().setCustomId(`agent:${id}:stop`).setLabel('Stop replies to me').setStyle(ButtonStyle.Secondary));
        return buttons.length ? [new ActionRowBuilder().addComponents(buttons)] : [];
    }
    async run(message, task, maxLength = 1900, { language } = {}) {
        const owner = message.author.id;
        if (this.preferences.isMuted(owner) || this.boundaries?.pausedUntil(owner)) return;
        for (const [key, state] of this.sessions) if (state.expires <= this.now()) this.sessions.delete(key);
        if (this.sessions.size >= 200) this.sessions.delete(this.sessions.keys().next().value);
        const id = randomBytes(12).toString('hex');
        const state = { language: language || detectLanguage(message.content), owner, task, message, maxLength, messages: [], prices: new Map(), stopRequested: false, busy: true, expires: this.now() + 600000 };
        this.sessions.set(id, state);
        try {
            state.messages.push(await replyClean(message, { content: localizeFixed('Thinking and checking...', state.language), components: this.components(id, state), flags: MessageFlags.SuppressEmbeds, allowedMentions: safeMentions }));
            await this.execute(id, state);
        } catch (error) { this.sessions.delete(id); throw error; }
    }
    async execute(id, state, refreshing = false) {
        const revision = this.preferences.revision(state.owner);
        state.abort = new AbortController();
        const valid = () => !this.preferences.isMuted(state.owner) && revision === this.preferences.revision(state.owner) && (!this.boundaries?.pausedUntil(state.owner) || Boolean(state.boundaryNotice && text === state.boundaryNotice));
        const edit = payload => state.messages[0].edit(cleanDiscordPayload({ ...payload, ...(payload.content ? { content: localizeFixed(payload.content, state.language) } : {}), flags: MessageFlags.SuppressEmbeds, allowedMentions: safeMentions }));
        let text;
        try {
            if (!valid()) throw new Error('Request stopped');
            if (refreshing) {
                const lines = [];
                for (const intent of state.prices.values()) {
                    if (!valid()) throw new Error('Request stopped');
                    const result = await this.actions.execute(intent, { signal: state.abort.signal });
                    if (result.quote) {
                        const q = result.quote;
                        lines.push(`${q.symbol}${q.currency ? '/' + q.currency : ''}: **${quoteMoney(q)}** · ${q.sourceLabel || q.source} · ${q.kind === 'aggregate' ? 'updated' : 'trade'} ${q.ageSeconds}s ago`);
                    } else {
                        const page = result.pages?.[0];
                        lines.push([page?.title, page?.description, page?.footer?.text].filter(Boolean).join(' · ') || 'Recent price unavailable. Try again shortly.');
                    }
                }
                text = lines.join('\n');
            } else {
                text = await state.task(async content => {
                    if (valid()) await edit({ content: compactPreview(content, { language: state.language }), components: this.components(id, state) });
                }, state.abort.signal, (intent, output) => {
                    if (intent.command === 'report_direct_abuse' && output?.boundaryNotice) state.boundaryNotice = output.boundaryNotice;
                    if (intent.command === 'price') state.prices.set(JSON.stringify(intent.args), intent);
                    if (intent.command === 'offer_stop' && output?.confirmationRequired) state.stopRequested = true;
                });
            }
        } catch {
            text = 'I couldn’t verify that right now. Please try again shortly.';
        } finally { state.busy = false; }
        if (!valid()) {
            if (this.boundaries?.pausedUntil(state.owner)) {
                for (const sent of state.messages) await sent.delete().catch(() => {});
                return;
            }
            await edit({ content: 'Request stopped. Use /start to enable automatic replies again.', components: [] }); return;
        }
        state.fullPages = splitMessage(localizeFixed(text || 'No answer available.', state.language), Math.min(state.maxLength, 1900));
        state.summary = compactPreview(localizeFixed(text || 'No answer available.', state.language), { language: state.language });
        state.expandable = state.fullPages.length > 1 || state.fullPages[0].length >= 400;
        state.expanded = false; state.page = 0;
        await this.render(id, state);
    }
    async render(id, state) {
        if (this.sessions.get(id) !== state || state.expires <= this.now() || this.preferences.isMuted(state.owner) || this.boundaries?.pausedUntil(state.owner) && !state.boundaryNotice) return;
        const content = state.expanded ? state.fullPages[state.page] : state.summary;
        await state.messages[0].edit(cleanDiscordPayload({ content, components: this.components(id, state), flags: MessageFlags.SuppressEmbeds, allowedMentions: safeMentions }));
        for (const old of state.messages.splice(1)) await old.delete().catch(() => {});
    }

    async onButton(interaction) {
        const [, id, action] = interaction.customId.split(':');
        const state = this.sessions.get(id);
        if (!state || state.expires <= this.now() || state.owner !== interaction.user.id || !['refresh', 'stop', 'more', 'less', 'next', 'previous'].includes(action) || action === 'refresh' && !state.prices.size || action === 'stop' && !state.stopRequested) {
            await replyClean(interaction, { content: 'This control expired or isn’t yours. Use /start or /stop to change your preference.', flags: MessageFlags.Ephemeral }); return;
        }
        if (action === 'stop') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            this.preferences.setMuted(state.owner, true);
            await interaction.editReply(cleanDiscordPayload({ content: 'Automatic replies stopped for you. Use /start to turn them back on.' }));
            await state.messages[0]?.edit(cleanDiscordPayload({ ...(state.busy ? { content: 'Request stopped. Use /start to resume.' } : {}), components: [] }))?.catch(() => {});
            return;
        }
        if (this.boundaries?.pausedUntil(state.owner)) {
            await replyClean(interaction, { content: 'Our conversation is paused for 5 hours. Please try after the pause ends.', flags: MessageFlags.Ephemeral }); return;
        }
        if (['more', 'less', 'next', 'previous'].includes(action)) {
            if (this.preferences.isMuted(state.owner) || state.busy || state.toggling || !state.expandable || ['next', 'previous'].includes(action) && !state.expanded) {
                await replyClean(interaction, { content: 'That view is busy or unavailable. Try again shortly.', flags: MessageFlags.Ephemeral }); return;
            }
            state.toggling = true;
            const old = { expanded: state.expanded, page: state.page };
            try {
                await interaction.deferUpdate();
                if (action === 'more') { state.expanded = true; state.page = 0; }
                else if (action === 'less') { state.expanded = false; state.page = 0; }
                else state.page = Math.max(0, Math.min(state.fullPages.length - 1, state.page + (action === 'next' ? 1 : -1)));
                await this.render(id, state);
            } catch (error) { Object.assign(state, old); throw error; }
            finally { state.toggling = false; }
            return;
        }
        if (this.preferences.isMuted(state.owner) || state.busy || state.toggling || (this.cooldowns.get(state.owner) || 0) > this.now()) {
            await replyClean(interaction, { content: this.preferences.isMuted(state.owner) ? 'Replies are stopped. Use /start to resume.' : 'Already checking, or on cooldown. Try again shortly.', flags: MessageFlags.Ephemeral }); return;
        }
        state.busy = true;
        if (this.cooldowns.size >= 1000) for (const [key, until] of this.cooldowns) if (until <= this.now()) this.cooldowns.delete(key);
        this.cooldowns.set(state.owner, this.now() + 5000);
        try {
            await interaction.deferUpdate();
            await state.messages[0].edit(cleanDiscordPayload({ content: localizeFixed('Checking again...', state.language), components: this.components(id, state) }));
            await this.execute(id, state, true);
        } finally { state.busy = false; }
    }
    destroy() {
        for (const state of this.sessions.values()) state.abort?.abort();
        this.sessions.clear(); this.cooldowns.clear();
    }

}
module.exports = { PublicControls };

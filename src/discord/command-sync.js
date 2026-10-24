const { Routes } = require('discord.js');
const { createLogger, errorDetails } = require('../utils/logger');

// Compare only fields this application manages; Discord adds IDs, versions and defaults.
function normalizeOption(option) {
    const result = { type: option.type, name: option.name, description: option.description, required: option.required ?? false };
    for (const key of ['autocomplete', 'choices', 'channel_types', 'min_value', 'max_value', 'min_length', 'max_length']) {
        if (option[key] !== undefined && option[key] !== null && option[key] !== false) result[key] = key === 'choices' ? option[key].map(choice => ({ name: choice.name, value: choice.value })) : option[key];
    }
    result.options = (option.options || []).map(normalizeOption);
    return result;
}
function signature(commands) {
    return JSON.stringify(commands.map(command => ({
        type: command.type ?? 1, name: command.name, description: command.description || '',
        default_member_permissions: command.default_member_permissions ?? null,
        nsfw: command.nsfw ?? false,
        options: (command.options || []).map(normalizeOption),
    })).sort((a, b) => a.type - b.type || a.name.localeCompare(b.name)));
}
class GuildCommandSync {
    constructor({ rest, commands, logger = createLogger('command-sync') }) {
        this.rest = rest; this.commands = commands; this.logger = logger;
        this.pending = new Map(); this.stopped = false;
    }
    syncGuild(applicationId, guildId) {
        if (this.stopped) return Promise.resolve({ guildId, status: 'skipped' });
        const key = `${applicationId}:${guildId}`;
        if (this.pending.has(key)) return this.pending.get(key);
        const task = this.perform(applicationId, guildId).finally(() => this.pending.delete(key));
        this.pending.set(key, task);
        return task;
    }
    async perform(applicationId, guildId) {
        try {
            const route = Routes.applicationGuildCommands(applicationId, guildId);
            const current = await this.rest.get(route);
            if (signature(current) === signature(this.commands)) {
                this.logger.debug('Commands already current', { guild: guildId });
                return { guildId, status: 'unchanged' };
            }
            // This application owns its guild command set. Global/other applications' commands are untouched.
            await this.rest.put(route, { body: this.commands });
            this.logger.info('Server commands registered', { guild: guildId, count: this.commands.length });
            return { guildId, status: 'updated' };
        } catch (error) {
            this.logger.error('Server command sync failed', { guild: guildId, ...errorDetails(error) });
            this.logger.warn('Check server installation', { hint: 'Install with bot + applications.commands scopes' });
            return { guildId, status: 'failed' };
        }
    }
    async syncAll(applicationId, guildIds) {
        const results = [];
        // Sequential registration avoids a burst of requests when joining several guilds.
        for (const guildId of new Set(guildIds)) results.push(await this.syncGuild(applicationId, guildId));
        const summary = { servers: results.length, updated: 0, unchanged: 0, failed: 0, skipped: 0 };
        for (const result of results) summary[result.status]++;
        const { skipped, ...fields } = summary;
        this.logger.info('Command sync complete', { ...fields, ...(skipped ? { skipped } : {}) });
        return summary;
    }
    async stop() {
        this.stopped = true;
        await Promise.all([...this.pending.values()]);
    }
}
// Used by the standalone deployment script; pages across all bot guilds.
async function discoverGuildIds(rest) {
    const ids = []; let after = '0';
    while (true) {
        const page = await rest.get(Routes.userGuilds(), { query: new URLSearchParams({ limit: '200', after }) });
        if (!Array.isArray(page)) throw new Error('Invalid guild list from Discord');
        ids.push(...page.map(guild => guild.id));
        if (page.length < 200) return [...new Set(ids)];
        const next = page[page.length - 1].id;
        if (next === after) throw new Error('Guild pagination did not advance');
        after = next;
    }
}
module.exports = { GuildCommandSync, signature, discoverGuildIds };

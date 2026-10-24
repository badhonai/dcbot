const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { REST } = require('discord.js');
const { commands } = require('../src/discord/commands');
const { GuildCommandSync, discoverGuildIds } = require('../src/discord/command-sync');
const { createLogger, errorDetails } = require('../src/utils/logger');
const log = createLogger('deploy');
async function main() {
    const { DISCORD_TOKEN, DISCORD_APPLICATION_ID, DISCORD_GUILD_IDS, DISCORD_GUILD_ID } = process.env;
    if (!DISCORD_TOKEN?.trim()) {
        log.error('Missing deployment settings', { hint: 'Set DISCORD_TOKEN in .env' });
        process.exitCode = 1; return;
    }
    const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
    const applicationId = DISCORD_APPLICATION_ID?.trim() || (await rest.get('/oauth2/applications/@me')).id;
    const targets = DISCORD_GUILD_IDS?.trim() || DISCORD_GUILD_ID?.trim();
    let guildIds;
    if (targets) {
        guildIds = [...new Set(targets.split(',').map(id => id.trim()).filter(Boolean))];
        if (!guildIds.length || guildIds.some(id => !/^\d{17,20}$/.test(id))) {
            log.error('Invalid server IDs', { hint: 'Use comma-separated server IDs in DISCORD_GUILD_IDS' });
            process.exitCode = 1; return;
        }
    } else guildIds = await discoverGuildIds(rest);
    if (!guildIds.length) { log.warn('No servers found', { hint: 'Install the bot in a server first' }); return; }
    log.info('Checking server commands', { servers: guildIds.length, count: commands.length });
    const result = await new GuildCommandSync({ rest, commands, logger: log }).syncAll(applicationId, guildIds);
    if (result.failed) process.exitCode = 1;
}
main().catch(error => { log.error('Command deployment failed', errorDetails(error)); process.exitCode = 1; });

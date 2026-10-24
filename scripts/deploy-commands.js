const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { REST, Routes } = require('discord.js');
const { commands } = require('../src/discord/commands');
const { createLogger, errorDetails } = require('../src/utils/logger');
const log = createLogger('deploy');
async function main() {
    const { DISCORD_TOKEN, DISCORD_APPLICATION_ID, DISCORD_GUILD_ID } = process.env;
    if (!DISCORD_TOKEN || !DISCORD_APPLICATION_ID || !DISCORD_GUILD_ID) {
        log.error('Missing deployment settings', { hint: 'Set DISCORD_TOKEN, DISCORD_APPLICATION_ID and DISCORD_GUILD_ID in .env' });
        process.exitCode = 1; return;
    }
    log.info('Deploying guild commands', { guild: DISCORD_GUILD_ID, count: commands.length });
    const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
    await rest.put(Routes.applicationGuildCommands(DISCORD_APPLICATION_ID, DISCORD_GUILD_ID), { body: commands });
    log.info('Commands deployed successfully', { count: commands.length });
}
main().catch(error => { log.error('Command deployment failed', errorDetails(error)); process.exitCode = 1; });

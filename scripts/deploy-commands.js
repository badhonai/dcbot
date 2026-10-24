const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { REST, Routes } = require('discord.js');
const { commands } = require('../src/discord/commands');
async function main() {
    const { DISCORD_TOKEN, DISCORD_APPLICATION_ID, DISCORD_GUILD_ID } = process.env;
    if (!DISCORD_TOKEN || !DISCORD_APPLICATION_ID || !DISCORD_GUILD_ID) {
        throw new Error('Set DISCORD_TOKEN, DISCORD_APPLICATION_ID and DISCORD_GUILD_ID');
    }
    const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
    await rest.put(Routes.applicationGuildCommands(DISCORD_APPLICATION_ID, DISCORD_GUILD_ID), { body: commands });
    console.info('Guild commands deployed.');
}
main().catch(error => { console.error('Command deployment failed:', error.message); process.exitCode = 1; });

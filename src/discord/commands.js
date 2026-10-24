const { SlashCommandBuilder } = require('discord.js');
const text = (command, name, description, required = true) => command.addStringOption(o => o.setName(name).setDescription(description).setRequired(required).setMaxLength(500));
const commands = [
    new SlashCommandBuilder().setName('help').setDescription('Commands, privacy, data sources and limits'),
    text(text(new SlashCommandBuilder().setName('ask').setDescription('Search locally approved project documents'), 'question', 'Question about the project'), 'project', 'Project ID; optional when only one is configured', false),
    text(new SlashCommandBuilder().setName('official').setDescription('Show curator-approved project links'), 'project', 'Project ID', false),
    text(new SlashCommandBuilder().setName('price').setDescription('Latest USD quote; use an exact coin ID to avoid ambiguity'), 'token', 'Symbol, name, or CoinPaprika ID such as btc-bitcoin'),
    text(text(new SlashCommandBuilder().setName('pair').setDescription('DEX pools for a token contract'), 'chain', 'ethereum, solana, base, bsc, arbitrum, polygon, optimism, avalanche'), 'address', 'Token contract/mint address (not a pool address)'),
    text(new SlashCommandBuilder().setName('newpairs').setDescription('Recent pools, NOT verified new projects or recommendations'), 'chain', 'ethereum, solana, base, bsc, arbitrum, polygon, optimism, avalanche'),
    text(new SlashCommandBuilder().setName('explain').setDescription('Free curated Web3 glossary'), 'term', 'Try liquidity, slippage, market cap, fdv, token unlock, gas, staking, rug pull'),
].map(command => command.toJSON());
module.exports = { commands };

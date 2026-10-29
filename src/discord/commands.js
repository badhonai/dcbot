const { SlashCommandBuilder } = require('discord.js');
const text = (command, name, description, required = true) => command.addStringOption(o => o.setName(name).setDescription(description).setRequired(required).setMaxLength(500));
const chains = [ ['Ethereum', 'ethereum'], ['Solana', 'solana'], ['Base', 'base'], ['BNB Chain', 'bsc'], ['Arbitrum', 'arbitrum'], ['Polygon', 'polygon'], ['Optimism', 'optimism'], ['Avalanche', 'avalanche'] ];
const chain = command => command.addStringOption(o => o.setName('chain').setDescription('Choose a network').setRequired(true).addChoices(...chains.map(([name, value]) => ({ name, value }))));
const commands = [
    new SlashCommandBuilder().setName('start').setDescription('Resume automatic replies to you'),
    new SlashCommandBuilder().setName('stop').setDescription('Stop automatic replies to you'),
    new SlashCommandBuilder().setName('chat').setDescription('Ask the AI agent to help with a task').addStringOption(o => o.setName('message').setDescription('Question, task or context').setRequired(true).setMaxLength(2000)),
    text(new SlashCommandBuilder().setName('search').setDescription('Search the web with source links'), 'query', 'What should I search for?'),
    new SlashCommandBuilder().setName('read').setDescription('Read a public webpage').addStringOption(o => o.setName('url').setDescription('Full HTTPS webpage URL').setRequired(true).setMaxLength(2000)),
    new SlashCommandBuilder().setName('help').setDescription('Commands & quick examples'),
    text(text(new SlashCommandBuilder().setName('ask').setDescription('Search approved project docs'), 'question', 'What would you like to know?'), 'project', 'Project ID (optional)', false),
    text(new SlashCommandBuilder().setName('official').setDescription('Approved project links'), 'project', 'Project ID (optional)', false),
    text(new SlashCommandBuilder().setName('price').setDescription('CoinGecko price or exchange trade'), 'token', 'Ticker, e.g. BTC, ETH or SOL').addStringOption(o => o.setName('mode').setDescription('CoinGecko by default, or choose a source').addChoices({ name: 'Recent CoinGecko quote', value: 'live' }, { name: 'Fresh exchange trade', value: 'exchange' }, { name: 'Market stats (USD, delayed)', value: 'market' })).addStringOption(o => o.setName('currency').setDescription('USDT by default; USD on request').addChoices({ name: 'USDT', value: 'usdt' }, { name: 'USD', value: 'usd' })),
    text(chain(new SlashCommandBuilder().setName('pair').setDescription('Token pools, liquidity & volume')), 'address', 'Token contract or mint address (not a pool)'),
    chain(new SlashCommandBuilder().setName('newpairs').setDescription('Recent pools · unverified')),
    new SlashCommandBuilder().setName('explain').setDescription('Web3 terms, simply explained').addStringOption(o => o.setName('term').setDescription('Choose a term').setRequired(true).addChoices(...['liquidity', 'slippage', 'market cap', 'fdv', 'token unlock', 'gas', 'staking', 'rug pull'].map(value => ({ name: value === 'fdv' ? 'FDV' : value.charAt(0).toUpperCase() + value.slice(1), value })))),
    text(new SlashCommandBuilder().setName('coin').setDescription('Token fundamentals & listed links'), 'token', 'Ticker or exact CoinGecko ID'),
    text(new SlashCommandBuilder().setName('compare').setDescription('Compare 2–4 tokens in USDT'), 'tokens', 'Comma-separated, e.g. BTC, ETH, SOL'),
    new SlashCommandBuilder().setName('trending').setDescription('Trending searches, not endorsements'),
    text(new SlashCommandBuilder().setName('x').setDescription('Research public X/Twitter evidence'), 'query', 'Public post/profile URL, @handle or topic'),
    text(new SlashCommandBuilder().setName('news').setDescription('Recent crypto news excerpts with sources'), 'topic', 'Topic, e.g. Ethereum upgrades', false),
    new SlashCommandBuilder().setName('fun').setDescription('Quizzes, riddles & community games')
        .addStringOption(o => o.setName('activity').setDescription('Choose an activity').addChoices(...['quiz', 'riddle', 'icebreaker', 'debate', 'fact'].map(value => ({ name: value, value }))))
        .addStringOption(o => o.setName('language').setDescription('Question language').addChoices({ name: 'English', value: 'en' }, { name: 'বাংলা', value: 'bn' }, { name: 'Banglish', value: 'banglish' })),
    text(text(new SlashCommandBuilder().setName('answer').setDescription('Check a quiz or riddle answer'), 'id', 'Question ID shown on the game, e.g. q1'), 'choice', 'A/B/C, riddle answer, or reveal')
        .addStringOption(o => o.setName('language').setDescription('Answer language').addChoices({ name: 'English', value: 'en' }, { name: 'বাংলা', value: 'bn' }, { name: 'Banglish', value: 'banglish' })),
].map(command => command.toJSON());
module.exports = { commands };

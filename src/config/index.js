const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '../..');

function loadConfig(env = process.env) {
    const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
    for (const key of ['DISCORD_TOKEN']) {
        if (!env[key]?.trim()) throw new Error(`Missing environment variable: ${key}`);
    }
    if (!Array.isArray(config.channels) || !config.channels.length ||
        !config.channels.every(id => typeof id === 'string' && /^\d{17,20}$/.test(id))) {
        throw new Error('channels must contain Discord channel ID strings');
    }
    if (typeof config.model !== 'string' || !config.model.trim()) throw new Error('model is required');
    const ranges = { historyLength: [1, 200], maxResponseLength: [1, 2000],
        maxCompletionTokens: [1, 32768], maxPendingPerChannel: [1, 100], requestTimeoutMs: [1000, 120000] };
    for (const [key, [min, max]] of Object.entries(ranges)) {
        if (!Number.isInteger(config[key]) || config[key] < min || config[key] > max) {
            throw new Error(`${key} must be an integer between ${min} and ${max}`);
        }
    }
    if (!Number.isFinite(config.temperature) || config.temperature < 0 || config.temperature > 2) {
        throw new Error('temperature must be between 0 and 2');
    }
    if (typeof config.systemPromptFile !== 'string') throw new Error('systemPromptFile is required');
    const promptPath = path.resolve(ROOT, config.systemPromptFile);
    const systemPrompt = fs.readFileSync(fs.existsSync(promptPath) ? promptPath : path.join(ROOT, 'system-prompt.example.txt'), 'utf8').trim();
    if (!systemPrompt) throw new Error('System prompt must not be empty');
    return Object.freeze({ ...config, channels: Object.freeze([...config.channels]), systemPrompt,
        discordToken: env.DISCORD_TOKEN, groqApiKey: env.GROQ_API_KEY });
}
module.exports = { loadConfig, ROOT };

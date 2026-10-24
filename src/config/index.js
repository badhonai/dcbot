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
    if (config.naturalLanguageCommands !== undefined && typeof config.naturalLanguageCommands !== 'boolean') throw new Error('naturalLanguageCommands must be true or false');
    if (typeof config.model !== 'string' || !config.model.trim()) throw new Error('model is required');
    const legacyGroq = !config.fallbackModel && config.model.startsWith('qwen/');
    const model = env.OLLAMA_MODEL?.trim() || (legacyGroq ? 'gpt-oss:120b' : config.model);
    const fallbackModel = env.GROQ_MODEL?.trim() || config.fallbackModel || (legacyGroq ? config.model : 'qwen/qwen3.8-27b');
    if (typeof fallbackModel !== 'string' || !fallbackModel.trim()) throw new Error('fallbackModel is required');
    const primaryMaxTokens = config.primaryMaxTokens ?? 1024;
    if (!Number.isInteger(primaryMaxTokens) || primaryMaxTokens < 128 || primaryMaxTokens > 8192) throw new Error('primaryMaxTokens must be between 128 and 8192');
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
    return Object.freeze({ ...config, model, fallbackModel, primaryMaxTokens, channels: Object.freeze([...config.channels]), systemPrompt,
        discordToken: env.DISCORD_TOKEN, groqApiKey: env.GROQ_API_KEY?.trim() || undefined, ollamaApiKey: env.OLLAMA_API_KEY?.trim() || undefined });
}
module.exports = { loadConfig, ROOT };

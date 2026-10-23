const Groq = require('groq-sdk');

let groq;
let config;
let systemPrompt = '';

// Each channel gets its own conversation history
const histories = new Map();

function init(cfg, prompt) {
    config = cfg;
    systemPrompt = prompt;
    groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
}

function getHistory(channelId) {
    if (!histories.has(channelId)) {
        histories.set(channelId, []);
    }
    return histories.get(channelId);
}

function addToHistory(channelId, role, content) {
    const history = getHistory(channelId);
    history.push({ role, content });
    while (history.length > config.historyLength) {
        history.shift();
    }
}

function removeLastAssistant(channelId) {
    const history = getHistory(channelId);
    for (let i = history.length - 1; i >= 0; i--) {
        if (history[i].role === 'assistant') {
            history.splice(i, 1);
            return true;
        }
    }
    return false;
}

function cleanResponse(text) {
    return text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

async function getResponse(channelId) {
    const history = getHistory(channelId);
    const messages = [
        { role: 'system', content: systemPrompt },
        ...history,
    ];

    try {
        const completion = await groq.chat.completions.create({
            model: config.model,
            messages,
            temperature: config.temperature,
            max_completion_tokens: 300,
        });

        let reply = completion.choices[0]?.message?.content || '';
        reply = cleanResponse(reply);

        if (!reply) {
            reply = '⚠️ I got an empty response. Try again?';
        }

        return reply;
    } catch (error) {
        console.error('Groq API error:', error.message);
        if (error.status === 429) {
            return '⏳ Rate limited. Give me a moment...';
        }
        return `⚠️ AI error: ${error.message}`;
    }
}

module.exports = { init, addToHistory, removeLastAssistant, getResponse };
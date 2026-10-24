function cleanResponse(text) {
    // Fail closed if a reasoning section is truncated without a closing tag.
    return text.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '').trim();
}
function createAiService(client, config) {
    return {
        async respond(history) {
            const completion = await client.chat.completions.create({
                model: config.model,
                messages: [{ role: 'system', content: config.systemPrompt }, ...history],
                temperature: config.temperature,
                max_completion_tokens: config.maxCompletionTokens,
            });
            const text = cleanResponse(completion.choices?.[0]?.message?.content || '');
            if (!text) throw new Error('AI returned no usable text');
            return text;
        },
    };
}
module.exports = { createAiService, cleanResponse };

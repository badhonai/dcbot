const Groq = require('groq-sdk');
const { cleanResponse } = require('./groq-service');
const { createLogger } = require('../utils/logger');

function failurePolicy(error) {
    const status = error?.status;
    const detail = `${error?.code || ''} ${error?.error?.code || ''} ${error?.message || ''}`.toLowerCase();
    if (status === 402 || /insufficient_(?:quota|credits|balance)|quota[_\s-]*(?:exceeded|exhausted)|(?:credit|balance).{0,30}(?:exhaust|deplet|insufficient|limit|empty)|(?:exhaust|insufficient).{0,30}(?:credit|balance)|usage.{0,30}limit|(?:hourly|weekly|monthly).{0,20}limit/.test(detail)) return { reason: 'credits_or_quota', waitMs: 3600000 };
    let retryMs = 0;
    const header = error?.headers?.get?.('retry-after');
    if (header) {
        const seconds = Number(header);
        retryMs = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - Date.now();
        retryMs = Math.max(0, Math.min(retryMs || 0, 86400000));
    }
    if (status === 429) return { reason: 'rate_limit', waitMs: Math.max(60000, retryMs) };
    if ([401, 403].includes(status)) return { reason: 'authentication_or_access', waitMs: 300000 };
    if (status === 404) return { reason: 'model_unavailable', waitMs: 300000 };
    if ([408, 409].includes(status) || status >= 500) return { reason: 'service_unavailable', waitMs: 30000 };
    if (error?.code === 'EMPTY_COMPLETION') return { reason: 'empty_response', waitMs: 30000 };
    if (!status && (/timeout|abort|connection|network|fetch/i.test(error?.name || '') || error instanceof TypeError)) return { reason: 'network_or_timeout', waitMs: 15000 };
    return null; // Do not hide invalid request/schema errors by retrying them elsewhere.
}
function usableCompletion(result) {
    const message = result?.choices?.[0]?.message;
    return Boolean(message && (typeof message.content === 'string' && cleanResponse(message.content) || Array.isArray(message.tool_calls) && message.tool_calls.length));
}
function createFailoverClient({ providers, now = Date.now, logger = createLogger('ai') }) {
    const states = providers.map(provider => ({ ...provider, until: 0, failed: false, probing: false, generation: 0 }));
    return {
        chat: { completions: { create: async request => {
            for (const state of states) {
                if (state.until > now() || state.probing) continue;
                const recovering = state.failed;
                if (recovering) state.probing = true;
                const generation = state.generation;
                try {
                    const result = await state.client.chat.completions.create({ ...request, model: state.model });
                    if (!usableCompletion(result)) throw Object.assign(new Error('Provider returned no answer or tool call'), { code: 'EMPTY_COMPLETION' });
                    if (generation === state.generation) {
                        state.until = 0; state.failed = false;
                        if (recovering) logger.info('AI provider recovered', { provider: state.name });
                    }
                    return result;
                } catch (error) {
                    const policy = failurePolicy(error);
                    if (!policy) throw error;
                    const alreadyCooling = state.until > now();
                    state.until = Math.max(state.until, now() + policy.waitMs);
                    state.failed = true; state.generation++;
                    if (!alreadyCooling) logger.warn('AI provider paused', { provider: state.name, reason: policy.reason, retrySeconds: Math.ceil(policy.waitMs / 1000), next: states[states.indexOf(state) + 1]?.name || 'none' });
                } finally { if (recovering) state.probing = false; }
            }
            throw Object.assign(new Error('AI providers temporarily unavailable'), { code: 'AI_UNAVAILABLE', status: 503 });
        } } },
    };
}
function createOllamaClient({ apiKey, timeoutMs = 30000, maxTokens = 1024, fetchFn = fetch }) {
    return { chat: { completions: { create: async request => {
        const body = {
            model: request.model, messages: request.messages, stream: false,
            temperature: request.temperature ?? 0.2,
            max_tokens: maxTokens,
            reasoning_effort: 'low',
            ...(request.tools ? { tools: request.tools } : {}),
        };
        // Ollama documents tools but not tool_choice/max_completion_tokens compatibility.
        const response = await fetchFn('https://ollama.com/v1/chat/completions', {
            method: 'POST', signal: AbortSignal.timeout(timeoutMs),
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        });
        if (!response.ok) {
            let data;
            try { data = await response.json(); } catch { data = {}; }
            const detail = typeof data?.error === 'string' ? data.error : data?.error?.message || data?.message || '';
            // The detail is used only to classify quota failures; never log or return it to Discord.
            throw Object.assign(new Error(detail || 'Ollama request failed'), { status: response.status, headers: response.headers, code: data?.error?.code });
        }
        try { return await response.json(); }
        catch { throw Object.assign(new Error('Invalid Ollama response'), { status: 502, code: 'BAD_RESPONSE' }); }
    } } } };
}
function createModelClient(config, { logger = createLogger('ai'), fetchFn = fetch } = {}) {
    const providers = [];
    if (config.ollamaApiKey) providers.push({ name: 'ollama', model: config.model,
        client: createOllamaClient({ apiKey: config.ollamaApiKey, timeoutMs: config.requestTimeoutMs, maxTokens: config.primaryMaxTokens || 1024, fetchFn }) });
    if (config.groqApiKey) providers.push({ name: 'groq', model: config.fallbackModel,
        client: new Groq({ apiKey: config.groqApiKey, timeout: config.requestTimeoutMs, maxRetries: 0 }) });
    if (!providers.length) return null;
    logger.info('AI providers ready', { primary: providers[0].name, model: providers[0].model, fallback: providers[1]?.name || 'none' });
    return createFailoverClient({ providers, logger });
}
module.exports = { failurePolicy, usableCompletion, createFailoverClient, createOllamaClient, createModelClient };

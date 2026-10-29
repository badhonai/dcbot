const { boundedJson } = require('../integrations/bounded-json');
const { readPublicPage, publicUrl } = require('../integrations/safe-page');
class WebService {
    constructor({ apiKey, fetchFn = fetch, reader = readPublicPage, now = Date.now } = {}) {
        this.apiKey = apiKey; this.fetch = fetchFn; this.reader = reader; this.now = now; this.pausedUntil = 0; this.cache = new Map(); this.pending = new Map();
    }
    async search(query, { signal } = {}) {
        signal?.throwIfAborted();
        query = query.trim().slice(0, 500);
        if (!query) throw new Error('Search query is empty');
        // Aborted callers do not join a shared transport controlled by another signal.
        if (signal) return this.searchOnce(query, { signal });
        const cached = this.cache.get(query);
        if (cached?.expires > this.now()) return structuredClone(cached.value);
        if (this.pending.has(query)) return structuredClone(await this.pending.get(query));
        if (this.pending.size >= 3) throw new Error('Web search is busy. Try again shortly.');
        const work = this.searchOnce(query).then(value => {
            for (const [key, entry] of this.cache) if (entry.expires <= this.now()) this.cache.delete(key);
            if (this.cache.size >= 32) this.cache.delete(this.cache.keys().next().value);
            this.cache.set(query, { value: structuredClone(value), expires: this.now() + 30000 }); return value;
        });
        this.pending.set(query, work);
        try { return await work; } finally { this.pending.delete(query); }
    }
    async searchOnce(query, { signal } = {}) {
        if (!this.apiKey) throw new Error('Web search needs OLLAMA_API_KEY on the host.');
        if (this.pausedUntil > this.now()) throw new Error('Web search is temporarily rate limited.');
        const timeout = AbortSignal.timeout(12000);
        const response = await this.fetch('https://ollama.com/api/web_search', { method: 'POST', signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
            headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: query.slice(0, 500), max_results: 5 }) });
        if (!response.ok) {
            if ([402, 429].includes(response.status)) this.pausedUntil = this.now() + 60000;
            throw new Error('Web search is unavailable or its allowance is exhausted.');
        }
        const data = await boundedJson(response, 256 * 1024);
        return { results: (Array.isArray(data.results) ? data.results : []).slice(0, 5).flatMap(item => {
            if (!item || typeof item !== 'object') return [];
            try { const url = publicUrl(item.url).href; return [{ title: String(item.title || '').slice(0, 180), url, content: String(item.content || '').slice(0, 1200) }]; }
            catch { return []; }
        }), fetchedAt: new Date(this.now()).toISOString(), untrusted: true };
    }
    async read(url, options = {}) { return { ...await this.reader(url, options), untrusted: true }; }
}
module.exports = { WebService };

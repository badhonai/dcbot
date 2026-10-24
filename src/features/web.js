const { readPublicPage, publicUrl } = require('../integrations/safe-page');
class WebService {
    constructor({ apiKey, fetchFn = fetch, reader = readPublicPage, now = Date.now } = {}) {
        this.apiKey = apiKey; this.fetch = fetchFn; this.reader = reader; this.now = now; this.pausedUntil = 0;
    }
    async search(query, { signal } = {}) {
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
        const data = await response.json();
        return { results: (data.results || []).slice(0, 5).flatMap(item => {
            try { const url = publicUrl(item.url).href; return [{ title: String(item.title || '').slice(0, 180), url, content: String(item.content || '').slice(0, 1200) }]; }
            catch { return []; }
        }), fetchedAt: new Date(this.now()).toISOString(), untrusted: true };
    }
    async read(url, options = {}) { return { ...await this.reader(url, options), untrusted: true }; }
}
module.exports = { WebService };

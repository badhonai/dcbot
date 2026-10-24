const { createLogger } = require('../utils/logger');
const { setTimeout: delay } = require('node:timers/promises');
class PublicApi {
    constructor({ fetchFn = fetch, now = Date.now, logger = createLogger('market-api') } = {}) {
        this.logger = logger;
        this.fetch = fetchFn; this.now = now; this.cache = new Map(); this.pending = new Map(); this.next = new Map();
    }
    async get(url, ttl = 60000) {
        const host = new URL(url).hostname;
        if (!['api.coinpaprika.com', 'api.dexscreener.com', 'api.geckoterminal.com', 'api.exchange.coinbase.com'].includes(host)) throw new Error('Unsupported provider');
        const hit = this.cache.get(url);
        if (ttl > 0 && hit && hit.expires > this.now()) { this.logger.debug?.('Cache hit', { provider: host }); return hit.value; }
        if (this.pending.has(url)) return this.pending.get(url);
        const wait = Math.max(0, (this.next.get(host) || 0) - this.now());
        if (wait > 10000) throw new Error('Provider busy or rate limited. Please try again shortly.');
        // Reserve slots before awaiting to avoid concurrent requests bursting the provider.
        this.next.set(host, this.now() + wait + (host === 'api.exchange.coinbase.com' ? 300 : 2500));
        const work = (async () => {
            if (wait) await delay(wait);
            const response = await this.fetch(url, { signal: AbortSignal.timeout(12000), ...(ttl === 0 ? { cache: 'no-store' } : {}), headers: { Accept: 'application/json', 'User-Agent': 'dcbot-web3/1.0' } });
            if (!response.ok) {
                this.logger.warn('Provider request rejected', { provider: host, status: response.status, hint: response.status === 429 ? 'Cooling down for 60 seconds' : 'Retry later; check provider status' });
                if (response.status === 429) this.next.set(host, this.now() + 60000);
                throw new Error('Data provider unavailable or rate limited. Please try again later.');
            }
            this.logger.debug?.('Provider request completed', { provider: host, status: response.status });
            const value = { data: await response.json(), fetchedAt: new Date(this.now()).toISOString() };
            if (ttl > 0) {
                if (this.cache.size >= 200) this.cache.delete(this.cache.keys().next().value);
                this.cache.set(url, { value, expires: this.now() + ttl });
            }
            return value;
        })();
        this.pending.set(url, work);
        try { return await work; } finally { this.pending.delete(url); }
    }
}
module.exports = { PublicApi };

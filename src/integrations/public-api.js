const { boundedJson } = require('./bounded-json');
const { createLogger } = require('../utils/logger');
const { setTimeout: delay } = require('node:timers/promises');
class PublicApi {
    constructor({ fetchFn = fetch, now = Date.now, logger = createLogger('market-api'), coingeckoApiKey, maxCacheBytes = 4 * 1024 * 1024, maxPending = 6 } = {}) {
        this.maxCacheBytes = maxCacheBytes; this.maxPending = maxPending; this.cacheBytes = 0;
        this.logger = logger; this.coingeckoApiKey = coingeckoApiKey;
        this.fetch = fetchFn; this.now = now; this.cache = new Map(); this.pending = new Map(); this.next = new Map();
    }
    async get(url, ttl = 60000) {
        const target = new URL(url); const host = target.hostname;
        if (target.protocol !== 'https:' || target.username || target.password || target.port && target.port !== '443') throw new Error('Unsupported provider');
        if (!['api.coingecko.com', 'api.coinpaprika.com', 'api.dexscreener.com', 'api.geckoterminal.com', 'api.exchange.coinbase.com', 'api.kraken.com'].includes(host)) throw new Error('Unsupported provider');
        const hit = this.cache.get(url);
        if (ttl > 0 && hit && hit.expires > this.now()) { this.logger.debug?.('Cache hit', { provider: host }); return hit.value; }
        if (this.pending.has(url)) return this.pending.get(url);
        if (this.pending.size >= this.maxPending) throw Object.assign(new Error('Provider busy; try again shortly.'), { code: 'BOT_BUSY' });
        const wait = Math.max(0, (this.next.get(host) || 0) - this.now());
        if (wait > 10000) throw Object.assign(new Error('Provider busy or rate limited. Please try again shortly.'), { code: 'PROVIDER_COOLDOWN', status: 429 });
        // Reserve slots before awaiting to avoid concurrent requests bursting the provider.
        this.next.set(host, this.now() + wait + (host === 'api.exchange.coinbase.com' ? 300 : host === 'api.kraken.com' ? 1000 : 2500));
        const work = (async () => {
            if (wait) await delay(wait);
            const response = await this.fetch(url, { redirect: 'error', signal: AbortSignal.timeout(12000), ...(ttl === 0 ? { cache: 'no-store' } : {}), headers: { Accept: 'application/json', 'User-Agent': 'dcbot-web3/1.0', ...(host === 'api.coingecko.com' && this.coingeckoApiKey ? { 'x-cg-demo-api-key': this.coingeckoApiKey } : {}) } });
            if (!response.ok) {
                let providerCode;
                if (host === 'api.coingecko.com') {
                    try {
                        const body = await boundedJson(response, 16384);
                        const code = Number(body?.status?.error_code ?? body?.error_code);
                        if ([10002, 10003, 10005, 10010, 10011].includes(code)) providerCode = code;
                    } catch { /* Never expose provider error bodies or credentials. */ }
                }
                if (response.status === 404) this.logger.debug?.('Product not listed at provider', { provider: host });
                else this.logger.warn('Provider request rejected', { provider: host, status: response.status, providerCode, hint: response.status === 429 ? 'Cooling down for 60 seconds' : 'Retry later; check provider status' });
                if (response.status === 429) this.next.set(host, this.now() + 60000);
                throw Object.assign(new Error('Data provider unavailable or rate limited. Please try again later.'), { status: response.status, providerCode });
            }
            this.logger.debug?.('Provider request completed', { provider: host, status: response.status });
            const value = { data: await boundedJson(response), fetchedAt: new Date(this.now()).toISOString() };
            if (ttl > 0) {
                const bytes = Buffer.byteLength(JSON.stringify(value));
                const remove = key => { const old = this.cache.get(key); this.cacheBytes -= old?.bytes || 0; this.cache.delete(key); };
                for (const [key, entry] of this.cache) if (entry.expires <= this.now() || key === url) remove(key);
                while (this.cache.size && (this.cache.size >= 100 || this.cacheBytes + bytes > this.maxCacheBytes)) remove(this.cache.keys().next().value);
                if (bytes <= this.maxCacheBytes) { this.cache.set(url, { value, bytes, expires: this.now() + ttl }); this.cacheBytes += bytes; }
            }
            return value;
        })();
        this.pending.set(url, work);
        try { return await work; } finally { this.pending.delete(url); }
    }
}
module.exports = { PublicApi };

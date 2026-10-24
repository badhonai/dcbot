const ALIASES = {
    bitcoin: 'BTC', btc: 'BTC', 'btc-bitcoin': 'BTC', ethereum: 'ETH', ether: 'ETH', eth: 'ETH', 'eth-ethereum': 'ETH',
    solana: 'SOL', sol: 'SOL', 'sol-solana': 'SOL', dogecoin: 'DOGE', doge: 'DOGE', 'doge-dogecoin': 'DOGE',
    cardano: 'ADA', ada: 'ADA', ripple: 'XRP', xrp: 'XRP', litecoin: 'LTC', ltc: 'LTC',
    avalanche: 'AVAX', avax: 'AVAX', chainlink: 'LINK', link: 'LINK', polkadot: 'DOT', dot: 'DOT',
};
function resolveSymbol(query) {
    const input = query.trim().toLowerCase();
    return ALIASES[input] || (/^[a-z0-9]{2,12}$/.test(input) ? input.toUpperCase() : null);
}
class LiveQuotes {
    constructor(api, { now = Date.now, maxAgeMs = 30000 } = {}) { this.api = api; this.now = now; this.maxAgeMs = maxAgeMs; }
    async get(query) {
        const symbol = resolveSymbol(query);
        if (!symbol) throw Object.assign(new Error('Use a ticker such as BTC, ETH or SOL. For delayed market stats, choose mode:market.'), { code: 'LIVE_UNAVAILABLE' });
        let result;
        try { result = await this.api.get(`https://api.exchange.coinbase.com/products/${encodeURIComponent(symbol)}-USD/ticker`, 0); }
        catch {
            throw Object.assign(new Error('Fresh exchange quote unavailable. Try again shortly, or use /price with mode:market for delayed data.'), { code: 'LIVE_UNAVAILABLE' });
        }
        const { data, fetchedAt } = result;
        const tradedAt = Date.parse(data.time); const age = this.now() - tradedAt;
        if (!Number.isFinite(tradedAt) || age > this.maxAgeMs || age < -5000 || !Number.isFinite(Number(data.price)) || Number(data.price) <= 0) {
            throw Object.assign(new Error('The exchange did not return a fresh trade. No live price shown. Try again shortly.'), { code: 'STALE_QUOTE' });
        }
        return { symbol, price: Number(data.price), tradedAt: new Date(tradedAt).toISOString(), fetchedAt,
            ageSeconds: Math.max(0, Math.floor(age / 1000)), source: 'Coinbase Exchange', url: `https://exchange.coinbase.com/trade/${symbol}-USD` };
    }
}
module.exports = { LiveQuotes, resolveSymbol, ALIASES };

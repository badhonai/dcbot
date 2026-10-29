const IDS = { btc: 'bitcoin', eth: 'ethereum', sol: 'solana', sui: 'sui', apt: 'aptos', bnb: 'binancecoin', xrp: 'ripple', ada: 'cardano', doge: 'dogecoin', avax: 'avalanche-2', link: 'chainlink', dot: 'polkadot', ltc: 'litecoin', ton: 'the-open-network', usdt: 'tether', usdc: 'usd-coin' };
class CoinGeckoQuotes {
    constructor(api, { now = Date.now, maxAgeMs = 120000 } = {}) { this.api = api; this.now = now; this.maxAgeMs = maxAgeMs; }
    async get(query) {
        const input = query.trim().toLowerCase();
        if (!/^[a-z0-9-]{1,100}$/.test(input)) throw Object.assign(new Error('Use a CoinGecko ID or common ticker.'), { code: 'LIVE_UNAVAILABLE' });
        let id = Object.hasOwn(IDS, input) ? IDS[input] : input;
        let symbol = Object.keys(IDS).find(key => IDS[key] === id)?.toUpperCase();
        if (!symbol) {
            const { data } = await this.api.get(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(input)}`, 3600000);
            const exactId = (data.coins || []).find(coin => coin.id === input);
            const matches = exactId ? [exactId] : (data.coins || []).filter(coin => coin.symbol?.toLowerCase() === input || coin.name?.toLowerCase() === input);
            if (matches.length !== 1) throw Object.assign(new Error(matches.length ? 'Multiple CoinGecko tokens match. Use an exact CoinGecko ID.' : 'No CoinGecko token found. Use an exact CoinGecko ID.'), { code: 'LIVE_UNAVAILABLE' });
            id = matches[0].id; symbol = matches[0].symbol.toUpperCase();
            if (!/^[a-z0-9-]{1,100}$/.test(id)) throw new Error('Invalid provider coin ID');
        }
        const { data, fetchedAt } = await this.api.get(`https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=usd&include_last_updated_at=true`, 0);
        const entry = data[id]; const price = entry?.usd; const updated = entry?.last_updated_at;
        const age = this.now() - updated * 1000;
        if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0 || typeof updated !== 'number' || !Number.isFinite(age) || age > this.maxAgeMs || age < -5000) throw Object.assign(new Error('CoinGecko did not return a recent timestamped quote. Try again shortly.'), { code: 'STALE_QUOTE' });
        return { symbol, coinId: id, price, updatedAt: new Date(updated * 1000).toISOString(), fetchedAt, ageSeconds: Math.max(0, Math.floor(age / 1000)), source: 'CoinGecko', sourceLabel: 'CoinGecko', kind: 'aggregate', updateIntervalSeconds: 60, url: `https://www.coingecko.com/en/coins/${id}` };
    }
}
module.exports = { CoinGeckoQuotes, IDS };

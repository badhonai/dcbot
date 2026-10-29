const IDS = { btc: 'bitcoin', eth: 'ethereum', sol: 'solana', sui: 'sui', apt: 'aptos', bnb: 'binancecoin', xrp: 'ripple', ada: 'cardano', doge: 'dogecoin', avax: 'avalanche-2', link: 'chainlink', dot: 'polkadot', ltc: 'litecoin', ton: 'the-open-network', usdt: 'tether', usdc: 'usd-coin' };
function coinInput(query, currency) {
    let input = String(query).trim().replace(/^\$/, '').toLowerCase();
    const hyphen = input.match(/^([a-z0-9]{1,15})-(usd|usdt)$/);
    const pair = input.match(/^([a-z0-9-]{1,100})\/(usd|usdt)$/) || (hyphen && Object.hasOwn(IDS, hyphen[1]) ? hyphen : null);
    const compact = !pair && input.match(/^([a-z0-9]+?)(usdt|usd)$/);
    const parsed = pair || (compact && (Object.hasOwn(IDS, compact[1]) || Object.values(IDS).includes(compact[1])) ? compact : null);
    if (parsed) {
        if (currency && parsed[2] !== currency) throw Object.assign(new Error('Pair currency does not match the requested quote. Use the base token and explicit currency.'), { code: 'LIVE_UNAVAILABLE' });
        input = parsed[1];
    }
    return input;
}
class CoinGeckoQuotes {
    constructor(api, { now = Date.now, maxAgeMs = 120000 } = {}) { this.api = api; this.now = now; this.maxAgeMs = maxAgeMs; }
    async resolve(query) {
        const input = coinInput(query);
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
        return { id, symbol };
    }
    async get(query, { currency = 'usdt' } = {}) {
        if (!['usd', 'usdt'].includes(currency)) throw new Error('Unsupported quote currency');
        const { id, symbol } = await this.resolve(coinInput(query, currency));
        const ids = currency === 'usdt' ? [...new Set([id, 'tether'])].join(',') : id;
        const { data, fetchedAt } = await this.api.get(`https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=usd&include_last_updated_at=true`, 0);
        const validate = entry => {
            const price = entry?.usd; const updated = entry?.last_updated_at; const age = this.now() - updated * 1000;
            if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0 || typeof updated !== 'number' || !Number.isFinite(age) || age > this.maxAgeMs || age < -5000) throw Object.assign(new Error('CoinGecko did not return recent timestamped data for both sides of the quote. Try again shortly.'), { code: 'STALE_QUOTE' });
            return { price, updated, age };
        };
        const base = validate(data[id]); const quote = currency === 'usdt' ? validate(data.tether) : null;
        const price = quote ? base.price / quote.price : base.price;
        if (!Number.isFinite(price) || price <= 0) throw Object.assign(new Error('Invalid USDT cross-rate'), { code: 'STALE_QUOTE' });
        const updated = quote ? Math.min(base.updated, quote.updated) : base.updated;
        return { symbol, coinId: id, price, currency: currency.toUpperCase(), updatedAt: new Date(updated * 1000).toISOString(), fetchedAt, ageSeconds: Math.max(0, Math.floor((this.now() - updated * 1000) / 1000)), source: 'CoinGecko', sourceLabel: quote ? 'CoinGecko cross-rate' : 'CoinGecko', kind: 'aggregate', derived: Boolean(quote), methodology: quote ? 'TOKEN/USD divided by USDT/USD, not an exchange pair trade' : 'Aggregated USD quote', updateIntervalSeconds: 60, url: `https://www.coingecko.com/en/coins/${id}` };
    }
}
module.exports = { CoinGeckoQuotes, IDS, coinInput };

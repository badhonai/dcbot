const ALIASES = {
    bitcoin: 'BTC', btc: 'BTC', 'btc-bitcoin': 'BTC', ethereum: 'ETH', ether: 'ETH', eth: 'ETH', 'eth-ethereum': 'ETH',
    solana: 'SOL', sol: 'SOL', 'sol-solana': 'SOL', dogecoin: 'DOGE', doge: 'DOGE', 'doge-dogecoin': 'DOGE',
    cardano: 'ADA', ada: 'ADA', ripple: 'XRP', xrp: 'XRP', litecoin: 'LTC', ltc: 'LTC',
    avalanche: 'AVAX', avax: 'AVAX', chainlink: 'LINK', link: 'LINK', polkadot: 'DOT', dot: 'DOT',
};
function resolveSymbol(query) {
    const input = query.trim().toLowerCase();
    return (Object.hasOwn(ALIASES, input) ? ALIASES[input] : null) || (/^[a-z0-9]{2,12}$/.test(input) ? input.toUpperCase() : null);
}
class LiveQuotes {
    constructor(api, { now = Date.now, maxAgeMs = 30000 } = {}) { this.api = api; this.now = now; this.maxAgeMs = maxAgeMs; }
    validate({ symbol, price, tradedAt, fetchedAt, source, sourceLabel, url, currency = 'USD' }) {
        const age = this.now() - tradedAt;
        if (!Number.isFinite(tradedAt) || age > this.maxAgeMs || age < -5000 || !Number.isFinite(Number(price)) || Number(price) <= 0) {
            throw Object.assign(new Error('No fresh trade returned'), { code: 'STALE_QUOTE' });
        }
        return { symbol, currency, price: Number(price), tradedAt: new Date(tradedAt).toISOString(), fetchedAt,
            ageSeconds: Math.max(0, Math.floor(age / 1000)), source, sourceLabel, url };
    }
    async coinbase(symbol, currency = 'usd') {
        const { data, fetchedAt } = await this.api.get(`https://api.exchange.coinbase.com/products/${encodeURIComponent(symbol)}-${currency.toUpperCase()}/ticker`, 0);
        return this.validate({ symbol, currency: currency.toUpperCase(), price: data.price, tradedAt: Date.parse(data.time), fetchedAt,
            source: 'Coinbase Exchange', sourceLabel: 'Coinbase', url: `https://exchange.coinbase.com/trade/${symbol}-${currency.toUpperCase()}` });
    }
    async kraken(symbol, currency = 'usd') {
        const base = ({ BTC: 'XBT', DOGE: 'XDG' })[symbol] || symbol;
        const { data, fetchedAt } = await this.api.get(`https://api.kraken.com/0/public/Trades?pair=${encodeURIComponent(base)}${currency.toUpperCase()}&count=1`, 0);
        if (!Array.isArray(data.error) || data.error.length || !data.result) throw new Error('Exchange product unavailable');
        const entry = Object.entries(data.result).find(([key, value]) => key !== 'last' && Array.isArray(value));
        const trades = entry?.[1] || [];
        const trade = trades.reduce((latest, current) => Number(current[2]) > Number(latest?.[2] || 0) ? current : latest, null);
        if (!trade) throw new Error('No exchange trades');
        return this.validate({ symbol, currency: currency.toUpperCase(), price: trade[0], tradedAt: Number(trade[2]) * 1000, fetchedAt,
            source: 'Kraken', sourceLabel: 'Kraken', url: `https://www.kraken.com/prices/${symbol.toLowerCase()}` });
    }
    async get(query, { currency = 'usd' } = {}) {
        if (!['usd', 'usdt'].includes(currency)) throw new Error('Unsupported quote currency');
        const symbol = resolveSymbol(query);
        if (!symbol) throw Object.assign(new Error('Use a ticker such as BTC, ETH, SOL or SUI.'), { code: 'LIVE_UNAVAILABLE' });
        let stale = false;
        for (const provider of ['coinbase', 'kraken']) {
            try { return await this[provider](symbol, currency); }
            catch (error) { stale ||= error.code === 'STALE_QUOTE'; }
        }
        throw Object.assign(new Error(`No fresh ${symbol} quote available. Try again shortly.`), { code: stale ? 'STALE_QUOTE' : 'LIVE_UNAVAILABLE' });
    }
}
module.exports = { LiveQuotes, resolveSymbol, ALIASES };

const { CoinGeckoQuotes } = require('./coingecko-quotes');
const { card, pages, notice, safeText } = require('../utils/cards');
const { quoteMoney, compactMoney, percent } = require('./market');
const { publicUrl } = require('../integrations/safe-page');
const BASE = 'https://api.coingecko.com/api/v3';
const finite = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
function providerLink(input) { try { return publicUrl(input).href; } catch { return null; } }
class CommunityMarket {
    constructor(api, { now = Date.now } = {}) { this.api = api; this.now = now; this.coins = new CoinGeckoQuotes(api, { now }); }
    async trending() {
        const { data, fetchedAt } = await this.api.get(`${BASE}/search/trending`, 120000);
        const coins = (Array.isArray(data.coins) ? data.coins : []).slice(0, 7).flatMap(record => {
            const item = record?.item;
            if (!item || !/^[a-z0-9-]{1,100}$/.test(item.id)) return [];
            return [{ id: item.id, name: safeText(item.name, 60), symbol: safeText(item.symbol, 15), rank: finite(item.market_cap_rank), url: `https://www.coingecko.com/en/coins/${item.id}` }];
        });
        if (!coins.length) return notice('Trending unavailable', 'No discovery list returned. Try again later.');
        return { ...pages(card('Trending crypto searches', coins.map((c, i) => `${i + 1}. **${c.name} (${c.symbol})** · rank ${c.rank ?? 'N/A'}\nID: \`${c.id}\``).join('\n'), { url: 'https://www.coingecko.com/en/highlights/trending-crypto', timestamp: fetchedAt, footer: 'CoinGecko search interest, not gainers, endorsements or verified projects' })), results: coins, fetchedAt, untrusted: true };
    }
    async coin(query) {
        const { id, symbol } = await this.coins.resolve(query);
        const { data, fetchedAt } = await this.api.get(`${BASE}/coins/${id}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false`, 300000);
        if (data.id !== id) throw new Error('Provider returned a different token');
        const m = data.market_data || {}; const url = `https://www.coingecko.com/en/coins/${id}`;
        const description = String(data.description?.en || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').slice(0, 900);
        const homepage = (Array.isArray(data.links?.homepage) ? data.links.homepage : []).map(providerLink).filter(Boolean).slice(0, 2);
        const handle = data.links?.twitter_screen_name;
        const x = typeof handle === 'string' && /^[A-Za-z0-9_]{1,15}$/.test(handle) ? `https://x.com/${handle}` : null;
        const metrics = { rank: finite(data.market_cap_rank), marketCapUsd: finite(m.market_cap?.usd), fdvUsd: finite(m.fully_diluted_valuation?.usd), circulatingSupply: finite(m.circulating_supply), totalSupply: finite(m.total_supply), maxSupply: finite(m.max_supply) };
        const result = { id, symbol, description, metrics, links: { homepage, x }, dataUpdatedAt: data.last_updated || null, fetchedAt, url, untrusted: true, note: 'Provider-listed information and links, NOT owner-approved or safety verified. Market cap/FDV are USD aggregates, not USDT prices. No unlock schedule inferred from supply.' };
        return { ...result, ...pages(card(`${safeText(data.name, 65)} · ${safeText(symbol, 15)}`, description.slice(0, 550) || 'No project description supplied.', { url, timestamp: fetchedAt, footer: 'Provider-listed, not vetted · USD aggregates may lag', fields: [
            { name: 'Market snapshot · USD', value: `Rank: ${metrics.rank ?? 'N/A'}\nMarket cap: ${compactMoney(metrics.marketCapUsd)}\nFDV: ${compactMoney(metrics.fdvUsd)}` },
            { name: 'Token supply', value: `Circulating: ${metrics.circulatingSupply ?? 'N/A'}\nTotal: ${metrics.totalSupply ?? 'N/A'}\nMax: ${metrics.maxSupply ?? 'Not supplied'}` },
            { name: 'Listed links · not verified', value: [...homepage, x].filter(Boolean).join('\n') || 'No links supplied' },
        ] })) };
    }
    async compare(input) {
        const tokens = [...new Set(input.split(',').map(s => s.trim().toLowerCase()).filter(Boolean))];
        if (tokens.length < 2 || tokens.length > 4) return notice('Choose 2–4 tokens', 'Use comma-separated tickers or exact CoinGecko IDs, e.g. BTC, ETH, SOL.');
        const resolved = [];
        for (const token of tokens) resolved.push(await this.coins.resolve(token));
        const unique = [...new Map(resolved.map(c => [c.id, c])).values()];
        if (unique.length < 2) return notice('Choose different tokens', 'Those names refer to the same token.');
        const ids = [...new Set([...unique.map(c => c.id), 'tether'])].join(',');
        const { data, fetchedAt } = await this.api.get(`${BASE}/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true&include_24hr_vol=true&include_last_updated_at=true`, 0);
        const fresh = entry => finite(entry?.usd) !== null && entry.usd > 0 && Number.isFinite(entry.last_updated_at) && this.now() - entry.last_updated_at * 1000 <= 120000 && this.now() - entry.last_updated_at * 1000 >= -5000;
        if (!fresh(data.tether)) return notice('Comparison unavailable', 'A recent Tether/USD reference is unavailable. No USD-parity assumption was made.');
        const quotes = unique.map(({ id, symbol }) => {
            const entry = data[id]; const url = `https://www.coingecko.com/en/coins/${id}`;
            if (!fresh(entry)) return { id, symbol, unavailable: true, url };
            const price = entry.usd / data.tether.usd;
            if (!Number.isFinite(price) || price <= 0) return { id, symbol, unavailable: true, url };
            return { id, symbol, price, currency: 'USDT', ageSeconds: Math.max(0, Math.floor((this.now() - Math.min(entry.last_updated_at, data.tether.last_updated_at) * 1000) / 1000)), change24hUsd: typeof entry.usd_24h_change === 'number' && Number.isFinite(entry.usd_24h_change) ? entry.usd_24h_change : null, marketCapUsd: finite(entry.usd_market_cap), volume24hUsd: finite(entry.usd_24h_vol), url };
        });
        return { ...pages(card('Crypto comparison', 'Recent USDT cross-rates. Price per token does not establish which asset is cheaper or better.', { timestamp: fetchedAt, footer: 'CoinGecko · ~60s updates · 24h change, cap & volume in USD', fields: quotes.map(q => ({ name: `${safeText(q.symbol, 15)}/USDT`, value: q.unavailable ? 'Recent quote unavailable' : `**${quoteMoney(q)}** · ${q.ageSeconds}s ago\n24h (USD): ${percent(q.change24hUsd)}\nCap: ${compactMoney(q.marketCapUsd)} · Vol: ${compactMoney(q.volume24hUsd)}` })) })), quotes, results: quotes.map(q => ({ title: q.symbol, url: q.url })), fetchedAt, untrusted: true, methodology: 'Each price is TOKEN/USD divided by fresh Tether/USD; cap, volume and 24h changes remain USD aggregates. Not investment advice or a ranking.' };
    }
}
module.exports = { CommunityMarket, providerLink };

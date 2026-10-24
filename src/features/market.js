const CHAINS = {
    ethereum: ['ethereum', 'eth'], eth: ['ethereum', 'eth'], solana: ['solana', 'solana'],
    base: ['base', 'base'], bsc: ['bsc', 'bsc'], arbitrum: ['arbitrum', 'arbitrum'],
    polygon: ['polygon', 'polygon_pos'], optimism: ['optimism', 'optimism'], avalanche: ['avalanche', 'avax'],
};
const money = value => value == null || value === '' || !Number.isFinite(Number(value)) ? 'N/A' :
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumSignificantDigits: 8 }).format(Number(value));
const percent = value => value == null || !Number.isFinite(Number(value)) ? 'N/A' : `${Number(value).toFixed(2)}%`;
const plain = value => String(value ?? 'N/A').replace(/[@`*_~<>\[\]\\]/g, '').slice(0, 150);
function chainIds(chain) {
    const ids = CHAINS[chain.toLowerCase()];
    if (!ids) throw new Error('Unsupported chain. Use ethereum, solana, base, bsc, arbitrum, polygon, optimism or avalanche.');
    return ids;
}
function addressFor(chain, address) {
    const valid = chain === 'solana' ? /^[1-9A-HJ-NP-Za-km-z]{32,44}$/ : /^0x[a-fA-F0-9]{40}$/;
    if (!valid.test(address)) throw new Error('Invalid token address for this chain.');
}
class MarketService {
    constructor(api) { this.api = api; }
    async price(query) {
        query = query.trim().toLowerCase();
        if (!/^[a-z0-9 -]{1,100}$/.test(query)) throw new Error('Use a token name, symbol, or CoinPaprika ID.');
        let id = query;
        if (!query.includes('-')) {
            const { data } = await this.api.get(`https://api.coinpaprika.com/v1/search?q=${encodeURIComponent(query)}&c=currencies&limit=20`, 3600000);
            const coins = (data.currencies || []).filter(c => c.is_active && (c.symbol?.toLowerCase() === query || c.name?.toLowerCase() === query));
            if (coins.length !== 1) return coins.length ? 'Multiple matches. Run `/price token:<exact ID>`:\n' + coins.map(c => `• ${plain(c.name)} (${plain(c.symbol)}): \`${plain(c.id)}\``).join('\n') : 'No exact match. Use a CoinPaprika coin ID, e.g. btc-bitcoin.';
            id = coins[0].id;
        }
        const { data, fetchedAt } = await this.api.get(`https://api.coinpaprika.com/v1/tickers/${encodeURIComponent(id)}`);
        const q = data.quotes?.USD;
        if (!q) throw new Error('No USD quote is available for this token.');
        return `**${plain(data.name)} (${plain(data.symbol)})** — ${plain(data.id)}\nPrice: ${money(q.price)}\n24h change: ${percent(q.percent_change_24h)}\n24h volume: ${money(q.volume_24h)}\nMarket cap: ${money(q.market_cap)}\nProvider updated: ${plain(data.last_updated)}\nFetched: ${fetchedAt}\nSource: https://coinpaprika.com/coin/${encodeURIComponent(id)}/\nLatest available quote; not a real-time trading feed.`;
    }
    async pair(chain, address) {
        const [dex] = chainIds(chain); addressFor(dex, address);
        const { data, fetchedAt } = await this.api.get(`https://api.dexscreener.com/token-pairs/v1/${dex}/${encodeURIComponent(address)}`);
        const pairs = (Array.isArray(data) ? data : []).filter(p => (dex === 'solana' ? p.baseToken?.address === address : p.baseToken?.address?.toLowerCase() === address.toLowerCase())).sort((a,b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0)).slice(0, 5);
        if (!pairs.length) return 'No indexed base-token pools found. This does not prove the token is invalid.';
        return `**DEX pools — ${dex}**\nToken: \`${address}\`\n` + pairs.map(p =>
            `\n**${plain(p.baseToken.symbol)} / ${plain(p.quoteToken?.symbol)} · ${plain(p.dexId)}**\nPrice: ${money(p.priceUsd)} · 24h change: ${percent(p.priceChange?.h24)}\nLiquidity: ${money(p.liquidity?.usd)} · 24h volume: ${money(p.volume?.h24)}\nMarket cap: ${money(p.marketCap)} · FDV: ${money(p.fdv)}\nCreated: ${p.pairCreatedAt ? new Date(p.pairCreatedAt).toISOString() : 'Unknown'}\nhttps://dexscreener.com/${dex}/${encodeURIComponent(p.pairAddress)}`
        ).join('\n') + `\n\nSource: DEX Screener · Fetched: ${fetchedAt}\nNot a token safety check or investment recommendation.`;
    }
    async newpairs(chain) {
        const [, network] = chainIds(chain);
        const { data, fetchedAt } = await this.api.get(`https://api.geckoterminal.com/api/v2/networks/${network}/new_pools?page=1`, 90000);
        const pools = (data.data || []).slice(0, 8);
        if (!pools.length) return 'No recent pools returned for this network.';
        return `**Recent pools — ${network}**\n⚠️ These are NOT verified new projects. Tokens may be old, malicious or illiquid. This is a limited provider feed, not every launch.\n` + pools.map(({ attributes: a }) =>
            `\n**${plain(a.name)}**\nCreated: ${plain(a.pool_created_at)}\nLiquidity: ${money(a.reserve_in_usd)} · 24h volume: ${money(a.volume_usd?.h24)}\nFDV: ${money(a.fdv_usd)} · Market cap: ${money(a.market_cap_usd)}\nhttps://www.geckoterminal.com/${network}/pools/${encodeURIComponent(a.address)}`
        ).join('\n') + `\n\nSource: GeckoTerminal · Fetched: ${fetchedAt}`;
    }
}
module.exports = { MarketService, money, chainIds, addressFor };

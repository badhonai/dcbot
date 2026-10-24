const { LiveQuotes } = require('./live-quotes');
const { card, pages, notice, safeText: plain, relativeTime } = require('../utils/cards');
const CHAINS = {
    ethereum: ['ethereum', 'eth'], eth: ['ethereum', 'eth'], solana: ['solana', 'solana'],
    base: ['base', 'base'], bsc: ['bsc', 'bsc'], arbitrum: ['arbitrum', 'arbitrum'],
    polygon: ['polygon', 'polygon_pos'], optimism: ['optimism', 'optimism'], avalanche: ['avalanche', 'avax'],
};
const money = value => value == null || value === '' || !Number.isFinite(Number(value)) ? 'N/A' :
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumSignificantDigits: 8 }).format(Number(value));
const compactMoney = value => value == null || value === '' || !Number.isFinite(Number(value)) ? 'N/A' :
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 2 }).format(Number(value));
const percent = value => value == null || value === '' || !Number.isFinite(Number(value)) ? 'N/A' : `${Number(value) > 0 ? '+' : ''}${Number(value).toFixed(2)}%`;
const field = (name, value) => ({ name, value, inline: true });
function chainIds(chain) {
    const ids = CHAINS[chain.toLowerCase()];
    if (!ids) throw new Error('Unsupported chain. Try ethereum, solana, base, bsc, arbitrum, polygon, optimism or avalanche.');
    return ids;
}
function addressFor(chain, address) {
    const valid = chain === 'solana' ? /^[1-9A-HJ-NP-Za-km-z]{32,44}$/ : /^0x[a-fA-F0-9]{40}$/;
    if (!valid.test(address)) throw new Error('Invalid token address for this chain.');
}
class MarketService {
    constructor(api, { liveQuotes = new LiveQuotes(api) } = {}) { this.api = api; this.liveQuotes = liveQuotes; }
    async price(query, { mode = 'live' } = {}) {
        if (mode === 'live') {
            try {
                const quote = await this.liveQuotes.get(query);
                return { ...pages(card(`${quote.symbol} · USD`, `**${money(quote.price)}**`, {
                    url: quote.url, footer: `Coinbase Exchange · Trade ${quote.ageSeconds}s ago · Fetched`, timestamp: quote.fetchedAt,
                })), quote };
            } catch (error) {
                if (['LIVE_UNAVAILABLE', 'STALE_QUOTE'].includes(error.code)) return notice('Live quote unavailable', error.message);
                throw error;
            }
        }
        if (mode !== 'market') throw new Error('Unsupported price mode');
        query = query.trim().toLowerCase();
        if (!/^[a-z0-9 -]{1,100}$/.test(query)) throw new Error('Use a token name, symbol, or CoinPaprika ID.');
        let id = query;
        if (!query.includes('-')) {
            const { data } = await this.api.get(`https://api.coinpaprika.com/v1/search?q=${encodeURIComponent(query)}&c=currencies&limit=20`, 3600000);
            const coins = (data.currencies || []).filter(c => c.is_active && (c.symbol?.toLowerCase() === query || c.name?.toLowerCase() === query));
            if (coins.length !== 1) {
                if (!coins.length) return notice('Token not found', 'Try an exact ID: `/price token:btc-bitcoin`.');
                const cards = [];
                for (let i = 0; i < coins.length; i += 5) cards.push(card('Multiple matches', 'Choose an ID and run `/price token:<ID>`.', { fields: coins.slice(i, i + 5).map(c => ({ name: `${plain(c.name)} · ${plain(c.symbol)}`, value: `\`${plain(c.id)}\`` })) }));
                return pages(cards);
            }
            id = coins[0].id;
        }
        const { data, fetchedAt } = await this.api.get(`https://api.coinpaprika.com/v1/tickers/${encodeURIComponent(id)}`);
        const q = data.quotes?.USD;
        if (!q) throw new Error('No USD quote is available for this token.');
        return pages(card(`${plain(data.name)} · ${plain(data.symbol)}`, `**${money(q.price)}**  ·  ${percent(q.percent_change_24h)} / 24h\nQuote updated ${relativeTime(data.last_updated)}.`, {
            url: `https://coinpaprika.com/coin/${encodeURIComponent(id)}/`,
            fields: [field('24h volume', compactMoney(q.volume_24h)), field('Market cap', compactMoney(q.market_cap))],
            footer: 'CoinPaprika · USD · May be delayed · Fetched', timestamp: fetchedAt,
        }));
    }
    async pair(chain, address) {
        const [dex] = chainIds(chain); addressFor(dex, address);
        const { data, fetchedAt } = await this.api.get(`https://api.dexscreener.com/token-pairs/v1/${dex}/${encodeURIComponent(address)}`);
        const pools = (Array.isArray(data) ? data : []).filter(p => (dex === 'solana' ? p.baseToken?.address === address : p.baseToken?.address?.toLowerCase() === address.toLowerCase())).sort((a,b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0)).slice(0, 5);
        if (!pools.length) return notice('No pools found', 'No indexed base-token pools. Check the chain and token address.');
        return pages(pools.map(p => card(`${plain(p.baseToken.symbol)} / ${plain(p.quoteToken?.symbol)}`, `**${money(p.priceUsd)}**  ·  ${percent(p.priceChange?.h24)} / 24h\n${plain(dex)} · ${plain(p.dexId)} · Created ${relativeTime(p.pairCreatedAt)}`, {
            url: `https://dexscreener.com/${dex}/${encodeURIComponent(p.pairAddress)}`,
            fields: [field('Liquidity', compactMoney(p.liquidity?.usd)), field('24h volume', compactMoney(p.volume?.h24)), field('Market cap', compactMoney(p.marketCap)), field('FDV', compactMoney(p.fdv)), { name: 'Token contract', value: `\`${address}\`` }],
            footer: 'DEX Screener · Top liquidity · Unverified · Fetched', timestamp: fetchedAt,
        })));
    }
    async newpairs(chain) {
        const [, network] = chainIds(chain);
        const { data, fetchedAt } = await this.api.get(`https://api.geckoterminal.com/api/v2/networks/${network}/new_pools?page=1`, 90000);
        const pools = (data.data || []).slice(0, 8);
        if (!pools.length) return notice('No recent pools', 'Try another network or check again later.');
        const cards = [];
        for (let i = 0; i < pools.length; i += 2) {
            cards.push(card(`Recent pools · ${plain(chain.toLowerCase())}`, 'Unverified pools—not endorsed projects. High risk.', {
                tone: 'amber', fields: pools.slice(i, i + 2).map(({ attributes: a }) => ({
                    name: plain(a.name),
                    value: `Liquidity **${compactMoney(a.reserve_in_usd)}** · 24h vol **${compactMoney(a.volume_usd?.h24)}**\nMC ${compactMoney(a.market_cap_usd)} · FDV ${compactMoney(a.fdv_usd)}\nCreated ${relativeTime(a.pool_created_at)} · [Chart](https://www.geckoterminal.com/${network}/pools/${encodeURIComponent(a.address)})`,
                })), footer: 'GeckoTerminal · Limited recent-pool feed · Fetched', timestamp: fetchedAt,
            }));
        }
        return pages(cards);
    }
}
module.exports = { MarketService, money, compactMoney, chainIds, addressFor };

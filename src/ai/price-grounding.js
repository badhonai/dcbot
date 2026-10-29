const { quoteMoney } = require('../features/market');
// Only correct an unsupported availability/refusal claim; do not route user input by keywords.
function priceDetour(text) {
    return /(?:price|quote).{0,35}(?:unavailable|not available|failed)|(?:can[’']?t|cannot|unable|couldn[’']?t|not able).{0,80}(?:live|current|real.time).{0,30}price|(?:would you like|want me to|shall I).{0,100}(?:coingecko|delayed price|recent price)/is.test(text || '');
}
function groundedQuote(quote, now = Date.now) {
    if (!quote || !Number.isFinite(quote.price) || quote.price <= 0 || !Number.isFinite(quote.ageSeconds)) return '';
    const fetched = Date.parse(quote.fetchedAt);
    const age = Math.max(0, quote.ageSeconds + (Number.isFinite(fetched) ? Math.floor(Math.max(0, now() - fetched) / 1000) : 0));
    if (age > (quote.kind === 'aggregate' ? 120 : 30)) return '';
    return `${quote.symbol}${quote.currency ? '/' + quote.currency : ''}: **${quoteMoney(quote)}** · ${quote.sourceLabel || quote.source} · ${quote.kind === 'aggregate' ? 'updated' : 'trade'} ${age}s ago`;
}
function safePriceFailure(error) {
    if (error?.status === 429) return 'The price provider is rate limited. Please try again shortly.';
    if ([401, 403].includes(error?.status)) return 'The price provider rejected access. The bot owner should check the API key and plan configuration.';
    return 'The price provider could not be reached or did not return usable data. Please try again shortly.';
}
module.exports = { priceDetour, groundedQuote, safePriceFailure };

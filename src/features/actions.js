const { explain } = require('./glossary');
const SPECS = {
    price: { description: 'Fetch a fresh USD exchange quote. Never guess a price. Use market mode only when the user explicitly wants delayed aggregate market statistics.', required: ['token'], properties: { token: { type: 'string', description: 'Ticker or token name, such as BTC' }, mode: { type: 'string', enum: ['live', 'market'] } } },
    pair: { description: 'Show DEX pools for a token contract or Solana mint. Requires an explicit chain and token address.', required: ['chain', 'address'], properties: { chain: { type: 'string' }, address: { type: 'string' } } },
    newpairs: { description: 'List recently created pools on an explicit network. Not vetted new projects.', required: ['chain'], properties: { chain: { type: 'string' } } },
    ask: { description: 'Search owner-approved project documents for project-specific facts.', required: ['question'], properties: { question: { type: 'string' }, project: { type: 'string' } } },
    official: { description: 'Get owner-approved project links.', required: [], properties: { project: { type: 'string' } } },
    explain: { description: 'Explain a glossary term: liquidity, slippage, market cap, fdv, token unlock, gas, staking or rug pull.', required: ['term'], properties: { term: { type: 'string' } } },
};
const TOOL_DEFINITIONS = Object.entries(SPECS).map(([name, spec]) => ({ type: 'function', function: { name, description: spec.description, parameters: { type: 'object', properties: spec.properties, required: spec.required, additionalProperties: false } } }));
function validateIntent(intent) {
    if (!Object.hasOwn(SPECS, intent?.command)) return null;
    const spec = SPECS[intent.command]; const args = intent?.args;
    if (!spec || !args || typeof args !== 'object' || Array.isArray(args)) return null;
    if (Object.keys(args).some(key => !Object.hasOwn(spec.properties, key))) return null;
    for (const name of spec.required) if (typeof args[name] !== 'string' || !args[name].trim()) return null;
    for (const [key, value] of Object.entries(args)) {
        if (typeof value !== 'string' || !value.trim() || value.length > 500) return null;
        if (spec.properties[key].enum && !spec.properties[key].enum.includes(value)) return null;
    }
    return { command: intent.command, args: { ...args } };
}
class Actions {
    constructor({ market, knowledge }) { this.market = market; this.knowledge = knowledge; this.active = 0; }
    async execute(rawIntent) {
        const intent = validateIntent(rawIntent);
        if (!intent) throw new Error('Invalid tool request');
        if (this.active >= 3) throw Object.assign(new Error('Bot busy; try again shortly.'), { code: 'BOT_BUSY' });
        this.active++;
        try {
            const a = intent.args;
            switch (intent.command) {
                case 'price': return await this.market.price(a.token, { mode: a.mode || 'live' });
                case 'pair': return await this.market.pair(a.chain, a.address);
                case 'newpairs': return await this.market.newpairs(a.chain);
                case 'ask': return this.knowledge.ask(a.project, a.question);
                case 'official': return this.knowledge.official(a.project);
                case 'explain': return explain(a.term);
            }
        } finally { this.active--; }
    }
}
module.exports = { Actions, validateIntent, SPECS, TOOL_DEFINITIONS };

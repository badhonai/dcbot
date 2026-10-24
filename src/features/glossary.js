const glossary = {
    liquidity: 'Liquidity is the ease of trading an asset without substantially moving its price. In a DEX pool, reserves provide liquidity. High displayed liquidity is not a guarantee of safety or that you can sell.',
    slippage: 'Slippage is the difference between an expected trade price and its execution price. Low liquidity, large trades, volatility and transaction ordering can increase it. A slippage tolerance is a limit, not a guaranteed loss.',
    'market cap': 'Market capitalization is token price × circulating supply. It is not the amount of money invested or the cash available to sellers. Supply estimates can be inaccurate.',
    fdv: 'Fully diluted valuation (FDV) is price × a provider-defined fully diluted supply, often maximum or total supply. It differs from circulating market cap and does not predict future value.',
    'token unlock': 'A token unlock releases previously restricted tokens under a vesting schedule. It can change available supply, but it does not guarantee selling or a particular price movement.',
    gas: 'Gas is the fee for executing blockchain operations. Fees vary by network demand and transaction complexity. Failed transactions may still cost gas.',
    staking: 'Staking can mean committing tokens to network validation, or a project reward/locking program. Risks differ: lockups, slashing, smart-contract failures, token price changes and unsustainable rewards.',
    'rug pull': 'A rug pull is an abusive exit or project action that harms holders, such as draining liquidity or exploiting privileged contract controls. A listing, audit or high volume does not guarantee safety.',
};
function explain(term) {
    const key = term.toLowerCase().trim().replace(/[-_]/g, ' ');
    return glossary[key] ? `**${key}**\n${glossary[key]}\n\nCurated educational glossary; not personalized financial advice.` : `Available terms: ${Object.keys(glossary).join(', ')}.`;
}
module.exports = { explain };

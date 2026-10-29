const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });
const { readDemoKey, checkPrice, checkAi } = require('../src/diagnostics/checks');
const { PublicApi } = require('../src/integrations/public-api');
const { createModelClient } = require('../src/ai/provider-client');
const { loadConfig } = require('../src/config');
const quiet = { info() {}, warn() {}, debug() {}, error() {} };
(async () => {
    const key = readDemoKey();
    const price = await checkPrice(new PublicApi({ coingeckoApiKey: key, logger: quiet }), { key });
    let ai = { status: 'not_checked', note: 'Set DIAGNOSE_AI=true for one small authenticated AI check.' };
    if (process.env.DIAGNOSE_AI === 'true') {
        try { ai = await checkAi(createModelClient(loadConfig(), { logger: quiet })); }
        catch { ai = { status: 'error', reason: 'configuration_error' }; }
    }
    console.log(JSON.stringify({ price, ai }, null, 2));
    if (price.status !== 'ok' || ai.status === 'error') process.exitCode = 1;
})().catch(() => { console.error('Diagnostic failed without exposing private configuration.'); process.exitCode = 1; });

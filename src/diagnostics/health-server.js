const http = require('node:http');
const v8 = require('node:v8');
const { version } = require('../../package.json');
function healthPort(env = process.env) {
    const value = env.HEALTH_PORT ?? env.PORT ?? env.SERVER_PORT ?? '25031';
    if (!/^\d+$/.test(String(value)) || Number(value) > 65535) throw new Error('Invalid health port');
    return Number(value);
}
function createHealthServer({ checkPrice, checkAi, checkAgentPrice, discordReady = () => false, logger = { info() {}, warn() {} } }) {
    let stopped = false; let running; let interval;
    const state = { price: { status: 'checking' }, ai: { status: 'checking' }, agentPrice: { status: checkAgentPrice ? 'checking' : 'not_checked' } };
    async function probe({ ai = false } = {}) {
        if (running || stopped) return running;
        running = (async () => {
            const price = Promise.resolve().then(checkPrice).then(result => { state.price = result; }).catch(() => { state.price = { status: 'error', reason: 'probe_failed' }; });
            const model = ai ? Promise.resolve().then(checkAi).then(result => { state.ai = result; }).catch(() => { state.ai = { status: 'error', reason: 'probe_failed' }; }) : Promise.resolve();
            await Promise.all([price, model]);
            if (ai && checkAgentPrice) {
                try { state.agentPrice = await checkAgentPrice(); } catch { state.agentPrice = { status: 'error', reason: 'probe_failed' }; }
            }
            logger.info('Startup/service checks', { price: state.price.status, priceReason: state.price.reason, ai: state.ai.status, agentPrice: state.agentPrice.status, agentPriceReason: state.agentPrice.reason });
        })();
        try { await running; } finally { running = undefined; }
    }
    const server = http.createServer({ requestTimeout: 5000, headersTimeout: 5000 }, (request, response) => {
        response.setHeader('Content-Type', 'application/json; charset=utf-8'); response.setHeader('Cache-Control', 'no-store');
        response.setHeader('X-Content-Type-Options', 'nosniff'); response.setHeader('Connection', 'close');
        let route;
        try { route = new URL(request.url, 'http://health.invalid').pathname; } catch { route = ''; }
        let status = 200; let body;
        if (!['GET', 'HEAD'].includes(request.method)) { status = 405; response.setHeader('Allow', 'GET, HEAD'); body = { error: 'method_not_allowed' }; }
        else if (['/', '/health', '/healthz'].includes(route)) body = { status: 'ok', service: 'discord-info-bot', diagnosticsVersion: 3, release: version, runtime: { rssMb: Math.round(process.memoryUsage().rss / 1048576), heapUsedMb: Math.round(process.memoryUsage().heapUsed / 1048576), heapLimitMb: Math.round(v8.getHeapStatistics().heap_size_limit / 1048576), uptimeSeconds: Math.floor(process.uptime()) }, discord: discordReady() ? 'connected' : 'disconnected', routes: ['/healthz', '/readyz', '/health/price', '/diagnostics'] };
        else if (route === '/diagnostics' || route === '/readyz') {
            const ready = discordReady() && state.price.status === 'ok' && ['ok', 'not_configured', 'not_checked'].includes(state.ai.status) && ['ok', 'not_configured', 'not_checked'].includes(state.agentPrice.status);
            if (route === '/readyz' && !ready) status = 503;
            body = { status: ready ? 'ready' : 'degraded', discord: discordReady() ? 'connected' : 'disconnected', price: state.price, ai: state.ai, agentPrice: state.agentPrice, note: 'Cached probe results, not live quotes. HTTP visits never trigger external API calls.' };
        } else if (route === '/health/price') { status = state.price.status === 'ok' ? 200 : 503; body = state.price; }
        else { status = 404; body = { error: 'not_found' }; }
        response.writeHead(status); response.end(request.method === 'HEAD' ? undefined : JSON.stringify(body));
    });
    server.maxConnections = 20;
    return {
        server, probe,
        async start({ port = 25031, intervalMinutes = 0, testAi = true } = {}) {
            if (!Number.isInteger(intervalMinutes) || intervalMinutes < 0 || intervalMinutes > 1440 || intervalMinutes > 0 && intervalMinutes < 10) throw new Error('Probe interval must be 0 or 10–1440 minutes');
            await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '0.0.0.0', () => { server.off('error', reject); resolve(); }); });
            server.on('error', () => logger.warn('Health server error', { hint: 'Check port allocation' }));
            if (!testAi) { state.ai = { status: 'not_checked' }; state.agentPrice = { status: 'not_checked' }; }
            void probe({ ai: testAi });
            if (intervalMinutes) { interval = setInterval(() => void probe(), intervalMinutes * 60000); interval.unref(); }
            return server.address();
        },
        async stop() { stopped = true; clearInterval(interval); server.closeIdleConnections(); await new Promise(resolve => server.close(resolve)); },
    };
}
module.exports = { healthPort, createHealthServer };

const https = require('node:https');
const dns = require('node:dns/promises');
const net = require('node:net');
const ipaddr = require('ipaddr.js');
const cheerio = require('cheerio');
const MAX_BYTES = 512 * 1024;
function publicUrl(input) {
    let url;
    try { url = new URL(input); } catch { throw new Error('Use a full public HTTPS URL.'); }
    const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    if (url.protocol !== 'https:' || url.username || url.password || url.port && url.port !== '443' || net.isIP(host) || !host.includes('.') || /(^|\.)(localhost|local|internal|home|lan|test|invalid|onion)\.?$/.test(host)) throw new Error('Only public HTTPS websites are allowed.');
    url.hash = '';
    return url;
}
function isPublicAddress(address) {
    try { return ipaddr.process(address).range() === 'unicast'; } catch { return false; }
}
async function resolvePublic(host, lookup = dns.lookup) {
    const addresses = await lookup(host, { all: true, verbatim: true });
    if (!addresses.length || addresses.some(item => !isPublicAddress(item.address))) throw new Error('Private or reserved network addresses are blocked.');
    return addresses[0];
}
function pinnedLookup(target) {
    return (_host, options, callback) => {
        if (options?.all) callback(null, [target]);
        else callback(null, target.address, target.family);
    };
}
function requestPage(url, target, signal) {
    return new Promise((resolve, reject) => {
        const request = https.get(url, { lookup: pinnedLookup(target), family: target.family, agent: false, signal,
            headers: { 'User-Agent': 'DiscordInfoAgent/1.0', Accept: 'text/html,application/xhtml+xml,text/plain', 'Accept-Encoding': 'identity' } }, response => {
            const status = response.statusCode;
            if ([301, 302, 303, 307, 308].includes(status)) { response.destroy(); resolve({ redirect: response.headers.location }); return; }
            const type = String(response.headers['content-type'] || '').split(';')[0];
            if (status !== 200 || !['text/html', 'application/xhtml+xml', 'text/plain'].includes(type) || response.headers['content-encoding'] && response.headers['content-encoding'] !== 'identity' || Number(response.headers['content-length']) > MAX_BYTES) {
                response.destroy(); reject(new Error('Page unavailable, too large or not supported text.')); return;
            }
            const chunks = []; let size = 0;
            response.on('data', chunk => {
                size += chunk.length;
                if (size > MAX_BYTES) { response.destroy(); reject(new Error('Page exceeds the reading limit.')); }
                else chunks.push(chunk);
            });
            response.on('error', reject);
            response.on('end', () => resolve({ body: Buffer.concat(chunks).toString('utf8'), type }));
        });
        request.on('error', reject);
    });
}
function extractPage(body, type, url) {
    if (type === 'text/plain') return { title: new URL(url).hostname, url, content: body.trim().slice(0, 10000) };
    const $ = cheerio.load(body);
    const title = $('title').first().text().replace(/\s+/g, ' ').trim().slice(0, 180);
    $('script,style,noscript,template,nav,footer,header,aside,form,iframe,svg').remove();
    $('p,li,h1,h2,h3,h4,br,div,section,article').each((_, element) => { $(element).append('\n'); });
    const content = ($('main').first().text() || $('article').first().text() || $('body').text()).replace(/[ \t]+/g, ' ').replace(/\n\s*\n/g, '\n\n').trim().slice(0, 10000);
    return { title: title || new URL(url).hostname, url, content, truncated: content.length >= 10000 };
}
function withAbort(work, signal) {
    return new Promise((resolve, reject) => {
        if (signal.aborted) { work.catch(() => {}); reject(signal.reason); return; }
        const abort = () => reject(signal.reason);
        signal.addEventListener('abort', abort, { once: true });
        work.then(value => { signal.removeEventListener('abort', abort); resolve(value); }, error => { signal.removeEventListener('abort', abort); reject(error); });
    });
}
async function readPublicPage(input, { lookup = dns.lookup, request = requestPage, signal } = {}) {
    const timeout = AbortSignal.timeout(15000);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    let url = publicUrl(input);
    for (let redirects = 0; redirects <= 3; redirects++) {
        combined.throwIfAborted();
        const target = await withAbort(resolvePublic(url.hostname, lookup), combined);
        combined.throwIfAborted();
        const result = await request(url, target, combined);
        if (result.redirect) { url = publicUrl(new URL(result.redirect, url).href); continue; }
        return { ...extractPage(result.body, result.type, url.href), fetchedAt: new Date().toISOString() };
    }
    throw new Error('Too many page redirects.');
}
module.exports = { publicUrl, isPublicAddress, resolvePublic, pinnedLookup, extractPage, readPublicPage };

const { publicUrl } = require('../integrations/safe-page');
const { card, pages, notice, safeText } = require('../utils/cards');
const X_HOSTS = new Set(['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com']);
function xTarget(input) {
    const value = String(input).trim();
    if (/^https?:\/\//i.test(value)) {
        const u = publicUrl(value);
        if (!X_HOSTS.has(u.hostname)) throw new Error('Use an X/Twitter profile or post URL, @handle, or a topic.');
        const match = u.pathname.match(/^\/([A-Za-z0-9_]{1,15})(?:\/status\/(\d{1,25}))?\/?$/);
        if (!match || /^(?:home|search|i|intent|settings|login|signup|explore|messages|compose)$/i.test(match[1])) throw new Error('Use a public profile or post URL.');
        const handle = match[1]; const url = `https://x.com/${handle}${match[2] ? `/status/${match[2]}` : ''}`;
        return { type: match[2] ? 'post' : 'profile', handle, url };
    }
    if (/^@?[A-Za-z0-9_]{1,15}$/.test(value) && value.startsWith('@')) return { type: 'profile', handle: value.slice(1), url: `https://x.com/${value.slice(1)}` };
    if (!value || value.length > 300 || /https?:\/\//i.test(value)) throw new Error('Use a short topic, @handle or full X/Twitter URL.');
    return { type: 'topic', query: value.replace(/[\x00-\x1f]/g, ' ') };
}
function xSource(url, target) {
    try {
        const u = publicUrl(url); if (!X_HOSTS.has(u.hostname)) return false;
        if (target.type === 'topic') return true;
        const path = u.pathname.toLowerCase(); const handle = target.handle.toLowerCase();
        if (target.type === 'post') return path.replace(/\/$/, '') === new URL(target.url).pathname.toLowerCase();
        return path === `/${handle}` || path === `/${handle}/` || new RegExp(`^/${handle}/status/\\d+/?$`).test(path);
    } catch { return false; }
}
class CommunityResearch {
    constructor(web, { now = Date.now } = {}) { this.web = web; this.now = now; }
    async x(query, options = {}) {
        let target;
        try { target = xTarget(query); } catch (error) { return notice('Check X research input', error.message); }
        const evidence = []; let direct = false; let searchAvailable = true;
        // Read only an explicitly supplied post, using the existing SSRF/size/redirect guards.
        if (target.type === 'post') {
            try {
                const page = await this.web.read(target.url, options);
                if (xSource(page.url, target) && page.content?.length >= 80 && !/log in to (?:x|twitter)|sign in to (?:x|twitter)|something went wrong|javascript is not available|enable javascript/i.test(page.content)) {
                    evidence.push({ title: page.title, url: page.url, content: page.content.slice(0, 1800), evidenceType: 'public_page_excerpt' }); direct = true;
                }
            } catch (error) { if (options.signal?.aborted) throw error; }
        }
        if (!direct) {
            const search = target.type === 'post' ? target.url : target.type === 'profile' ? `site:x.com/${target.handle} OR site:twitter.com/${target.handle}` : `site:x.com OR site:twitter.com ${target.query}`;
            try {
                const found = await this.web.search(search, options);
                for (const item of found.results || []) if (xSource(item.url, target)) evidence.push({ ...item, evidenceType: 'search_snippet_only' });
            } catch (error) { if (options.signal?.aborted) throw error; searchAvailable = false; }
        }
        const fetchedAt = new Date(this.now()).toISOString(); const results = evidence.slice(0, 5);
        const limitations = 'Public evidence only; indexed snippets may be incomplete or old. No authenticated X API, complete timelines, protected/deleted posts, verified ownership, follower counts or engagement guarantees. Fetch time is NOT post publication time. Never infer a post or profile exists when no evidence was returned.';
        if (!results.length) return { ...notice('X evidence unavailable', searchAvailable ? 'No readable public evidence found. This does not prove the account or post is absent. Paste the public post text or try another source.' : 'Public reading failed or search is unavailable. Search requires OLLAMA_API_KEY and remaining search allowance. Paste the post text instead.'), results: [], target, fetchedAt, limitations, access: 'unavailable', untrusted: true };
        return { ...pages(results.map(item => card(safeText(item.title || 'X public evidence', 150), item.content.slice(0, 850), { url: item.url, timestamp: fetchedAt, footer: item.evidenceType === 'search_snippet_only' ? 'Indexed snippet, not full post/profile · May be old or incomplete' : 'Public page excerpt · Not authenticated account verification' }))), results, target, fetchedAt, limitations, access: direct ? 'public_page_excerpt' : 'indexed_snippets', untrusted: true };
    }
    async news(topic = 'crypto', options = {}) {
        const day = new Date(this.now()).toISOString().slice(0, 10);
        const found = await this.web.search(`${topic.slice(0, 250)} crypto news recent ${day}`, options);
        const results = (found.results || []).slice(0, 5);
        return { ...found, ...(!results.length ? notice('No news found', 'Try a different topic. No headline was invented.') : pages(results.map(item => card(safeText(item.title, 150), item.content.slice(0, 750), { url: item.url, timestamp: found.fetchedAt, footer: 'Search excerpt, not a verified report · Check publication date at source' })))), note: 'Search coverage is incomplete; fetchedAt is retrieval time, NOT publication date. Distinguish attributed reports, rumours and confirmed announcements. No invented dates, hype or investment recommendations.' };
    }
}
module.exports = { CommunityResearch, xTarget, xSource };

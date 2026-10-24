const COLORS = { blue: 0x5865f2, green: 0x36b37e, amber: 0xe6a23c };
function clip(value, limit = 800) {
    const text = String(value ?? '').trim();
    if (text.length <= limit) return text;
    const end = text.lastIndexOf(' ', limit - 1);
    return text.slice(0, end > limit / 2 ? end : limit - 1).trimEnd() + '…';
}
function safeText(value, limit = 100) {
    return clip(String(value ?? 'N/A').replace(/[@`*_~<>\[\]\\]/g, '').replace(/[\x00-\x1f\x7f]/g, ' '), limit);
}
function card(title, description = '', options = {}) {
    const result = { color: COLORS[options.tone] || COLORS.blue, title: clip(title, 180) };
    if (description) result.description = clip(description, 1200);
    if (options.fields?.length) {
        let remaining = 3200 - result.title.length - (result.description?.length || 0);
        result.fields = [];
        for (const f of options.fields.slice(0, 8)) {
            const name = clip(f.name, 120);
            if (remaining < name.length + 20) break;
            const value = clip(f.value || 'N/A', Math.min(800, remaining - name.length));
            result.fields.push({ name, value, inline: Boolean(f.inline) });
            remaining -= name.length + value.length;
        }
    }
    if (options.url && /^https:\/\//.test(options.url)) result.url = options.url;
    if (options.footer) result.footer = { text: clip(options.footer, 160) };
    if (options.timestamp && Number.isFinite(Date.parse(options.timestamp))) result.timestamp = new Date(options.timestamp).toISOString();
    return result;
}
function pages(...items) { return { pages: items.flat() }; }
function notice(title, description) { return pages(card(title, description, { tone: 'amber' })); }
function relativeTime(value) {
    const ms = typeof value === 'number' ? value : Date.parse(value);
    return Number.isFinite(ms) ? `<t:${Math.floor(ms / 1000)}:R>` : 'Unknown';
}
module.exports = { card, pages, notice, clip, safeText, relativeTime };

const { clean } = require('../utils/clean-output');
const { stripLinks } = require('./reply-presentation');
function pageText(page) {
    return [page.text, page.title ? `**${page.title}**` : '', page.description, ...(page.fields || []).map(f => `**${f.name}**\n${f.value}`), page.url ? `[Source](<${page.url}>)` : '', page.footer?.text].filter(Boolean).join('\n\n');
}
function compactPreview(input, { limit = 399, language = 'en' } = {}) {
    const text = clean(input || 'No results.');
    if (text.length <= limit) return text;
    const link = [...text.matchAll(/\[([^\]\n]+)\]\(<(https?:\/\/[^>\n]+)>\)/g)].map(m => `[Source](<${m[2]}>)`).find(s => s.length < Math.min(180, limit / 2));
    const tail = link ? '\n\n' + link : '';
    const budget = limit - tail.length;
    const plain = stripLinks(text).replace(/```[\s\S]*?```/g, '').replace(/^#{1,6}\s*/gm, '').trim();
    const blocks = plain.split(/\n\n+/).filter(b => b && !/^\*\*[^*\n]+\*\*$/.test(b));
    let summary = blocks.find(b => b.length <= budget && !/^[-#]?\s*Sources?:/i.test(b));
    if (!summary && tail) { const unlinked = blocks.find(b => b.length <= limit && !/^[-#]?\s*Sources?:/i.test(b)); if (unlinked) return clean(unlinked); }
    if (!summary) {
        const sentences = plain.match(/[^\n]+?[.!?।](?=\s|$)/gu) || [];
        summary = sentences.find(s => s.length <= budget);
    }
    if (!summary) summary = language === 'bn' ? 'বিস্তারিত প্রস্তুত। পুরো উত্তর পড়তে More চাপুন।' : language === 'banglish' ? 'Bistarito toiri ache. Puro uttor porte More chapun.' : 'Details are ready. Select More to read the full answer.';
    return clean(summary + tail).slice(0, limit);
}
module.exports = { compactPreview, pageText };

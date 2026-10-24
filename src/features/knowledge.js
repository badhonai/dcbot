const { card, pages, notice, clip, safeText } = require('../utils/cards');
const fs = require('node:fs');
const path = require('node:path');
const tokenize = text => [...new Set(text.toLowerCase().match(/[a-z0-9]{3,}/g) || [])].filter(t => !['the','what','how','does','this','that','and','for','are','with','project','about'].includes(t));
class KnowledgeService {
    constructor(root) {
        this.root = path.resolve(root);
        this.projects = JSON.parse(fs.readFileSync(path.join(root, 'projects.json'), 'utf8'));
        for (const p of this.projects) {
            if (!/^[a-z0-9-]+$/.test(p.id)) throw new Error('Invalid project ID');
            for (const link of p.links || []) if (!/^https:\/\//.test(link.url)) throw new Error('Official links must use HTTPS');
            for (const d of p.documents || []) {
                if (!/^https:\/\//.test(d.source) || !d.updatedAt || !Number.isFinite(Date.parse(d.updatedAt))) throw new Error('Documents require an HTTPS source and valid updatedAt date');
                const file = path.resolve(root, d.file);
                if (!file.startsWith(this.root + path.sep)) throw new Error('Knowledge file outside root');
                d.text = fs.readFileSync(file, 'utf8');
            }
        }
    }
    select(id) {
        const p = id ? this.projects.find(p => p.id === id) : this.projects.length === 1 ? this.projects[0] : null;
        if (!p) throw new Error(this.projects.length ? `Choose a project: ${this.projects.map(p => p.id).join(', ')}` : 'No approved project knowledge configured yet. Ask the bot owner to add official docs.');
        return p;
    }
    official(id) {
        const p = this.select(id);
        const links = p.links || [];
        if (!links.length) return notice('No links added', 'The owner has not added official links for this project.');
        const cards = [];
        for (let i = 0; i < links.length; i += 6) cards.push(card(`${safeText(p.name)} · Official links`, links.slice(i, i + 6).map(l => `• [${safeText(l.label)}](${l.url.replace(/[()\s]/g, c => encodeURIComponent(c))})`).join('\n'), { footer: 'Owner-approved · Not an independent audit' }));
        return pages(cards);
    }
    ask(id, question) {
        const p = this.select(id); const terms = tokenize(question);
        const hits = (p.documents || []).flatMap(d => d.text.split(/\n\s*\n/).map(text => ({ text, d, score: terms.filter(t => tokenize(text).includes(t)).length })))
            .filter(h => h.score > 0).sort((a,b) => b.score - a.score).slice(0, 4);
        if (!hits.length) return notice('No matching passage', 'Try a more specific keyword. No answer was found in the approved docs.');
        return pages(hits.map(h => card(`${safeText(p.name)} · Project docs`, clip(h.text, 650), {
            url: h.d.source,
            fields: [{ name: 'Source', value: `[Read original](${h.d.source.replace(/[()\s]/g, c => encodeURIComponent(c))}) · Reviewed ${safeText(h.d.updatedAt)}` }],
            footer: 'Approved document excerpt · Not AI-generated',
        })));
    }
}
module.exports = { KnowledgeService };

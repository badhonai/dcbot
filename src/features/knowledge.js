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
        return `**${p.name} — curator-approved links**\n` + (p.links || []).map(l => `• ${l.label}: ${l.url}`).join('\n') + '\nApproval is by the bot owner, not an independent security audit.';
    }
    ask(id, question) {
        const p = this.select(id); const terms = tokenize(question);
        const hits = (p.documents || []).flatMap(d => d.text.split(/\n\s*\n/).map(text => ({ text, d, score: terms.filter(t => tokenize(text).includes(t)).length })))
            .filter(h => h.score > 0).sort((a,b) => b.score - a.score).slice(0, 4);
        if (!hits.length) return 'I could not find that in the approved documents. Try more specific keywords or contact the project team.';
        return `**${p.name} — approved document excerpts**\nThese are matching passages, not an AI-generated conclusion. Check sources for context and current details.\n\n` + hits.map(h =>
            `${h.text.slice(0, 2400)}${h.text.length > 2400 ? '… [excerpt truncated]' : ''}\nSource: ${h.d.source}\nDocument reviewed: ${h.d.updatedAt}`
        ).join('\n\n');
    }
}
module.exports = { KnowledgeService };

const fs = require('node:fs');
const path = require('node:path');
const FIVE_HOURS = 5 * 60 * 60000;
// Personal conversation boundaries only. No Discord moderation permissions/actions.
class ChatBoundaries {
    constructor(file, { now = Date.now } = {}) {
        this.file = file; this.now = now;
        const entries = file && fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
        if (!Array.isArray(entries) || entries.some(entry => !Array.isArray(entry) || entry.length !== 2 || !/^\d+$/.test(entry[0]) || !Number.isFinite(entry[1]?.expires) || !Number.isInteger(entry[1]?.count) || entry[1].count < 1 || entry[1].count > 3 || !Number.isFinite(entry[1]?.until) || !Array.isArray(entry[1]?.messages) || entry[1].messages.some(id => typeof id !== 'string'))) throw new Error('Invalid chat boundary file');
        this.entries = new Map(entries);
    }
    save(entries) {
        if (this.file) {
            fs.mkdirSync(path.dirname(this.file), { recursive: true });
            fs.writeFileSync(`${this.file}.tmp`, JSON.stringify([...entries]), { mode: 0o600 }); fs.renameSync(`${this.file}.tmp`, this.file);
        }
        this.entries = entries;
    }
    pausedUntil(user) { const until = this.entries.get(user)?.until || 0; return until > this.now() ? until : 0; }
    record(user, messageId, input, evidence) {
        if (!/^\d+$/.test(user) || !messageId || typeof evidence !== 'string' || evidence.trim().length < 3 || !input.includes(evidence)) return null;
        const prior = this.entries.get(user);
        if (prior?.messages.includes(messageId) || this.pausedUntil(user)) return null;
        const entry = prior && prior.expires > this.now() ? { ...prior, messages: [...prior.messages] } : { count: 0, messages: [], until: 0 };
        entry.count++; entry.messages.push(messageId); entry.expires = this.now() + 60 * 60000;
        if (entry.count >= 3) { entry.until = this.now() + FIVE_HOURS; entry.expires = entry.until; }
        const next = new Map([...this.entries].filter(([, value]) => value.expires > this.now()));
        if (next.size >= 10000 && !next.has(user)) {
            const warning = [...next].find(([, value]) => value.until <= this.now());
            if (warning) next.delete(warning[0]); // Never shorten an active five-hour pause to evict a warning.
        }
        next.set(user, entry); this.save(next);
        if (entry.count === 1) return { reply: 'Let’s keep it respectful 🙂 I’m happy to help with your question.', paused: false };
        if (entry.count === 2) return { reply: 'That’s getting harsh 😕 Please stop the personal insults. If it continues, I’ll pause our chat for 5 hours.', paused: false };
        return { reply: `I’m stepping away from this chat for 5 hours 😕 I won’t reply to conversation messages until <t:${Math.floor(entry.until / 1000)}:t>. We can try again after that.`, paused: true, until: entry.until };
    }
}
module.exports = { ChatBoundaries, FIVE_HOURS };

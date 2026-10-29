const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
// Atomic local persistence. Never silently reset a malformed preferences file.
class ReplyPreferences extends EventEmitter {
    constructor(file) {
        super();
        this.file = file; this.revisions = new Map();
        const data = file && fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
        if (!Array.isArray(data) || data.some(id => typeof id !== 'string' || !/^\d+$/.test(id))) throw new Error('Invalid reply preferences file');
        this.muted = new Set(data);
    }
    isMuted(user) { return this.muted.has(user); }
    revision(user) { return this.revisions.get(user) || 0; }
    setMuted(user, muted) {
        if (!/^\d+$/.test(user)) throw new Error('Invalid user ID');
        const next = new Set(this.muted);
        if (muted) next.add(user); else next.delete(user);
        if (this.file) {
            fs.mkdirSync(path.dirname(this.file), { recursive: true });
            const temp = `${this.file}.tmp`;
            fs.writeFileSync(temp, JSON.stringify([...next]), { mode: 0o600 }); fs.renameSync(temp, this.file);
        }
        this.muted = next; this.revisions.set(user, this.revision(user) + 1);
        this.emit('change', user, muted);
    }
}
module.exports = { ReplyPreferences };

// Single-process implementation. Replace with a shared store before horizontal scaling.
class HistoryStore {
    constructor(limit) { this.limit = limit; this.histories = new Map(); }
    get(channelId) { return (this.histories.get(channelId) || []).map(({ role, content }) => ({ role, content })); }
    add(channelId, role, content, messageId) {
        const history = this.histories.get(channelId) || [];
        history.push({ role, content, messageId });
        this.histories.set(channelId, history.slice(-this.limit));
    }
    removeByMessageId(channelId, messageId) {
        const history = this.histories.get(channelId) || [];
        const index = history.findIndex(entry => entry.role === 'assistant' && entry.messageId === messageId);
        if (index < 0) return false;
        history.splice(index, 1);
        return true;
    }
}
module.exports = { HistoryStore };

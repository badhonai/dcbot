class QueueFullError extends Error {}
// Serialize all mutations per channel; unrelated channels can proceed concurrently.
class ChannelQueue {
    constructor(maxPending) { this.maxPending = maxPending; this.channels = new Map(); }
    run(channelId, task) {
        const state = this.channels.get(channelId) || { tail: Promise.resolve(), count: 0 };
        if (state.count >= this.maxPending) return Promise.reject(new QueueFullError('Channel queue is full'));
        state.count++;
        this.channels.set(channelId, state);
        const result = state.tail.then(task);
        state.tail = result.catch(() => {}).finally(() => {
            state.count--;
            if (!state.count) this.channels.delete(channelId);
        });
        return result;
    }
    async drain() { await Promise.all([...this.channels.values()].map(state => state.tail)); }
}
module.exports = { ChannelQueue, QueueFullError };

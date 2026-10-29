// Bound decoded response bytes before JSON parsing, including chunked/compressed bodies.
async function boundedJson(response, maxBytes = 1024 * 1024) {
    if (Number(response.headers?.get?.('content-length')) > maxBytes) {
        await response.body?.cancel?.().catch(() => {});
        throw new Error('Provider response exceeds the size limit');
    }
    if (!response.body?.getReader) {
        const data = await response.json(); // Compatibility with injected transports in tests.
        if (Buffer.byteLength(JSON.stringify(data)) > maxBytes) throw new Error('Provider response exceeds the size limit');
        return data;
    }
    const reader = response.body.getReader(); const chunks = []; let bytes = 0;
    try {
        while (true) {
            const { done, value } = await reader.read(); if (done) break;
            bytes += value.byteLength;
            if (bytes > maxBytes) throw new Error('Provider response exceeds the size limit');
            chunks.push(Buffer.from(value));
        }
        return JSON.parse(Buffer.concat(chunks, bytes).toString('utf8'));
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
module.exports = { boundedJson };

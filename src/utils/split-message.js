function splitMessage(text, maxLength) {
    if (!Number.isInteger(maxLength) || maxLength < 1 || maxLength > 2000) throw new Error('Invalid chunk length');
    const chunks = [];
    while (text.length) {
        let end = Math.min(text.length, maxLength);
        if (end < text.length) {
            const newline = text.lastIndexOf('\n', end - 1);
            if (newline > 0) end = newline + 1;
            // Do not split a UTF-16 surrogate pair.
            else if (end > 1 && /[\uD800-\uDBFF]/.test(text[end - 1])) end--;
        }
        chunks.push(text.slice(0, end));
        text = text.slice(end);
    }
    return chunks;
}
module.exports = { splitMessage };

// Discord-aware splitter. Unlike splitMessage, may close/reopen formatting between packets.
function splitDiscordMessage(input, maxLength = 1900) {
    if (!Number.isInteger(maxLength) || maxLength < 64 || maxLength > 2000) {
        if (Number.isInteger(maxLength) && maxLength > 0 && maxLength < 64) return splitMessage(input, maxLength);
        throw new Error('Invalid chunk length');
    }
    let text = String(input); let fence = ''; let bold = false; const chunks = [];
    while (text.length) {
        const prefix = fence ? '```' + fence + '\n' : bold ? '**' : '';
        const limit = maxLength - prefix.length - 8;
        let end = Math.min(text.length, limit);
        if (end < text.length) {
            const head = text.slice(0, end);
            const paragraph = head.lastIndexOf('\n\n'); const line = head.lastIndexOf('\n');
            const sentence = [...head.matchAll(/[.!?।]\s+/gu)].at(-1);
            const word = head.lastIndexOf(' ');
            end = paragraph > end * 0.4 ? paragraph + 2 : line > end * 0.4 ? line + 1 : sentence && sentence.index > end * 0.4 ? sentence.index + sentence[0].length : word > end * 0.4 ? word + 1 : end;
            // A masked link/inline-code/URL is atomic whenever it fits in one packet.
            for (const match of text.matchAll(/\[[^\]\n]+\]\((?:<[^>\n]+>|[^\s\n]+)\)|`[^`\n]+`|<?https?:\/\/[^\s<>]+>?/g)) {
                const stop = match.index + match[0].length;
                if (match.index >= end) break;
                if (stop > end) {
                    if (match.index > 0) end = match.index;
                    else if (stop <= limit) end = stop;
                    else { text = '[Content too long for one Discord block]\n' + text.slice(stop); end = Math.min(text.length, limit); }
                    break;
                }
            }
            if (end > 1 && /[\uD800-\uDBFF]/.test(text[end - 1])) end--;
            if (end > 1 && text[end - 1] === '*' && text[end] === '*') end--;
        }
        let body = text.slice(0, end); text = text.slice(end);
        for (const line of body.split('\n')) {
            const marker = line.match(/^\s*```([^`]*)\s*$/);
            if (marker) fence = fence ? '' : (marker[1].trim().slice(0, 20) || ' ');
            else if (!fence) bold = (line.match(/(?<!\\)\*\*(?!\*)/g) || []).length % 2 ? !bold : bold;
        }
        const suffix = fence ? '\n```' : bold ? '**' : '';
        chunks.push(prefix + body + suffix);
    }
    return chunks;
}
module.exports.splitDiscordMessage = splitDiscordMessage;

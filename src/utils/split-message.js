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

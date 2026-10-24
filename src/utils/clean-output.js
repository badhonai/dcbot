// Apply presentation cleanup at the Discord boundary, not to URLs or tool data.
function clean(text) {
    const replacements = { '\u2014': ',', '\u2013': ',', '\u2011': '-', '\u2018': "'", '\u2019': "'", '\u201c': '', '\u201d': '', '"': '', '\u2026': '' };
    return String(text).replace(/[\u2014\u2013\u2011\u2018\u2019\u201c\u201d"\u2026]/g, char => replacements[char]).trim().replace(/\.+$/, '');
}
function cleanDiscordPayload(payload) {
    if (typeof payload === 'string') return clean(payload);
    const result = { ...payload };
    if (typeof result.content === 'string') result.content = clean(result.content);
    if (result.embeds) result.embeds = result.embeds.map(value => {
        const embed = { ...(value.toJSON ? value.toJSON() : value) };
        for (const key of ['title', 'description']) if (typeof embed[key] === 'string') embed[key] = clean(embed[key]) || undefined;
        if (embed.fields) embed.fields = embed.fields.map(field => ({ ...field, name: clean(field.name) || '\u200b', value: clean(field.value) || '\u200b' }));
        if (embed.footer) embed.footer = { ...embed.footer, text: clean(embed.footer.text) || '\u200b' };
        if (embed.author) embed.author = { ...embed.author, name: clean(embed.author.name) || '\u200b' };
        return embed;
    });
    return result;
}
function replyClean(target, payload) {
    const cleaned = cleanDiscordPayload(payload);
    if (typeof cleaned === 'object' && !cleaned.content && !cleaned.embeds?.length) cleaned.content = '\u200b';
    return target.reply(cleaned || '\u200b');
}
module.exports = { clean, cleanDiscordPayload, replyClean };

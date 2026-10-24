const { test } = require('node:test');
const assert = require('node:assert/strict');
const { clean, cleanDiscordPayload, replyClean } = require('../src/utils/clean-output');
test('output cleaner matches requested punctuation replacements', () => {
    assert.equal(clean('  “Hello” — it’s ‘fine’ – non‑breaking "quotes"…...  '), "Hello , it's 'fine' , non-breaking quotes");
    assert.equal(clean('Keep commas, question marks?'), 'Keep commas, question marks?');
    assert.equal(clean('Done...'), 'Done');
    assert.equal(clean('বাংলা লেখা।'), 'বাংলা লেখা।');
});
test('payload cleaning covers embed text without mutating URLs, identifiers or original data', () => {
    const input = { content: '“Answer”…', embeds: [{ title: 'Title—here.', description: '“Info”.', url: 'https://example.com/a—b', fields: [{ name: '“Field”', value: 'It’s here.' }], footer: { text: '“Source”.', icon_url: 'https://example.com/a–b' } }], components: [{ custom_id: 'do—not—change' }], flags: 64 };
    const result = cleanDiscordPayload(input);
    assert.equal(result.content, 'Answer'); assert.equal(result.embeds[0].title, 'Title,here');
    assert.equal(result.embeds[0].fields[0].value, "It's here"); assert.equal(result.embeds[0].footer.text, 'Source');
    assert.equal(result.embeds[0].url, input.embeds[0].url); assert.equal(result.components, input.components);
    assert.equal(input.content, '“Answer”…'); assert.equal(result.flags, 64);
});
test('send-boundary reply wrapper cleans error messages too', async () => {
    let sent;
    await replyClean({ reply: async payload => { sent = payload; } }, { content: 'I couldn’t finish.' });
    assert.equal(sent.content, "I couldn't finish");
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createLogger, errorDetails } = require('../src/utils/logger');
function fixture(options = {}) {
    const lines = [];
    const logger = createLogger('test', { env: {}, now: () => new Date('2026-10-24T10:00:00Z'), write: (text, severity) => lines.push({ text, severity }), ...options });
    return { logger, lines };
}
test('readable logs have a stable UTC timestamp, aligned level and scope', () => {
    const { logger, lines } = fixture();
    logger.info('Bot online', { commands: 7, private: true, missing: undefined });
    assert.equal(lines[0].text, '2026-10-24T10:00:00.000Z  INFO   test            Bot online  |  commands=7  private=true');
});
test('debug is opt-in and level filtering applies to child loggers', () => {
    const { logger, lines } = fixture({ level: 'warn' });
    logger.debug('hidden'); logger.info('hidden'); logger.child('api').warn('visible');
    assert.equal(lines.length, 1); assert.match(lines[0].text, /api/);
    const debug = fixture({ level: 'debug' }); debug.logger.debug('visible'); assert.equal(debug.lines.length, 1);
});
test('JSON logs stay parseable, typed, and isolated from field collisions', () => {
    const { logger, lines } = fixture({ format: 'json' });
    logger.info('Completed', { durationMs: 12, level: 'fake', time: 'fake' });
    const row = JSON.parse(lines[0].text);
    assert.equal(row.level, 'info'); assert.equal(row.time, '2026-10-24T10:00:00.000Z');
    assert.equal(row.fields.durationMs, 12); assert.equal(row.fields.level, 'fake');
});
test('redacts configured credentials, sensitive fields and known credential prefixes', () => {
    const secret = 'example-discord-credential';
    const { logger, lines } = fixture({ env: { DISCORD_TOKEN: secret } });
    logger.error('Never print ' + secret + ' or github_pat_fake123', { apiKey: 'secret', question: 'private text', note: secret, request: { authorization: secret } });
    assert.ok(!lines[0].text.includes(secret)); assert.ok(!lines[0].text.includes('github_pat_fake123'));
    assert.ok(!lines[0].text.includes('private text')); assert.match(lines[0].text, /REDACTED/); assert.match(lines[0].text, /omitted/);
});
test('control characters, newlines and ANSI escapes cannot inject extra log lines', () => {
    const { logger, lines } = fixture();
    logger.warn('\x1b[31mWarning\nforged\rline', { note: 'hello\tworld\u2028new line' });
    assert.ok(!/[\n\r\t\x1b\u2028]/.test(lines[0].text));
});
test('fields and text are bounded; circular objects are not serialized', () => {
    const { logger, lines } = fixture(); const circular = {}; circular.self = circular;
    logger.info('a'.repeat(10000), { circular }); assert.ok(lines[0].text.length < 500);
});
test('silent disables all output and invalid levels fall back to info', () => {
    const silent = fixture({ level: 'silent' }); silent.logger.error('no'); assert.equal(silent.lines.length, 0);
    const fallback = fixture({ level: 'invalid' }); fallback.logger.debug('no'); fallback.logger.info('yes'); assert.equal(fallback.lines.length, 1);
});
test('errors expose actionable metadata, never raw messages or stack traces', () => {
    const error = Object.assign(new Error('sensitive provider payload'), { status: 429 });
    assert.deepEqual(errorDetails(error), { error: 'Error', status: 429, code: undefined, hint: 'Rate limit reached; wait before retrying' });
    assert.ok(!JSON.stringify(errorDetails(error)).includes('sensitive'));
    assert.match(errorDetails({ code: 50013 }).hint, /permissions/);
    assert.match(errorDetails({ name: 'TimeoutError' }).hint, /timed out/);
});
test('output callback receives severity for routing warnings and errors to stderr', () => {
    const { logger, lines } = fixture(); logger.warn('warn'); logger.error('error');
    assert.deepEqual(lines.map(l => l.severity), ['warn', 'error']);
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { detectLanguage, matchesLanguage, enforceLanguage, localizeFixed } = require('../src/conversation/language');
const { createAgent } = require('../src/ai/agent');
const response = content => ({ choices: [{ message: { content } }] });
function sdk(fn) { return { chat: { completions: { create: fn } } }; }
test('Bangla, Banglish, English and explicit language switches are recognized', () => {
    for (const input of ['ভাই কেমন আছো?', 'এইটা বুঝিয়ে বলো']) assert.equal(detectLanguage(input), 'bn');
    for (const input of ['Bhai ki obostha?', 'tui ki koros', 'BTC er price koto?', 'kemon acho', 'amake ektu help koro']) assert.equal(detectLanguage(input), 'banglish', input);
    assert.equal(detectLanguage('What is Bitcoin?'), 'en');
    assert.equal(detectLanguage('Banglish e bolo'), 'banglish'); assert.equal(detectLanguage('Please reply in English', 'bn'), 'en');
    assert.equal(detectLanguage('বাংলিশে বলো'), 'banglish');
});
test('ambiguous short turns carry session language but a clear English turn switches it', () => {
    assert.equal(detectLanguage('okay', 'banglish'), 'banglish'); assert.equal(detectLanguage('next', 'bn'), 'bn');
    assert.equal(detectLanguage('Please explain the next step', 'banglish'), 'en');
    assert.equal(detectLanguage('https://example.com/বাংলা', 'en'), 'en');
});
test('Banglish guard rejects plain English and Bengali script', () => {
    assert.equal(matchesLanguage('I am fine, how can I help you?', 'banglish'), false);
    assert.equal(matchesLanguage('আমি ভালো আছি', 'banglish'), false);
    assert.equal(matchesLanguage('Ami bhalo achi, tumi kemon?', 'banglish'), true);
});
test('wrong-language prose gets one tool-free rewrite with protected values and URLs', async () => {
    let calls = 0;
    const answer = await enforceLanguage('The price is 123.45 USDT. Read https://example.com/a\n\n-# Sources: [1](<https://example.com/a>)', 'bn', { client: sdk(async request => {
        calls++; assert.equal(request.tools, undefined);
        const tokens = request.messages[1].content.match(/ZX[A-Z0-9]+XZ/g);
        return response(`দাম ${tokens[0]} USDT। বিস্তারিত ${tokens[1]}`);
    }) });
    assert.equal(calls, 1); assert.match(answer, /123\.45/); assert.match(answer, /https:\/\/example.com\/a/); assert.match(answer, /Sources: \[1\]/);
});
test('repair cannot change numbers, invent links or leak reasoning', async () => {
    const broken = await enforceLanguage('The answer is 123', 'bn', { client: sdk(async () => response('উত্তর 999')) }); assert.ok(!broken.includes('999'));
    const link = await enforceLanguage('Hello there', 'bn', { client: sdk(async () => response('হ্যালো https://evil.example')) }); assert.ok(!link.includes('evil'));
    const safe = await enforceLanguage('Hello there', 'bn', { client: sdk(async () => response('<think>secret reasoning</think>হ্যালো, কেমন আছো?')) }); assert.ok(!safe.includes('secret')); assert.match(safe, /হ্যালো/);
});
test('already-correct prose and verified price metadata avoid a rewrite call', async () => {
    let calls = 0; const client = sdk(async () => { calls++; throw new Error('must not call'); });
    assert.equal(await enforceLanguage('Bhai, ki help lagbe?', 'banglish', { client }), 'Bhai, ki help lagbe?');
    const price = await enforceLanguage('BTC/USDT: **123 USDT** · CoinGecko cross-rate · updated 25s ago', 'bn', { client });
    assert.match(price, /123 USDT/); assert.match(price, /25 সেকেন্ড/); assert.equal(calls, 0);
});
test('agent enforces Banglish when its first model answer is English and remembers the language', async () => {
    let calls = 0; const requests = [];
    const agent = createAgent({ config: {}, actions: {}, client: sdk(async request => { requests.push(request); return response(++calls === 1 ? 'Hello, how can I help?' : 'Bhai, ki help lagbe?'); }) });
    const answer = await agent.respond('Bhai ki obostha?', { sessionKey: 'a:u' });
    assert.equal(answer, 'Bhai, ki help lagbe?'); assert.equal(calls, 2);
    assert.equal(agent.languageFor('okay', 'a:u'), 'banglish'); assert.equal(agent.languageFor('What is next?', 'a:u'), 'en');
    assert.match(requests[0].messages[0].content, /MANDATORY CURRENT-TURN LANGUAGE: Banglish/);
});
test('boundary notices and checking states stay in the user language without another model call', () => {
    assert.equal(localizeFixed('Thinking and checking...', 'bn'), 'ভাবছি আর যাচাই করছি...');
    const text = localizeFixed('I’m stepping away from this chat for 5 hours 😕 I won’t reply to conversation messages until <t:12345:t>. We can try again after that.', 'banglish');
    assert.match(text, /5 ghontar/); assert.match(text, /<t:12345:t>/);
});

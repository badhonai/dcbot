const { test } = require('node:test');
const assert = require('node:assert/strict');
const { CommunityFun, QUIZZES, RIDDLES, PROMPTS } = require('../src/features/community-fun');
const { Actions, TOOL_DEFINITIONS, validateIntent } = require('../src/features/actions');
const { createAgent } = require('../src/ai/agent');
const { looksLikeRequest } = require('../src/discord/agent-handler');
const body = result => JSON.stringify(result);
test('quiz question response contains ID/options, never an answer key or explanation', () => {
 const r = new CommunityFun({ pick: () => 0 }).fun('quiz'); assert.equal(r.questionId, 'q1'); assert.equal(r.options.length, 3); assert.equal(r.correct, undefined); assert.equal(r.answer, undefined);
 assert.ok(!body(r).includes(QUIZZES[0][4][0])); assert.match(r.instruction, /Do not reveal/);
});
test('every curated quiz can check correct and incorrect attempts without state', () => {
 const f = new CommunityFun();
 for (const q of QUIZZES) {
  assert.equal(f.answer(q[0], 'ABC'[q[3]]).correct, true);
  assert.equal(f.answer(q[0], 'ABC'[(q[3] + 1) % 3]).correct, false);
  assert.equal(f.answer(q[0], 'reveal').correct, null);
 }
 assert.equal(f.sessions, undefined); assert.equal(f.scores, undefined);
});
test('riddles accept curated alternatives and reveal only through answer', () => {
 const f = new CommunityFun({ pick: () => 0 }); const r = f.fun('riddle'); assert.equal(r.questionId, 'r1'); assert.equal(r.answer, undefined);
 for (const q of RIDDLES) assert.equal(f.answer(q[0], q[2][0]).correct, true);
 assert.equal(f.answer('r1', 'piano').correct, true); assert.equal(f.answer('r1', 'brick').correct, false);
});
test('all activity banks are finite, offline and produce short safe cards', () => {
 for (const activity of ['quiz', 'riddle', ...Object.keys(PROMPTS)]) {
  const f = new CommunityFun({ pick: n => n - 1 });
  for (const language of ['en', 'bn', 'banglish']) { const r = f.fun(activity, language); assert.equal(r.pages.length, 1); assert.ok(body(r.pages[0]).length < 1700); assert.ok(!body(r).includes('@everyone')); }
 }
});
test('Bangla and Banglish games localize choices and feedback without model calls', () => {
 const f = new CommunityFun({ pick: () => 0 }); const bn = f.fun('quiz', 'bn');
 assert.match(bn.question, /ওয়ালেটে/); assert.match(bn.options[0], /প্রাইভেট/);
 assert.match(f.answer('q1', 'A', 'bn').pages[0].title, /সঠিক/); assert.match(f.fun('quiz', 'banglish').question, /ashole/);
 assert.equal(f.answer('q1', 'প্রাইভেট কী', 'bn').correct, true);
});
test('unknown IDs/activities are safe notices, not fabricated game results', () => {
 const f = new CommunityFun(); assert.match(f.answer('../data', 'A').pages[0].title, /Unknown/); assert.match(f.fun('gamble').pages[0].title, /Choose/);
});
test('new community tools are strict read-only schemas with bounded inputs', () => {
 assert.equal(TOOL_DEFINITIONS.length, 19);
 assert.equal(validateIntent({ command: 'fun', args: { activity: 'gamble' } }), null);
 assert.equal(validateIntent({ command: 'x_research', args: { query: 'x'.repeat(401) } }), null);
 assert.equal(validateIntent({ command: 'answer', args: { id: 'q1', choice: 'A', user: 'someone' } }), null);
 assert.equal(validateIntent({ command: 'trending', args: {} }).command, 'trending');
});
test('offline fun works through Actions without keys, market, web or persistence', async () => {
 const actions = new Actions({}); assert.ok((await actions.execute({ command: 'fun', args: { activity: 'fact' } })).pages.length);
 assert.equal((await actions.execute({ command: 'answer', args: { id: 'q1', choice: 'A' } })).correct, true); assert.equal(actions.active, 0);
});
test('agent can use curated tools for a one-word quiz request, while bare BTC stays protected', async () => {
 let calls = 0; const executed = [];
 const agent = createAgent({ config: {}, actions: { execute: async intent => { executed.push(intent); return new CommunityFun({ pick: () => 0 }).fun('quiz'); } }, client: { chat: { completions: { create: async req => {
  if (++calls === 1) { assert.ok(req.tools.some(t => t.function.name === 'fun')); return { choices: [{ message: { tool_calls: [{ id: 'f', function: { name: 'fun', arguments: '{"activity":"quiz"}' } }] } }] }; }
  return { choices: [{ message: { content: 'What does a wallet hold? A. Private keys B. Coins inside the app C. Guaranteed returns. ID q1' } }] };
 } } } } });
 const r = await agent.respond('quiz'); assert.match(r, /ID q1/); assert.equal(executed[0].command, 'fun');
 assert.equal(looksLikeRequest('quiz'), true); assert.equal(looksLikeRequest('কুইজ দাও'), true);
});

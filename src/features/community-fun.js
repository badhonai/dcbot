const { randomInt } = require('node:crypto');
const { card, pages, notice } = require('../utils/cards');
// Curated static learning/game data. No scores, profiles, gambling or background jobs.
const QUIZZES = [
 ['q1', ['What does a wallet hold?', 'Wallet e ashole ki thake?', 'ওয়ালেটে আসলে কী থাকে?'], ['Private keys', 'Coins stored inside the app', 'Guaranteed returns'], 0, ['Keys authorize transactions; assets are recorded on the network.', 'Key diye transaction authorize hoy; asset network e record thake.', 'কী দিয়ে লেনদেন অনুমোদিত হয়; সম্পদের হিসাব নেটওয়ার্কে থাকে।']],
 ['q2', ['What does gas usually pay for?', 'Gas fee kisher jonno lage?', 'গ্যাস ফি সাধারণত কীসের জন্য?'], ['Token marketing', 'Transaction computation', 'A guaranteed profit'], 1, ['Gas meters network computation, not investment performance.', 'Gas network er computation er hisab, profit er guarantee na.', 'গ্যাস নেটওয়ার্কের গণনার হিসাব, লাভের নিশ্চয়তা নয়।']],
 ['q3', ['A lower price per token always means a cheaper valuation. True?', 'Token er dam kom manei valuation kom, thik?', 'প্রতি টোকেনের দাম কম মানেই মূল্যায়ন কম, ঠিক?'], ['True', 'False', 'Only for meme coins'], 1, ['Supply matters: market cap is price multiplied by circulating supply.', 'Supply o matter kore: market cap holo dam gun circulating supply.', 'সরবরাহও গুরুত্বপূর্ণ: বাজারমূল্য হলো দাম গুণ প্রচলিত সরবরাহ।']],
 ['q4', ['What is slippage?', 'Slippage mane ki?', 'স্লিপেজ কী?'], ['Expected versus executed price difference', 'A fixed staking reward', 'A seed phrase backup'], 0, ['Execution may differ from a quote as liquidity and prices change.', 'Liquidity ar dam bodlale execution quote theke alada hote pare.', 'তারল্য ও দাম বদলালে লেনদেনের কার্যকর দাম কোট থেকে আলাদা হতে পারে।']],
 ['q5', ['Who should receive your seed phrase?', 'Seed phrase kake deya uchit?', 'সিড ফ্রেজ কাকে দেওয়া উচিত?'], ['A helpful stranger', 'Support staff in DMs', 'Nobody asking for it'], 2, ['Never share a seed phrase; a legitimate helper does not need it.', 'Seed phrase share koro na; help korte eta dorkar hoy na.', 'সিড ফ্রেজ কাউকে দেবেন না; সাহায্য করতে এটি দরকার হয় না।']],
 ['q6', ['Does a DEX listing prove a token is safe?', 'DEX e listing thaklei token safe?', 'ডেক্সে তালিকাভুক্ত হলেই কি টোকেন নিরাপদ?'], ['Yes', 'No', 'Only with a logo'], 1, ['Listings and liquidity do not establish safety or ownership.', 'Listing ar liquidity diye safety ba ownership prove hoy na.', 'তালিকাভুক্তি বা তারল্য নিরাপত্তা বা মালিকানার প্রমাণ নয়।']],
 ['q7', ['Which input is needed for a token market cap?', 'Token market cap ber korte konta lage?', 'টোকেনের বাজারমূল্য বের করতে কোনটি লাগে?'], ['Follower count', 'Circulating supply', 'Logo colour'], 1, ['Market cap uses circulating supply multiplied by price.', 'Market cap ber hoy circulating supply gun dam diye.', 'প্রচলিত সরবরাহকে দাম দিয়ে গুণ করলে বাজারমূল্য হয়।']],
 ['q8', ['What does a stablecoin aim to do?', 'Stablecoin er uddeshho ki?', 'স্টেবলকয়েনের উদ্দেশ্য কী?'], ['Stay near a reference value', 'Never have any risk', 'Always outperform BTC'], 0, ['A peg is a target, not a guarantee; depegging can happen.', 'Peg ekta target, guarantee na; depeg hote pare.', 'পেগ একটি লক্ষ্য, নিশ্চয়তা নয়; পেগ ভাঙতে পারে।']],
 ['q9', ['Which is usually a public identifier?', 'Konti shadharonoto public identifier?', 'কোনটি সাধারণত প্রকাশ্য পরিচায়ক?'], ['Seed phrase', 'Private key', 'Wallet address'], 2, ['An address can be public; private keys and seed phrases must stay secret.', 'Address public hote pare; private key ar seed phrase gopon rakho.', 'ঠিকানা প্রকাশ্য হতে পারে; প্রাইভেট কী ও সিড ফ্রেজ গোপন রাখুন।']],
 ['q10', ['What is a block explorer useful for?', 'Block explorer diye ki dekha jay?', 'ব্লক এক্সপ্লোরার কী কাজে লাগে?'], ['Guaranteed future prices', 'Public on-chain records', 'Recovering any lost seed phrase'], 1, ['Explorers expose public chain data; they cannot guarantee prices or recover secrets.', 'Explorer e public chain data dekha jay, future dam ba secret ferot deya jay na.', 'এক্সপ্লোরারে প্রকাশ্য চেইন তথ্য দেখা যায়, ভবিষ্যৎ দাম বা গোপন কী উদ্ধার করা যায় না।']],
 ['q11', ['What does FDV assume for token supply?', 'FDV te kon supply dhora hoy?', 'এফডিভিতে কোন সরবরাহ ধরা হয়?'], ['Only exchange reserves', 'A fully diluted supply basis', 'Only burnt tokens'], 1, ['FDV uses a diluted supply assumption; provider definitions and missing maximum supply matter.', 'FDV te diluted supply dhora hoy; provider er definition check koro.', 'এফডিভিতে পূর্ণ সরবরাহের অনুমান থাকে; প্রদানকারীর সংজ্ঞা যাচাই করুন।']],
 ['q12', ['Does a transaction hash prove an investment is profitable?', 'Transaction hash thaklei investment profitable?', 'লেনদেনের হ্যাশ থাকলেই কি বিনিয়োগ লাভজনক?'], ['Yes', 'No', 'Only on weekends'], 1, ['A hash identifies a transaction, not an investment outcome.', 'Hash transaction chinte shahajjo kore, profit prove kore na.', 'হ্যাশ লেনদেন শনাক্ত করে, লাভের প্রমাণ দেয় না।']],
];
const CHOICES = {
 q1: [['Private key', 'App er bhitore coin', 'Guaranteed profit'], ['প্রাইভেট কী', 'অ্যাপের ভেতরে কয়েন', 'নিশ্চিত লাভ']],
 q2: [['Token er marketing', 'Transaction er computation', 'Nishchit profit'], ['টোকেনের প্রচার', 'লেনদেনের গণনা', 'নিশ্চিত লাভ']],
 q3: [['Thik', 'Bhul', 'Shudhu meme coin e'], ['ঠিক', 'ভুল', 'শুধু মিম কয়েনে']],
 q4: [['Quote ar execution er dam er parthokko', 'Fixed staking reward', 'Seed phrase er backup'], ['প্রত্যাশিত ও কার্যকর দামের পার্থক্য', 'নির্দিষ্ট স্টেকিং পুরস্কার', 'সিড ফ্রেজের ব্যাকআপ']],
 q5: [['Ochena helpful lok', 'DM e support staff', 'Je chaibe takeo na'], ['অচেনা সাহায্যকারী', 'ডিএমে সাপোর্ট কর্মী', 'যে চাইবে তাকেও নয়']],
 q6: [['Haan', 'Na', 'Logo thaklei'], ['হ্যাঁ', 'না', 'লোগো থাকলেই']],
 q7: [['Follower count', 'Circulating supply', 'Logo er rong'], ['অনুসারীর সংখ্যা', 'প্রচলিত সরবরাহ', 'লোগোর রং']],
 q8: [['Reference value er kache thaka', 'Kono risk na thaka', 'Shobshomoy BTC ke harano'], ['রেফারেন্স মূল্যের কাছাকাছি থাকা', 'কোনো ঝুঁকি না থাকা', 'সবসময় বিটিসিকে হারানো']],
 q9: [['Seed phrase', 'Private key', 'Wallet address'], ['সিড ফ্রেজ', 'প্রাইভেট কী', 'ওয়ালেটের ঠিকানা']],
 q10: [['Future dam nishchit jana', 'Public on-chain record', 'Harano seed phrase ferot ana'], ['ভবিষ্যৎ দাম নিশ্চিত জানা', 'প্রকাশ্য অনচেইন তথ্য', 'হারানো সিড ফ্রেজ উদ্ধার']],
 q11: [['Shudhu exchange reserve', 'Fully diluted supply er bhitti', 'Shudhu burn kora token'], ['শুধু এক্সচেঞ্জের রিজার্ভ', 'পূর্ণ সরবরাহের ভিত্তি', 'শুধু পোড়ানো টোকেন']],
 q12: [['Haan', 'Na', 'Shudhu weekend e'], ['হ্যাঁ', 'না', 'শুধু সপ্তাহান্তে']],
};
const choicesFor = (quiz, l) => l ? CHOICES[quiz[0]][l - 1] : quiz[2];
const RIDDLES = [
 ['r1', ['What has keys but opens no locks?', 'Key ache, kintu tala khole na, ki?', 'কী আছে, কিন্তু তালা খোলে না, কী?'], ['piano', 'keyboard', 'পিয়ানো', 'কিবোর্ড'], ['A piano or keyboard', 'Piano ba keyboard', 'পিয়ানো বা কিবোর্ড']],
 ['r2', ['What gets wetter as it dries?', 'Shukate shukate nije bhije jay, ki?', 'শুকাতে শুকাতে নিজে ভিজে যায়, কী?'], ['towel', 'gamcha', 'তোয়ালে', 'গামছা'], ['A towel', 'Gamcha ba towel', 'তোয়ালে']],
 ['r3', ['What has hands but cannot clap?', 'Hat ache, tali dite pare na, ki?', 'হাত আছে, তালি দিতে পারে না, কী?'], ['clock', 'watch', 'ghori', 'ঘড়ি'], ['A clock', 'Ghori', 'ঘড়ি']],
 ['r4', ['What has many teeth but cannot bite?', 'Onek daat, kintu kamrate pare na, ki?', 'অনেক দাঁত, কিন্তু কামড়াতে পারে না, কী?'], ['comb', 'chiruni', 'চিরুনি'], ['A comb', 'Chiruni', 'চিরুনি']],
 ['r5', ['What can travel around the world while staying in a corner?', 'Ek konay theke duniyajure ghure, ki?', 'এক কোণায় থেকে সারা বিশ্ব ঘোরে, কী?'], ['stamp', 'postage stamp', 'ডাকটিকিট'], ['A postage stamp', 'Dak ticket', 'ডাকটিকিট']],
 ['r6', ['What becomes bigger the more you take away?', 'Joto shorao, toto boro hoy, ki?', 'যত সরাও, তত বড় হয়, কী?'], ['hole', 'gorto', 'গর্ত'], ['A hole', 'Gorto', 'গর্ত']],
];
const PROMPTS = {
 icebreaker: [
  ['Which crypto concept finally clicked for you, and what helped?', 'Kon crypto concept ta finally bujhecho? Ki help korechilo?', 'কোন ক্রিপ্টো ধারণাটি অবশেষে বুঝেছেন? কী সাহায্য করেছে?'],
  ['Explain a blockchain to a fictional alien in one sentence.', 'Ek line e ekta alien ke blockchain bujhao.', 'এক বাক্যে এক কাল্পনিক এলিয়েনকে ব্লকচেইন বোঝান।'],
  ['What would you name a blockchain-themed cafe?', 'Blockchain themed cafe hole ki nam dite?', 'ব্লকচেইন-থিমের ক্যাফের কী নাম দিতেন?'],
  ['Which everyday problem would you solve with better technology?', 'Technology diye rojkar kon shomossha solve korte chao?', 'প্রযুক্তি দিয়ে দৈনন্দিন কোন সমস্যা সমাধান করতে চান?'],
  ['Describe today’s mood with a harmless crypto metaphor.', 'Ajker mood ta ekta mojar crypto tulona diye bolo.', 'আজকের মেজাজ একটি মজার ক্রিপ্টো উপমায় বলুন।'],
  ['What is one thing a newcomer should learn before buying a token?', 'Token kenar age newcomer er konta shekha uchit?', 'টোকেন কেনার আগে নতুনদের কোন বিষয় শেখা উচিত?'],
 ],
 debate: [
  ['Community debate: low fees or maximum decentralization? Explain the trade-off, not a price prediction.', 'Community adda: kom fee na beshi decentralization? Trade-off bolo, dam predict na.', 'কমিউনিটি বিতর্ক: কম ফি নাকি বেশি বিকেন্দ্রীকরণ? সুবিধা-অসুবিধা বলুন, দাম নয়।'],
  ['Community debate: simple wallet UX or more advanced controls?', 'Community adda: simple wallet UX na beshi advanced control?', 'কমিউনিটি বিতর্ক: সহজ ওয়ালেট নাকি বেশি উন্নত নিয়ন্ত্রণ?'],
  ['Community debate: on-chain games or conventional games, and why?', 'Community adda: on-chain game na normal game, keno?', 'কমিউনিটি বিতর্ক: অনচেইন গেম নাকি প্রচলিত গেম, কেন?'],
  ['Community debate: should token supply be fixed or flexible? Discuss design trade-offs.', 'Token supply fixed na flexible howa bhalo? Design er trade-off bolo.', 'টোকেনের সরবরাহ নির্দিষ্ট নাকি পরিবর্তনশীল হওয়া ভালো? নকশার সুবিধা-অসুবিধা বলুন।'],
 ],
 fact: [
  ['A token unit price alone does not establish valuation; supply matters too.', 'Shudhu token er dam diye valuation bojha jay na, supply o matter kore.', 'শুধু টোকেনের দাম দিয়ে মূল্যায়ন বোঝা যায় না, সরবরাহও গুরুত্বপূর্ণ।'],
  ['A stablecoin peg is a target, not a promise that the market price can never deviate.', 'Stablecoin er peg ekta target, market dam kokhono bodlabe na emon promise na.', 'স্টেবলকয়েনের পেগ একটি লক্ষ্য, বাজারদর কখনো বদলাবে না এমন প্রতিশ্রুতি নয়।'],
  ['A wallet manages keys; on-chain assets are accounted for by the network.', 'Wallet key manage kore; on-chain asset er hisab network e thake.', 'ওয়ালেট কী পরিচালনা করে; অনচেইন সম্পদের হিসাব নেটওয়ার্কে থাকে।'],
  ['An explorer link identifies public chain data; it is not an endorsement of a project.', 'Explorer link e public chain data dekha jay, project er endorsement na.', 'এক্সপ্লোরার লিংকে প্রকাশ্য চেইন তথ্য দেখা যায়, এটি প্রকল্পের অনুমোদন নয়।'],
 ],
};
const index = language => language === 'banglish' ? 1 : language === 'bn' ? 2 : 0;
class CommunityFun {
    constructor({ pick = randomInt } = {}) { this.pick = pick; }
    fun(activity = 'quiz', language = 'en') {
        const l = index(language);
        if (activity === 'quiz' || activity === 'riddle') {
            const bank = activity === 'quiz' ? QUIZZES : RIDDLES; const item = bank[this.pick(bank.length)];
            const options = activity === 'quiz' ? choicesFor(item, l).map((answer, i) => `${'ABC'[i]}. ${answer}`).join('\n') : '';
            const instruction = ['Use /answer with this ID and your choice; ask for a hint or explanation in chat.', 'Ei ID ar tomar choice diye /answer use koro; hint lagle chat e bolo.', 'এই আইডি ও আপনার উত্তর দিয়ে /answer ব্যবহার করুন; ইঙ্গিত চাইলে চ্যাটে বলুন।'][l];
            return { ...pages(card(activity === 'quiz' ? 'Crypto quiz' : 'Community riddle', `${item[1][l]}\n${options}\n\n${instruction}`, { footer: `Question ID: ${item[0]} · No scores or personal data stored` })), questionId: item[0], question: item[1][l], options: activity === 'quiz' ? choicesFor(item, l) : undefined, instruction: 'Show the question and options only. Do not reveal or guess the answer before the user attempts it or asks for the answer. Use answer with the questionId to check.' };
        }
        if (!Object.hasOwn(PROMPTS, activity)) return notice('Choose an activity', 'quiz, riddle, icebreaker, debate or fact');
        const bank = PROMPTS[activity]; const text = bank[this.pick(bank.length)][l];
        return pages(card(`Community ${activity}`, text, { footer: activity === 'fact' ? 'Curated learning card · Not live market data or financial advice' : 'For friendly community discussion · No profiling or rewards' }));
    }
    answer(id, choice, language = 'en') {
        const l = index(language); const quiz = QUIZZES.find(q => q[0] === id); const riddle = RIDDLES.find(q => q[0] === id);
        if (!quiz && !riddle) return notice('Unknown question ID', 'Use the ID shown on a quiz or riddle.');
        const value = choice.trim().toLowerCase().replace(/[.!?]+$/g, '');
        const reveal = ['answer', 'reveal', 'উত্তর', 'bolo'].includes(value);
        let correct;
        if (quiz) {
            const candidate = /^[abc]$/i.test(value) ? 'abc'.indexOf(value) : quiz[2].findIndex((a, i) => a.toLowerCase() === value || choicesFor(quiz, l)[i].toLowerCase() === value);
            correct = candidate === quiz[3];
        } else correct = riddle[2].includes(value);
        const solution = quiz ? `${'ABC'[quiz[3]]}. ${choicesFor(quiz, l)[quiz[3]]}\n${quiz[4][l]}` : riddle[3][l];
        const title = reveal ? ['Answer', 'Uttor', 'উত্তর'][l] : correct ? ['Correct! 🎉', 'Thik bolecho! 🎉', 'সঠিক উত্তর! 🎉'][l] : ['Nice try 🙂', 'Bhalo cheshta 🙂', 'ভালো চেষ্টা 🙂'][l];
        return { ...pages(card(title, solution, { footer: 'Community learning game · No points, prizes or stored player history' })), questionId: id, correct: reveal ? null : correct };
    }
}
module.exports = { CommunityFun, QUIZZES, RIDDLES, PROMPTS };

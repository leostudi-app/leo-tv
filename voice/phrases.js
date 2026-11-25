/* Lists every sentence LEO can say, so each can be recorded once as a voice clip.
   Run: node voice/phrases.js > voice/phrases.json  (the voice workflow does this). Mirrors the say() calls in index.html. */
const C = require('../core.js');

const NUM_WORD = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const PRAISE = ['Brilliant!', 'Well done, Leo!', 'Amazing!', "You're a superstar, Leo!", 'Fantastic!', 'Yes! Great job!'];
const PLURAL = ['footballs', 'apples', 'stars', 'music notes'];
const SHAPES = C.BASIC_SHAPES.concat(C.EXTRA_SHAPES);
const nums = Array.from({ length: 10 }, (_, i) => i + 1);
const texts = [];
const add = (...t) => texts.push(...t);

add(...C.GAMES.map((g) => g.name), 'Hello Leo! Pick a game!', 'Hello Leo! Can you hear me?', ...PRAISE);
// Number games
for (const n of nums) {
  add(`Can you find number ${n}?`, `Kick the ball into goal number ${n}!`, `That's number ${n}.`, `Goal! Number ${n}!`,
    `${nums.slice(0, n).join(', ')}. ${NUM_WORD[n]}!`, NUM_WORD[n], `Look for number ${n}!`, `That's ${n}.`,
    `What comes after ${n}?`, `Find number ${n} first!`, `Start with number ${n}.`);
}
add(...PLURAL.map((p) => `How many ${p}? Let's count!`), 'Listen to my drum. How many bangs?', 'Ooh, nearly!');
// Shapes
for (const s of SHAPES) add(`Can you find the ${s}?`, `That's a ${s}.`, `Yes! The ${s} fits!`);
add('Which shape fits in the hole?');
// Animals
for (const [a, sound] of Object.entries(C.ANIMALS)) add(`Listen! ${sound} Which animal says that?`, `That's a ${a}.`, `Yes! The ${a} says ${sound}`);
// Jigsaw
for (const p of C.PUZZLES) add(`Let's make a picture of ${p.name}! Pick a piece, then find where it goes.`, `You did it, Leo! ${p.done}`);
add('Where does this piece go?', 'Pick a piece first!', 'Look for the glowing space!', 'Not there. Look at the picture!', 'Yes!', 'Perfect!', 'Great!');
// Penalty
add('Penalty time! Pick where to shoot!', 'Shoot again!', 'Ooh, the goalie saved it! Try again!', 'What a save! Have another go!');
add('Goal! On the left!', 'Goal! In the middle!', 'Goal! On the right!');
// Copy my tune
add('Listen to my tune, then copy me!', 'Your turn!', 'Ooh, nearly! Listen again.', 'You copied my tune!');
for (let k = 2; k <= 4; k++) add(`Ready? ${k} notes this time!`);
// Number order
add('Put the numbers in order!');
for (const len of new Set(C.ORDER_LENGTHS)) for (let start = 1; start + len - 1 <= 10; start++) add(`${nums.slice(start - 1, start - 1 + len).join(', ')}!`);
// Rewards, video, friends
add('Wow! You finished the game, Leo! Open your surprise!', 'Watch your video, or skip it?', "Let's dance!",
  'Here are all your friends!', 'Play games to find new friends!');
for (const f of C.FRIENDS) add(`You found ${f.name}!`, `${f.name} is your new friend!`);
// Birthday (25 Nov 2026)
add('Happy birthday to you', 'Happy birthday dear Leo', 'Happy birthday to you!', "Let's play!");

const seen = new Map();
for (const t of texts) for (const part of C.speechParts(t)) seen.set(C.clipKey(part), part);
const out = [...seen].map(([key, text]) => ({ key, text }));
if (require.main === module) process.stdout.write(JSON.stringify(out, null, 1));
module.exports = out;

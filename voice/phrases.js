/* Lists every sentence OLIVER can say, so each can be recorded once as a voice clip.
   Run: node voice/phrases.js > voice/phrases.json  (the voice workflow does this). Mirrors the say() calls in index.html. */
const C = require('../core.js');

const NUM_WORD = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const PRAISE = ['Brilliant!', 'Well done, Oliver!', 'Amazing!', "You're a superstar, Oliver!", 'Fantastic!', 'Yes! Great job!'];
const PLURAL = ['footballs', 'apples', 'stars', 'music notes'];
const SHAPES = C.BASIC_SHAPES.concat(C.EXTRA_SHAPES);
const nums = Array.from({ length: 10 }, (_, i) => i + 1);
const texts = [];
const add = (...t) => texts.push(...t);

add(...C.GAMES.map((g) => g.name), 'Hello Oliver! Pick a game!', 'Hello Oliver! Can you hear me?', ...PRAISE);
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
for (const p of C.PUZZLES) add(`Let's make a picture of ${p.name}! Pick a piece, then find where it goes.`, `You did it, Oliver! ${p.done}`);
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
// Shape builder
const an = (w) => (/^[aeiou]/.test(w) ? 'an' : 'a');
for (const b of C.BUILDS) {
  add(`Let's build a ${b.name}!`, `You built a ${b.name}!`);
  for (const l of b.layers) add(`Find the ${l.colour} ${l.shape}!`, `Yes! Now find the ${l.colour} ${l.shape}!`);
}
for (const colour of Object.keys(C.COLOURS)) for (const shape of C.BUILD_SHAPES) add(`That's ${an(colour)} ${colour} ${shape}.`);
// Memory pairs
add('Find the matching pairs! Turn over two cards.', 'Here are more cards!', 'Not a match. Try again!', 'You found all the pairs!');
for (const p of ['dogs', 'cats', 'pigs', 'cows', 'sheep', 'ducks', 'frogs', 'lions']) add(`Two ${p}!`);
// Hide & Seek
for (const h of C.HIDERS) add(`Hide and seek! Can you find ${h}?`, `Can you find ${h}?`, `Boo! You found ${h}!`);
add('Not there! Keep looking!', "Here's a clue! Look carefully!");
// Fire Rescue
add('Nee naw! Fire! Drive to the fire and spray the water!', 'Fire! Fire! Put it out!', 'No fire there! Look for the flames!',
  'Hooray! All the fires are out!', 'Splash! The fire is out!', 'Well done, firefighter!', 'Woosh! Great spraying!');
// Race Day
add('Race day! Jump over the cones and win the race!', 'Another race! Jump over the cones!', 'Oops! Jump over the cones!', 'You won the race!', 'Try again! Jump over the cones!',
  "Ooh, you came second! So close! Let's race again!", "Ooh, you came third! Jump over the cones! Let's race again!");
// Rewards, video, friends
add('Wow! You finished the game, Oliver! Open your surprise!', 'Watch your video, or skip it?', "Let's dance!",
  'Here are all your friends!', 'Play games to find new friends!');
for (const f of C.FRIENDS) add(`You found ${f.name}!`, `${f.name} is your new friend!`);
// Birthday (25 Nov 2026)
add('Happy birthday to you', 'Happy birthday dear Oliver', 'Happy birthday to you!', "Let's play!");

const seen = new Map();
for (const t of texts) for (const part of C.speechParts(t)) seen.set(C.clipKey(part), part);
const out = [...seen].map(([key, text]) => ({ key, text }));
if (require.main === module) process.stdout.write(JSON.stringify(out, null, 1));
module.exports = out;

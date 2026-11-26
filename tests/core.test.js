// Run with: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');

// Deterministic RNG for repeatable tests.
function seeded(seed = 42) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
}

test('extractYouTubeId handles common link formats', () => {
  const id = 'dQw4w9WgXcQ';
  for (const url of [
    `https://www.youtube.com/watch?v=${id}`,
    `https://youtu.be/${id}?si=abc`,
    `https://www.youtube.com/shorts/${id}`,
    `https://www.youtubekids.com/watch?v=${id}`,
    `https://m.youtube.com/watch?feature=share&v=${id}`,
    id
  ]) assert.equal(C.extractYouTubeId(url), id, url);
  assert.equal(C.extractYouTubeId('not a link'), null);
  assert.equal(C.extractYouTubeId(null), null);
});

test('parseVideoList dedupes and skips junk', () => {
  const text = 'https://youtu.be/dQw4w9WgXcQ\nrubbish\nhttps://youtu.be/dQw4w9WgXcQ, https://youtu.be/aaaaaaaaaaa';
  assert.deepEqual(C.parseVideoList(text), ['dQw4w9WgXcQ', 'aaaaaaaaaaa']);
});

test('numbers start at 1-5 and unlock 1-10 after mastery', () => {
  let s = C.defaultState();
  assert.equal(C.numberMax(s), 5);
  for (let i = 0; i < 10; i++) s = C.recordAnswer(s, 'numbers', (i % 5) + 1, i !== 0); // 9/10 first-try
  assert.equal(C.numberMax(s), 10);
});

test('mastery needs a full window, not just a lucky start', () => {
  let s = C.defaultState();
  for (let i = 0; i < 5; i++) s = C.recordAnswer(s, 'numbers', 1, true);
  assert.equal(C.isMastered(s, 'numbers'), false);
});

test('recordAnswer is immutable and rejects unknown skills', () => {
  const s = C.defaultState();
  const next = C.recordAnswer(s, 'shapes', 'circle', false);
  assert.deepEqual(s.stats.shapes, {});
  assert.deepEqual(next.stats.shapes.circle, { right: 0, tries: 1 });
  assert.throws(() => C.recordAnswer(s, 'colours', 'red', true), /Unknown skill/);
});

test('rounds always contain the target and 3 distinct options', () => {
  const rng = seeded();
  const s = C.defaultState();
  for (const type of C.ROUND_TYPES) {
    for (let i = 0; i < 50; i++) {
      const r = C.makeRound(type, s, rng);
      assert.equal(r.options.length, 3, type);
      assert.equal(new Set(r.options).size, 3, type);
      assert.ok(r.options.includes(r.target), type);
    }
  }
});

test('drum rounds never exceed 5 beats', () => {
  const rng = seeded(7);
  let s = C.defaultState();
  for (let i = 0; i < 10; i++) s = C.recordAnswer(s, 'numbers', 1, true);
  for (let i = 0; i < 100; i++) assert.ok(C.makeRound('drumCount', s, rng).target <= 5);
});

test('weak items are picked more often than mastered ones', () => {
  const rng = seeded(3);
  const stats = { 1: { right: 10, tries: 10 }, 2: { right: 0, tries: 10 } };
  let twos = 0;
  for (let i = 0; i < 1000; i++) if (C.pickWeighted([1, 2], stats, rng) === 2) twos++;
  assert.ok(twos > 700, `expected mostly 2s, got ${twos}`);
});

test('stars trigger a reward and claiming awards new friends in order', () => {
  let s = C.defaultState();
  s.settings.starsPerReward = 2;
  let r = C.addStar(s);
  assert.equal(r.rewardReady, false);
  r = C.addStar(r.state);
  assert.equal(r.rewardReady, true);
  const claimed = C.claimReward(r.state);
  assert.equal(claimed.state.stars, 0);
  assert.equal(claimed.friend.name, C.FRIENDS[0].name);
  assert.equal(C.claimReward(claimed.state).friend.name, C.FRIENDS[1].name);
});

test('friends cycle without duplicates once all are collected', () => {
  let s = C.defaultState();
  for (let i = 0; i < C.FRIENDS.length + 3; i++) s = C.claimReward(s).state;
  assert.equal(s.friends.length, C.FRIENDS.length);
});

test('videos rotate and an empty list is handled', () => {
  let s = C.defaultState();
  s.settings.videoIds = [];
  assert.equal(C.takeNextVideo(s).videoId, null);
  s.settings.videoIds = ['aaaaaaaaaaa', 'bbbbbbbbbbb'];
  const a = C.takeNextVideo(s);
  const b = C.takeNextVideo(a.state);
  const c = C.takeNextVideo(b.state);
  assert.deepEqual([a.videoId, b.videoId, c.videoId], ['aaaaaaaaaaa', 'bbbbbbbbbbb', 'aaaaaaaaaaa']);
});

test('PIN must be exactly four digits and match', () => {
  const s = C.defaultState();
  s.settings.pin = '2468';
  assert.equal(C.checkPin(s, '2468'), true);
  assert.equal(C.checkPin(s, '1234'), false);
  assert.equal(C.isValidPin('12a4'), false);
});

test('loadState survives corrupt storage and keeps new defaults', () => {
  const broken = { getItem: () => '{not json' };
  assert.equal(C.loadState(broken).stars, 0);
  const old = { getItem: () => JSON.stringify({ stars: 3, settings: { tvMinutes: 15 } }) };
  const s = C.loadState(old);
  assert.equal(s.stars, 3);
  assert.equal(s.settings.tvMinutes, 15);
  assert.equal(s.settings.starsPerReward, 5);
});

test('every game maps rounds to valid round types', () => {
  assert.equal(C.GAMES.length, 18);
  for (const g of C.GAMES.filter((x) => !['jigsaw', 'penalty', 'tune', 'animals', 'order', 'build', 'pairs', 'hide', 'fire', 'race', 'letters', 'spell', 'planets'].includes(x.id))) for (let i = 0; i < 6; i++) assert.ok(C.ROUND_TYPES.includes(C.roundTypeFor(g.id, i)), g.id);
  assert.deepEqual([0, 1, 2].map((i) => C.roundTypeFor('count', i)), ['countIt', 'drumCount', 'countIt']);
  assert.throws(() => C.roundTypeFor('nope', 0), /Unknown game/);
});

test('prize videos default to the chosen links, including for older saved progress', () => {
  assert.deepEqual(C.defaultState().settings.videoIds, C.DEFAULT_VIDEOS);
  const old = { getItem: () => JSON.stringify({ stars: 2, settings: { videoIds: [] } }) };
  assert.equal(C.loadState(old).settings.videoIds.length, 15);
  const custom = { getItem: () => JSON.stringify({ settings: { videoIds: ['aaaaaaaaaaa'] } }) };
  assert.deepEqual(C.loadState(custom).settings.videoIds, ['aaaaaaaaaaa']);
});

test('jigsaw order is a shuffled permutation, never pre-solved', () => {
  for (let k = 0; k < 50; k++) {
    const o = C.jigsawOrder(10);
    assert.deepEqual(o.slice().sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    assert.ok(!o.every((v, i) => v === i));
  }
  assert.ok(!C.jigsawOrder(10, () => 0.999999).every((v, i) => v === i)); // degenerate rng still unsolved
});

test('placing pieces: only the matching slot, no duplicates, done at ten', () => {
  let placed = [];
  assert.equal(C.placePiece(placed, 3, 4).ok, false);
  for (let i = 0; i < 10; i++) {
    const r = C.placePiece(placed, i, i); assert.ok(r.ok); placed = r.placed;
    assert.equal(C.isJigsawDone(placed), i === 9);
  }
  assert.equal(C.placePiece(placed, 2, 2).ok, false);
  assert.throws(() => C.placePiece([], '1', 1), /integers/);
});

test('puzzles rotate and survive older saves without the field', () => {
  let s = C.loadState({ getItem: () => JSON.stringify({ stars: 1 }) });
  const seen = [];
  for (let i = 0; i < 5; i++) { const r = C.takeNextPuzzle(s); seen.push(r.puzzle); s = r.state; }
  assert.deepEqual(seen, [0, 1, 2, 3, 0]);
});

test('copy my tune: sequences, lengths and checking', () => {
  for (let k = 0; k < 50; k++) {
    const q = C.simonSequence(4);
    assert.equal(q.length, 4); assert.ok(q.every((p) => p >= 0 && p < 4));
    for (let i = 2; i < q.length; i++) assert.ok(!(q[i] === q[i - 1] && q[i] === q[i - 2]));
  }
  assert.deepEqual([0, 1, 2, 3, 4, 9].map((i) => C.simonLength(i)), [2, 2, 3, 3, 4, 4]);
  assert.equal(C.checkSimon([1, 2, 3], [1, 2]), 'continue');
  assert.equal(C.checkSimon([1, 2, 3], [1, 3]), 'wrong');
  assert.equal(C.checkSimon([1, 2, 3], [1, 2, 3]), 'done');
  assert.throws(() => C.simonSequence(0), /positive/);
});

test('goalie never saves the first shot or two in a row', () => {
  assert.notEqual(C.keeperDive(1, { firstShot: true }, () => 0), 1);
  assert.notEqual(C.keeperDive(1, { lastSaved: true }, () => 0), 1);
  assert.equal(C.keeperDive(2, {}, () => 0), 2); // low roll = save
  assert.notEqual(C.keeperDive(2, {}, () => 0.9), 2);
  assert.throws(() => C.keeperDive(5), /shot/);
});

test('prize time defaults to 4 minutes; old 10-minute saves migrate, custom values stay', () => {
  assert.equal(C.defaultState().settings.tvMinutes, 4);
  assert.equal(C.loadState({ getItem: () => JSON.stringify({ settings: { tvMinutes: 10 } }) }).settings.tvMinutes, 4);
  assert.equal(C.loadState({ getItem: () => JSON.stringify({ settings: { tvMinutes: 7 } }) }).settings.tvMinutes, 7);
  assert.equal(C.loadState({ getItem: () => JSON.stringify({ version: 2, settings: { tvMinutes: 10 } }) }).settings.tvMinutes, 10);
});

test('animal rounds: target is among three distinct animals with its sound; stats survive old saves', () => {
  const st = C.loadState({ getItem: () => JSON.stringify({ stats: { numbers: {}, shapes: {} } }) });
  for (let k = 0; k < 30; k++) {
    const r = C.makeRound('animal', st);
    assert.equal(r.options.length, 3); assert.equal(new Set(r.options).size, 3);
    assert.ok(r.options.includes(r.target)); assert.equal(r.sound, C.ANIMALS[r.target]);
  }
  const after = C.recordAnswer(st, 'animals', 'dog', true);
  assert.deepEqual(after.stats.animals.dog, { right: 1, tries: 1 });
});

test('number order: consecutive, shuffled, growing; starts at 1 until mastered', () => {
  const fresh = C.defaultState();
  assert.deepEqual([0, 1, 2, 3, 4].map((i) => C.orderRound(i, fresh).numbers.length), [3, 3, 4, 4, 5]);
  for (let k = 0; k < 30; k++) {
    const r = C.orderRound(4, fresh);
    assert.deepEqual(r.numbers, [1, 2, 3, 4, 5]);
    assert.deepEqual(r.shuffled.slice().sort((a, b) => a - b), r.numbers);
    assert.ok(!r.shuffled.every((v, i) => v === r.numbers[i]));
  }
  const pro = { ...fresh, history: { ...fresh.history, numbers: Array(10).fill(true) } };
  for (let k = 0; k < 30; k++) { const r = C.orderRound(4, pro); assert.ok(r.numbers[0] >= 1 && r.numbers[4] <= 10); }
  assert.equal(C.nextInOrder([3, 4, 5], [3]), 4);
  assert.equal(C.nextInOrder([3, 4, 5], [3, 4, 5]), null);
});

test('each game has its own video, wrapping and skipping on errors', () => {
  const s = C.defaultState();
  s.settings.videoIds = ['v0', 'v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7', 'v8', 'v9'];
  assert.deepEqual(C.GAMES.map((g) => C.videoForGame(s, g.id)), ['v0', 'v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7', 'v8', 'v9', 'v0', 'v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7']); // games 11-18 wrap until more videos are added
  assert.equal(C.videoForGame(s, 'order', 1), 'v0'); // next one along when a video won't play
  s.settings.videoIds = ['a', 'b', 'c'];
  assert.equal(C.videoForGame(s, 'tune'), 'b'); // game 8 of 10 wraps round 3 videos
  s.settings.videoIds = [];
  assert.equal(C.videoForGame(s, 'balloons'), null);
});

test('twelve built-in videos; old default lists upgrade, custom lists are kept', () => {
  assert.equal(C.defaultState().settings.videoIds.length, 15);
  const ten = C.loadState({ getItem: () => JSON.stringify({ version: 3, settings: { videoIds: C.DEFAULT_VIDEOS.slice(0, 10) } }) });
  assert.equal(ten.settings.videoIds.length, 15);
  const twelve = C.loadState({ getItem: () => JSON.stringify({ version: 4, settings: { videoIds: C.DEFAULT_VIDEOS.slice(0, 12) } }) });
  assert.deepEqual(twelve.settings.videoIds, C.DEFAULT_VIDEOS);
  assert.equal(C.videoForGame(twelve, 'race'), 'fdGWRq1dVBA');
  const old = C.loadState({ getItem: () => JSON.stringify({ version: 2, settings: { videoIds: C.DEFAULT_VIDEOS.slice(0, 5) } }) });
  assert.deepEqual(old.settings.videoIds, C.DEFAULT_VIDEOS);
  const mine = C.loadState({ getItem: () => JSON.stringify({ version: 2, settings: { videoIds: ['aaaaaaaaaaa'] } }) });
  assert.deepEqual(mine.settings.videoIds, ['aaaaaaaaaaa']);
  assert.equal(C.loadState({ getItem: () => JSON.stringify(old) }).settings.videoIds.length, 15);
});

test('shape builder: every layer is one known shape and colour; options hold exactly one right answer', () => {
  for (const b of C.BUILDS) for (const l of b.layers) {
    assert.ok(C.BUILD_SHAPES.includes(l.shape) && C.COLOURS[l.colour], `${b.name}: ${l.shape} ${l.colour}`);
    for (let k = 0; k < 20; k++) {
      const o = C.buildOptions(l);
      assert.equal(o.length, 3);
      assert.equal(o.filter((x) => x.shape === l.shape && x.colour === l.colour).length, 1);
      assert.equal(new Set(o.map((x) => x.shape + x.colour)).size, 3);
    }
  }
});

test('memory pairs: each item exactly twice, matching only true pairs', () => {
  const d = C.memoryDeck(4, ['a', 'b', 'c', 'd', 'e']);
  assert.equal(d.length, 8);
  for (const x of new Set(d)) assert.equal(d.filter((y) => y === x).length, 2);
  const i = d.indexOf(d[0], 1);
  assert.ok(C.isPair(d, 0, i)); assert.ok(!C.isPair(d, 0, 0));
  assert.throws(() => C.memoryDeck(9, ['a']), /pairs/);
});

test('hide and seek: a known hider and spot each round, never repeating, and harder as rounds go on', () => {
  let prev = null;
  for (let r = 0; r < 40; r++) {
    const h = C.hideRound(r, prev);
    assert.ok(C.HIDERS.includes(h.hider) && C.HIDE_SPOTS.includes(h.spot));
    if (prev) { assert.notEqual(h.hider, prev.hider); assert.notEqual(h.spot, prev.spot); }
    prev = h;
  }
  assert.ok(C.hideRound(0).peek > C.hideRound(4).peek);
  assert.equal(C.hideRound(99).peek, C.HIDE_PEEK[C.HIDE_PEEK.length - 1]);
});

test('fire rescue: fires only appear in free windows, and rounds grow', () => {
  const active = [{ col: 0, floor: 0 }, { col: 2, floor: 1 }];
  for (let k = 0; k < 50; k++) {
    const f = C.nextFire(active, { col: 4, floor: 0 });
    assert.ok(f.col >= 0 && f.col < C.FIRE_COLS && f.floor >= 0 && f.floor < C.FIRE_FLOORS);
    assert.ok(!active.some((a) => a.col === f.col && a.floor === f.floor));
    assert.ok(!(f.col === 4 && f.floor === 0));
  }
  const all = []; for (let c = 0; c < C.FIRE_COLS; c++) for (let f = 0; f < C.FIRE_FLOORS; f++) all.push({ col: c, floor: f });
  assert.equal(C.nextFire(all), null);
  assert.ok(C.fireRoundPlan(4).total > C.fireRoundPlan(0).total);
  assert.deepEqual(C.fireRoundPlan(99), C.FIRE_ROUNDS[C.FIRE_ROUNDS.length - 1]);
});

test('race day: cones sit between start and finish, well spaced, and races get busier', () => {
  for (let r = 0; r < 5; r++) for (let k = 0; k < 30; k++) {
    const plan = C.raceRoundPlan(r), cones = C.raceObstacles(plan.cones);
    assert.equal(cones.length, plan.cones);
    assert.ok(cones[0] >= 800 && cones[cones.length - 1] <= C.RACE_LENGTH - 350);
    for (let i = 1; i < cones.length; i++) assert.ok(cones[i] - cones[i - 1] >= 750);
  }
  assert.ok(C.raceRoundPlan(4).cones > C.raceRoundPlan(0).cones);
});

test('levels: Middle and Big change the number games, and everything else gets harder', () => {
  const at = (level) => ({ ...C.defaultState(level), stats: C.defaultState().stats });
  for (let k = 0; k < 200; k++) {
    const mid = C.makeRound('goal', at(2));
    assert.equal(mid.ask, 'plus'); assert.equal(mid.a + mid.b, mid.target); assert.ok(mid.target <= 20);
    assert.ok(mid.options.includes(mid.target) && new Set(mid.options).size === 3 && mid.options.every((x) => x >= 1));
    const big = C.makeRound('findNumber', at(3));
    assert.equal(big.ask, 'times'); assert.equal(big.a * big.b, big.target);
    assert.equal(big.options.length, 4); assert.equal(new Set(big.options).size, 4); assert.ok(big.options.includes(big.target));
    const take = C.makeRound('goal', at(3));
    assert.equal(take.ask, 'minus'); assert.equal(take.a - take.b, take.target); assert.ok(take.target >= 1);
    const find = C.makeRound('findNumber', at(2));
    assert.ok(!find.ask && find.target >= 1 && find.target <= 20);
    const count = C.makeRound('countIt', at(3));
    assert.ok(count.target >= 6 && count.target <= 20);
    const ord = C.orderRound(4, at(3));
    assert.deepEqual(ord.numbers, [...ord.numbers].sort((a, b) => a - b)); assert.ok(ord.numbers.every((n) => n >= 1 && n <= 100));
    assert.equal(new Set(ord.numbers).size, ord.numbers.length);
  }
  assert.equal(C.makeRound('findNumber', at(1)).ask, undefined); // Little is unchanged
  assert.ok(C.simonLength(4, 3) > C.simonLength(4, 1));
  assert.ok(C.pairsSize(4, 3) > C.pairsSize(4, 1));
  assert.ok(C.hideRound(4, null, Math.random, 3).peek < C.hideRound(4).peek);
  assert.equal(C.hideRound(0, null, Math.random, 3).clue, false);
  for (const level of [1, 2, 3]) for (let r = 0; r < 5; r++) {
    const plan = C.raceRoundPlan(r, level), cones = C.raceObstacles(plan.cones, plan.length, Math.random, plan.gap);
    assert.equal(cones.length, plan.cones); assert.ok(cones[cones.length - 1] <= plan.length - 350);
  }
  assert.equal(C.clampLevel('9'), 1); assert.equal(C.defaultState(3).settings.level, 3);
  assert.equal(C.loadState({ getItem: () => JSON.stringify({ version: 5, settings: {} }) }, 'x', 3).settings.level, 3); // new setting takes the child's default
});

test('kids: each web address opens the right child, with birthdays only on the day', () => {
  const K = require('../kids.js');
  assert.equal(K.pickKid('play.leostudi.app'), 'leo');
  assert.equal(K.pickKid('charlie-play-learn.vercel.app'), 'charlie');
  assert.equal(K.pickKid('localhost', '?kid=seraphina'), 'seraphina');
  assert.equal(K.pickKid('something-else.example'), 'leo');
  assert.equal(K.kid('leo').storageKey, 'leo.v1'); // Leo keeps his saved progress
  assert.equal(K.birthdayAge(K.kid('leo'), new Date(2026, 10, 25)), 4);
  assert.equal(K.birthdayAge(K.kid('leo'), new Date(2026, 10, 26)), null);
  assert.equal(K.birthdayAge(K.kid('arthur'), new Date(2026, 10, 25)), null);
  assert.equal(K.ordinal(1), '1st'); assert.equal(K.ordinal(12), '12th'); assert.equal(K.ordinal(22), '22nd');
  assert.equal(K.kid('charlie').level, 3);
});

test('reward wheel: slices, no repeats, dress up and world progress', () => {
  assert.deepEqual(C.wheelSlices().map((t) => t.id), ['celebrate', 'toybox', 'dressup', 'dance', 'world']);
  const all = C.wheelSlices({ hasClips: true, hasVideo: true });
  assert.equal(all.length, 7);
  for (let k = 0; k < 100; k++) assert.notEqual(all[C.pickTreat(all, 'dance')].id, 'dance');
  const owned = []; let item;
  while ((item = C.nextWardrobeItem(owned))) owned.push(item.id);
  assert.equal(owned.length, C.WARDROBE.length);
  let wear = { hat: null, face: null };
  wear = C.toggleWear(wear, 'crown'); wear = C.toggleWear(wear, 'shades'); wear = C.toggleWear(wear, 'cap');
  assert.deepEqual(wear, { hat: 'cap', face: 'shades' });
  assert.deepEqual(C.toggleWear(wear, 'cap'), { hat: null, face: 'shades' });
  assert.deepEqual(C.worldProgress(0), { zone: 0, placed: 0, zonesDone: 0, worlds: 0, score: 0 });
  assert.equal(C.worldProgress(7).zone, 1); assert.equal(C.worldProgress(7).placed, 1); assert.equal(C.worldProgress(7).score, 120);
  assert.equal(C.worldProgress(C.WORLD_SIZE).worlds, 1); assert.equal(C.worldProgress(C.WORLD_SIZE).zone, 0);
  assert.equal(C.defaultState().world, 0); assert.deepEqual(C.defaultState().wear, { hat: null, face: null });
});

test('letter games: first letter at Little/Middle, a missing inside letter at Big', () => {
  const rng = seeded(7);
  for (let i = 0; i < 60; i++) {
    for (const level of [1, 2]) {
      const r = C.makeRound('letterStart', C.defaultState(level), rng);
      assert.equal(r.ask, 'first');
      assert.equal(r.target, r.word[0].toUpperCase());
      assert.equal(new Set(r.options).size, r.options.length);
      assert.ok(r.options.includes(r.target));
      assert.ok(C.LETTER_WORDS.includes(r.word));
    }
    const b = C.makeRound('letterStart', C.defaultState(3), rng);
    assert.equal(b.ask, 'missing');
    assert.ok(b.gap > 0 && b.gap < b.word.length - 1);
    assert.equal(b.target, b.word[b.gap].toUpperCase());
    assert.equal(b.options.length, 4);
    assert.equal(new Set(b.options).size, 4);
    assert.ok(b.options.includes(b.target));
  }
});

test('Spell It: tray holds the word letters (plus decoys above Little), never already spelt', () => {
  const rng = seeded(3);
  for (const level of [1, 2, 3]) {
    let prev = null;
    for (let i = 0; i < 40; i++) {
      const r = C.spellRound(level, rng, prev);
      assert.notEqual(r.word, prev); prev = r.word;
      assert.ok(C.SPELL_WORDS[level].includes(r.word));
      assert.equal(r.tray.length, r.word.length + [0, 0, 1, 2][level]);
      assert.notEqual(r.tray.join(''), r.word.toUpperCase());
      const left = r.tray.slice();
      for (const ch of r.word.toUpperCase()) { const k = left.indexOf(ch); assert.ok(k >= 0); left.splice(k, 1); }
      assert.equal(r.guide, level === 1);
    }
  }
  assert.equal(C.nextSpellLetter('cat', 0), 'C');
  assert.equal(C.nextSpellLetter('cat', 2), 'T');
  assert.equal(C.nextSpellLetter('cat', 3), null);
});

test('Space Trip: answers are in the options, Big asks only about planets, facts are right', () => {
  const rng = seeded(11);
  assert.deepEqual(C.PLANETS, ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune']);
  for (const level of [1, 2, 3]) {
    let prev = null;
    for (let i = 0; i < 50; i++) {
      const r = C.planetRound(level, rng, prev);
      assert.notEqual(r.q, prev); prev = r.q;
      assert.ok(r.options.includes(r.target));
      assert.equal(new Set(r.options).size, r.options.length);
      if (level === 3) assert.ok(r.options.every((o) => C.PLANETS.includes(o)));
      if (level === 1) assert.ok(r.options.every((o) => ['sun', 'moon', 'earth', 'mars', 'jupiter', 'saturn'].includes(o)));
      assert.equal(r.labels, level > 1);
    }
  }
  const third = C.SPACE_QUIZ[3].find((x) => x.q === 'Which planet is third from the Sun?');
  assert.equal(third.a, 'earth');
  assert.equal(C.SPACE_QUIZ[3].find((x) => x.q.includes('hottest')).a, 'venus');
});

test('18 games, new ones at the end so prize videos keep their games', () => {
  assert.equal(C.GAMES.length, 18);
  assert.deepEqual(C.GAMES.slice(-3).map((g) => g.id), ['letters', 'spell', 'planets']);
  assert.equal(C.GAMES[14].id, 'race');
});

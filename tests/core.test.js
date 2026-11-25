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

test('eight games, each mapping rounds to valid round types', () => {
  assert.equal(C.GAMES.length, 10);
  for (const g of C.GAMES.filter((x) => !['jigsaw', 'penalty', 'tune', 'animals', 'order'].includes(x.id))) for (let i = 0; i < 6; i++) assert.ok(C.ROUND_TYPES.includes(C.roundTypeFor(g.id, i)), g.id);
  assert.deepEqual([0, 1, 2].map((i) => C.roundTypeFor('count', i)), ['countIt', 'drumCount', 'countIt']);
  assert.throws(() => C.roundTypeFor('nope', 0), /Unknown game/);
});

test('prize videos default to the five chosen links, including for older saved progress', () => {
  assert.deepEqual(C.defaultState().settings.videoIds, C.DEFAULT_VIDEOS);
  const old = { getItem: () => JSON.stringify({ stars: 2, settings: { videoIds: [] } }) };
  assert.equal(C.loadState(old).settings.videoIds.length, 5);
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
  assert.deepEqual([0, 1, 2, 3, 4, 9].map(C.simonLength), [2, 2, 3, 3, 4, 4]);
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
  assert.deepEqual(C.GAMES.map((g) => C.videoForGame(s, g.id)), ['v0', 'v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7', 'v8', 'v9']);
  assert.equal(C.videoForGame(s, 'order', 1), 'v0'); // next one along when a video won't play
  s.settings.videoIds = ['a', 'b', 'c'];
  assert.equal(C.videoForGame(s, 'tune'), 'b'); // game 8 of 10 wraps round 3 videos
  s.settings.videoIds = [];
  assert.equal(C.videoForGame(s, 'balloons'), null);
});

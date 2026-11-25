/* LEO core logic — pure functions, no DOM. Shared by index.html and the Node tests. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api; // Node (tests)
  else {
    root.LeoCore = api; // Browser
    // Elements with the hidden attribute must really disappear: CSS display rules were overriding it,
    // leaving an invisible layer over the video that swallowed taps on phones.
    if (typeof document !== 'undefined' && document.head) {
      const fix = document.createElement('style');
      fix.textContent = '[hidden]{display:none!important}';
      document.head.appendChild(fix);
    }
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const STORAGE_KEY = 'leo.v1';
  const HISTORY_LEN = 10; // rolling window used to judge mastery
  const MASTERY = 0.8; // 80% first-try accuracy unlocks the next level

  const BASIC_SHAPES = ['circle', 'square', 'triangle', 'star'];
  const EXTRA_SHAPES = ['heart', 'rectangle', 'diamond', 'oval'];
  const ROUND_TYPES = ['findNumber', 'countIt', 'findShape', 'shapeFit', 'drumCount', 'goal'];

  // The games on the menu; each cycles through its round types.
  const GAMES = [
    { id: 'balloons', name: 'Number Balloons', types: ['findNumber'] },
    { id: 'goal', name: 'Score a Goal', types: ['goal'] },
    { id: 'count', name: 'Count & Drum', types: ['countIt', 'drumCount'] },
    { id: 'shapes', name: 'Shape Hunt', types: ['findShape'] },
    { id: 'puzzle', name: 'Shape Puzzle', types: ['shapeFit'] },
    { id: 'jigsaw', name: 'Jigsaw', types: ['jigsaw'] }, // one 10-piece picture per game
    { id: 'penalty', name: 'Penalty Shootout', types: ['penalty'] }, // just for fun
    { id: 'tune', name: 'Copy My Tune', types: ['simon'] }, // memory + music
    { id: 'animals', name: 'Animal Sounds', types: ['animal'] },
    { id: 'order', name: 'Number Order', types: ['order'] }
  ];

  // LEO makes each noise himself; art for every animal lives in index.html.
  const ANIMALS = {
    dog: 'Woof! Woof!', cat: 'Meow!', pig: 'Oink! Oink!', cow: 'Moooo!',
    sheep: 'Baa! Baa!', duck: 'Quack! Quack!', frog: 'Ribbit! Ribbit!', lion: 'Roar!'
  };
  const ORDER_LENGTHS = [3, 3, 4, 4, 5];

  const SIMON_PADS = 4;
  const SIMON_LENGTHS = [2, 2, 3, 3, 4]; // grows gently across a game

  const JIGSAW_COLS = 5;
  const JIGSAW_ROWS = 2;
  const JIGSAW_PIECES = JIGSAW_COLS * JIGSAW_ROWS;
  // Original pictures drawn in index.html (symbols #pic0..#pic3).
  const PUZZLES = [
    { name: 'Leo playing football', done: 'Leo is playing football!' },
    { name: 'a birthday party', done: "It's a birthday party!" },
    { name: 'the bottom of the sea', done: "It's under the sea!" },
    { name: 'a rocket in space', done: "It's a rocket in space!" }
  ];

  // Prize videos chosen by Leo's dad; editable in the grown-ups area.
  // Video N plays after game N (Number Balloons first ... Number Order tenth).
  const DEFAULT_VIDEOS = ['nEUTY8n2iZo', 'XcTvDcJt058', 'uaEcjl_jO9w', 'S-lkBBl-KG4', 'oVL8CvA5NIs',
    'uFs-T_iq6lc', '64FUWQMZakY', 'd3XW_lvBRVw', 'PfpLAqAtjnI', 'EW6cIIRayXc'];
  const OLD_DEFAULT_VIDEOS = DEFAULT_VIDEOS.slice(0, 5); // the first list; devices still on it get all ten

  // Original collectable friends (no third-party characters).
  const FRIENDS = [
    { name: 'Zuzu', colour: '#ff7eb6', ears: 'round' },
    { name: 'Pom', colour: '#ffb84d', ears: 'pointy' },
    { name: 'Wiggle', colour: '#7ad66b', ears: 'antenna' },
    { name: 'Bop', colour: '#5fb8ff', ears: 'round' },
    { name: 'Tiko', colour: '#b48cff', ears: 'pointy' },
    { name: 'Mimo', colour: '#ff6b6b', ears: 'antenna' },
    { name: 'Fizz', colour: '#3fd4c4', ears: 'round' },
    { name: 'Nubs', colour: '#f2d24b', ears: 'pointy' },
    { name: 'Loopy', colour: '#ff9a62', ears: 'antenna' },
    { name: 'Bimble', colour: '#8fa8ff', ears: 'round' },
    { name: 'Squish', colour: '#e57ee0', ears: 'pointy' },
    { name: 'Tumble', colour: '#9be15d', ears: 'antenna' }
  ];

  function defaultState() {
    return {
      version: 3,
      settings: { starsPerReward: 5, tvMinutes: 4, videoIds: DEFAULT_VIDEOS.slice(), pin: null },
      stars: 0,
      rewardsEarned: 0,
      friends: [], // indexes into FRIENDS
      nextVideo: 0,
      nextPuzzle: 0,
      stats: { numbers: {}, shapes: {}, animals: {} }, // item -> { right, tries }
      history: { numbers: [], shapes: [], animals: [] } // rolling first-try results (true/false)
    };
  }

  /** Merge stored data over defaults so new fields survive upgrades. */
  function normaliseState(raw) {
    const base = defaultState();
    if (!raw || typeof raw !== 'object') return base;
    const settings = { ...base.settings, ...(raw.settings || {}) };
    if (!Array.isArray(settings.videoIds) || settings.videoIds.length === 0) settings.videoIds = DEFAULT_VIDEOS.slice();
    // v2: 8 games x (play + 4 min prize) is about an hour. Move the old 10-minute default to 4.
    if ((raw.version || 1) < 2 && settings.tvMinutes === 10) settings.tvMinutes = 4;
    // v3: ten built-in videos. Only replace a list nobody has customised (exactly the old five).
    if ((raw.version || 1) < 3 && settings.videoIds.join() === OLD_DEFAULT_VIDEOS.join()) settings.videoIds = DEFAULT_VIDEOS.slice();
    return {
      ...base,
      ...raw,
      version: base.version,
      settings,
      stats: { ...base.stats, ...(raw.stats || {}) },
      history: { ...base.history, ...(raw.history || {}) }
    };
  }

  function loadState(storage) {
    try {
      const text = storage && storage.getItem(STORAGE_KEY);
      return normaliseState(text ? JSON.parse(text) : null);
    } catch (err) {
      // Corrupt or blocked storage: start fresh rather than crash the child's game.
      if (typeof console !== 'undefined') console.warn('[LEO] could not load progress', err);
      return defaultState();
    }
  }

  function saveState(storage, state) {
    try {
      if (storage) storage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (err) {
      if (typeof console !== 'undefined') console.warn('[LEO] could not save progress', err);
      return false;
    }
  }

  /** Accepts watch, youtu.be, shorts, embed and youtube-kids links, or a bare 11-char id. */
  function extractYouTubeId(input) {
    if (typeof input !== 'string') return null;
    const s = input.trim();
    if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
    const m = s.match(/(?:[?&]v=|youtu\.be\/|\/shorts\/|\/embed\/|\/live\/)([A-Za-z0-9_-]{11})/);
    return m ? m[1] : null;
  }

  function parseVideoList(text) {
    if (typeof text !== 'string') return [];
    const ids = text.split(/[\s,]+/).map(extractYouTubeId).filter(Boolean);
    return [...new Set(ids)];
  }

  function clampInt(value, min, max, fallback) {
    const n = Number.parseInt(value, 10);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  function accuracy(list) {
    if (!list || list.length === 0) return 0;
    return list.filter(Boolean).length / list.length;
  }

  function isMastered(state, skill) {
    const h = state.history[skill] || [];
    return h.length >= HISTORY_LEN && accuracy(h) >= MASTERY;
  }

  function numberMax(state) {
    return isMastered(state, 'numbers') ? 10 : 5;
  }

  function shapePool(state) {
    return isMastered(state, 'shapes') ? BASIC_SHAPES.concat(EXTRA_SHAPES) : BASIC_SHAPES.slice();
  }

  /** Returns a new state; firstTry decides mastery, any answer is still praised in the UI. */
  function recordAnswer(state, skill, item, firstTry) {
    if (!state.stats[skill]) throw new Error(`Unknown skill: ${skill}`);
    const key = String(item);
    const prev = state.stats[skill][key] || { right: 0, tries: 0 };
    const history = (state.history[skill] || []).concat(Boolean(firstTry)).slice(-HISTORY_LEN);
    return {
      ...state,
      stats: { ...state.stats, [skill]: { ...state.stats[skill], [key]: { right: prev.right + (firstTry ? 1 : 0), tries: prev.tries + 1 } } },
      history: { ...state.history, [skill]: history }
    };
  }

  /** Weak or unseen items are picked more often. */
  function pickWeighted(items, stats, rng) {
    const weights = items.map((it) => {
      const s = stats[String(it)];
      if (!s || s.tries === 0) return 3;
      return 1 + 3 * (1 - s.right / s.tries);
    });
    const total = weights.reduce((a, b) => a + b, 0);
    let r = rng() * total;
    for (let i = 0; i < items.length; i++) {
      r -= weights[i];
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  }

  function shuffle(list, rng) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /** Target plus distinct distractors from the pool, shuffled. */
  function makeOptions(target, pool, count, rng) {
    const others = shuffle(pool.filter((x) => x !== target), rng).slice(0, count - 1);
    return shuffle([target, ...others], rng);
  }

  function range(a, b) {
    return Array.from({ length: b - a + 1 }, (_, i) => a + i);
  }

  function makeRound(type, state, rng = Math.random) {
    const nums = range(1, numberMax(state));
    switch (type) {
      case 'findNumber':
      case 'goal': {
        const target = pickWeighted(nums, state.stats.numbers, rng);
        return { type, skill: 'numbers', target, options: makeOptions(target, nums, 3, rng) };
      }
      case 'countIt': {
        const target = pickWeighted(nums, state.stats.numbers, rng);
        return { type, skill: 'numbers', target, options: makeOptions(target, nums, 3, rng), thing: shuffle(['ball', 'apple', 'star', 'note'], rng)[0] };
      }
      case 'drumCount': {
        const small = range(1, Math.min(5, numberMax(state))); // beats get hard to count past 5
        const target = pickWeighted(small, state.stats.numbers, rng);
        return { type, skill: 'numbers', target, options: makeOptions(target, small, 3, rng) };
      }
      case 'findShape':
      case 'shapeFit': {
        const pool = shapePool(state);
        const target = pickWeighted(pool, state.stats.shapes, rng);
        return { type, skill: 'shapes', target, options: makeOptions(target, pool, 3, rng) };
      }
      case 'animal': {
        const pool = Object.keys(ANIMALS);
        const target = pickWeighted(pool, state.stats.animals || {}, rng);
        return { type, skill: 'animals', target, sound: ANIMALS[target], options: makeOptions(target, pool, 3, rng) };
      }
      default:
        throw new Error(`Unknown round type: ${type}`);
    }
  }

  /** Round type for a given game and round number (0-based). */
  function roundTypeFor(gameId, roundIndex) {
    const game = GAMES.find((g) => g.id === gameId);
    if (!game) throw new Error(`Unknown game: ${gameId}`);
    return game.types[roundIndex % game.types.length];
  }

  /** Rotates through activities so the same game never repeats back to back. */
  function nextRoundType(previous, rng = Math.random) {
    const choices = ROUND_TYPES.filter((t) => t !== previous);
    return choices[Math.floor(rng() * choices.length)];
  }

  /** Tray order for a new jigsaw: shuffled, never already in solved order. */
  function jigsawOrder(n = JIGSAW_PIECES, rng = Math.random) {
    const solved = range(0, n - 1);
    if (n < 2) return solved;
    let order = shuffle(solved, rng);
    for (let i = 0; i < 5 && order.every((v, k) => v === k); i++) order = shuffle(solved, rng);
    if (order.every((v, k) => v === k)) order = solved.slice(1).concat(0); // rotate as a last resort
    return order;
  }

  /** Pure placement check: a piece belongs in the slot with the same index. */
  function placePiece(placed, piece, slot) {
    if (!Number.isInteger(piece) || !Number.isInteger(slot)) throw new Error('piece and slot must be integers');
    if (placed.includes(piece) || piece !== slot) return { ok: false, placed };
    return { ok: true, placed: placed.concat(piece) };
  }

  function isJigsawDone(placed, n = JIGSAW_PIECES) {
    return new Set(placed).size >= n;
  }

  /** Picture to use next, advancing so the puzzles rotate. */
  function takeNextPuzzle(state) {
    const i = (Number.isInteger(state.nextPuzzle) ? state.nextPuzzle : 0) % PUZZLES.length;
    return { state: { ...state, nextPuzzle: (i + 1) % PUZZLES.length }, puzzle: i };
  }

  /** Random tune of pad indexes; never the same pad three times running. */
  function simonSequence(len, pads = SIMON_PADS, rng = Math.random) {
    if (!Number.isInteger(len) || len < 1) throw new Error('len must be a positive integer');
    const seq = [];
    while (seq.length < len) {
      const p = Math.floor(rng() * pads);
      if (seq.length >= 2 && seq[seq.length - 1] === p && seq[seq.length - 2] === p) continue;
      seq.push(p);
    }
    return seq;
  }

  function simonLength(roundIndex) {
    return SIMON_LENGTHS[Math.min(Math.max(roundIndex, 0), SIMON_LENGTHS.length - 1)];
  }

  /** 'wrong' as soon as an input differs, 'done' when the whole tune matches, else 'continue'. */
  function checkSimon(seq, inputs) {
    for (let i = 0; i < inputs.length; i++) if (inputs[i] !== seq[i]) return 'wrong';
    return inputs.length >= seq.length ? 'done' : 'continue';
  }

  /**
   * Where the goalie dives (0 left, 1 middle, 2 right). Saves are rare so it stays fun:
   * never on the first shot, never twice in a row, otherwise about one in four.
   */
  function keeperDive(shot, { firstShot = false, lastSaved = false } = {}, rng = Math.random) {
    if (![0, 1, 2].includes(shot)) throw new Error('shot must be 0, 1 or 2');
    const save = !firstShot && !lastSaved && rng() < 0.25;
    if (save) return shot;
    const others = [0, 1, 2].filter((x) => x !== shot);
    return others[Math.floor(rng() * others.length) % others.length];
  }

  /**
   * Number Order round: consecutive numbers to put smallest-first, shown shuffled.
   * Starts at 1 until numbers are mastered, then can start anywhere up to 10.
   */
  function orderRound(roundIndex, state, rng = Math.random) {
    const len = ORDER_LENGTHS[Math.min(Math.max(roundIndex, 0), ORDER_LENGTHS.length - 1)];
    const top = numberMax(state);
    const start = top > 5 ? 1 + Math.floor(rng() * (top - len + 1)) : 1;
    const numbers = range(start, start + len - 1);
    let shuffled = shuffle(numbers, rng);
    if (shuffled.every((v, i) => v === numbers[i])) shuffled = numbers.slice(1).concat(numbers[0]);
    return { numbers, shuffled };
  }

  /** The number that should be tapped next, or null when the row is complete. */
  function nextInOrder(numbers, placed) {
    return placed.length < numbers.length ? numbers[placed.length] : null;
  }

  function addStar(state) {
    const stars = state.stars + 1;
    return { state: { ...state, stars }, rewardReady: stars >= state.settings.starsPerReward };
  }

  /** Spends the stars, awards a new friend (cycling once all are collected) and returns it. */
  function claimReward(state) {
    const owned = new Set(state.friends);
    const missing = FRIENDS.map((_, i) => i).filter((i) => !owned.has(i));
    const friendIndex = missing.length ? missing[0] : state.rewardsEarned % FRIENDS.length;
    const friends = owned.has(friendIndex) ? state.friends : state.friends.concat(friendIndex);
    return {
      state: { ...state, stars: 0, rewardsEarned: state.rewardsEarned + 1, friends },
      friend: FRIENDS[friendIndex]
    };
  }

  /** Next approved video id, advancing the pointer so episodes rotate. */
  function takeNextVideo(state) {
    const ids = state.settings.videoIds;
    if (!ids.length) return { state, videoId: null };
    const i = state.nextVideo % ids.length;
    return { state: { ...state, nextVideo: (i + 1) % ids.length }, videoId: ids[i] };
  }

  /**
   * Each game has its own prize video: the Nth video in the grown-ups list goes with the Nth game
   * (wrapping round if there are fewer videos than games). `attempt` moves on to the next video
   * when one refuses to play. Returns null when no videos are set.
   */
  function videoForGame(state, gameId, attempt = 0) {
    const ids = state.settings.videoIds;
    if (!ids.length) return null;
    const g = GAMES.findIndex((x) => x.id === gameId);
    const i = ((g < 0 ? 0 : g) + attempt) % ids.length;
    return ids[i];
  }

  /** Splits what LEO says into sentences; each sentence has its own recorded voice clip. */
  function speechParts(text) {
    return String(text || '').split(/(?<=[.!?])\s+/).map((t) => t.trim()).filter(Boolean);
  }

  /** Stable file name for a sentence's clip: readable slug plus a short hash to keep it unique. */
  function clipKey(sentence) {
    const t = String(sentence).trim();
    let h = 5381;
    for (let i = 0; i < t.length; i++) h = ((h * 33) ^ t.charCodeAt(i)) >>> 0;
    const slug = t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'x';
    return `${slug}-${h.toString(36)}`;
  }

  function isValidPin(pin) {
    return typeof pin === 'string' && /^\d{4}$/.test(pin);
  }

  function checkPin(state, pin) {
    return isValidPin(pin) && state.settings.pin === pin;
  }

  return {
    STORAGE_KEY, FRIENDS, BASIC_SHAPES, EXTRA_SHAPES, ROUND_TYPES, GAMES, DEFAULT_VIDEOS, roundTypeFor,
    defaultState, normaliseState, loadState, saveState,
    extractYouTubeId, parseVideoList, clampInt, accuracy, isMastered, numberMax, shapePool,
    recordAnswer, pickWeighted, makeOptions, makeRound, nextRoundType,
    JIGSAW_COLS, JIGSAW_ROWS, JIGSAW_PIECES, PUZZLES, jigsawOrder, placePiece, isJigsawDone, takeNextPuzzle,
    ANIMALS, orderRound, nextInOrder,
    SIMON_PADS, simonSequence, simonLength, checkSimon, keeperDive,
    speechParts, clipKey, ORDER_LENGTHS,
    addStar, claimReward, takeNextVideo, videoForGame, isValidPin, checkPin
  };
});

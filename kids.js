/* Each child's own version of the app: name, host character, birthday and starting level.
   One app serves them all; which child is chosen by the web address it's opened from.
   To add a child: add an entry here (and a Vercel domain + TV app), then push — their voice lines are recorded automatically. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api; // Node (tests, voice recording)
  else root.LeoKids = api; // Browser
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // host: lion | dino | princess | penguin. level: 1 Little (3-5), 2 Middle (5-7), 3 Big (7-9).
  // born: 'YYYY-MM-DD' shows a birthday party on that day each year (null for none).
  // storageKey keeps each child's progress separate (and keeps progress saved before this change).
  const KIDS = {
    leo: { name: 'Leo', host: 'lion', born: '2022-11-25', level: 1, pronoun: 'he', storageKey: 'leo.v1', tvApk: 'latest/leo-tv.apk',
      domains: ['play.leostudi.app', 'leo-play-learn.vercel.app', 'leostudi.app'] },
    arthur: { name: 'Arthur', host: 'dino', born: null, level: 1, pronoun: 'he', storageKey: 'arthur.v1', tvApk: 'arthur-latest/arthur-tv.apk',
      domains: ['arthur-play-learn.vercel.app'] },
    oliver: { name: 'Oliver', host: 'dino', born: null, level: 1, pronoun: 'he', storageKey: 'oliver.v1', tvApk: 'oliver-latest/oliver-tv.apk',
      domains: ['oliver-play-learn.vercel.app'] },
    seraphina: { name: 'Seraphina', host: 'princess', born: null, level: 1, pronoun: 'she', storageKey: 'seraphina.v1', tvApk: 'seraphina-latest/seraphina-tv.apk',
      domains: ['seraphina-play-learn.vercel.app'] },
    charlie: { name: 'Charlie', host: 'penguin', born: null, level: 3, pronoun: 'he', storageKey: 'charlie.v1', tvApk: 'charlie-latest/charlie-tv.apk',
      domains: ['charlie-play-learn.vercel.app'] }
  };
  const DEFAULT_KID = 'leo';
  const LEVELS = [
    { id: 1, name: 'Little', ages: '3–5' },
    { id: 2, name: 'Middle', ages: '5–7' },
    { id: 3, name: 'Big', ages: '7–9' }
  ];

  /** Which child this copy is for: ?kid=slug wins (for testing), then the web address, then Leo. */
  function pickKid(hostname = '', search = '') {
    const q = /[?&]kid=([a-z0-9-]+)/i.exec(search || '');
    if (q && KIDS[q[1].toLowerCase()]) return q[1].toLowerCase();
    const host = String(hostname || '').toLowerCase();
    for (const [slug, k] of Object.entries(KIDS)) if (k.domains.includes(host)) return slug;
    const prefix = host.split('.')[0].replace(/-play-learn$/, '').replace(/-.*$/, '');
    return KIDS[prefix] ? prefix : DEFAULT_KID;
  }

  function kid(slug) {
    const k = KIDS[slug] || KIDS[DEFAULT_KID];
    return { slug: KIDS[slug] ? slug : DEFAULT_KID, ...k, NAME: k.name.toUpperCase() };
  }

  /** Age they turn on this year's birthday, or null when today isn't their birthday. */
  function birthdayAge(k, d = new Date()) {
    if (!k.born) return null;
    const [y, m, day] = k.born.split('-').map(Number);
    if (d.getMonth() + 1 !== m || d.getDate() !== day) return null;
    const age = d.getFullYear() - y;
    return age > 0 ? age : null;
  }

  function ordinal(n) {
    const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  return { KIDS, DEFAULT_KID, LEVELS, pickKid, kid, birthdayAge, ordinal };
});

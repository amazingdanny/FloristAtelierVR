// Shared game data + scoring. Imported by the server (Node) and by both clients (browser).

export const TAGS = {
  love:       { label: 'Love',        color: '#e8738a' },
  sorry:      { label: 'Forgiveness', color: '#c9c3d6' },
  joy:        { label: 'Joy',         color: '#f2c14e' },
  calm:       { label: 'Calm',        color: '#a99be0' },
  friendship: { label: 'Friendship',  color: '#f5a76c' },
  memory:     { label: 'Remembrance', color: '#7fb3e8' },
  magic:      { label: 'Magic',       color: '#8fe3d6' },
};

// Base flowers that always grow in the florist's buckets.
// adj = word used when this flower is the *second* parent of a hybrid.
export const FLOWERS = {
  rose:        { name: 'Red Rose',      tag: 'love',       petal: '#e8606e', center: '#b8384c', adj: 'Rosy',     noun: 'Rose' },
  tulip:       { name: 'White Tulip',   tag: 'sorry',      petal: '#f7f2ea', center: '#e9dcc4', adj: 'Pearly',   noun: 'Tulip' },
  sunflower:   { name: 'Sunflower',     tag: 'joy',        petal: '#f7c948', center: '#7a4a2a', adj: 'Sunny',    noun: 'Sunbloom' },
  lavender:    { name: 'Lavender',      tag: 'calm',       petal: '#a58fd6', center: '#8a74c4', adj: 'Dreamy',   noun: 'Lavender' },
  daisy:       { name: 'Daisy',         tag: 'friendship', petal: '#fffdf7', center: '#f4c542', adj: 'Merry',    noun: 'Daisy' },
  forgetmenot: { name: 'Forget-me-not', tag: 'memory',     petal: '#7fb3e8', center: '#f6e27a', adj: 'Wistful',  noun: 'Forget-me-not' },
  moonpetal:   { name: 'Moonpetal',     tag: 'magic',      petal: '#bfe6ff', center: '#e9f7ff', adj: 'Starlit',  noun: 'Moonpetal', glow: true },
  lilyWhite:   { name: 'White Lily',    tag: 'calm',       petal: '#fdfbf5', center: '#f2a33a', adj: 'Pure',     noun: 'Lily' },
  lilyPink:    { name: 'Pink Lily',     tag: 'love',       petal: '#ff7eb6', center: '#c92a68', adj: 'Blushing', noun: 'Lily' },
  peony:       { name: 'Peony',         tag: 'joy',        petal: '#ff5fa2', center: '#ffc4dc', adj: 'Bouncy',   noun: 'Peony' },
  orchid:      { name: 'Orchid',        tag: 'magic',      petal: '#c86bfa', center: '#ffe36e', adj: 'Exotic',   noun: 'Orchid' },
  carnation:   { name: 'Carnation',     tag: 'friendship', petal: '#ff8a7a', center: '#e8506e', adj: 'Frilly',   noun: 'Carnation' },
  hydrangea:   { name: 'Hydrangea',     tag: 'sorry',      petal: '#6fa8ff', center: '#c5dbff', adj: 'Misty',    noun: 'Hydrangea' },
  poppy:       { name: 'Poppy',         tag: 'memory',     petal: '#ff3b30', center: '#2b2233', adj: 'Fiery',    noun: 'Poppy' },
};
export const FLOWER_KINDS = Object.keys(FLOWERS);

export function mixHex(a, b, t = 0.5) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t);
  const g = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t);
  const bl = Math.round((pa & 255) * (1 - t) + (pb & 255) * t);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
}

// A cross-bred glowing flower grown by a Garden Sprite (phone player).
// Shape comes from parent A, colour is a blend, glow + adjective from parent B.
export function makeHybrid(a, b) {
  const A = FLOWERS[a], B = FLOWERS[b];
  const tags = A.tag === B.tag ? [A.tag] : [A.tag, B.tag];
  const name = a === b ? `Glowing ${A.noun}` : `${B.adj} ${A.noun}`;
  return {
    a, b, name, tags,
    petal: a === b ? A.petal : mixHex(A.petal, B.petal, 0.45),
    center: A.center,
    glowColor: B.glow ? B.petal : mixHex(B.petal, '#ffffff', 0.35),
  };
}

export const REQUESTS = [
  { id: 'sorry',      text: "I need something to say I'm sorry.",               tags: ['sorry', 'calm'] },
  { id: 'moondance',  text: 'Make me a crown for the moonlight dance!',          tags: ['magic', 'joy'], form: 'crown' },
  { id: 'moving',     text: 'My best friend is moving far, far away...',         tags: ['friendship', 'memory'] },
  { id: 'confess',    text: "I'm confessing my love to the baker's son today!", tags: ['love', 'joy'] },
  { id: 'dragon',     text: 'Please cheer up my grumpy pet dragon.',             tags: ['joy', 'calm'] },
  { id: 'witchball',  text: "Something enchanting for the Witches' Ball.",       tags: ['magic', 'love'] },
  { id: 'grandma',    text: 'Grandma turns one hundred today!',                  tags: ['memory', 'joy'] },
  { id: 'sleep',      text: "I can't sleep... something soothing, please.",      tags: ['calm', 'magic'] },
  { id: 'bakery',     text: 'Celebrate the grand opening of my bakery!',         tags: ['joy', 'friendship'] },
  { id: 'fairyqueen', text: 'A crown fit for the Fairy Queen herself.',          tags: ['magic', 'friendship'], form: 'crown' },
  { id: 'potion',     text: "My cat spilled the witch's potion. Help me apologise!", tags: ['sorry', 'magic'] },
  { id: 'teacher',    text: 'A thank-you for my old teacher.',                   tags: ['memory', 'friendship'] },
  { id: 'wedding',    text: "A flower crown for my sister's wedding!",           tags: ['love', 'friendship'], form: 'crown' },
  { id: 'rival',      text: 'I want to make peace with my baking rival.',        tags: ['sorry', 'friendship'] },
  { id: 'star',       text: 'Something to wish upon a falling star.',            tags: ['magic', 'memory'] },
  { id: 'anniv',      text: 'Our fiftieth anniversary, my dear!',                tags: ['love', 'memory'] },
  { id: 'exam',       text: 'Calm my nerves before the big wizard exam.',        tags: ['calm', 'friendship'] },
  { id: 'firstdate',  text: 'A first date by the lake. No pressure!',            tags: ['love', 'calm'] },
  { id: 'heartbreak', text: 'My snail won second place at the race. Again.',     tags: ['sorry', 'joy'] },
  { id: 'harvest',    text: 'A crown for the harvest festival parade!',          tags: ['joy', 'memory'], form: 'crown' },
];
export const REQUEST_BY_ID = Object.fromEntries(REQUESTS.map(r => [r.id, r]));

export const VILLAGERS = {
  fairy:    { name: 'Shy Fairy',      body: '#f6c6d8', accent: '#c8b6f2', skin: '#fde3d6' },
  baker:    { name: 'Busy Baker',     body: '#fff4e2', accent: '#e8b27a', skin: '#f3c9a8' },
  witch:    { name: 'Trendy Witch',   body: '#9c82d4', accent: '#3e3357', skin: '#d9f0d0' },
  knight:   { name: 'Gentle Knight',  body: '#bcc8d6', accent: '#e8738a', skin: '#f5d3b8' },
  granny:   { name: 'Granny Gardener',body: '#b9d9b0', accent: '#f2e2c4', skin: '#f6d8c2' },
  cat:      { name: 'Postal Cat',     body: '#f2b680', accent: '#5a7bb5', skin: '#f2b680' },
  frog:     { name: 'Frog Prince',    body: '#9fd38a', accent: '#f2c14e', skin: '#9fd38a' },
  mushroom: { name: 'Mushroom Kid',   body: '#f4e9d8', accent: '#e86a5a', skin: '#fbe1cf' },
};
export const VILLAGER_KINDS = Object.keys(VILLAGERS);

// Wrapping papers and ribbons (bright, saturated colours, in rainbow order). Keys are sent over the network.
export const PAPERS = {
  cherry:    { name: 'Cherry red paper',   color: '#d7263d' },
  blush:     { name: 'Hot pink paper',     color: '#ff4f8b' },
  magenta:   { name: 'Magenta paper',      color: '#e0218a' },
  bubblegum: { name: 'Bubblegum paper',    color: '#ff9ccf' },
  dustyrose: { name: 'Dusty rose paper',   color: '#e07a95' },
  coral:     { name: 'Coral paper',        color: '#ff6b3d' },
  peach:     { name: 'Peach paper',        color: '#ffab76' },
  sunny:     { name: 'Sunshine paper',     color: '#ffc21a' },
  apple:     { name: 'Apple green paper',  color: '#8fd13f' },
  mint:      { name: 'Emerald paper',      color: '#22c27a' },
  turquoise: { name: 'Turquoise paper',    color: '#12c7c0' },
  ocean:     { name: 'Ocean paper',        color: '#1e90ff' },
  violet:    { name: 'Violet paper',       color: '#8e44e8' },
  wisteria:  { name: 'Wisteria paper',     color: '#b58cff' },
  noir:      { name: 'Midnight paper',     color: '#2d2a6e' },
  cream:     { name: 'Kraft paper',        color: '#c98b4a' },
};
export const RIBBONS = {
  ruby:      { name: 'Ruby silk',          color: '#e3123f' },
  fuchsia:   { name: 'Fuchsia silk',       color: '#ff2fa8' },
  babypink:  { name: 'Baby pink silk',     color: '#ffb3d9' },
  rosegold:  { name: 'Rose gold satin',    color: '#f08a8a' },
  tangerine: { name: 'Tangerine silk',     color: '#ff7a00' },
  gold:      { name: 'Golden silk',        color: '#ffb300' },
  lemon:     { name: 'Lemon silk',         color: '#ffe600' },
  lime:      { name: 'Lime silk',          color: '#6fd11c' },
  emerald:   { name: 'Emerald silk',       color: '#0fa968' },
  turquoise: { name: 'Turquoise silk',     color: '#19d3c5' },
  sky:       { name: 'Blue silk',          color: '#1fa2ff' },
  navy:      { name: 'Navy silk',          color: '#1f3b9e' },
  lilac:     { name: 'Purple silk',        color: '#9b4dff' },
  plum:      { name: 'Plum silk',          color: '#8e1f6e' },
  snow:      { name: 'White satin',        color: '#ffffff' },
  licorice:  { name: 'Licorice satin',     color: '#2a2230' },
};

export const REACTIONS = ['😍', '😊', '🤔', '😬', '😂', '🐝'];

export const TIMINGS = {
  opening: 3500,
  request: 15000,
  arrange: 75000,
  judge: 15000,
  reveal: 8000,
  npcPick: 2500,
  npcRate: 3500,
  beeCooldown: 22000,
  growMin: 5000,
};

export const MAX_STEMS = 12;

export function stemTags(stem) {
  if (stem.tags) return stem.tags;
  return FLOWERS[stem.k] ? [FLOWERS[stem.k].tag] : [];
}

// bouquet: { stems:[{k}|{f,tags,owner}], wrap, ribbon, snips, form:'bouquet'|'crown' }
export function scoreBouquet(bouquet, request) {
  const stems = bouquet?.stems || [];
  const n = stems.length;
  const want = request.tags;
  const covered = new Set();
  let matching = 0;
  for (const s of stems) {
    const tags = stemTags(s);
    let hit = false;
    for (const t of tags) if (want.includes(t)) { covered.add(t); hit = true; }
    if (hit) matching++;
  }
  const coverage = covered.size / want.length;
  const purity = n ? matching / n : 0;
  const sizeFactor = n >= 3 ? (n > 10 ? 0.9 : 1) : n / 3;
  const match = Math.round(100 * (0.55 * coverage + 0.45 * purity) * sizeFactor);
  const moodPts = Math.round(match / 5); // 0..20

  const form = bouquet?.form || 'bouquet';
  const craft = [];
  if (request.form === 'crown') {
    if (form === 'crown') craft.push(['Wire crown', 4]);
    else craft.push(['Wanted a crown!', -3]);
  } else if (form === 'crown') {
    craft.push(['Unexpected crown', 0]);
  } else if (bouquet?.wrap) {
    craft.push(['Wrapped', 2]);
  }
  if (bouquet?.ribbon && n) craft.push(['Silk ribbon', 2]);
  const snips = Math.min(3, bouquet?.snips || 0);
  if (snips && n) craft.push([`Neat trims ×${snips}`, snips]);
  const craftPts = craft.reduce((a, c) => a + c[1], 0);

  return { n, match, coverage, purity, matching, covered: [...covered], moodPts, craft, craftPts };
}

export function npcHearts(match) {
  return Math.max(1, Math.min(5, Math.round(match / 20 + (Math.random() - 0.5))));
}

export function shopRating(avg) {
  if (avg >= 33) return { stars: 5, title: 'Legendary Atelier' };
  if (avg >= 26) return { stars: 4, title: 'Beloved Village Boutique' };
  if (avg >= 19) return { stars: 3, title: 'Charming Little Shop' };
  if (avg >= 11) return { stars: 2, title: 'Budding Florist' };
  return { stars: 1, title: 'Wilted but Hopeful' };
}

export const NPC_NAMES = ['Pip', 'Mirabel', 'Old Tobias', 'Juniper', 'Bram', 'Odette', 'Fennel', 'Luma'];

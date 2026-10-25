// Atelier & Bloom — party edition
// Static file server + WebSocket game server (authoritative game flow).
import http from 'node:http';
import https from 'node:https';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import QRCode from 'qrcode';
import * as D from './public/js/shared/data.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, 'public');
const PORT = Number(process.env.PORT) || 3000;
const HTTPS_PORT = Number(process.env.HTTPS_PORT) || 3443;
const CERT_DIR = process.env.CERT_DIR || path.join(__dirname, 'certs');
const HOST_GRACE_MS = 30000; // room closes if the florist stays disconnected this long
const CUSTOM_REQUEST_MS = 45000; // time the customer gets once they start writing their own request

// ---------------------------------------------------------------- static files
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};
const ROUTES = { '/': 'index.html', '/florist': 'florist.html', '/play': 'phone.html', '/join': 'phone.html' };

async function handleHttp(req, res) {
  try {
    const url = new URL(req.url, 'http://x');
    let p = url.pathname;
    if (p === '/healthz') return send(res, 200, 'ok', 'text/plain');
    if (p === '/api/rooms') {
      const list = [...rooms.values()].filter(r => r.host && r.hostConnected)
        .map(r => ({ code: r.code, players: r.phoneCount(), phase: r.phase, age: Date.now() - r.created }));
      return send(res, 200, JSON.stringify(list), MIME['.json']);
    }
    if (p === '/api/info') {
      return send(res, 200, JSON.stringify({ lan: lanAddresses()[0] || null, port: PORT, httpsPort: httpsServer ? HTTPS_PORT : null }), MIME['.json']);
    }
    if (p === '/qr.svg') {
      const data = (url.searchParams.get('d') || '').slice(0, 300);
      const svg = await QRCode.toString(data || 'atelier', { type: 'svg', margin: 1, color: { dark: '#5b4a6bff', light: '#00000000' } });
      return send(res, 200, svg, MIME['.svg']);
    }
    if (ROUTES[p]) p = '/' + ROUTES[p];
    const file = path.normalize(path.join(PUBLIC, decodeURIComponent(p)));
    if (!file.startsWith(PUBLIC)) return send(res, 403, 'forbidden', 'text/plain');
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) return send(res, 404, 'not found', 'text/plain');
      const ext = path.extname(file);
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Cache-Control': ext === '.woff2' || file.includes('/vendor/') ? 'public, max-age=86400' : 'no-cache',
      });
      fs.createReadStream(file).pipe(res);
    });
  } catch (e) {
    console.error(e);
    send(res, 500, 'error', 'text/plain');
  }
}
const servers = [http.createServer(handleHttp)];
let httpsServer = null;
try {
  const key = fs.readFileSync(path.join(CERT_DIR, 'key.pem'));
  const cert = fs.readFileSync(path.join(CERT_DIR, 'cert.pem'));
  httpsServer = https.createServer({ key, cert }, handleHttp);
  servers.push(httpsServer);
} catch { /* no local certificate: plain HTTP only (fine behind an HTTPS host such as Render) */ }
function send(res, code, body, type) { res.writeHead(code, { 'Content-Type': type }); res.end(body); }

// ---------------------------------------------------------------- helpers
const rand = (n) => Math.floor(Math.random() * n);
const pick = (arr) => arr[rand(arr.length)];
const shuffle = (a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = rand(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const token = () => crypto.randomBytes(12).toString('hex');
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
function newCode() {
  for (let i = 0; i < 1000; i++) {
    const c = Array.from({ length: 4 }, () => CODE_CHARS[rand(CODE_CHARS.length)]).join('');
    if (!rooms.has(c)) return c;
  }
  return token().slice(0, 6).toUpperCase();
}
function wsSend(ws, msg) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); }
function cleanRequestText(s) { return String(s || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 90); }
function cleanName(s) { return String(s || '').replace(/[<>]/g, '').trim().slice(0, 14) || 'Villager'; }

// ---------------------------------------------------------------- rooms
const rooms = new Map();

class Room {
  constructor() {
    this.code = newCode();
    this.created = Date.now();
    this.hostToken = token();
    this.host = null;
    this.hostConnected = false;
    this.hostLeftAt = 0;
    this.hostGrace = null;
    this.spectators = new Set();
    this.players = new Map();
    this.joinSeq = 0;
    this.phase = 'lobby';
    this.endsAt = 0;
    this.timer = null;
    this.round = 0;
    this.totalRounds = 0;
    this.rotation = [];
    this.order = null;
    this.usedRequests = new Set();
    this.flowers = new Map();
    this.flowerSeq = 1;
    this.bees = new Map();
    this.beeSeq = 1;
    this.floristScore = 0;
    this.history = [];
    this.lastResult = null;
    this.final = null;
    this.lobbyBouquet = { stems: [], wrap: null, ribbon: null, snips: 0, form: 'bouquet' };
    rooms.set(this.code, this);
  }

  phones() { return [...this.players.values()]; }
  phoneCount() { return this.phones().filter(p => p.connected).length; }
  leader() { return this.phones().filter(p => p.connected).sort((a, b) => a.seq - b.seq)[0] || null; }

  setPhase(phase, ms = 0, onEnd = null) {
    clearTimeout(this.timer);
    this.phase = phase;
    this.endsAt = ms ? Date.now() + ms : 0;
    if (ms && onEnd) this.timer = setTimeout(onEnd, ms);
    this.broadcast();
  }

  // the request in play: one of the premade ones, or the customer's own words
  currentRequest() {
    const o = this.order;
    if (!o?.requestId) return null;
    return o.requestId === 'custom' ? o.custom : D.REQUEST_BY_ID[o.requestId];
  }

  // ---- public state
  customerInfo() {
    const o = this.order;
    if (!o) return null;
    if (o.npc) return { id: null, npc: true, name: o.npc.name, villager: o.npc.villager };
    const p = this.players.get(o.customerId);
    return p ? { id: p.id, npc: false, name: p.name, villager: p.villager } : null;
  }
  bouquetView(b) {
    return {
      stems: (b?.stems || []).map(s => s.f
        ? { f: s.f, k: s.a, b: s.b, name: s.name, petal: s.petal, glowColor: s.glowColor, owner: s.owner, ownerName: s.ownerName, hybrid: true }
        : { k: s.k, name: D.FLOWERS[s.k].name }),
      wrap: b?.wrap || null, ribbon: b?.ribbon || null, snips: b?.snips || 0, form: b?.form || 'bouquet',
    };
  }
  publicState() {
    const o = this.order;
    const req = this.currentRequest();
    return {
      t: 'state',
      code: this.code,
      phase: this.phase,
      timeLeft: this.endsAt ? Math.max(0, this.endsAt - Date.now()) : 0,
      round: this.round,
      totalRounds: this.totalRounds,
      hostConnected: this.hostConnected,
      floristScore: this.floristScore,
      watchers: this.spectators.size + this.phones().filter(p => p.connected && p.watching).length,
      players: this.phones().map(p => ({ id: p.id, name: p.name, villager: p.villager, score: p.score, connected: p.connected, leader: this.leader()?.id === p.id })),
      customer: this.customerInfo(),
      request: req ? { id: req.id, text: req.text, form: req.form || null, custom: !!req.custom } : null,
      bouquet: this.bouquetView(o ? o.bouquet : this.lobbyBouquet),
      hearts: o?.hearts ?? null,
      lastResult: this.phase === 'reveal' ? this.lastResult : null,
      final: this.phase === 'final' ? this.final : null,
    };
  }
  privateState(p) {
    const o = this.order;
    const isCustomer = o && !o.npc && o.customerId === p.id;
    return {
      id: p.id,
      isCustomer: !!isCustomer,
      options: isCustomer && this.phase === 'request' ? o.options.map(id => ({ id, text: D.REQUEST_BY_ID[id].text, form: D.REQUEST_BY_ID[id].form || null })) : null,
      beeReadyIn: Math.max(0, p.beeReadyAt - Date.now()),
      beeActive: [...this.bees.values()].some(b => b.owner === p.id),
      isLeader: this.leader()?.id === p.id,
      score: p.score,
    };
  }
  broadcast() {
    const pub = this.publicState();
    wsSend(this.host, pub);
    for (const s of this.spectators) wsSend(s, pub);
    for (const p of this.players.values()) if (p.connected) wsSend(p.ws, { ...pub, me: this.privateState(p) });
  }
  toPhones(msg) { for (const p of this.players.values()) if (p.connected) wsSend(p.ws, msg); for (const s of this.spectators) wsSend(s, msg); }
  toAll(msg) { wsSend(this.host, msg); this.toPhones(msg); }

  // ---- game flow
  startGame() {
    if (!['lobby', 'final'].includes(this.phase)) return;
    for (const p of this.players.values()) {
      p.score = 0;
      p.stats = { sent: 0, used: 0, bees: 0, stolen: 0, heartsGiven: [] };
      p.beeReadyAt = 0;
    }
    this.floristScore = 0;
    this.history = [];
    this.round = 0;
    this.usedRequests.clear();
    this.flowers.clear();
    this.bees.clear();
    const phones = this.phones().filter(p => p.connected).sort((a, b) => a.seq - b.seq);
    this.totalRounds = Math.max(3, Math.min(5, phones.length));
    this.rotation = [];
    const order = shuffle(phones.map(p => p.id));
    // every villager is the customer once; with fewer than 3 villagers, village regulars (NPCs) fill in
    for (let i = 0; i < this.totalRounds; i++) this.rotation.push(i < order.length ? order[i] : null);
    this.order = null;
    this.setPhase('opening', D.TIMINGS.opening, () => this.nextOrder());
  }

  nextOrder() {
    this.round++;
    if (this.round > this.totalRounds) return this.finish();
    let customerId = this.rotation[this.round - 1];
    let cust = customerId ? this.players.get(customerId) : null;
    if (customerId && (!cust || !cust.connected)) {
      // planned customer left: pick someone who hasn't been the customer yet
      const done = new Set(this.rotation.slice(0, this.round - 1));
      const alive = this.phones().filter(p => p.connected && !done.has(p.id));
      cust = alive.length ? pick(alive) : null;
    }
    const pool = D.REQUESTS.filter(r => !this.usedRequests.has(r.id));
    // Make sure at least one crown request shows up across a game.
    let options = shuffle(pool).slice(0, 3).map(r => r.id);
    if (this.round === 2 && !this.history.some(h => h.form === 'crown') && !options.some(id => D.REQUEST_BY_ID[id].form)) {
      const crown = shuffle(pool.filter(r => r.form === 'crown'))[0];
      if (crown) options[0] = crown.id;
    }
    options.forEach(id => this.usedRequests.add(id));
    const usedV = new Set(this.phones().map(p => p.villager));
    const npcV = shuffle(D.VILLAGER_KINDS.filter(v => !usedV.has(v)))[0] || pick(D.VILLAGER_KINDS);
    this.order = {
      customerId: cust ? cust.id : null,
      npc: cust ? null : { name: pick(D.NPC_NAMES), villager: npcV },
      options,
      requestId: null,
      custom: null,
      extended: false,
      bouquet: { stems: [], wrap: null, ribbon: null, snips: 0, form: 'bouquet' },
      hearts: null,
    };
    this.flowers.clear();
    this.bees.clear();
    wsSend(this.host, { t: 'newOrder' });
    if (this.order.npc) this.setPhase('request', D.TIMINGS.npcPick, () => this.chooseRequest(pick(options)));
    else this.setPhase('request', D.TIMINGS.request, () => this.chooseRequest(pick(options)));
  }

  chooseRequest(id) {
    if (this.phase !== 'request') return;
    if (!this.order.options.includes(id) && !(id === 'custom' && this.order.custom)) return;
    this.order.requestId = id;
    for (const p of this.players.values()) p.beeReadyAt = Date.now() + 8000; // short grace before bees
    this.setPhase('arrange', D.TIMINGS.arrange, () => this.deliver('timeout'));
  }

  deliver(why) {
    if (this.phase !== 'arrange') return;
    for (const b of this.bees.values()) wsSend(this.host, { t: 'beeCancel', id: b.id });
    this.bees.clear();
    this.order.delivered = JSON.parse(JSON.stringify(this.order.bouquet));
    this.order.deliveredWhy = why;
    if (this.order.npc) {
      const sc = D.scoreBouquet(this.order.delivered, this.currentRequest());
      this.setPhase('judge', D.TIMINGS.npcRate, () => this.rate(D.npcHearts(sc.match), null));
    } else {
      this.setPhase('judge', D.TIMINGS.judge, () => {
        const sc = D.scoreBouquet(this.order.delivered, this.currentRequest());
        this.rate(D.npcHearts(sc.match), null);
      });
    }
  }

  rate(hearts, byPlayer) {
    if (this.phase !== 'judge') return;
    hearts = Math.max(1, Math.min(5, Math.round(Number(hearts) || 3)));
    this.order.hearts = hearts;
    if (byPlayer) byPlayer.stats.heartsGiven.push(hearts);
    const req = this.currentRequest();
    const b = this.order.delivered;
    const sc = D.scoreBouquet(b, req);
    const floristPts = Math.max(0, sc.moodPts + sc.craftPts + hearts * 2);
    this.floristScore += floristPts;

    // Garden Sprite points for their flowers in the bouquet
    const spriteGain = new Map();
    for (const s of b.stems) {
      if (!s.owner) continue;
      const owner = this.players.get(s.owner);
      if (!owner) continue;
      let pts = 3;
      if (s.tags.some(t => req.tags.includes(t))) pts += 2;
      if (hearts >= 4) pts += 1;
      owner.score += pts;
      owner.stats.used++;
      spriteGain.set(owner.id, (spriteGain.get(owner.id) || 0) + pts);
    }
    // Customer gets a little "satisfaction" bonus when they were happy
    const cust = this.order.customerId ? this.players.get(this.order.customerId) : null;
    if (cust && hearts >= 4) { cust.score += 2; spriteGain.set(cust.id, (spriteGain.get(cust.id) || 0) + 2); }

    this.lastResult = {
      round: this.round,
      request: { text: req.text, tags: req.tags, tagLabels: req.tags.map(t => D.TAGS[t].label), form: req.form || null },
      customer: this.customerInfo(),
      bouquet: this.bouquetView(b),
      hearts,
      match: sc.match, moodPts: sc.moodPts, craft: sc.craft, craftPts: sc.craftPts, n: sc.n,
      covered: sc.covered.map(t => D.TAGS[t].label),
      floristPts,
      floristScore: this.floristScore,
      gains: [...spriteGain.entries()].map(([id, pts]) => ({ id, name: this.players.get(id)?.name, pts })),
    };
    this.history.push({ round: this.round, form: req.form, match: sc.match, hearts, floristPts });
    this.setPhase('reveal', D.TIMINGS.reveal, () => this.nextOrder());
  }

  finish() {
    const rounds = Math.max(1, this.history.length);
    const avg = this.floristScore / rounds;
    const rating = D.shopRating(avg);
    const ps = this.phones();
    const ranked = [...ps].sort((a, b) => b.score - a.score).map(p => ({ id: p.id, name: p.name, villager: p.villager, score: p.score }));
    const awards = [];
    const top = (fn, min = 1) => { let best = null, v = -Infinity; for (const p of ps) { const x = fn(p); if (x > v) { v = x; best = p; } } return v >= min ? [best, v] : null; };
    let a;
    if ((a = top(p => p.stats.used))) awards.push({ title: 'Green Thumb', who: a[0].name, why: `${a[1]} flower${a[1] > 1 ? 's' : ''} in bouquets` });
    if ((a = top(p => p.stats.stolen))) awards.push({ title: 'Cheekiest Bee', who: a[0].name, why: `stole ${a[1]} stem${a[1] > 1 ? 's' : ''}` });
    if ((a = top(p => p.stats.sent))) awards.push({ title: 'Busiest Gardener', who: a[0].name, why: `grew ${a[1]} flower${a[1] > 1 ? 's' : ''}` });
    const critics = ps.filter(p => p.stats.heartsGiven.length);
    if (critics.length > 1) {
      const avgH = p => p.stats.heartsGiven.reduce((x, y) => x + y, 0) / p.stats.heartsGiven.length;
      const harsh = critics.reduce((m, p) => avgH(p) < avgH(m) ? p : m);
      awards.push({ title: 'Toughest Critic', who: harsh.name, why: `gave ${avgH(harsh).toFixed(1)} hearts on average` });
    }
    this.final = { floristScore: this.floristScore, avg: Math.round(avg), ...rating, ranked, awards, history: this.history };
    this.order = null;
    this.setPhase('final');
  }

  // Shut the room down for everyone and forget it.
  close(reason) {
    clearTimeout(this.timer);
    clearTimeout(this.hostGrace);
    const msg = { t: 'closed', reason };
    const sockets = [this.host, ...this.spectators, ...this.phones().map(p => p.ws)];
    for (const ws of sockets) {
      if (!ws) continue;
      wsSend(ws, msg);
      ws.room = null; ws.role = null; ws.player = null;
    }
    this.host = null; this.hostConnected = false;
    this.players.clear(); this.spectators.clear();
    rooms.delete(this.code);
  }

  backToLobby() {
    if (this.phase !== 'final') return;
    this.order = null;
    this.round = 0;
    this.lobbyBouquet = { stems: [], wrap: null, ribbon: null, snips: 0, form: 'bouquet' };
    this.setPhase('lobby');
  }

  // ---- incoming
  onHost(msg) {
    switch (msg.t) {
      case 'start': return this.startGame();
      case 'again': return this.backToLobby();
      case 'deliver': return this.deliver('bell');
      case 'bouquet': return this.updateBouquet(msg.b);
      case 'beeResult': return this.beeResult(msg);
      case 'skip': // debug / impatient florist
        if (this.phase === 'request') this.chooseRequest(this.order.options[0]);
        return;
      case 'pose': // florist head/hands for the phones' live atelier view
        for (const s of this.spectators) wsSend(s, msg);
        for (const p of this.players.values()) if (p.connected && p.watching) wsSend(p.ws, msg);
        return;
    }
  }

  updateBouquet(raw) {
    if (!raw || !Array.isArray(raw.stems)) return;
    const target = this.order && this.phase === 'arrange' ? this.order.bouquet : (this.phase === 'lobby' ? this.lobbyBouquet : null);
    if (!target) return;
    const stems = [];
    for (const s of raw.stems.slice(0, D.MAX_STEMS)) {
      if (s && s.f && this.flowers.has(s.f)) stems.push(this.flowers.get(s.f));
      else if (s && D.FLOWERS[s.k]) stems.push({ k: s.k });
    }
    target.stems = stems;
    target.wrap = D.PAPERS[raw.wrap] ? raw.wrap : null;
    target.ribbon = D.RIBBONS[raw.ribbon] ? raw.ribbon : null;
    target.snips = Math.max(0, Math.min(20, Number(raw.snips) || 0));
    target.form = raw.form === 'crown' ? 'crown' : 'bouquet';
    this.toPhones({ t: 'bouquet', bouquet: this.bouquetView(target) });
  }

  onPhone(p, msg) {
    switch (msg.t) {
      case 'start': if (this.leader()?.id === p.id) this.startGame(); return;
      case 'again': if (this.leader()?.id === p.id) this.backToLobby(); return;
      case 'pickRequest':
        if (this.phase === 'request' && this.order?.customerId === p.id) this.chooseRequest(msg.id);
        return;
      case 'watch': // phone opened/closed the live atelier view
        p.watching = !!msg.on;
        this.broadcast();
        return;
      case 'writing': // the customer opened "write your own": give them time to type
        if (this.phase === 'request' && this.order?.customerId === p.id && !this.order.extended) {
          this.order.extended = true;
          const left = this.endsAt - Date.now();
          if (left < CUSTOM_REQUEST_MS) this.setPhase('request', CUSTOM_REQUEST_MS, () => this.chooseRequest(pick(this.order.options)));
        }
        return;
      case 'customRequest': {
        if (this.phase !== 'request' || this.order?.customerId !== p.id) return;
        const text = cleanRequestText(msg.text);
        if (text.length < 3) return wsSend(p.ws, { t: 'toast', text: 'Tell the florist a little more!' });
        let tags = [...new Set((Array.isArray(msg.tags) ? msg.tags : []).filter(t => D.TAGS[t]))].slice(0, 2);
        if (!tags.length) tags = shuffle(Object.keys(D.TAGS)).slice(0, 2);
        this.order.custom = { id: 'custom', text, tags, form: msg.crown ? 'crown' : undefined, custom: true };
        this.chooseRequest('custom');
        return;
      }
      case 'rate':
        if (this.phase === 'judge' && this.order?.customerId === p.id) this.rate(msg.hearts, p);
        return;
      case 'react': {
        if (!D.REACTIONS.includes(msg.e)) return;
        const now = Date.now();
        if (now - (p.lastReact || 0) < 350) return;
        p.lastReact = now;
        const m = { t: 'react', from: p.id, name: p.name, villager: p.villager, e: msg.e, customer: this.order?.customerId === p.id };
        wsSend(this.host, m);
        for (const s of this.spectators) wsSend(s, m);
        return;
      }
      case 'grow': {
        if (!['lobby', 'request', 'arrange'].includes(this.phase)) return;
        if (this.order?.customerId === p.id && this.phase !== 'lobby') return;
        if (!D.FLOWERS[msg.a] || !D.FLOWERS[msg.b]) return;
        const now = Date.now();
        if (now - (p.lastGrow || 0) < D.TIMINGS.growMin) return;
        p.lastGrow = now;
        const h = D.makeHybrid(msg.a, msg.b);
        const f = { f: 'f' + (this.flowerSeq++), ...h, owner: p.id, ownerName: p.name };
        this.flowers.set(f.f, f);
        if (this.phase !== 'lobby') p.stats.sent++;
        wsSend(this.host, { t: 'spawnFlower', flower: f });
        wsSend(p.ws, { t: 'toast', text: `Your ${h.name} is on its way to the atelier ✨` });
        return;
      }
      case 'bee': {
        if (this.phase !== 'arrange' || this.order?.customerId === p.id) return;
        const now = Date.now();
        if (now < p.beeReadyAt || [...this.bees.values()].some(b => b.owner === p.id)) return;
        const bee = { id: 'b' + (this.beeSeq++), owner: p.id, ownerName: p.name };
        this.bees.set(bee.id, bee);
        p.beeReadyAt = now + D.TIMINGS.beeCooldown;
        p.stats.bees++;
        wsSend(this.host, { t: 'spawnBee', bee });
        this.toPhones({ t: 'toast', text: `🐝 ${p.name} sent a cheeky bee!` });
        this.broadcast();
        return;
      }
    }
  }

  beeResult(msg) {
    const bee = this.bees.get(msg.id);
    if (!bee) return;
    this.bees.delete(msg.id);
    const p = this.players.get(bee.owner);
    if (msg.outcome === 'stole' && p && this.phase === 'arrange') {
      p.score += 2;
      p.stats.stolen++;
      this.toPhones({ t: 'toast', text: `🐝 ${p.name}'s bee stole a ${String(msg.name || 'flower').slice(0, 30)}! (+2)` });
    } else if (msg.outcome === 'shooed' && p) {
      this.toPhones({ t: 'toast', text: `🌸 The florist shooed ${p.name}'s bee away!` });
    }
    this.broadcast();
  }
}

// ---------------------------------------------------------------- sockets
const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
for (const srv of servers) {
  srv.on('upgrade', (req, socket, head) => {
    if (!req.url.startsWith('/ws')) return socket.destroy();
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });
}

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data); } catch { return; }
    if (!msg || typeof msg.t !== 'string') return;
    if (msg.t === 'ping') return wsSend(ws, { t: 'pong', at: msg.at });
    try { route(ws, msg); } catch (e) { console.error('handler error', e); }
  });
  ws.on('close', () => onClose(ws));
});

function route(ws, msg) {
  // ---- florist (host)
  if (msg.t === 'host') {
    let room = msg.code && rooms.get(String(msg.code).toUpperCase());
    if (!room || room.hostToken !== msg.token) room = new Room();
    if (room.host && room.host !== ws) { wsSend(room.host, { t: 'kicked' }); room.host.role = null; }
    clearTimeout(room.hostGrace);
    room.host = ws;
    room.hostConnected = true;
    ws.role = 'host';
    ws.room = room;
    wsSend(ws, { t: 'hosted', code: room.code, token: room.hostToken });
    room.broadcast();
    // resend any live sprite flowers so a reloaded florist sees them
    for (const f of room.flowers.values()) wsSend(ws, { t: 'spawnFlower', flower: f });
    return;
  }
  // ---- spectator (TV)
  if (msg.t === 'spectate') {
    const room = rooms.get(String(msg.code || '').toUpperCase());
    if (!room) return wsSend(ws, { t: 'error', error: 'No atelier with that code.' });
    ws.role = 'spectator'; ws.room = room;
    room.spectators.add(ws);
    wsSend(ws, room.publicState());
    return;
  }
  // ---- villager (phone)
  if (msg.t === 'join') {
    const room = rooms.get(String(msg.code || '').toUpperCase());
    if (!room) return wsSend(ws, { t: 'error', gone: true, error: 'No atelier with that code. Check the sign in the shop!' });
    let p = msg.token && [...room.players.values()].find(x => x.token === msg.token);
    if (p) {
      if (p.ws && p.ws !== ws) { p.ws.role = null; try { p.ws.close(); } catch {} }
    } else {
      if (msg.token && !msg.name) return wsSend(ws, { t: 'error', error: '' });
      if (room.players.size >= 8) return wsSend(ws, { t: 'error', error: 'The atelier is full (8 villagers max).' });
      const taken = new Set(room.phones().map(x => x.villager));
      let villager = D.VILLAGERS[msg.villager] && !taken.has(msg.villager) ? msg.villager : D.VILLAGER_KINDS.find(v => !taken.has(v));
      p = {
        id: 'p' + (++room.joinSeq), seq: room.joinSeq, token: token(), name: cleanName(msg.name), villager,
        score: 0, stats: { sent: 0, used: 0, bees: 0, stolen: 0, heartsGiven: [] }, beeReadyAt: 0,
      };
      room.players.set(p.id, p);
      wsSend(room.host, { t: 'playerJoined', name: p.name, villager: p.villager });
    }
    p.ws = ws; p.connected = true;
    ws.role = 'phone'; ws.room = room; ws.player = p;
    wsSend(ws, { t: 'joined', id: p.id, token: p.token, code: room.code, villager: p.villager, name: p.name });
    room.broadcast();
    return;
  }
  const room = ws.room;
  if (!room) return;
  if (ws.role === 'host' && room.host === ws) {
    if (msg.t === 'close') return room.close('The florist closed the atelier.');
    room.onHost(msg);
  } else if (ws.role === 'phone' && ws.player) {
    if (msg.t === 'leave') {
      room.players.delete(ws.player.id);
      ws.player = null; ws.room = null; ws.role = null;
      room.broadcast();
      return;
    }
    room.onPhone(ws.player, msg);
  }
}

function onClose(ws) {
  const room = ws.room;
  if (!room) return;
  if (ws.role === 'host' && room.host === ws) {
    room.host = null; room.hostConnected = false; room.hostLeftAt = Date.now();
    clearTimeout(room.hostGrace);
    room.hostGrace = setTimeout(() => {
      if (!room.hostConnected && rooms.get(room.code) === room) room.close('The florist lost connection, so the atelier closed.');
    }, HOST_GRACE_MS);
    room.broadcast();
  } else if (ws.role === 'phone' && ws.player && ws.player.ws === ws) {
    ws.player.connected = false;
    if (room.phase === 'lobby') {
      // drop players who leave in the lobby after a short grace period
      const p = ws.player;
      setTimeout(() => { if (!p.connected && room.phase === 'lobby') { room.players.delete(p.id); room.broadcast(); } }, 20000);
    }
    room.broadcast();
  } else if (ws.role === 'spectator') {
    room.spectators.delete(ws);
  }
}

// keep-alive + cleanup
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    try { ws.ping(); } catch {}
  }
  const now = Date.now();
  for (const room of rooms.values()) {
    const empty = !room.hostConnected && room.phoneCount() === 0;
    if ((empty && now - room.hostLeftAt > 10 * 60e3) || now - room.created > 6 * 3600e3) {
      clearTimeout(room.timer);
      rooms.delete(room.code);
    }
  }
}, 25000);

// Real Wi-Fi/Ethernet addresses first; skip virtual adapters (Parallels, VMware, Docker, VPN tunnels) phones can't reach.
const VIRTUAL_IF = /^(bridge|vmnet|vnic|vboxnet|docker|veth|utun|tun|tap|awdl|llw)/i;
function lanAddresses() {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    if (VIRTUAL_IF.test(name)) continue;
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(a.address);
  }
  const rank = (ip) => ip.startsWith('192.168.') ? 0 : ip.startsWith('10.') ? 1 : ip.startsWith('172.') ? 2 : 3;
  return out.sort((a, b) => rank(a) - rank(b));
}
servers[0].listen(PORT, () => {
  console.log(`\n🌸 Atelier & Bloom is running!`);
  console.log(`   This computer:  http://localhost:${PORT}`);
  for (const ip of lanAddresses()) console.log(`   Same Wi-Fi:     http://${ip}:${PORT}/play   (phones)`);
  if (!httpsServer) console.log(`   VR headsets need HTTPS — deploy online, use a tunnel, or run "npm run cert" (see README).`);
});
if (httpsServer) httpsServer.listen(HTTPS_PORT, () => {
  for (const ip of lanAddresses()) console.log(`   HTTPS (VR):     https://${ip}:${HTTPS_PORT}/florist   (accept the certificate warning once)`);
});

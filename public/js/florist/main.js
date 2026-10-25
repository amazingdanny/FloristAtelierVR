// Atelier & Bloom — the Florist (VR headset or desktop). Hosts the room over WebSocket.
import * as THREE from 'three';
import { Net } from '../net.js';
import { SoundBoard } from '../audio.js';
import { VILLAGERS, TIMINGS } from '../shared/data.js';
import { World } from './world.js';
import { Atelier } from './bench.js';
import { Panels } from './panels.js';
import { CustomerManager, Crowd, SpriteOrbs, Floaters, COUNTER_SPOT } from './villagers.js';
import { Bees } from './bees.js';
import { Interactor, XRHands, DesktopMouse } from './input.js';
import { labelSprite } from './textures.js';

const $ = (s) => document.querySelector(s);
const canvas = $('#c');
const params = new URLSearchParams(location.search);

// ------------------------------------------------------------------ renderer / scene
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
renderer.setClearColor('#fbf1e6', 1);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog('#f6e8e0', 9, 22);
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 40);
camera.position.set(0, 1.62, 0.3);
scene.add(camera);

const sound = new SoundBoard();
const world = new World(scene);
const floaters = new Floaters(scene);
const panels = new Panels(scene);
const customers = new CustomerManager(scene, floaters);
const crowd = new Crowd(scene);
const orbs = new SpriteOrbs(scene);

let S = null;                 // latest server state
let prevPhase = null;
let prevRound = -1;
let roomCode = '';
let deadline = 0;
let mode = 'intro';           // intro | desktop | xr
let handedOver = false;
let lastTick = -1;

const atelier = new Atelier(scene, {
  sound, floaters,
  onChange: (b) => net.send({ t: 'bouquet', b }),
  onBell: () => {
    if (!S) return;
    if (S.phase === 'lobby') { net.send({ t: 'start' }); sound.startMusic(); }
    else if (S.phase === 'final') net.send({ t: 'again' });
    else if (S.phase === 'arrange') deliverNow();
    else if (S.phase === 'request') net.send({ t: 'skip' });
  },
});
const bees = new Bees(scene, atelier, sound, { camera, onResult: (r) => net.send({ t: 'beeResult', ...r }) });
const interactor = new Interactor({ atelier, scene, sound, bees, onDeliverByHand: () => deliverNow(), isPlaying: () => S?.phase === 'arrange' });
const hands = new XRHands(renderer, scene, interactor, {});

// VR hover tooltip: shows what the hand is about to grab
const hoverTip = labelSprite(' ', { size: 0.032, font: 40, bg: 'rgba(79,64,88,0.92)', color: '#ffffff' });
hoverTip.visible = false;
hoverTip.renderOrder = 50;
hoverTip.material.depthTest = false;
scene.add(hoverTip);
let hoverTipText = '';
function updateHoverTip() {
  const h = hands.hands.find(x => x.hover && !x.held);
  if (!h) { hoverTip.visible = false; return; }
  const t = h.hover;
  const text = t.label || '';
  if (!text) { hoverTip.visible = false; return; }
  if (text !== hoverTipText) { hoverTip.userData.redraw(text); hoverTipText = text; }
  t.collider.getWorldPosition(hoverTip.position);
  hoverTip.position.y += (t.radius || 0.06) + 0.05;
  hoverTip.visible = true;
}

// invisible collider so the desktop player can click the customer to hand over
const custCollider = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 1.4, 8), new THREE.MeshBasicMaterial({ visible: false }));
custCollider.userData.customer = true;
custCollider.position.copy(COUNTER_SPOT).setY(0.7);
scene.add(custCollider);

const tip = $('#tip');
const mouse = new DesktopMouse(canvas, camera, interactor, {
  bees, getCustomer: () => (customers.current ? custCollider : null),
  onTooltip: (text, x, y) => { tip.hidden = !text; if (text) { tip.textContent = text; tip.style.left = x + 'px'; tip.style.top = y + 'px'; } },
});

// ------------------------------------------------------------------ fade through black
const fadeMesh = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 12), new THREE.MeshBasicMaterial({ color: '#000000', side: THREE.BackSide, transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
fadeMesh.renderOrder = 9999;
fadeMesh.visible = false;
camera.add(fadeMesh);
const fade = { state: 'idle', t: 0, cb: null, queue: [] };
function fadeThrough(cb) {
  if (fade.state !== 'idle') { fade.queue.push(cb); return; }
  fade.state = 'out'; fade.t = 0; fade.cb = cb; fadeMesh.visible = true;
}
function updateFade(dt) {
  if (fade.state === 'idle') return;
  fade.t += dt;
  const m = fadeMesh.material;
  if (fade.state === 'out') {
    m.opacity = Math.min(1, fade.t / 0.55);
    if (fade.t >= 0.55) { fade.cb?.(); fade.cb = null; while (fade.queue.length) fade.queue.shift()(); fade.state = 'hold'; fade.t = 0; }
  } else if (fade.state === 'hold') {
    m.opacity = 1;
    if (fade.t >= 0.3) { fade.state = 'in'; fade.t = 0; }
  } else if (fade.state === 'in') {
    m.opacity = Math.max(0, 1 - fade.t / 0.7);
    if (fade.t >= 0.7) { fade.state = 'idle'; fadeMesh.visible = false; }
  }
}

// ------------------------------------------------------------------ networking
let hostInfo = null;
try { hostInfo = JSON.parse(localStorage.getItem('ab_host') || 'null'); } catch {}
if (params.has('new')) hostInfo = null;
const net = new Net(onMessage, (st) => { if (st === 'open') setHudPlayers(); });
net.hello = () => ({ t: 'host', code: hostInfo?.code, token: hostInfo?.token });

function onMessage(m) {
  switch (m.t) {
    case 'hosted':
      roomCode = m.code;
      hostInfo = { code: m.code, token: m.token };
      try { localStorage.setItem('ab_host', JSON.stringify(hostInfo)); } catch {}
      showCode();
      break;
    case 'state': onState(m); break;
    case 'spawnFlower': onFlower(m.flower); break;
    case 'spawnBee': {
      const o = orbs.get(m.bee.owner);
      bees.spawn(m.bee, o ? o.obj.position.clone() : null);
      break;
    }
    case 'beeCancel': bees.cancel(m.id); break;
    case 'react': onReact(m); break;
    case 'playerJoined': sound.sfx('door'); break;
    case 'closed':
      try { localStorage.removeItem('ab_host'); } catch {}
      renderer.xr.getSession()?.end().catch(() => {});
      location.href = '/';
      break;
    case 'kicked':
      panels.say('This atelier was opened in another window.', {});
      break;
  }
}

// When the florist page is opened as localhost, phones can't use that address: swap in the computer's LAN IP.
let joinHost = location.host;
const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
if (isLocal) {
  fetch('/api/info').then(r => r.json()).then(info => {
    if (!info.lan) return;
    joinHost = location.protocol === 'https:' && info.httpsPort ? `${info.lan}:${info.httpsPort}` : `${info.lan}:${info.port}`;
    if (roomCode) showCode();
  }).catch(() => {});
}
function joinUrl() { return `${joinHost}/play`; }
function showCode() {
  $('#code').textContent = roomCode;
  $('#hudCode').textContent = roomCode;
  $('#joinUrl').textContent = joinUrl();
  const full = `${location.protocol}//${joinHost}/play?code=${roomCode}`;
  $('#qr').src = '/qr.svg?d=' + encodeURIComponent(full);
  panels.loadQR(full);
  if (S?.phase === 'lobby' || !S) panels.drawLobby(roomCode, joinUrl(), S?.players || [], true);
}
function setHudPlayers() {
  const n = S ? S.players.filter(p => p.connected).length : 0;
  $('#hudPlayers').textContent = `${n} villager${n === 1 ? '' : 's'}`;
}

// ------------------------------------------------------------------ game state → scene
const REACTION_QUOTES = {
  5: ['It\'s perfect! I could cry!', 'Exactly what my heart wanted!', 'You read my mind!'],
  4: ['Oh, I love it!', 'This is lovely, thank you!', 'Wonderful work!'],
  3: ['That\'s... rather nice.', 'Pretty! Not quite it, but pretty.', 'I think they\'ll like it.'],
  2: ['Hm. An interesting choice...', 'Is this... what I asked for?', 'Well, it smells nice.'],
  1: ['Oh dear. Oh no.', 'I... will pretend I love it.', 'My dragon is still grumpy.'],
};
const VOICE = { fairy: 1.7, baker: 1.0, witch: 1.25, knight: 0.7, granny: 1.35, cat: 1.55, frog: 0.55, mushroom: 1.9 };
function speak(text, villager) {
  try {
    if (!sound.enabled || !window.speechSynthesis || !text) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/[“”]/g, ''));
    u.lang = 'en-GB';
    u.pitch = Math.min(2, VOICE[villager] || 1.1);
    u.rate = 0.98;
    u.volume = 0.9;
    speechSynthesis.speak(u);
  } catch {}
}
const pickQ = (n) => { const a = REACTION_QUOTES[n] || REACTION_QUOTES[3]; return a[Math.floor(Math.random() * a.length)]; };

function onState(s) {
  const prev = S;
  S = s;
  deadline = performance.now() + (s.timeLeft || 0);
  setHudPlayers();
  const phaseChanged = s.phase !== prevPhase;
  const roundChanged = s.round !== prevRound;

  if (phaseChanged || roundChanged) enterPhase(s, prevPhase);
  else refreshPhase(s);

  prevPhase = s.phase; prevRound = s.round;
}

function custSub(c) { return VILLAGERS[c?.villager]?.name || ''; }

function enterPhase(s, from) {
  const p = s.phase;
  if (p === 'lobby') {
    const go = () => {
      world.setMood('morning');
      customers.leave();
      orbs.clear();
      bees.cancelAll();
      atelier.resetHolders();
      atelier.clearBasket();
      atelier.locked = false; atelier.canDeliver = false;
      panels.bubble.mesh.visible = false;
      crowd.cheer = false;
      crowd.sync(s.players);
      panels.drawLobby(roomCode, joinUrl(), s.players, true);
      if (!from && s.bouquet?.stems?.length) atelier.restore(s.bouquet);
    };
    if (from === 'final') fadeThrough(go); else go();
    statusLobby(s);
    atelier.setTimerText('');
    atelier.setHint(mode === 'xr' ? 'Grab flowers from the buckets — practice!' : 'Click the flowers to practise!');
  } else if (p === 'opening') {
    fadeThrough(() => {
      world.setMood('day');
      crowd.clear();
      panels.hideSign();
      atelier.resetHolders();
      atelier.clearBasket();
      orbs.sync(s.players.filter(x => x.connected), null);
    });
    sound.startMusic();
    panels.drawStatus({ title: 'The shop is opening…', lines: [{ text: 'Sunlight pours through the glass. Customers are on their way!' }], score: s.floristScore });
    atelier.setHint('');
  } else if (p === 'request') {
    if (from === 'lobby' || from === 'final' || !from) { fadeThrough(() => { world.setMood('day'); crowd.clear(); panels.hideSign(); }); }
    handedOver = false;
    bees.cancelAll();
    customers.leave();
    atelier.resetHolders();
    atelier.clearBasket();
    atelier.locked = false; atelier.canDeliver = false;
    if (s.customer) customers.arrive(s.customer);
    orbs.sync(s.players.filter(x => x.connected), s.customer?.id);
    panels.say(s.customer?.npc ? 'Good day! Hmm, what do I need…' : 'Hello! Just a moment, let me think…', { name: s.customer?.name, sub: custSub(s.customer), mood: 'think' });
    atelier.setHint('A customer is coming in…');
    sound.sfx('door');
    statusRound(s, `${s.customer?.name || 'Someone'} is choosing a request…`);
  } else if (p === 'arrange') {
    atelier.locked = false; atelier.canDeliver = true;
    if (!customers.current && s.customer) customers.arrive(s.customer);
    if (s.request) {
      panels.say(s.request.text, { name: s.customer?.name, sub: custSub(s.customer), crown: s.request.form === 'crown' });
      speak(s.request.text + (s.request.form === 'crown' ? ' A flower crown, please!' : ''), s.customer?.villager);
    }
    atelier.setHint(mode === 'xr' ? 'Arrange flowers, then hand it over!' : 'Arrange, then click the customer!');
    if (!from && s.bouquet?.stems?.length && !atelier.arr.stems.length) atelier.restore(s.bouquet);
    else net.send({ t: 'bouquet', b: atelier.netState() }); // sync anything arranged while the customer was choosing
    statusRound(s);
    lastTick = -1;
  } else if (p === 'judge') {
    atelier.canDeliver = false;
    hands.forceReleaseAll();
    bees.cancelAll();
    if (!handedOver) handOver();
    atelier.locked = true;
    panels.say('Hmm… let me see…', { name: s.customer?.name, sub: custSub(s.customer), mood: 'think' });
    atelier.setHint('');
    statusRound(s, 'The customer is deciding…');
  } else if (p === 'reveal') {
    const r = s.lastResult;
    if (r) {
      customers.showHearts(r.hearts);
      const quote = pickQ(r.hearts);
      panels.say(quote, { name: s.customer?.name, hearts: r.hearts });
      speak(quote, s.customer?.villager);
      sound.sfx(r.hearts >= 3 ? 'hearts' : 'sad');
      if (r.hearts >= 4) for (let i = 0; i < 3; i++) setTimeout(() => customers.react(['😍', '💐', '✨'][i]), i * 300);
      const lines = [
        { text: `“${r.request.text}”`, color: '#85738c' },
        { text: `Secret mood: ${r.request.tagLabels.join(' + ')}${r.request.form === 'crown' ? ' · 👑 crown' : ''}`, big: true },
        { row: ['Mood match', `${r.match}%  (+${r.moodPts})`] },
        ...r.craft.map(c => ({ row: [c[0], (c[1] >= 0 ? '+' : '') + c[1]] })),
        { row: ['Hearts ×2', '+' + r.hearts * 2] },
        { row: ['This order', String(r.floristPts)] },
      ];
      panels.drawStatus({ title: `Order ${r.round} of ${s.totalRounds}`, lines, score: r.floristScore });
    }
    atelier.setTimerText('');
  } else if (p === 'final') {
    fadeThrough(() => {
      world.setMood('evening');
      customers.leave();
      orbs.clear();
      atelier.resetHolders();
      atelier.clearBasket();
      panels.bubble.mesh.visible = false;
      crowd.sync(s.players, { withScores: true });
      crowd.cheer = true;
      if (s.final) panels.drawFinal(s.final, roomCode);
    });
    sound.sfx('fanfare');
    if (s.final) panels.drawStatus({ title: 'Closing time 🌙', lines: [{ text: s.final.title, big: true }, { text: `${s.final.stars} / 5 stars` }, { text: 'Ring the bell to play again!' }], score: s.floristScore });
    atelier.setTimerText('');
    atelier.setHint('');
  }
}

function refreshPhase(s) {
  if (s.phase === 'lobby') {
    crowd.sync(s.players);
    panels.drawLobby(roomCode, joinUrl(), s.players, true);
    statusLobby(s);
  } else if (['request', 'arrange'].includes(s.phase)) {
    orbs.sync(s.players.filter(x => x.connected), s.customer?.id);
  }
}

function statusLobby(s) {
  const n = s.players.filter(p => p.connected).length;
  panels.drawStatus({
    title: 'Before opening',
    lines: [
      { text: n ? `${n} villager${n > 1 ? 's are' : ' is'} waiting outside!` : 'No villagers yet. Share the code — or play solo with village regulars.', big: !!n },
      { text: 'Flower meanings are on the chalkboard. Practise a bouquet, then ring the bell 🔔 to open the shop.' },
      { text: mode === 'desktop' ? 'Click to use things · drag to look around.' : 'Grab: trigger, grip or pinch · Thumbstick ↑↓: counter height · Swat bees away!', color: '#9b85dc' },
    ],
  });
}

function statusRound(s, sub) {
  panels.drawStatus({
    title: `Order ${s.round} of ${s.totalRounds}`,
    timer: s.phase === 'arrange' ? fmt(s.timeLeft) : '',
    lines: sub ? [{ text: sub }] : [{ text: 'Grab stems · trim · wrap · ribbon' }, { text: 'Hand the bouquet to the customer or ring the bell 🔔' }],
    score: s.floristScore,
  });
}
const fmt = (ms) => { const sec = Math.ceil(ms / 1000); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; };

function deliverNow() {
  if (!S || S.phase !== 'arrange' || handedOver) return;
  if (!atelier.arr.stems.length) { sound.sfx('uh'); atelier.setHint('Add some flowers first!'); return; }
  hands.forceReleaseAll();
  handOver();
  net.send({ t: 'deliver' });
}

function handOver() {
  handedOver = true;
  atelier.canDeliver = false;
  const cust = customers.current;
  if (!atelier.arr.stems.length) { atelier.locked = true; return; }
  const form = atelier.arr.form;
  const g = atelier.takeFinished();
  atelier.locked = true;
  if (!cust) { atelier.poof(g); return; }
  const inner = cust.model.userData.inner;
  inner.attach(g);
  const target = form === 'crown' ? new THREE.Vector3(0, 1.08, 0) : new THREE.Vector3(0, 0.62, 0.26);
  const q = new THREE.Quaternion().setFromEuler(form === 'crown' ? new THREE.Euler(0, 0, 0) : new THREE.Euler(-0.25, 0, 0));
  atelier.tweenTo(g, target, q, form === 'crown' ? 1.7 : 1.15, 0.7, { arc: 0.15 });
  sound.sfx('sparkle');
}

function onFlower(f) {
  const o = orbs.get(f.owner);
  if (o) orbs.visit(f.owner, atelier.basketDropPoint(), () => atelier.addGift(f));
  else atelier.addGift(f);
}

function onReact(m) {
  if (m.customer && customers.current) { customers.react(m.e); return; }
  const o = orbs.get(m.from);
  if (o) { floaters.emoji(m.e, o.obj.position.clone().add(new THREE.Vector3(0, 0.12, 0)), { size: 0.16, rise: 0.35 }); return; }
  const cm = crowd.members.get(m.from);
  if (cm) floaters.emoji(m.e, cm.model.position.clone().add(new THREE.Vector3(0, 1.5, 0)), { size: 0.2, rise: 0.4 });
}

// ------------------------------------------------------------------ modes
async function setupButtons() {
  const vrBtn = $('#vrBtn'), arBtn = $('#arBtn');
  const xr = navigator.xr;
  let vrOk = false, arOk = false;
  if (xr) {
    try { vrOk = await xr.isSessionSupported('immersive-vr'); } catch {}
    try { arOk = await xr.isSessionSupported('immersive-ar'); } catch {}
  }
  if (vrOk) { vrBtn.disabled = false; vrBtn.textContent = 'Enter VR 🌸'; }
  else {
    vrBtn.textContent = 'VR not available here';
    $('#xrNote').textContent = location.protocol !== 'https:' && location.hostname !== 'localhost'
      ? 'WebXR needs HTTPS. Open this page via an https:// address on the headset.'
      : 'Open this page in the browser of a VR headset (e.g. Meta Quest) to play in VR.';
  }
  arBtn.hidden = !arOk;
  vrBtn.addEventListener('click', () => startXR('immersive-vr'));
  arBtn.addEventListener('click', () => startXR('immersive-ar'));
  $('#deskBtn').addEventListener('click', startDesktop);
  const closeRoom = () => { if (confirm('Close this atelier? Every villager will be sent back to the join screen.')) net.send({ t: 'close' }); };
  $('#exitBtn').addEventListener('click', closeRoom);
  $('#closeRoomBtn').addEventListener('click', closeRoom);
  $('#menuBtn').addEventListener('click', () => { $('#intro').hidden = false; mouse.enabled = false; mode = 'intro'; $('#help').hidden = true; });
  $('#fsBtn').addEventListener('click', () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.().catch(() => {}); });
  $('#soundBtn').addEventListener('click', () => {
    sound.start();
    sound.enabled = !sound.enabled;
    if (sound.enabled) sound.startMusic(); else sound.stopMusic();
    $('#soundBtn').textContent = sound.enabled ? '🔊' : '🔇';
  });
}

function startDesktop() {
  sound.start(); sound.startMusic();
  mode = 'desktop';
  if (S?.phase === 'lobby') statusLobby(S);
  $('#intro').hidden = true;
  $('#hud').hidden = false;
  $('#help').hidden = false;
  mouse.enabled = true;
  atelier.setHint('Click the flowers to practise!');
}

async function startXR(kind) {
  sound.start(); sound.startMusic();
  try {
    const session = await navigator.xr.requestSession(kind, { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] });
    renderer.xr.setFoveation?.(0.5);
    await renderer.xr.setSession(session);
    mode = 'xr';
    mouse.enabled = false;
    const isAR = kind === 'immersive-ar';
    world.setAR(isAR);
    renderer.setClearAlpha(isAR ? 0 : 1);
    scene.fog = isAR ? null : fogDefault;
    $('#intro').hidden = true;
    calibrateAt = performance.now() + 1200;
    atelier.setHint('Grab flowers from the buckets — practise!');
    session.addEventListener('end', () => {
      mode = 'intro';
      world.setAR(false);
      renderer.setClearAlpha(1);
      scene.fog = fogDefault;
      $('#intro').hidden = false;
      camera.position.set(0, 1.62, 0.3);
    });
  } catch (e) {
    console.error(e);
    $('#xrNote').textContent = 'Could not start the XR session: ' + e.message;
  }
}
const fogDefault = scene.fog;
let calibrateAt = 0;

// ------------------------------------------------------------------ loop
const camPos = new THREE.Vector3();
const MAXDT = parseFloat(params.get('maxdt')) || 0.05;
let lastNow = performance.now();
renderer.setAnimationLoop(() => {
  const now = performance.now();
  const rawDt = Math.min(0.5, (now - lastNow) / 1000);
  lastNow = now;
  const dt = Math.min(MAXDT, rawDt);
  if (mode !== 'xr') {
    mouse.applyCamera();
  }
  camera.getWorldPosition(camPos);
  if (mode === 'xr') {
    const xrCam = renderer.xr.getCamera();
    xrCam.getWorldPosition(camPos);
    if (calibrateAt && performance.now() > calibrateAt) {
      calibrateAt = 0;
      atelier.setHeight(THREE.MathUtils.clamp(camPos.y * 0.56, 0.62, 1.05));
    }
    const st = hands.sticks();
    if (st) atelier.setHeight(atelier.root.position.y - st * dt * 0.25);
  }
  world.update(dt);
  const handInfo = mode === 'xr' ? hands.update(dt) : [];
  if (mode === 'xr') updateHoverTip(); else hoverTip.visible = false;
  atelier.update(dt);
  customers.update(dt, camPos);
  crowd.update(dt, camPos);
  orbs.update(dt);
  bees.update(dt, handInfo);
  floaters.update(dt);
  updateFade(rawDt);

  // countdown
  if (S && (S.phase === 'arrange' || S.phase === 'request' || S.phase === 'judge')) {
    const left = Math.max(0, deadline - performance.now());
    const secs = Math.ceil(left / 1000);
    if (S.phase === 'arrange') {
      atelier.setTimerText(fmt(left), left < 10000);
      if (secs !== lastTick) {
        lastTick = secs;
        if (secs <= 10 && secs > 0) sound.sfx('tick');
        panels.drawStatus({ ...panels.statusArgs, timer: fmt(left), urgent: left < 10000 });
      }
    } else atelier.setTimerText(secs ? String(secs) : '');
  }
  sendPose(now);
  renderer.render(scene, camera);
});

// ------------------------------------------------------------------ pose for the phones' live view
// ~12 times a second, only while someone is watching: head, hands, what each hand holds.
let lastPose = 0;
const pq = new THREE.Quaternion(), pp = new THREE.Vector3();
const r3 = (n) => Math.round(n * 1000) / 1000;
const packPose = (obj) => { obj.getWorldPosition(pp); obj.getWorldQuaternion(pq); return [pp.x, pp.y, pp.z, pq.x, pq.y, pq.z, pq.w].map(r3); };
function heldInfo(held) {
  if (!held) return null;
  switch (held.type) {
    case 'stem': { const st = held.stem; return { t: 'stem', k: st.k, petal: st.hybrid?.petal, glow: st.hybrid?.glowColor }; }
    case 'scissors': return { t: 'scissors' };
    case 'paper': return { t: 'paper', key: held.key };
    case 'ribbon': return { t: 'ribbon', key: held.key };
    case 'arrangement': return { t: 'arr' };
    default: return null;
  }
}
function sendPose(now) {
  if (!S?.watchers || now - lastPose < 80 || mode === 'intro') return;
  lastPose = now;
  const head = mode === 'xr' ? renderer.xr.getCamera() : camera;
  const msg = { t: 'pose', h: packPose(head), ch: r3(atelier.root.position.y), hands: null, a: null };
  if (mode === 'xr') {
    msg.hands = hands.hands.map(h => h.source ? { p: packPose(h.hold), held: heldInfo(h.held) } : null);
    const holding = hands.hands.find(h => h.held?.type === 'arrangement' && !h.held.delivered);
    if (holding) msg.a = packPose(holding.held.obj);
  }
  net.send(msg);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// fonts → redraw canvas text
document.fonts?.load('600 40px Fredoka').then(() => document.fonts.load('700 40px Nunito')).then(() => {
  panels.redrawAll();
  atelier.redrawLabels();
}).catch(() => {});
panels.drawChalk();
panels.drawLobby('', joinUrl(), [], false);
statusLobby({ players: [] });
setupButtons();

// debugging hooks (used by automated tests)
window.__ab = { renderer, scene, camera, atelier, panels, customers, bees, orbs, interactor, mouse, net, get state() { return S; }, startDesktop, startXR, hands, world };
if (params.has('desktop')) startDesktop();

import { Net } from '../net.js';
import { SoundBoard } from '../audio.js';
import { Greenhouse } from './greenhouse.js';
import { villagerSVG, stemIcon, heartsSVG, starsSVG, flowerSVG } from '../art.js';
import { VILLAGERS, VILLAGER_KINDS, PAPERS, RIBBONS, REACTIONS, FLOWERS, TAGS, FLOWER_KINDS } from '../shared/data.js';

const $ = (s) => document.querySelector(s);
const screen = $('#screen');
const dock = $('#dock');
const ghRoot = $('#greenhouse');
const sound = new SoundBoard();
const sfx = (n) => { if (soundOn) sound.sfx(n); };
let soundOn = localStorage.getItem('ab_sound') !== 'off';

let S = null;          // latest public state
let me = null;         // private state
let joined = false;
let myId = null;
let lastKey = '';
let deadline = 0, phaseTotal = 1;
let myHearts = 0;
let myVillager = localStorage.getItem('ab_villager') || 'fairy';

const params = new URLSearchParams(location.search);
let savedCode = (params.get('code') || localStorage.getItem('ab_code') || '').toUpperCase();
const savedToken = localStorage.getItem('ab_token');

// ------------------------------------------------------------------ networking
const net = new Net(onMessage, (st) => {
  $('#conn').hidden = st === 'open' || !joined;
});

function onMessage(m) {
  switch (m.t) {
    case 'joined':
      joined = true; myId = m.id;
      localStorage.setItem('ab_token', m.token);
      localStorage.setItem('ab_code', m.code);
      localStorage.setItem('ab_villager', m.villager);
      myVillager = m.villager;
      net.hello = () => ({ t: 'join', code: m.code, token: m.token });
      $('#topbar').hidden = false;
      $('#myCode').textContent = m.code;
      $('#myName').textContent = m.name;
      $('#myPortrait').innerHTML = villagerSVG(m.villager, 40);
      lastKey = '';
      break;
    case 'closed':
      leaveRoom(m.reason || 'The atelier has closed.');
      break;
    case 'error':
      if (joined && m.gone) leaveRoom('The atelier has closed.');
      else if (!joined) {
        localStorage.removeItem('ab_token');
        showJoin(m.error);
      } else toast(m.error);
      break;
    case 'state':
      S = m; me = m.me || null;
      watchView?.onState(m);
      if (joined) render();
      break;
    case 'bouquet':
      if (S) { S.bouquet = m.bouquet; updateBouquets(); }
      watchView?.onBouquet(m.bouquet);
      break;
    case 'pose':
      watchView?.onPose(m);
      break;
    case 'toast':
      toast(m.text);
      break;
  }
}

// ------------------------------------------------------------------ join screen
async function showJoin(error = '') {
  $('#topbar').hidden = true;
  $('#timer').hidden = true;
  ghRoot.hidden = true;
  dock.innerHTML = '';
  const name = localStorage.getItem('ab_name') || '';
  screen.innerHTML = `
    <h1 class="title center">Atelier &amp; Bloom<small>a cozy floral party game</small></h1>
    <div class="card" style="display:flex;flex-direction:column;gap:14px">
      ${error ? `<div class="tag" style="background:#fde2e8;border-color:#f2a7b8">${error}</div>` : ''}
      <label class="field">Atelier code
        <input class="text code-input" id="codeIn" maxlength="4" autocomplete="off" autocapitalize="characters" value="${savedCode}" placeholder="ABCD">
      </label>
      <div class="room-chips" id="roomChips"></div>
      <label class="field">Your name
        <input class="text" id="nameIn" maxlength="14" autocomplete="off" value="${name}" placeholder="e.g. Mira">
      </label>
      <div class="field" style="font-weight:800;font-size:.9rem">Choose your villager</div>
      <div class="villagers">${VILLAGER_KINDS.map(v => `<button class="villager ${v === myVillager ? 'sel' : ''}" data-v="${v}">${villagerSVG(v, 54)}${VILLAGERS[v].name}</button>`).join('')}</div>
      <button class="btn big" id="joinBtn">Enter the atelier 🌸</button>
    </div>
    <p class="center muted" style="font-size:.85rem">One friend wears the VR headset and plays the Florist. Everyone else joins here!</p>`;
  screen.querySelectorAll('.villager').forEach(b => b.addEventListener('click', () => {
    myVillager = b.dataset.v; sfx('click');
    screen.querySelectorAll('.villager').forEach(x => x.classList.toggle('sel', x === b));
  }));
  $('#joinBtn').addEventListener('click', doJoin);
  $('#nameIn').addEventListener('keydown', (e) => { if (e.key === 'Enter') doJoin(); });
  try {
    const rooms = await (await fetch('/api/rooms')).json();
    rooms.sort((a, b) => a.age - b.age);
    if (rooms.length && !$('#codeIn').value) $('#codeIn').value = rooms[0].code;
    if (rooms.length > 1) {
      $('#roomChips').innerHTML = `<span class="muted" style="width:100%;text-align:center;font-size:.8rem">Open ateliers:</span>` +
        rooms.slice(0, 6).map(r => `<button class="room-chip" data-c="${r.code}">${r.code}</button>`).join('');
      $('#roomChips').querySelectorAll('button').forEach(b => b.addEventListener('click', () => { $('#codeIn').value = b.dataset.c; }));
    }
  } catch {}
}

function doJoin() {
  const code = $('#codeIn').value.trim().toUpperCase();
  const name = $('#nameIn').value.trim();
  if (code.length !== 4) return toast('Enter the 4-letter code shown in the shop');
  if (!name) return toast('What should the villagers call you?');
  localStorage.setItem('ab_name', name);
  sound.start();
  goFullscreen();
  net.hello = null;
  net.send({ t: 'join', code, name, villager: myVillager });
}

// ------------------------------------------------------------------ live atelier view (👀)
// The 3D code is only downloaded the first time someone opens the view.
let watchView = null;
let watchOpen = false;
async function openWatch() {
  if (watchOpen) return;
  watchOpen = true;
  $('#watch').hidden = false;
  document.body.classList.add('watching');
  net.send({ t: 'watch', on: true });
  try {
    if (!watchView) {
      $('#watchLoading').hidden = false;
      const { AtelierView } = await import('/js/watch/view.js');
      watchView = new AtelierView($('#watchCanvas'));
      window.__watch = watchView; // debugging hook (automated tests)
      if (S) watchView.onState(S);
    }
    $('#watchLoading').hidden = true;
    if (watchOpen) watchView.start();
  } catch (e) {
    console.error(e);
    closeWatch();
    toast('Could not open the live view on this phone');
  }
}
function closeWatch() {
  if (!watchOpen) return;
  watchOpen = false;
  watchView?.stop();
  $('#watch').hidden = true;
  $('#watch').classList.remove('big');
  document.body.classList.remove('watching');
  net.send({ t: 'watch', on: false });
}
$('#watchBtn').addEventListener('click', () => { sfx('click'); if (watchOpen) closeWatch(); else openWatch(); });
$('#watchClose').addEventListener('click', closeWatch);
$('#watchBig').addEventListener('click', () => { $('#watch').classList.toggle('big'); watchView?.resize(); });
addEventListener('resize', () => watchView?.resize());
// stop drawing (and tell the florist to stop sending poses) while the phone is locked or in another app
document.addEventListener('visibilitychange', () => {
  if (!watchOpen || !watchView) return;
  if (document.hidden) { watchView.stop(); net.send({ t: 'watch', on: false }); }
  else { net.send({ t: 'watch', on: true }); watchView.start(); }
});

// Forget the current room and go back to the join screen.
function leaveRoom(message = '') {
  closeWatch();
  joined = false; myId = null; S = null; me = null; lastKey = '';
  net.hello = null;
  localStorage.removeItem('ab_token');
  localStorage.removeItem('ab_code');
  savedCode = '';
  if (params.has('code')) history.replaceState(null, '', location.pathname);
  $('#conn').hidden = true;
  showJoin(message);
}
$('#exitBtn').addEventListener('click', () => {
  if (!confirm('Leave this atelier?')) return;
  net.send({ t: 'leave' });
  leaveRoom();
});

function goFullscreen() {
  const el = document.documentElement;
  if (document.fullscreenElement || !el.requestFullscreen) return;
  el.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
}
if (!document.documentElement.requestFullscreen) $('#fsBtn').style.display = 'none';
$('#fsBtn').addEventListener('click', () => {
  if (document.fullscreenElement) document.exitFullscreen(); else goFullscreen();
});
$('#soundBtn').addEventListener('click', () => {
  soundOn = !soundOn; localStorage.setItem('ab_sound', soundOn ? 'on' : 'off');
  $('#soundBtn').textContent = soundOn ? '🔊' : '🔇';
  sound.start();
});
$('#soundBtn').textContent = soundOn ? '🔊' : '🔇';
document.addEventListener('pointerdown', () => sound.start(), { once: true });

// ------------------------------------------------------------------ greenhouse
const greenhouse = new Greenhouse(ghRoot, {
  sfx,
  onSend: (a, b) => {
    if (!S || !['lobby', 'request', 'arrange'].includes(S.phase)) { toast('The atelier is closed for a moment — try again soon!'); return false; }
    net.send({ t: 'grow', a, b });
    return true;
  },
});

// ------------------------------------------------------------------ render
function render() {
  const p = S.phase;
  const isCust = !!me?.isCustomer;
  const lobbyish = p === 'lobby' || p === 'opening';
  const key = [p, isCust, S.round, !!S.request, me?.isLeader, lobbyish ? S.players.map(x => x.id + x.connected + x.leader).join(',') : '', lobbyish ? S.hostConnected : ''].join('|');
  $('#myScore').textContent = `${me?.score ?? 0} pts`;
  setTimer(S.timeLeft, p);
  if (key !== lastKey) {
    lastKey = key;
    myHearts = 0;
    screen.innerHTML = '';
    dock.innerHTML = '';
    const fn = SCREENS[p] || SCREENS.lobby;
    fn(isCust);
  } else {
    updateDynamic();
  }
  updateBouquets();
  updateBee();
  let warn = document.getElementById('hostWarn');
  const needWarn = !S.hostConnected && p !== 'lobby';
  if (needWarn && !warn) {
    warn = document.createElement('div'); warn.id = 'hostWarn'; warn.className = 'card center';
    warn.style.cssText = 'background:#fde2e8;font-weight:800;margin-bottom:10px';
    warn.textContent = 'The florist lost connection… if they’re not back within 30 seconds, the atelier will close.';
    screen.prepend(warn);
  } else if (!needWarn && warn) warn.remove();
  // greenhouse availability
  const gardenPhase = ['lobby', 'request', 'arrange'].includes(p);
  ghRoot.hidden = !(gardenPhase && !(isCust && p !== 'lobby'));
  greenhouse.setEnabled(gardenPhase, '');
}

const PHASE_TOTAL = { request: 15000, arrange: 75000, judge: 15000, reveal: 8000, opening: 3500 };
function setTimer(ms, phase) {
  const show = ms > 0 && phase !== 'opening';
  $('#timer').hidden = !show;
  deadline = performance.now() + ms;
  phaseTotal = Math.max(ms, PHASE_TOTAL[phase] || ms || 1);
}
(function timerLoop() {
  const left = Math.max(0, deadline - performance.now());
  $('#timerFill').style.transform = `scaleX(${left / phaseTotal})`;
  $('#timer').classList.toggle('low', left < 10000);
  const t = document.getElementById('secs');
  if (t) t.textContent = Math.ceil(left / 1000);
  requestAnimationFrame(timerLoop);
})();

function playersHTML() {
  return `<div class="players">${S.players.map(p => `<div class="pl ${p.connected ? '' : 'off'}"><div class="portrait">${villagerSVG(p.villager, 60)}${p.leader ? '<span class="crown">👑</span>' : ''}</div><span>${esc(p.name)}</span></div>`).join('')}</div>`;
}
function custHead(sub) {
  const c = S.customer;
  if (!c) return '';
  return `<div class="order-head"><div class="portrait">${villagerSVG(c.villager, 58)}</div><div><b class="display" style="font-size:1.1rem">${esc(c.name)}${c.npc ? ' <span class="tag">villager</span>' : ''}</b><div class="muted" style="font-size:.85rem">${VILLAGERS[c.villager]?.name || ''} ${sub || ''}</div></div></div>`;
}
function requestHTML() {
  if (!S.request) return '';
  return `<p class="quote">${esc(S.request.text)}</p>${S.request.form === 'crown' ? '<div style="margin-top:6px"><span class="tag" style="background:#fff3c4">👑 Wants a flower crown</span></div>' : ''}`;
}
function bouquetBlock(title = 'The florist is arranging…') {
  return `<div><div class="row between"><b class="display">${title}</b><span class="muted" id="secsWrap"><span id="secs"></span>s</span></div><div class="bouquet" data-bq></div><div class="bq-extra" data-bqx></div></div>`;
}
function reactRow(big = false) {
  return `<div class="react-row ${big ? 'big' : ''}">${REACTIONS.map(e => `<button data-e="${e}">${e}</button>`).join('')}</div>`;
}
function wireReactions(root = document) {
  root.querySelectorAll('.react-row button').forEach(b => b.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    net.send({ t: 'react', e: b.dataset.e });
    floatEmoji(b.dataset.e, e.clientX, e.clientY);
    if (navigator.vibrate) try { navigator.vibrate(12); } catch {}
  }));
}

const SCREENS = {
  lobby() {
    const leader = me?.isLeader;
    screen.innerHTML = `
      <div class="card center">
        <h2 style="margin:4px 0">You're in the village! 🌷</h2>
        <p class="lead">${S.hostConnected ? 'The florist is warming up in the atelier.' : 'Waiting for the florist to open the atelier…'}</p>
      </div>
      <div class="card">${playersHTML()}</div>
      ${leader ? `<button class="btn big mint pulse" id="startBtn">Open the shop! 🔔</button><p class="center muted" style="margin:-4px 0 0;font-size:.85rem">You're the party leader — start when everyone's in (the florist can start too).</p>` : `<p class="center muted">Waiting for the party leader 👑 or the florist to open the shop…</p>`}
      <div class="card"><b class="display">How to play</b>
        <ul style="margin:6px 0 0;padding-left:18px;line-height:1.45">
          <li>Each round one villager is the <b>Customer</b> and picks a heartfelt request.</li>
          <li>Everyone else is a <b>Garden Sprite</b>: grow glowing hybrid flowers and send them to the florist. Used flowers = points!</li>
          <li>Feeling cheeky? Send a 🐝 to steal a stem from the bouquet (+2) — unless the florist shoos it!</li>
          <li>The customer rates the bouquet with hearts. Flowers have meanings — choose wisely!</li>
        </ul>
      </div>`;
    $('#startBtn')?.addEventListener('click', () => { sfx('bell'); net.send({ t: 'start' }); });
    dock.innerHTML = `<div class="card" style="margin-top:12px"><div class="muted" style="font-size:.85rem;margin-bottom:6px">Say hi to the florist:</div>${reactRow()}</div>`;
    wireReactions(dock);
  },
  opening() {
    screen.innerHTML = `<div class="card center" style="margin-top:30px"><h2>The atelier opens its doors… 🌸</h2><p class="lead">Sunlight pours through the greenhouse glass.</p>${playersHTML()}</div>`;
  },
  request(isCust) {
    if (isCust) {
      const opts = me.options || [];
      screen.innerHTML = `
        <div class="card">${custHead('— that\'s you!')}<p class="lead" style="margin-top:10px">You step into the atelier. What do you need today?</p></div>
        ${opts.map((o, i) => `<button class="request-card" data-id="${o.id}">${o.form === 'crown' ? '<span class="badge tag" style="background:#fff3c4">👑 crown</span>' : ''}“${esc(o.text)}”</button>`).join('')}
        <button class="request-card own" id="ownBtn">✏️ Write my own…</button>
        <p class="center muted" style="font-size:.85rem">Only you get to choose! <span id="secs"></span>s</p>`;
      screen.querySelectorAll('.request-card[data-id]').forEach(b => b.addEventListener('click', () => {
        sfx('door'); net.send({ t: 'pickRequest', id: b.dataset.id });
        screen.querySelectorAll('.request-card').forEach(x => x.disabled = true); b.style.outline = '3px solid var(--rose)';
      }));
      $('#ownBtn').addEventListener('click', () => { sfx('click'); net.send({ t: 'writing' }); showCustomRequest(); });
    } else {
      screen.innerHTML = `<div class="card">${custHead('is at the counter…')}<p class="lead" style="margin-top:10px">…deciding what to ask for. <span class="muted">(<span id="secs"></span>s)</span></p></div>
        <p class="center muted" style="margin:0;font-size:.9rem">Start growing now — get a head start! 🌱</p>`;
    }
  },
  arrange(isCust) {
    if (isCust) {
      screen.innerHTML = `
        <div class="card">${custHead('— your order')}<div style="margin-top:8px">${requestHTML()}</div></div>
        <div class="card">${bouquetBlock('Your bouquet so far…')}</div>
        <div class="card"><b class="display">React live! The florist sees it 👀</b><div style="margin-top:8px">${reactRow(true)}</div></div>`;
      wireReactions(screen);
    } else {
      screen.innerHTML = `
        <div class="card compact">${custHead('asks:')}<div style="margin-top:6px">${requestHTML()}</div>
          <div class="row between" style="margin-top:10px"><b class="display" style="font-size:.95rem">The florist's bouquet</b><span class="muted" style="font-size:.85rem"><span id="secs"></span>s</span></div>
          <div class="bouquet small" data-bq></div><div class="bq-extra" data-bqx></div>
        </div>`;
      dock.innerHTML = `<div class="card" style="margin-top:12px">${reactRow()}</div>
        <button class="fab-bee" id="beeBtn" aria-label="Send a cheeky bee"><span class="ring" id="beeCd"></span><span class="ico">🐝</span><span class="lbl" id="beeLbl">Bee!</span></button>`;
      $('#beeBtn').addEventListener('click', () => { if (me && me.beeReadyIn <= 0 && !me.beeActive) { sfx('pop'); net.send({ t: 'bee' }); me.beeActive = true; updateBee(); if (navigator.vibrate) try { navigator.vibrate([20, 40, 20]); } catch {} } });
      wireReactions(dock);
    }
  },
  judge(isCust) {
    if (isCust) {
      screen.innerHTML = `
        <div class="card center"><h2 style="margin:2px 0 6px">Your bouquet is ready! 💐</h2>${requestHTML()}</div>
        <div class="card"><div class="bouquet" data-bq></div><div class="bq-extra" data-bqx></div></div>
        <div class="card center"><b class="display" style="font-size:1.15rem">How well does it say what you wanted?</b>
          <div class="heart-row" id="heartRow" style="margin:10px 0">${[1, 2, 3, 4, 5].map(i => `<button data-h="${i}">${heartSVGOne()}</button>`).join('')}</div>
          <button class="btn big" id="rateBtn" disabled>Give hearts</button>
          <p class="muted" style="font-size:.85rem;margin:8px 0 0"><span id="secs"></span>s left</p>
        </div>`;
      const btns = screen.querySelectorAll('#heartRow button');
      btns.forEach(b => b.addEventListener('click', () => {
        myHearts = +b.dataset.h; sfx('pop');
        btns.forEach(x => x.classList.toggle('on', +x.dataset.h <= myHearts));
        $('#rateBtn').disabled = false;
      }));
      $('#rateBtn').addEventListener('click', () => { if (myHearts) { sfx('hearts'); net.send({ t: 'rate', hearts: myHearts }); $('#rateBtn').disabled = true; $('#rateBtn').textContent = 'Sent! 💕'; } });
    } else {
      screen.innerHTML = `
        <div class="card">${custHead('is inspecting the bouquet…')}<div style="margin-top:8px">${requestHTML()}</div></div>
        <div class="card"><div class="bouquet" data-bq></div><div class="bq-extra" data-bqx></div></div>
        <div class="card center"><b class="display">Hmm… what will they think?</b><div style="margin-top:8px">${reactRow(true)}</div></div>`;
      wireReactions(screen);
    }
  },
  reveal() {
    const r = S.lastResult;
    if (!r) return;
    const mine = r.gains.find(g => g.id === myId);
    sfx(r.hearts >= 3 ? 'hearts' : 'sad');
    screen.innerHTML = `
      <div class="card center">
        <div class="muted" style="font-weight:800">Order ${r.round} • ${esc(r.customer?.name || '')}</div>
        <div style="margin:6px 0">${heartsSVG(r.hearts, 5, 34)}</div>
        <div class="result-big">${r.match}% <span style="font-size:1.1rem;color:var(--ink-soft)">mood match</span></div>
        <div style="margin-top:8px">Secret mood: ${r.request.tagLabels.map(t => `<span class="tag">${t}</span>`).join(' ')}${r.request.form === 'crown' ? ' <span class="tag">👑 crown</span>' : ''}</div>
      </div>
      <div class="card"><div class="bouquet" data-bq-static>${bqStemsHTML(r.bouquet)}</div>
        <ul class="breakdown">
          <li><span>Mood match</span><b>+${r.moodPts}</b></li>
          ${r.craft.map(c => `<li><span>${c[0]}</span><b>${c[1] >= 0 ? '+' : ''}${c[1]}</b></li>`).join('')}
          <li><span>Customer hearts ×2</span><b>+${r.hearts * 2}</b></li>
          <li><span><b>Florist earns</b></span><b>${r.floristPts}</b></li>
        </ul>
      </div>
      ${mine ? `<div class="card center"><b class="display" style="font-size:1.3rem;color:var(--mint-deep)">You earned +${mine.pts}! 🌟</b></div>` : ''}
      ${r.gains.length && !mine ? `<div class="card center muted">${r.gains.map(g => `${esc(g.name)} +${g.pts}`).join(' • ')}</div>` : ''}`;
  },
  final() {
    const f = S.final;
    if (!f) return;
    sfx('fanfare');
    const myRank = f.ranked.findIndex(p => p.id === myId) + 1;
    screen.innerHTML = `
      <div class="card center">
        <div class="muted" style="font-weight:800">Closing time 🌙</div>
        <h2 style="margin:6px 0">${esc(f.title)}</h2>
        ${starsSVG(f.stars, 5, 36)}
        <p class="muted" style="margin:6px 0 0">The florist earned ${f.floristScore} points (${f.avg} per order)</p>
      </div>
      <div class="card"><b class="display">Villagers of the day</b>
        <ol class="leader">${f.ranked.map((p, i) => `<li>${i === 0 ? '🏆' : i + 1 + '.'} ${villagerSVG(p.villager, 40)} ${esc(p.name)} <span class="pts">${p.score}</span></li>`).join('')}</ol>
        ${myRank ? `<p class="center" style="margin:8px 0 0">You placed <b>#${myRank}</b>!</p>` : ''}
      </div>
      ${f.awards.length ? `<div class="card"><b class="display">Awards</b>${f.awards.map(a => `<div class="award">🏅 <div><b>${a.title}</b> — ${esc(a.who)}<div class="muted" style="font-size:.85rem">${a.why}</div></div></div>`).join('')}</div>` : ''}
      ${me?.isLeader ? `<button class="btn big mint" id="againBtn">Play again 🌸</button>` : '<p class="center muted">Thanks for visiting the atelier!</p>'}`;
    $('#againBtn')?.addEventListener('click', () => net.send({ t: 'again' }));
  },
};

// ------------------------------------------------------------------ write-your-own request
// Words that hint at a mood, used to pre-select the secret mood while the customer types.
const MOOD_WORDS = {
  love: ['love', 'crush', 'date', 'valentine', 'romant', 'kiss', 'propos', 'wedding', 'heart', 'darling', 'sweetheart'],
  sorry: ['sorry', 'apolog', 'forgive', 'mistake', 'fight', 'argu', 'oops', 'regret', 'make up'],
  joy: ['happy', 'birthday', 'party', 'celebrat', 'cheer', 'fun', 'congrat', 'sunny', 'bright', 'smile', 'win'],
  calm: ['calm', 'relax', 'sleep', 'peace', 'stress', 'rest', 'quiet', 'gentle', 'cozy', 'cosy', 'sick', 'get well'],
  friendship: ['friend', 'buddy', 'pal', 'thank', 'neighbo', 'team', 'together', 'bestie'],
  memory: ['miss', 'memor', 'remember', 'goodbye', 'farewell', 'moving', 'grandma', 'grandpa', 'funeral', 'away', 'old times'],
  magic: ['magic', 'witch', 'wizard', 'fairy', 'moon', 'star', 'spell', 'enchant', 'dream', 'myst', 'dragon', 'unicorn'],
};
function guessMoods(text) {
  const t = text.toLowerCase();
  return Object.entries(MOOD_WORDS)
    .map(([tag, words]) => [tag, words.filter(w => t.includes(w)).length])
    .filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([tag]) => tag);
}

function showCustomRequest() {
  let moods = [];
  let touched = false; // once the customer picks moods themselves, stop guessing
  let crown = false;
  screen.innerHTML = `
    <div class="card" style="display:flex;flex-direction:column;gap:12px">
      ${custHead('— that\'s you!')}
      <label class="field">What would you like?
        <textarea class="text" id="customText" maxlength="90" rows="3" placeholder="e.g. Something cozy for my grandma's birthday"></textarea>
      </label>
      <div class="char-count muted"><span id="charCount">0</span>/90</div>
      <div class="field" style="font-weight:800;font-size:.9rem">Secret mood <span class="muted" style="font-weight:600">(pick 1–2 · the florist has to guess it!)</span></div>
      <div class="mood-chips" id="moodChips">${Object.entries(TAGS).map(([k, t]) => `<button class="mood-chip" data-t="${k}"><span class="dot" style="background:${t.color}"></span>${t.label}</button>`).join('')}</div>
      <div class="mood-chips"><button class="mood-chip" id="crownChip">👑 Make it a flower crown</button></div>
      <div class="custom-actions">
        <button class="btn ghost" id="backBtn">← Back</button>
        <button class="btn mint" id="sendOwnBtn">Order it 🌸</button>
      </div>
      <p class="center muted" style="margin:0;font-size:.85rem"><span id="secs"></span>s left</p>
    </div>`;
  const input = $('#customText');
  const paint = () => screen.querySelectorAll('#moodChips .mood-chip').forEach(c => c.classList.toggle('sel', moods.includes(c.dataset.t)));
  input.addEventListener('input', () => {
    $('#charCount').textContent = input.value.length;
    if (!touched) { moods = guessMoods(input.value); paint(); }
  });
  screen.querySelectorAll('#moodChips .mood-chip').forEach(c => c.addEventListener('click', () => {
    touched = true; sfx('click');
    const t = c.dataset.t;
    if (moods.includes(t)) moods = moods.filter(x => x !== t);
    else moods = [...moods, t].slice(-2); // keep the two most recent picks
    paint();
  }));
  $('#crownChip').addEventListener('click', () => { crown = !crown; sfx('click'); $('#crownChip').classList.toggle('sel', crown); });
  $('#backBtn').addEventListener('click', () => { sfx('click'); SCREENS.request(true); updateDynamic(); });
  $('#sendOwnBtn').addEventListener('click', () => {
    const text = input.value.trim();
    if (text.length < 3) return toast('Tell the florist a little more!');
    if (!moods.length) return toast('Pick a secret mood so the florist has something to guess');
    sfx('door');
    net.send({ t: 'customRequest', text, tags: moods, crown });
    $('#sendOwnBtn').disabled = true; $('#sendOwnBtn').textContent = 'Sent! 💐';
  });
  setTimeout(() => input.focus(), 50);
  updateDynamic();
}

function heartSVGOne() {
  return `<svg viewBox="0 0 24 24"><path d="M12 21s-7.5-4.6-9.6-9.3C.9 8.3 3 4.5 6.6 4.5c2.2 0 3.8 1.3 5.4 3.1 1.6-1.8 3.2-3.1 5.4-3.1 3.6 0 5.7 3.8 4.2 7.2C19.5 16.4 12 21 12 21z" fill="#eadde3"/></svg>`;
}

function bqStemsHTML(b) {
  if (!b || !b.stems.length) return '<span class="empty">No flowers yet…</span>';
  return b.stems.map(s => `<div class="stem ${s.owner === myId ? 'mine' : ''}">${stemIcon(s, 40)}${s.hybrid ? `<span class="own">${s.owner === myId ? 'yours!' : esc(s.ownerName)}</span>` : ''}</div>`).join('');
}
function bqExtraHTML(b) {
  if (!b) return '';
  const x = [];
  if (b.form === 'crown') x.push('<span class="tag" style="background:#fff3c4">👑 Flower crown</span>');
  // a colour dot keeps the label readable on dark or very bright papers
  const dot = (c) => `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${c};border:1px solid rgba(0,0,0,.15);margin-right:5px;vertical-align:-1px"></span>`;
  if (b.wrap && PAPERS[b.wrap]) x.push(`<span class="tag">${dot(PAPERS[b.wrap].color)}${PAPERS[b.wrap].name}</span>`);
  if (b.ribbon && RIBBONS[b.ribbon]) x.push(`<span class="tag">${dot(RIBBONS[b.ribbon].color)}🎀 ${RIBBONS[b.ribbon].name}</span>`);
  if (b.snips) x.push(`<span class="tag">✂️ ${b.snips} trim${b.snips > 1 ? 's' : ''}</span>`);
  return x.join('');
}
function updateBouquets() {
  if (!S) return;
  document.querySelectorAll('[data-bq]').forEach(el => { el.innerHTML = bqStemsHTML(S.bouquet); });
  document.querySelectorAll('[data-bqx]').forEach(el => { el.innerHTML = bqExtraHTML(S.bouquet); });
}
function updateDynamic() {
  // players list may change in lobby (handled by key), nothing else needed for now
}
let beeTimer = null;
function updateBee() {
  const btn = $('#beeBtn'); if (!btn || !me) return;
  clearInterval(beeTimer);
  const readyAt = performance.now() + me.beeReadyIn;
  const draw = () => {
    const left = Math.max(0, readyAt - performance.now());
    const cd = $('#beeCd'); if (!cd) return clearInterval(beeTimer);
    const frac = me.beeActive ? 1 : Math.min(1, left / 22000);
    cd.style.setProperty('--p', (1 - frac) * 360 + 'deg');
    const ready = !me.beeActive && left <= 0;
    btn.classList.toggle('ready', ready);
    btn.disabled = !ready;
    $('#beeLbl').textContent = me.beeActive ? 'buzzing' : left > 0 ? Math.ceil(left / 1000) + 's' : 'Bee!';
  };
  draw();
  beeTimer = setInterval(draw, 250);
}

// ------------------------------------------------------------------ bits
function toast(text) {
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = text;
  $('#toasts').appendChild(t);
  setTimeout(() => { t.style.transition = 'opacity .4s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 400); }, 2600);
  while ($('#toasts').children.length > 3) $('#toasts').firstChild.remove();
}
function floatEmoji(e, x, y) {
  const d = document.createElement('div');
  d.className = 'floatEmoji'; d.textContent = e;
  d.style.left = (x - 20) + 'px'; d.style.top = (y - 30) + 'px';
  document.body.appendChild(d);
  setTimeout(() => d.remove(), 1200);
}
function esc(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

// ------------------------------------------------------------------ boot
const urlCode = (params.get('code') || '').toUpperCase();
if (savedToken && savedCode && (!urlCode || urlCode === localStorage.getItem('ab_code'))) {
  net.hello = { t: 'join', code: savedCode, token: savedToken };
  screen.innerHTML = `<div class="card center" style="margin-top:40px"><h2>Finding your atelier…</h2></div>`;
  setTimeout(() => { if (!joined) { net.hello = null; showJoin(); } }, 3500);
} else {
  showJoin();
}

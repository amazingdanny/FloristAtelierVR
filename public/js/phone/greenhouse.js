// The Garden Sprite mini-game: cross-breed two seeds, water + prune the sprout, send the glowing bloom.
import { FLOWERS, FLOWER_KINDS, TAGS, makeHybrid } from '../shared/data.js';
import { flowerSVG } from '../art.js';

const WEED_SVG = `<svg viewBox="0 0 54 54"><path d="M27 50 q-2 -14 -12 -22 q10 2 12 12 q2 -14 14 -20 q-8 10 -10 30z" fill="#7fae5a"/><path d="M27 50 q-6 -8 -16 -8 q8 -4 16 4z" fill="#97c46f"/><circle cx="27" cy="50" r="3" fill="#8a6a4a"/></svg>`;
const LEAF_SVG = `<svg viewBox="0 0 54 54"><path d="M10 40 q6 -26 34 -28 q-2 28 -34 28z" fill="#c9915a"/><path d="M12 39 q14 -12 30 -25" stroke="#8a5a30" stroke-width="2" fill="none"/></svg>`;
const SNAIL_SVG = `<svg viewBox="0 0 54 54"><path d="M8 42 h34 q6 0 6 -6" stroke="#c9b18a" stroke-width="6" stroke-linecap="round" fill="none"/><circle cx="24" cy="30" r="12" fill="#e7b38a"/><path d="M24 30 m-6 0 a6 6 0 1 0 6 -6 a3 3 0 1 0 3 3" stroke="#a5704a" stroke-width="2" fill="none"/><path d="M44 34 l2 -8 M47 35 l4 -6" stroke="#c9b18a" stroke-width="2"/></svg>`;

export class Greenhouse {
  constructor(root, { onSend, sfx }) {
    this.root = root;
    this.onSend = onSend;
    this.sfx = sfx || (() => {});
    this.a = null; this.b = null;
    this.mode = 'pick';
    this.enabled = true;
    this.growth = 0; this.moist = 50; this.weeds = []; this.nextWeed = 2;
    this.build();
  }

  build() {
    const seedBtns = FLOWER_KINDS.map(k => {
      const F = FLOWERS[k], T = TAGS[F.tag];
      return `<button class="seed" data-k="${k}">${flowerSVG(k, { size: 40 })}<b>${F.name}</b><i style="background:${T.color}33">${T.label}</i></button>`;
    }).join('');
    this.root.innerHTML = `
      <div class="card gh">
        <div class="rest" id="ghRest" hidden></div>
        <h3>🌱 Your greenhouse</h3>
        <div class="sub">Cross-breed a glowing flower that fits the order — if the florist uses it, you score!</div>
        <div id="ghPick">
          <div class="slots">
            <div class="slot" data-slot="a"><span>Shape</span></div>
            <span class="times">×</span>
            <div class="slot" data-slot="b"><span>Glow</span></div>
          </div>
          <div class="seeds">${seedBtns}</div>
          <div class="preview" id="ghPreview"><span class="muted">Tap two seeds. Each flower carries a meaning — a hybrid carries both!</span></div>
          <button class="btn mint big" id="ghPlant" disabled>Plant it 🌱</button>
        </div>
        <div id="ghGrow" hidden>
          <div class="grow-wrap">
            <div class="moist"><div class="band"></div><div class="fill" id="ghMoist"></div></div>
            <div class="stage" id="ghStage"><div class="plant" id="ghPlantArt"></div></div>
          </div>
          <div class="growbar"><div class="fill" id="ghGrowFill"></div></div>
          <div class="hint" id="ghHint">Keep the soil in the green zone and pluck the pests!</div>
          <button class="btn sky big" id="ghWater">💧 Water</button>
        </div>
        <div id="ghBloom" hidden>
          <div class="bloom-show" id="ghBloomArt"></div>
          <div class="center"><b class="display" id="ghBloomName" style="font-size:1.4rem"></b><div id="ghBloomTags" style="margin:6px 0 12px"></div></div>
          <button class="btn big" id="ghSend">Send to the florist ✨</button>
        </div>
      </div>`;
    const $ = (s) => this.root.querySelector(s);
    this.el = {
      pick: $('#ghPick'), grow: $('#ghGrow'), bloom: $('#ghBloom'), rest: $('#ghRest'),
      preview: $('#ghPreview'), plant: $('#ghPlant'), moist: $('#ghMoist'), stage: $('#ghStage'),
      plantArt: $('#ghPlantArt'), growFill: $('#ghGrowFill'), hint: $('#ghHint'), water: $('#ghWater'),
      bloomArt: $('#ghBloomArt'), bloomName: $('#ghBloomName'), bloomTags: $('#ghBloomTags'), send: $('#ghSend'),
      slotA: this.root.querySelector('[data-slot="a"]'), slotB: this.root.querySelector('[data-slot="b"]'),
    };
    this.root.querySelectorAll('.seed').forEach(b => b.addEventListener('click', () => this.pickSeed(b.dataset.k)));
    this.el.slotA.addEventListener('click', () => { this.a = this.b ? this.b : null; this.b = null; this.sfx('click'); this.updatePick(); });
    this.el.slotB.addEventListener('click', () => { this.b = null; this.sfx('click'); this.updatePick(); });
    this.el.plant.addEventListener('click', () => this.startGrow());
    this.el.water.addEventListener('pointerdown', (e) => { e.preventDefault(); this.water(); });
    this.el.send.addEventListener('click', () => this.send());
    this.updatePick();
  }

  pickSeed(k) {
    this.sfx('click');
    if (!this.a) this.a = k; else this.b = k;
    this.updatePick();
  }

  updatePick() {
    const fill = (el, k, label) => {
      el.classList.toggle('full', !!k);
      el.innerHTML = k ? `${flowerSVG(k, { size: 48 })}<span>${FLOWERS[k].name}</span>` : `<span>${label}</span>`;
    };
    fill(this.el.slotA, this.a, 'Shape');
    fill(this.el.slotB, this.b, 'Glow');
    if (this.a && this.b) {
      const h = makeHybrid(this.a, this.b);
      this.el.preview.innerHTML = `${flowerSVG(this.a, { petal: h.petal, glow: h.glowColor, size: 64 })}<div><b>${h.name}</b>${h.tags.map(t => `<span class="tag" style="background:${TAGS[t].color}44">${TAGS[t].label}</span>`).join(' ')}</div>`;
      this.el.plant.disabled = false;
    } else {
      this.el.preview.innerHTML = `<span class="muted">Tap two seeds. Each flower carries a meaning — a hybrid carries both!</span>`;
      this.el.plant.disabled = true;
    }
  }

  startGrow() {
    if (!this.a || !this.b) return;
    this.sfx('pluck');
    this.mode = 'grow';
    this.growth = 0; this.moist = 45; this.nextWeed = 1.4;
    this.weeds.forEach(w => w.el.remove()); this.weeds = [];
    this.el.pick.hidden = true; this.el.grow.hidden = false; this.el.bloom.hidden = true;
    this.drawPlant();
    this.loop();
  }

  water() {
    if (this.mode !== 'grow' || !this.enabled) return;
    this.moist = Math.min(100, this.moist + 15);
    this.sfx('water');
    // little droplets
    for (let i = 0; i < 3; i++) {
      const d = document.createElement('div');
      d.textContent = '💧';
      d.style.cssText = `position:absolute;left:${40 + Math.random() * 20}%;top:5%;font-size:18px;transition:transform .6s ease-in,opacity .6s;pointer-events:none`;
      this.el.stage.appendChild(d);
      requestAnimationFrame(() => { d.style.transform = 'translateY(170px)'; d.style.opacity = '0'; });
      setTimeout(() => d.remove(), 700);
    }
  }

  spawnWeed() {
    if (this.weeds.length >= 3) return;
    const types = [WEED_SVG, LEAF_SVG, SNAIL_SVG];
    const el = document.createElement('button');
    el.className = 'weed';
    el.innerHTML = types[Math.floor(Math.random() * types.length)];
    const side = Math.random() < 0.5;
    el.style.left = (side ? 4 + Math.random() * 22 : 58 + Math.random() * 24) + '%';
    el.style.top = (30 + Math.random() * 50) + '%';
    const w = { el };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.sfx('pluck');
      el.style.transition = 'transform .25s, opacity .25s';
      el.style.transform = 'translateY(-30px) rotate(40deg) scale(.6)';
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 260);
      this.weeds = this.weeds.filter(x => x !== w);
    });
    this.el.stage.appendChild(el);
    this.weeds.push(w);
  }

  loop() {
    cancelAnimationFrame(this.raf);
    let last = performance.now();
    const step = (now) => {
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      if (this.mode !== 'grow') return;
      if (this.enabled) this.tick(dt);
      this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }

  tick(dt) {
    this.moist = Math.max(0, this.moist - 11 * dt);
    const inBand = this.moist >= 40 && this.moist <= 80;
    let rate = inBand ? 15 : (this.moist < 40 ? 3 : 1.5);
    rate *= Math.pow(0.5, this.weeds.length);
    this.growth = Math.min(100, this.growth + rate * dt);
    this.nextWeed -= dt;
    if (this.nextWeed <= 0) { this.spawnWeed(); this.nextWeed = 1.6 + Math.random() * 1.8; }
    let hint = 'Lovely! Keep it up…', warn = false;
    if (this.weeds.length) { hint = 'Pests! Tap them away!'; warn = true; }
    else if (this.moist < 40) { hint = this.moist < 15 ? 'So thirsty… water me!' : 'A little more water'; warn = this.moist < 15; }
    else if (this.moist > 80) { hint = 'Too much water! Wait a moment'; warn = true; }
    this.el.hint.textContent = hint;
    this.el.hint.classList.toggle('warn', warn);
    this.el.moist.style.height = `calc(${this.moist}% - 8px)`;
    this.el.growFill.style.width = this.growth + '%';
    this.drawPlant();
    if (this.growth >= 100) this.bloom();
  }

  drawPlant() {
    const g = this.growth / 100;
    const h = makeHybrid(this.a, this.b);
    const stemH = 30 + g * 150;
    const wilt = this.moist < 15 ? 12 : 0;
    const leaves = g > 0.25 ? `<path d="M100 ${230 - stemH * 0.45} q-28 -14 -40 4 q18 12 40 -4z" fill="#9cc98f"/>` : '';
    const leaves2 = g > 0.45 ? `<path d="M100 ${230 - stemH * 0.65} q28 -14 40 4 q-18 12 -40 -4z" fill="#8fbf82"/>` : '';
    const bud = g > 0.7 ? `<ellipse cx="${100 + wilt}" cy="${230 - stemH - 8}" rx="${6 + (g - 0.7) * 30}" ry="${10 + (g - 0.7) * 30}" fill="${h.petal}" stroke="${h.glowColor}" stroke-width="2"/>` : '';
    this.el.plantArt.innerHTML = `<svg viewBox="0 0 200 240" width="200" height="240">
      <path d="M100 230 Q ${100 + wilt * 2} ${230 - stemH / 2} ${100 + wilt} ${230 - stemH}" stroke="#7fae7a" stroke-width="6" fill="none" stroke-linecap="round"/>
      ${leaves}${leaves2}${bud}
      <path d="M56 206 h88 l-10 34 h-68z" fill="#e7a57f"/><rect x="50" y="198" width="100" height="14" rx="5" fill="#f0b892"/>
      <ellipse cx="100" cy="200" rx="44" ry="5" fill="#8a6a4a"/>
    </svg>`;
  }

  bloom() {
    this.mode = 'bloom';
    cancelAnimationFrame(this.raf);
    this.weeds.forEach(w => w.el.remove()); this.weeds = [];
    this.sfx('sparkle');
    const h = makeHybrid(this.a, this.b);
    this.el.grow.hidden = true; this.el.bloom.hidden = false;
    this.el.bloomArt.innerHTML = flowerSVG(this.a, { petal: h.petal, glow: h.glowColor, size: 150 });
    this.el.bloomName.textContent = h.name;
    this.el.bloomTags.innerHTML = h.tags.map(t => `<span class="tag" style="background:${TAGS[t].color}44">${TAGS[t].label}</span>`).join(' ');
    if (navigator.vibrate) try { navigator.vibrate(30); } catch {}
  }

  send() {
    if (this.mode !== 'bloom' || !this.enabled) return;
    const ok = this.onSend(this.a, this.b);
    if (ok === false) return;
    const art = this.el.bloomArt.querySelector('svg');
    if (art) {
      const r = art.getBoundingClientRect();
      const fly = document.createElement('div');
      fly.className = 'flyaway';
      fly.style.left = r.left + 'px'; fly.style.top = r.top + 'px';
      fly.innerHTML = art.outerHTML;
      document.body.appendChild(fly);
      setTimeout(() => fly.remove(), 1200);
    }
    this.sfx('sparkle');
    this.mode = 'pick';
    this.el.bloom.hidden = true; this.el.pick.hidden = false;
    this.updatePick();
  }

  setEnabled(on, why = '') {
    this.enabled = on;
    this.el.rest.hidden = on;
    this.el.rest.textContent = why;
  }
}

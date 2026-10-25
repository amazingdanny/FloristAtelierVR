// Live 3D view of the atelier for villagers' phones. Loaded on demand (👀 button).
// It builds the same world + workbench as the florist, but drives it from the server's
// state/bouquet messages and the florist's ~12 Hz pose updates instead of local input.
import * as THREE from 'three';
import { World } from '../florist/world.js';
import { Atelier, paperSheet, ribbonCurl } from '../florist/bench.js';
import { CustomerManager, Crowd, Floaters } from '../florist/villagers.js';
import { createFlower } from '../florist/flowers.js';
import { makeMitten } from '../florist/input.js';
import { PAPERS, RIBBONS } from '../shared/data.js';

const SILENT = { sfx() {}, start() {}, startMusic() {}, stopMusic() {} };
const TARGET = new THREE.Vector3(0, 1.0, -0.45); // the camera orbits around the counter
const FRAME_MS = 1000 / 30;                      // phones render at most 30 fps
const tmpV = new THREE.Vector3(), tmpQ = new THREE.Quaternion();
const fmt = (ms) => { const sec = Math.ceil(ms / 1000); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; };

function makeFloristAvatar() {
  const g = new THREE.Group();
  const L = (c) => new THREE.MeshLambertMaterial({ color: c });
  const head = new THREE.Group();
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.11, 18, 14), L('#f6d9c4'));
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.118, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), L('#8a5a44'));
  hair.rotation.x = 0.35;
  const eyeGeo = new THREE.SphereGeometry(0.013, 8, 6);
  const eyeL = new THREE.Mesh(eyeGeo, L('#3b2f3f')); eyeL.position.set(-0.038, 0.01, -0.1);
  const eyeR = eyeL.clone(); eyeR.position.x = 0.038;
  const cheekGeo = new THREE.SphereGeometry(0.018, 8, 6);
  const cheekL = new THREE.Mesh(cheekGeo, L('#f4a3b4')); cheekL.position.set(-0.062, -0.025, -0.085); cheekL.scale.z = 0.4;
  const cheekR = cheekL.clone(); cheekR.position.x = 0.062;
  // a flower tucked behind the ear
  const fl = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), L('#ff8fb1'));
  fl.position.set(0.09, 0.07, 0.01); fl.scale.set(1, 0.5, 1);
  head.add(face, hair, eyeL, eyeR, cheekL, cheekR, fl);
  const body = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.42, 4, 12), L('#a8dcc0'));
  torso.position.y = -0.48;
  const apron = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.3, 4, 10), L('#fff6ee'));
  apron.position.set(0, -0.55, -0.08); apron.scale.z = 0.75; // sits in front of the torso (no z-fighting)
  body.add(torso, apron);
  const hands = [makeMitten('#f6c6d8'), makeMitten('#c9b6f2')];
  hands.forEach(m => m.scale.setScalar(0.85));
  hands[0].scale.x = -0.85; // left mitten
  g.add(head, body, ...hands);
  return { group: g, head, body, hands };
}

// smoothing toward the latest network pose
function follow(obj, target, k) {
  if (!target) return;
  obj.position.lerp(tmpV.set(target[0], target[1], target[2]), k);
  obj.quaternion.slerp(tmpQ.set(target[3], target[4], target[5], target[6]), k);
}

export class AtelierView {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor('#fbf1e6', 1);
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog('#f6e8e0', 9, 22);
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.05, 40);
    this.scene.add(this.camera);

    this.world = new World(this.scene);
    this.floaters = new Floaters(this.scene);
    this.customers = new CustomerManager(this.scene, this.floaters);
    this.crowd = new Crowd(this.scene);
    this.at = new Atelier(this.scene, { sound: SILENT, floaters: this.floaters });
    this.avatar = makeFloristAvatar();
    this.scene.add(this.avatar.group);
    this.avatar.head.position.set(0, 1.62, 0.3);
    this.handHeld = [null, null]; // { key, obj } shown in each mitten

    this.S = null;
    this.phase = null;
    this.round = -1;
    this.pose = null;
    this.deadline = 0;
    this.handedOver = false;
    this.running = false;
    this.orbit = { yaw: 0.8, pitch: 0.5, dist: 2.4 }; // front-right, over the customer's shoulder
    this.bindTouch();
    this.applyCamera();
  }

  // ---------------------------------------------------------------- lifecycle
  start() {
    if (this.running) return;
    this.running = true;
    this.resize();
    if (this.S) this.sync(this.S, true);
    let last = performance.now(), lastFrame = 0;
    this.renderer.setAnimationLoop((now) => {
      if (now - lastFrame < FRAME_MS) return;
      lastFrame = now;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      this.update(dt);
      this.renderer.render(this.scene, this.camera);
    });
  }
  stop() {
    this.running = false;
    this.renderer.setAnimationLoop(null);
  }
  resize() {
    const w = this.canvas.clientWidth || 1, h = this.canvas.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ---------------------------------------------------------------- camera (drag to orbit, pinch to zoom)
  applyCamera() {
    const o = this.orbit;
    this.camera.position.set(
      TARGET.x + Math.sin(o.yaw) * Math.cos(o.pitch) * o.dist,
      TARGET.y + Math.sin(o.pitch) * o.dist,
      TARGET.z - Math.cos(o.yaw) * Math.cos(o.pitch) * o.dist,
    );
    this.camera.lookAt(TARGET);
  }
  bindTouch() {
    const pts = new Map();
    let pinch = 0;
    const c = this.canvas;
    c.style.touchAction = 'none';
    c.addEventListener('pointerdown', (e) => { c.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); pinch = 0; });
    c.addEventListener('pointermove', (e) => {
      const p = pts.get(e.pointerId);
      if (!p) return;
      const o = this.orbit;
      if (pts.size === 1) {
        o.yaw = THREE.MathUtils.clamp(o.yaw - (e.clientX - p.x) * 0.006, -1.4, 1.4);
        o.pitch = THREE.MathUtils.clamp(o.pitch + (e.clientY - p.y) * 0.005, 0.08, 1.15);
      }
      p.x = e.clientX; p.y = e.clientY;
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch) o.dist = THREE.MathUtils.clamp(o.dist * pinch / d, 1.2, 4);
        pinch = d;
      }
      this.applyCamera();
    });
    const up = (e) => { pts.delete(e.pointerId); pinch = 0; };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('wheel', (e) => { this.orbit.dist = THREE.MathUtils.clamp(this.orbit.dist * (1 + e.deltaY * 0.001), 1.2, 4); this.applyCamera(); e.preventDefault(); }, { passive: false });
  }

  // ---------------------------------------------------------------- incoming messages
  onState(s) {
    this.S = s;
    this.deadline = performance.now() + (s.timeLeft || 0);
    if (!this.running) return; // caught up in full when the view opens
    this.sync(s, false);
  }
  onBouquet(b) {
    if (this.S) this.S.bouquet = b;
    if (this.running) this.syncBouquet(b, false);
  }
  onPose(p) { this.pose = p; }

  sync(s, instant) {
    const phaseChanged = s.phase !== this.phase || s.round !== this.round;
    if (phaseChanged || instant) this.enterPhase(s, instant);
    else if (s.phase === 'lobby' || s.phase === 'final') this.crowd.sync(s.players, { withScores: s.phase === 'final' });
    this.phase = s.phase; this.round = s.round;
    if (!['judge', 'reveal'].includes(s.phase)) this.syncBouquet(s.bouquet, instant);
  }

  enterPhase(s, instant) {
    const p = s.phase, at = this.at;
    this.world.setMood(p === 'lobby' ? 'morning' : p === 'final' ? 'evening' : 'day');
    if (['lobby', 'opening', 'final'].includes(p)) {
      this.customers.leave();
      if (p === 'opening') this.crowd.clear();
      else { this.crowd.sync(s.players, { withScores: p === 'final' }); this.crowd.cheer = p === 'final'; }
    } else this.crowd.clear();
    if (['lobby', 'opening', 'request', 'final'].includes(p) || instant) {
      this.handedOver = false;
      at.resetHolders();
    }
    if (['request', 'arrange', 'judge', 'reveal'].includes(p) && s.customer) this.customers.arrive(s.customer);
    if (p === 'judge') {
      if (instant) this.syncBouquet(s.bouquet, true);
      this.handOver();
    }
    if (p === 'reveal' && s.lastResult) {
      if (instant) { this.syncBouquet(s.lastResult.bouquet, true); this.handOver(); }
      this.customers.showHearts(s.lastResult.hearts);
    }
    if (!['arrange', 'request', 'judge'].includes(p)) at.setTimerText('');
  }

  // Hand the finished arrangement to the customer (mirrors the florist's handOver).
  handOver() {
    if (this.handedOver) return;
    this.handedOver = true;
    const at = this.at, cust = this.customers.current;
    if (!at.arr.stems.length) return;
    const form = at.arr.form;
    const g = at.takeFinished();
    if (!cust) { at.poof(g); return; }
    cust.model.userData.inner.attach(g);
    const target = form === 'crown' ? new THREE.Vector3(0, 1.08, 0) : new THREE.Vector3(0, 0.62, 0.26);
    const q = new THREE.Quaternion().setFromEuler(form === 'crown' ? new THREE.Euler(0, 0, 0) : new THREE.Euler(-0.25, 0, 0));
    at.tweenTo(g, target, q, form === 'crown' ? 1.7 : 1.15, 0.7, { arc: 0.15 });
  }

  // Bring the workbench arrangement in line with the server's bouquet, animating the difference.
  syncBouquet(b, instant) {
    const at = this.at;
    if (!b || this.handedOver) return;
    const want = b.stems || [];
    const form = b.form || 'bouquet';
    const sig = (s) => s.f || s.k;
    if (instant || (at.arr.stems.length && want.length && at.arr.form !== form)) {
      at.restore({ ...b, stems: want.map(s => (s.hybrid ? { ...s, hybrid: true } : s)) });
      at.arr.stems.forEach((st, i) => { st.sig = sig(want[i]); });
      return;
    }
    // stems only get appended or pulled out, so a greedy in-order match finds the changes
    let j = 0;
    for (const st of [...at.arr.stems]) {
      if (j < want.length && st.sig === sig(want[j])) { j++; continue; }
      at.removeStem(st);
      at.scene.attach(st.obj);
      at.poof(st.obj);
    }
    for (; j < want.length; j++) this.addStem(want[j], form);
    this.syncTools(b);
  }

  // Paper, ribbon and trims. One tool animation at a time: while one is playing (at.busy),
  // the rest wait and update() retries a few times a second.
  syncTools(b) {
    const at = this.at;
    if (at.busy || !at.arr.stems.length) return;
    const holding = (t) => (this.pose?.hands || []).some(h => h?.held?.t === t);
    const fromTool = (t) => t.collider.getWorldPosition(new THREE.Vector3());
    if (b.wrap && b.wrap !== at.arr.wrap && at.arr.form === 'bouquet') {
      // in VR the florist carries the sheet over themselves; with the mouse it flies from the roll
      const roll = at.papers.find(t => t.key === b.wrap);
      at.wrap(b.wrap, holding('paper') || !roll ? {} : { from: fromTool(roll) });
      return;
    }
    if (!b.wrap && at.arr.wrap) { at.arr.wrap = null; at.layout(false); }
    if (b.ribbon && b.ribbon !== at.arr.ribbon) {
      const spool = at.ribbons.find(t => t.key === b.ribbon);
      at.tie(b.ribbon, holding('ribbon') || !spool ? {} : { from: fromTool(spool) });
      return;
    }
    if (!b.ribbon && at.arr.ribbon) { at.arr.ribbon = null; at.layout(false); }
    if ((b.snips || 0) > at.arr.snips) {
      if (holding('scissors')) at.snip(); else at.useScissors();
      at.arr.snips = b.snips;
    }
  }

  addStem(s, form) {
    const at = this.at;
    const obj = s.hybrid ? createFlower(s.k, { petal: s.petal, glowColor: s.glowColor }) : createFlower(s.k);
    // start from the florist's hand if it's holding this flower, else from its bucket / the gift basket
    const hi = (this.pose?.hands || []).findIndex(h => h?.held?.t === 'stem' && h.held.k === s.k);
    if (hi >= 0) this.avatar.hands[hi].getWorldPosition(obj.position);
    else if (s.hybrid) obj.position.copy(at.basketDropPoint());
    else {
      const bucket = at.targets.find(t => t.type === 'bucket' && t.kind === s.k);
      if (bucket) bucket.collider.getWorldPosition(obj.position); else at.anchorWorld(form, obj.position);
    }
    this.scene.add(obj);
    if (form === 'crown' && !at.crownReady) at.setWireBend(1);
    at.locked = false;
    const stem = { obj, k: s.k, f: s.f, hybrid: s.hybrid ? s : null, sig: s.f || s.k };
    if (!at.addStem(stem, form)) this.scene.remove(obj);
  }

  // ---------------------------------------------------------------- per frame
  update(dt) {
    const p = this.pose, av = this.avatar, at = this.at;
    const k = 1 - Math.exp(-dt * 14);
    if (p) {
      if (p.ch) at.setHeight(p.ch);
      follow(av.head, p.h, k);
      // hands: tracked in VR; resting on the counter for mouse play
      av.hands.forEach((m, i) => {
        const hp = p.hands?.[i];
        if (hp) follow(m, hp.p, k);
        else {
          const side = i ? 0.2 : -0.2;
          const yaw = new THREE.Euler().setFromQuaternion(av.head.quaternion, 'YXZ').y;
          tmpV.set(side, 0, -0.32).applyAxisAngle(THREE.Object3D.DEFAULT_UP, yaw).add(av.head.position);
          tmpV.y = at.root.position.y + 0.1;
          m.position.lerp(tmpV, k);
        }
        this.showHeld(i, hp?.held || null);
      });
      // a held arrangement follows the florist's hand
      const g = at.activeGroup();
      if (p.a && !this.handedOver && at.arr.stems.length) {
        if (g.parent !== this.scene) this.scene.attach(g);
        follow(g, p.a, k);
      } else if (g.parent === this.scene && !this.handedOver) {
        const crown = g === at.crownGroup;
        (crown ? at.crownStand : at.stand).attach(g);
        at.tweenTo(g, crown ? at.crownRest : at.bouquetRest, new THREE.Quaternion(), 1, 0.35);
      }
    }
    // body hangs under the head, turning with it
    const yaw = new THREE.Euler().setFromQuaternion(av.head.quaternion, 'YXZ').y;
    av.body.position.copy(av.head.position);
    av.body.rotation.set(0, yaw, 0);

    this.toolCheck = (this.toolCheck || 0) + dt;
    if (this.toolCheck > 0.3) {
      this.toolCheck = 0;
      if (this.S?.bouquet && !this.handedOver && !['judge', 'reveal'].includes(this.S.phase)) this.syncTools(this.S.bouquet);
    }
    this.world.update(dt);
    at.update(dt);
    this.customers.update(dt, av.head.position);
    this.crowd.update(dt, av.head.position);
    this.floaters.update(dt);
    if (this.S && ['arrange', 'request', 'judge'].includes(this.S.phase)) {
      const left = Math.max(0, this.deadline - performance.now());
      at.setTimerText(this.S.phase === 'arrange' ? fmt(left) : String(Math.ceil(left / 1000) || ''), this.S.phase === 'arrange' && left < 10000);
    }
  }

  // what the florist is holding, drawn in the matching mitten
  showHeld(i, held) {
    const key = held ? JSON.stringify(held) : '';
    const cur = this.handHeld[i];
    if ((cur?.key || '') === key) return;
    const at = this.at, hand = this.avatar.hands[i];
    if (cur) {
      if (cur.obj === at.scissors) {
        at.root.attach(at.scissors);
        at.tweenTo(at.scissors, at.scissorsRest.pos, new THREE.Quaternion().setFromEuler(at.scissorsRest.rot), 1.5, 0.35);
      } else cur.obj.parent?.remove(cur.obj);
    }
    this.handHeld[i] = null;
    if (!held || held.t === 'arr') return;
    let obj;
    if (held.t === 'stem') {
      obj = held.petal ? createFlower(held.k, { petal: held.petal, glowColor: held.glow }) : createFlower(held.k);
      obj.position.set(0, 0, 0.1); obj.rotation.set(-Math.PI / 2, 0, 0);
    } else if (held.t === 'scissors') {
      obj = at.scissors;
      at.tweens = at.tweens.filter(t => t.obj !== obj);
      hand.add(obj);
      obj.position.set(0, -0.01, -0.02); obj.rotation.set(0, 0, 0); obj.scale.setScalar(1.5);
    } else if (held.t === 'paper' && PAPERS[held.key]) {
      obj = paperSheet(PAPERS[held.key].color); obj.position.set(0, 0.02, -0.09);
    } else if (held.t === 'ribbon' && RIBBONS[held.key]) {
      obj = ribbonCurl(RIBBONS[held.key].color); obj.position.set(0, -0.05, -0.04);
    }
    if (!obj) return;
    if (obj.parent !== hand) hand.add(obj);
    this.handHeld[i] = { key, obj };
  }
}

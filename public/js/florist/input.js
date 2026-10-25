// Input: WebXR hands/controllers (grab with trigger, grip or pinch) and a desktop mouse fallback.
import * as THREE from 'three';
import { PAPERS, RIBBONS, FLOWERS } from '../shared/data.js';
import { createFlower } from './flowers.js';

const tmp = new THREE.Vector3();

export function makeMitten(color = '#f6c6d8') {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color });
  const palm = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.035, 4, 10), mat);
  palm.rotation.x = Math.PI / 2; palm.scale.set(1.2, 1, 0.75);
  palm.position.set(0, -0.005, 0.015);
  const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.012, 0.03, 4, 8), mat);
  thumb.position.set(0.03, 0.01, -0.005); thumb.rotation.set(0.6, 0, -0.9);
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.036, 0.025, 14), new THREE.MeshLambertMaterial({ color: '#fffaf2' }));
  cuff.rotation.x = Math.PI / 2; cuff.position.z = 0.06;
  g.add(palm, thumb, cuff);
  g.userData.thumb = thumb;
  return g;
}

function makeSheet(color) {
  const geo = new THREE.PlaneGeometry(0.2, 0.2, 6, 1);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, Math.pow(p.getX(i) * 6, 2) * 0.012);
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }));
  m.rotation.x = -0.4; m.position.set(0, 0.02, -0.09);
  return m;
}
function makeRibbonStrip(color) {
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, -0.02), new THREE.Vector3(0.02, -0.04, -0.05), new THREE.Vector3(-0.01, -0.09, -0.06), new THREE.Vector3(0.015, -0.14, -0.05)]);
  const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.006, 4, false), new THREE.MeshLambertMaterial({ color }));
  m.scale.set(2, 1, 0.4);
  return m;
}

// ----------------------------------------------------------------------------
// Shared grab/drop logic used by both VR hands and the desktop mouse.
export class Interactor {
  constructor({ atelier, scene, sound, bees, onDeliverByHand, isPlaying }) {
    this.at = atelier; this.scene = scene; this.sound = sound; this.bees = bees;
    this.onDeliverByHand = onDeliverByHand;
    this.isPlaying = isPlaying || (() => true);
  }

  newStem(kind, worldPos) {
    const obj = createFlower(kind);
    if (worldPos) obj.position.copy(worldPos);
    this.scene.add(obj);
    return { obj, k: kind };
  }

  // where should a stem go for one-click (desktop) placement?
  defaultForm() { return this.at.arr.form || (this.at.crownReady ? 'crown' : 'bouquet'); }

  // put a stem that is not in the arrangement back where it came from
  discard(stem) {
    if (stem.hybrid) this.at.returnToBasket(stem);
    else this.at.poof(stem.obj);
  }
}

// ----------------------------------------------------------------------------
export class XRHands {
  constructor(renderer, scene, interactor, { haptic }) {
    this.renderer = renderer; this.scene = scene; this.ix = interactor; this.at = interactor.at;
    this.hands = [0, 1].map(i => this.makeHand(i));
    this.hoverLabel = null;
    this.onHover = null;
  }

  makeHand(i) {
    const grip = this.renderer.xr.getControllerGrip(i);
    const ctrl = this.renderer.xr.getController(i);
    this.scene.add(grip, ctrl);
    const mitten = makeMitten(i ? '#c9b6f2' : '#f6c6d8');
    mitten.scale.setScalar(0.85);
    grip.add(mitten);
    const hold = new THREE.Object3D();
    hold.position.set(0, 0, -0.01);
    grip.add(hold);
    const h = { i, grip, ctrl, mitten, hold, held: null, pos: new THREE.Vector3(), prev: new THREE.Vector3(), vel: new THREE.Vector3(), speed: 0, source: null, buttons: 0, hover: null, bellIn: false, snipCd: 0 };
    const press = () => { h.buttons++; if (h.buttons === 1) this.grab(h); };
    const release = () => { h.buttons = Math.max(0, h.buttons - 1); if (h.buttons === 0) this.drop(h); };
    ctrl.addEventListener('selectstart', press);
    ctrl.addEventListener('selectend', release);
    ctrl.addEventListener('squeezestart', press);
    ctrl.addEventListener('squeezeend', release);
    ctrl.addEventListener('connected', (e) => {
      h.source = e.data;
      mitten.visible = true;
      if (e.data.handedness === 'left') mitten.scale.x = -0.85;
    });
    ctrl.addEventListener('disconnected', () => { h.source = null; this.drop(h); h.buttons = 0; });
    return h;
  }

  pulse(h, intensity = 0.4, ms = 30) {
    try { h.source?.gamepad?.hapticActuators?.[0]?.pulse(intensity, ms); } catch {}
  }

  nearest(h, maxExtra = 0.045) {
    let best = null, bd = Infinity;
    for (const t of this.at.targets) {
      if (t.type === 'bell') continue;
      if (t.type === 'arrangement' && (!this.at.arr.stems.length || this.at.arr.form !== t.form || this.at.locked)) continue;
      if (t.type === 'arrangement' && this.at.arr.form === 'crown' && t.form !== 'crown') continue;
      if (t.type === 'wire' && this.at.arr.form === 'crown' && this.at.arr.stems.length) {
        // a filled crown is grabbed as an arrangement
      }
      t.collider.getWorldPosition(tmp);
      const d = tmp.distanceTo(h.pos) - (t.radius || 0.07);
      // small priority bias: individual stems & tools before containers
      const bias = t.type === 'arrangement' ? 0.02 : t.type === 'bucket' ? 0.01 : 0;
      if (d + bias < bd) { bd = d + bias; best = t; }
    }
    return bd <= maxExtra ? best : null;
  }

  grab(h) {
    if (h.held) return;
    const t = this.nearest(h);
    if (!t) return;
    const at = this.at;
    switch (t.type) {
      case 'bucket': {
        if (at.locked) return;
        const stem = this.ix.newStem(t.kind);
        this.holdStem(h, stem);
        this.ix.sound.sfx('grab');
        break;
      }
      case 'basketFlower': {
        const item = t.item;
        at.takeFromBasket(item);
        this.holdStem(h, item);
        this.ix.sound.sfx('grab');
        break;
      }
      case 'arrStem': {
        if (at.locked) return;
        const stem = t.stem;
        at.removeStem(stem);
        this.holdStem(h, stem);
        this.ix.sound.sfx('grab');
        break;
      }
      case 'arrangement': {
        const g = t.form === 'crown' ? at.crownGroup : at.bouquetGroup;
        h.hold.attach(g);
        h.held = { type: 'arrangement', obj: g, form: t.form };
        this.ix.sound.sfx('grab');
        break;
      }
      case 'wire': {
        if (at.crownReady) {
          if (at.arr.form === 'crown' && at.arr.stems.length && !at.locked) {
            h.hold.attach(at.crownGroup);
            h.held = { type: 'arrangement', obj: at.crownGroup, form: 'crown' };
            this.ix.sound.sfx('grab');
          }
          return;
        }
        h.held = { type: 'wire', travelled: 0 };
        this.ix.sound.sfx('grab');
        break;
      }
      case 'scissors': {
        at.tweens = at.tweens.filter(tw => tw.obj !== at.scissors);
        at.busy = false;
        h.hold.attach(at.scissors);
        at.scissors.position.set(0, -0.01, -0.02);
        at.scissors.rotation.set(0, 0, 0);
        at.scissors.scale.setScalar(1.5);
        h.held = { type: 'scissors', obj: at.scissors };
        this.ix.sound.sfx('grab');
        break;
      }
      case 'paper': {
        const sheet = makeSheet(PAPERS[t.key].color);
        h.hold.add(sheet);
        h.held = { type: 'paper', obj: sheet, key: t.key };
        this.ix.sound.sfx('wrap');
        break;
      }
      case 'ribbon': {
        const strip = makeRibbonStrip(RIBBONS[t.key].color);
        h.hold.add(strip);
        h.held = { type: 'ribbon', obj: strip, key: t.key };
        this.ix.sound.sfx('grab');
        break;
      }
    }
    this.pulse(h, 0.5, 25);
  }

  holdStem(h, stem) {
    h.hold.attach(stem.obj);
    stem.obj.position.set(0, 0, 0.1);
    stem.obj.rotation.set(-Math.PI / 2, 0, 0);
    stem.obj.scale.setScalar(1);
    if (stem.obj.userData.halo) stem.obj.userData.halo.scale.setScalar(0.13);
    h.held = { type: 'stem', stem, obj: stem.obj };
  }

  stemNear(h, form) {
    const a = this.at.anchorWorld(form, new THREE.Vector3());
    if (form === 'bouquet') a.y += 0.08;
    const mid = h.held.obj.localToWorld(new THREE.Vector3(0, 0.12, 0));
    return Math.min(a.distanceTo(h.pos), a.distanceTo(mid)) < (form === 'crown' ? 0.17 : 0.19);
  }

  drop(h) {
    const held = h.held;
    if (!held) return;
    h.held = null;
    const at = this.at;
    switch (held.type) {
      case 'stem': {
        const stem = held.stem;
        let placed = false;
        for (const form of ['bouquet', 'crown']) {
          if (!this.stemNearCached(h, stem, form)) continue;
          if (at.canAdd(form)) { this.scene.attach(stem.obj); placed = at.addStem(stem, form); if (placed) { this.ix.sound.sfx('place'); at.sparkle(stem.obj.localToWorld(new THREE.Vector3(0, stem.obj.userData.len, 0)), '#fff6c4'); } }
          else this.ix.sound.sfx('uh');
          break;
        }
        if (!placed) { this.scene.attach(stem.obj); this.ix.discard(stem); this.ix.sound.sfx('drop'); }
        this.pulse(h, placed ? 0.6 : 0.2, 35);
        break;
      }
      case 'arrangement': {
        if (held.delivered) break;
        const g = held.obj;
        const parent = held.form === 'crown' ? at.crownStand : at.stand;
        parent.attach(g);
        const rest = held.form === 'crown' ? at.crownRest : at.bouquetRest;
        at.tweenTo(g, rest, new THREE.Quaternion(), 1, 0.35);
        this.ix.sound.sfx('drop');
        break;
      }
      case 'scissors': {
        at.root.attach(at.scissors);
        const q = new THREE.Quaternion().setFromEuler(at.scissorsRest.rot);
        at.tweenTo(at.scissors, at.scissorsRest.pos, q, 1.5, 0.35);
        break;
      }
      case 'paper':
      case 'ribbon': {
        const obj = held.obj;
        this.scene.attach(obj);
        at.poof(obj);
        break;
      }
      case 'wire': break;
    }
  }

  stemNearCached(h, stem, form) {
    const a = this.at.anchorWorld(form, new THREE.Vector3());
    if (form === 'bouquet') a.y += 0.08;
    const mid = stem.obj.localToWorld(new THREE.Vector3(0, 0.12, 0));
    return Math.min(a.distanceTo(h.pos), a.distanceTo(mid)) < (form === 'crown' ? 0.17 : 0.19);
  }

  forceReleaseAll() { for (const h of this.hands) { h.buttons = 0; this.drop(h); } }

  update(dt) {
    const at = this.at;
    const handInfo = [];
    for (const h of this.hands) {
      if (!h.source) { h.mitten.visible = false; continue; }
      h.mitten.visible = true;
      h.prev.copy(h.pos);
      h.grip.getWorldPosition(h.pos);
      h.vel.subVectors(h.pos, h.prev).divideScalar(Math.max(dt, 1e-3));
      h.speed = h.speed * 0.6 + h.vel.length() * 0.4;
      handInfo.push({ pos: h.pos, speed: h.speed });

      // hover feedback
      const hov = h.held ? null : this.nearest(h);
      if (hov !== h.hover) {
        if (h.hover?.hl) h.hover.hl.scale.setScalar(1);
        h.hover = hov;
        if (hov) { this.pulse(h, 0.15, 10); if (hov.hl) hov.hl.scale.setScalar(1.08); }
        this.onHover?.(hov);
      }
      // pinch-like thumb animation
      h.mitten.userData.thumb.rotation.z = h.buttons ? -0.3 : -0.9;

      // bell is touched, not grabbed
      at.bellT.collider.getWorldPosition(tmp);
      const nearBell = tmp.distanceTo(h.pos) < 0.075;
      if (nearBell && !h.bellIn) { at.ringBell(); this.pulse(h, 0.8, 60); }
      h.bellIn = nearBell;

      const held = h.held;
      if (!held) continue;
      if (held.type === 'arrangement') {
        const p = held.obj.getWorldPosition(tmp);
        if (this.ix.isPlaying() && at.canDeliver && p.z < -0.93 && Math.abs(p.x) < 0.8 && p.y > 0.4) {
          held.delivered = true;
          h.held = null;
          this.pulse(h, 0.9, 80);
          this.ix.onDeliverByHand();
        }
      } else if (held.type === 'scissors') {
        h.snipCd -= dt;
        const tip = at.scissors.userData.tip.getWorldPosition(new THREE.Vector3());
        const a = at.anchorWorld();
        if (tip.distanceTo(a) < 0.13 && h.snipCd <= 0 && at.arr.stems.length) {
          if (at.snip()) { h.snipCd = 0.55; this.pulse(h, 0.7, 40); }
        }
      } else if (held.type === 'paper') {
        if (at.anchorWorld('bouquet').distanceTo(h.pos) < 0.17 && at.arr.form === 'bouquet') {
          if (at.wrap(held.key)) { h.hold.remove(held.obj); h.held = null; this.pulse(h, 0.7, 50); }
        }
      } else if (held.type === 'ribbon') {
        if (at.arr.stems.length && at.anchorWorld().distanceTo(h.pos) < 0.16) {
          if (at.tie(held.key)) { h.hold.remove(held.obj); h.held = null; this.pulse(h, 0.7, 50); }
        }
      } else if (held.type === 'wire') {
        held.travelled += h.pos.distanceTo(h.prev);
        const before = at.wireBend;
        at.setWireBend(Math.min(1, at.wireBend + h.pos.distanceTo(h.prev) * 1.5));
        if (Math.floor(before * 8) !== Math.floor(at.wireBend * 8)) { this.pulse(h, 0.3, 15); this.ix.sound.sfx('tick'); }
        if (at.crownReady) { at.setWireBend(1); this.ix.sound.sfx('crown'); at.sparkle(at.anchorWorld('crown'), '#c8f0c0'); h.held = null; this.pulse(h, 0.8, 70); }
      }
    }
    return handInfo;
  }

  // thumbsticks (any) -> bench height
  sticks() {
    let y = 0;
    for (const h of this.hands) {
      const ax = h.source?.gamepad?.axes;
      if (ax && ax.length >= 4 && Math.abs(ax[3]) > 0.5) y += ax[3];
    }
    return y;
  }
}

// ----------------------------------------------------------------------------
export class DesktopMouse {
  constructor(canvas, camera, interactor, { bees, getCustomer, onTooltip }) {
    this.canvas = canvas; this.camera = camera; this.ix = interactor; this.at = interactor.at; this.bees = bees;
    this.getCustomer = getCustomer; this.onTooltip = onTooltip || (() => {});
    this.ray = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.yaw = 0; this.pitch = -0.3;
    this.enabled = false;
    this.drag = null;
    this.hover = null;
    canvas.addEventListener('pointerdown', (e) => this.down(e));
    canvas.addEventListener('pointermove', (e) => this.move(e));
    canvas.addEventListener('pointerup', (e) => this.up(e));
    canvas.addEventListener('wheel', (e) => { if (!this.enabled) return; e.preventDefault(); camera.fov = THREE.MathUtils.clamp(camera.fov + e.deltaY * 0.03, 40, 85); camera.updateProjectionMatrix(); }, { passive: false });
    window.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      if (e.key === 'ArrowLeft' || e.key === 'a') this.yaw += 0.15;
      if (e.key === 'ArrowRight' || e.key === 'd') this.yaw -= 0.15;
      if (e.key === 'ArrowUp' || e.key === 'w') this.pitch += 0.1;
      if (e.key === 'ArrowDown' || e.key === 's') this.pitch -= 0.1;
      this.clampView();
    });
  }
  clampView() { this.yaw = THREE.MathUtils.clamp(this.yaw, -2.0, 2.0); this.pitch = THREE.MathUtils.clamp(this.pitch, -1.25, 0.45); }
  applyCamera() {
    const c = this.camera;
    c.position.set(0, 1.72, 0.6);
    c.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }
  pick(e) {
    const r = this.canvas.getBoundingClientRect();
    this.mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.mouse, this.camera);
    const list = [...this.bees.colliders, ...this.at.colliders];
    const cust = this.getCustomer();
    if (cust) list.push(cust);
    const hits = this.ray.intersectObjects(list, false);
    for (const hit of hits) {
      const o = hit.object;
      if (o.userData.bee) return { bee: o.userData.bee };
      if (o.userData.customer) return { customer: true };
      const t = o.userData.target;
      if (t && this.usable(t)) return { target: t };
    }
    return null;
  }
  usable(t) {
    if (t.type === 'arrangement') return this.at.arr.stems.length && this.at.arr.form === t.form;
    return true;
  }
  down(e) {
    if (!this.enabled) return;
    this.canvas.setPointerCapture(e.pointerId);
    this.drag = { x: e.clientX, y: e.clientY, yaw: this.yaw, pitch: this.pitch, moved: false };
  }
  move(e) {
    if (!this.enabled) return;
    if (this.drag) {
      const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 6) this.drag.moved = true;
      if (this.drag.moved) {
        this.yaw = this.drag.yaw + dx * 0.005;
        this.pitch = this.drag.pitch + dy * 0.004;
        this.clampView();
      }
      return;
    }
    const p = this.pick(e);
    const label = p?.bee ? `Shoo ${p.bee.info.ownerName}'s bee!` : p?.customer ? (this.at.canDeliver && this.at.arr.stems.length ? 'Hand over the bouquet' : '') : p?.target?.label || '';
    this.canvas.style.cursor = label ? 'pointer' : 'grab';
    this.onTooltip(label, e.clientX, e.clientY);
    const t = p?.target || null;
    if (t !== this.hover) {
      if (this.hover?.hl) this.hover.hl.scale.setScalar(1);
      this.hover = t;
      if (t?.hl) t.hl.scale.setScalar(1.08);
    }
  }
  up(e) {
    if (!this.enabled || !this.drag) return;
    const wasDrag = this.drag.moved;
    this.drag = null;
    if (wasDrag) return;
    const p = this.pick(e);
    if (!p) return;
    this.ix.sound.start();
    if (p.bee) return this.bees.shoo(p.bee);
    if (p.customer) { if (this.at.canDeliver && this.at.arr.stems.length) this.ix.onDeliverByHand(); return; }
    this.click(p.target);
  }
  click(t) {
    const at = this.at, ix = this.ix;
    switch (t.type) {
      case 'bucket': {
        if (at.locked) return;
        const form = ix.defaultForm();
        if (!at.canAdd(form)) return ix.sound.sfx('uh');
        const from = t.collider.getWorldPosition(new THREE.Vector3());
        const stem = ix.newStem(t.kind, from);
        at.addStem(stem, form);
        ix.sound.sfx('place');
        break;
      }
      case 'basketFlower': {
        const form = ix.defaultForm();
        if (!at.canAdd(form)) return ix.sound.sfx('uh');
        at.takeFromBasket(t.item);
        ix.scene.attach(t.item.obj);
        at.addStem(t.item, form);
        ix.sound.sfx('place');
        break;
      }
      case 'arrStem': {
        if (at.locked) return;
        const stem = t.stem;
        at.removeStem(stem);
        ix.scene.attach(stem.obj);
        ix.discard(stem);
        ix.sound.sfx('drop');
        break;
      }
      case 'scissors': if (!at.useScissors() && !at.busy) ix.sound.sfx('uh'); break;
      case 'paper': at.wrap(t.key, { from: t.collider.getWorldPosition(new THREE.Vector3()) }); break;
      case 'ribbon': at.tie(t.key, { from: t.collider.getWorldPosition(new THREE.Vector3()) }); break;
      case 'bell': at.ringBell(); break;
      case 'wire': {
        if (at.crownReady) {
          if (at.canDeliver && at.arr.form === 'crown' && at.arr.stems.length) ix.onDeliverByHand();
          return;
        }
        if (at.arr.form === 'bouquet') return ix.sound.sfx('uh');
        const start = at.wireBend;
        let k = 0;
        const step = () => {
          k += 0.06;
          at.setWireBend(start + (1 - start) * Math.min(1, k));
          if (k < 1) requestAnimationFrame(step);
          else { ix.sound.sfx('crown'); at.sparkle(at.anchorWorld('crown'), '#c8f0c0'); }
        };
        ix.sound.sfx('tick');
        step();
        break;
      }
      case 'arrangement': if (at.canDeliver) ix.onDeliverByHand(); break;
    }
  }
}

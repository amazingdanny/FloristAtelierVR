// Chibi villagers (customers + lobby crowd) and Garden Sprite orbs.
import * as THREE from 'three';
import { VILLAGERS } from '../shared/data.js';
import { labelSprite, glowTexture, emojiTexture, blobShadow } from './textures.js';
import { DOOR } from './world.js';
import { mergeGeometries } from '/vendor/three/addons/BufferGeometryUtils.js';

// merge static parts that share a material -> far fewer draw calls (important on standalone headsets)
function mergeByMaterial(group, keep) {
  const byMat = new Map();
  for (const child of [...group.children]) {
    if (!child.isMesh || keep.has(child)) continue;
    child.updateMatrix();
    let g = child.geometry.clone().applyMatrix4(child.matrix);
    if (g.index) g = g.toNonIndexed();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    if (!byMat.has(child.material)) byMat.set(child.material, []);
    byMat.get(child.material).push(g);
    group.remove(child);
  }
  for (const [mat, geos] of byMat) group.add(new THREE.Mesh(mergeGeometries(geos), mat));
}

const L = (c) => new THREE.MeshLambertMaterial({ color: c });
const B = (c) => new THREE.MeshBasicMaterial({ color: c });
const matCache = new Map();
const M = (c) => { if (!matCache.has(c)) matCache.set(c, L(c)); return matCache.get(c); };
const INK = '#4a3b52';

function mesh(geo, mat, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); return m; }

export function makeVillager(kind) {
  const V = VILLAGERS[kind] || VILLAGERS.fairy;
  const g = new THREE.Group();
  const inner = new THREE.Group(); // bobbing part
  g.add(inner);
  g.userData.inner = inner;
  const shadow = blobShadow(0.7, 0.9); shadow.position.y = 0.01; g.add(shadow);

  // robe / body
  const prof = [[0.0, 0], [0.27, 0.0], [0.26, 0.08], [0.22, 0.35], [0.17, 0.6], [0.13, 0.7], [0.0, 0.72]].map(([x, y]) => new THREE.Vector2(x, y));
  inner.add(mesh(new THREE.LatheGeometry(prof, 18), M(V.body)));
  // head
  const headY = 0.9;
  const head = mesh(new THREE.SphereGeometry(0.2, 20, 14), M(V.skin), 0, headY, 0);
  head.scale.set(1, 0.95, 0.95);
  inner.add(head);
  // face
  const eyeGeo = new THREE.SphereGeometry(0.022, 8, 6);
  const eyes = [-1, 1].map(s => mesh(eyeGeo, M(INK), 0.07 * s, headY + 0.02, 0.182));
  const blushGeo = new THREE.CircleGeometry(0.035, 12);
  const blushMat = new THREE.MeshBasicMaterial({ color: '#f29bb0', transparent: true, opacity: 0.55 });
  const blush = [-1, 1].map(s => { const b = mesh(blushGeo, blushMat, 0.12 * s, headY - 0.045, 0.16); b.rotation.y = 0.55 * s; return b; });
  const smile = mesh(new THREE.TorusGeometry(0.035, 0.007, 5, 10, Math.PI), M(INK), 0, headY - 0.05, 0.188);
  smile.rotation.z = Math.PI;
  inner.add(...eyes, ...blush, smile);
  g.userData.eyes = eyes;
  g.userData.smile = smile;
  // arms (hold forward)
  const armGeo = new THREE.CapsuleGeometry(0.045, 0.2, 4, 8);
  const arms = [-1, 1].map(s => {
    const a = mesh(armGeo, M(V.body), 0.17 * s, 0.56, 0.08);
    a.rotation.set(-1.0, 0, -0.35 * s);
    return a;
  });
  const hands = [-1, 1].map(s => mesh(new THREE.SphereGeometry(0.05, 10, 8), M(V.skin), 0.12 * s, 0.47, 0.2));
  inner.add(...arms, ...hands);
  g.userData.arms = arms;
  const hold = new THREE.Object3D(); hold.position.set(0, 0.47, 0.24); inner.add(hold);
  g.userData.hold = hold;

  // accessories
  const acc = V.accent;
  switch (kind) {
    case 'fairy': {
      const wingMat = new THREE.MeshLambertMaterial({ color: acc, transparent: true, opacity: 0.55, side: THREE.DoubleSide, emissive: acc, emissiveIntensity: 0.3 });
      const wings = [-1, 1].map(s => {
        const w = mesh(new THREE.CircleGeometry(0.22, 16), wingMat, 0.12 * s, 0.68, -0.14);
        w.scale.set(0.75, 1.2, 1);
        w.rotation.set(0, 0.6 * s, 0.5 * s);
        return w;
      });
      inner.add(...wings);
      g.userData.wings = wings;
      const spark = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: '#fff6b0', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      spark.scale.set(0.12, 0.12, 1); spark.position.set(0, headY + 0.3, 0);
      inner.add(spark, mesh(new THREE.SphereGeometry(0.018, 8, 6), B('#fff6b0'), 0, headY + 0.3, 0), mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.1, 4), M('#e6c46a'), 0, headY + 0.24, 0));
      break;
    }
    case 'baker': {
      inner.add(mesh(new THREE.CylinderGeometry(0.13, 0.12, 0.14, 14), M('#ffffff'), 0, headY + 0.2, 0));
      [[-0.08, 0], [0.08, 0], [0, 0.06], [0, -0.06]].forEach(([x, z]) => inner.add(mesh(new THREE.SphereGeometry(0.09, 10, 8), M('#ffffff'), x, headY + 0.3, z)));
      const apron = mesh(new THREE.PlaneGeometry(0.26, 0.4), new THREE.MeshLambertMaterial({ color: '#ffffff', side: THREE.DoubleSide }), 0, 0.3, 0.215);
      apron.rotation.x = -0.15;
      inner.add(apron);
      inner.add(mesh(new THREE.TorusGeometry(0.05, 0.012, 5, 10, Math.PI), M('#8a5a3a'), 0, headY - 0.085, 0.17));
      break;
    }
    case 'witch': {
      const brim = mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.015, 24), M(acc), 0, headY + 0.16, -0.01);
      brim.rotation.x = -0.12;
      inner.add(brim);
      const cone = mesh(new THREE.ConeGeometry(0.14, 0.4, 16), M(acc), 0, headY + 0.36, -0.03);
      cone.rotation.x = -0.18;
      inner.add(cone);
      inner.add(mesh(new THREE.CylinderGeometry(0.152, 0.155, 0.04, 16), M('#f2c14e'), 0, headY + 0.18, 0));
      const glass = M('#2e2640');
      [-1, 1].forEach(s => inner.add(mesh(new THREE.BoxGeometry(0.075, 0.045, 0.012), glass, 0.07 * s, headY + 0.02, 0.192)));
      inner.add(mesh(new THREE.BoxGeometry(0.06, 0.01, 0.01), glass, 0, headY + 0.03, 0.195));
      eyes.forEach(e => e.visible = false);
      break;
    }
    case 'knight': {
      const helm = mesh(new THREE.SphereGeometry(0.215, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), M('#d7dee8'), 0, headY + 0.01, 0);
      inner.add(helm);
      inner.add(mesh(new THREE.BoxGeometry(0.3, 0.035, 0.05), M('#5b6778'), 0, headY + 0.08, 0.18));
      const plume = mesh(new THREE.SphereGeometry(0.07, 10, 8), M(acc), 0, headY + 0.26, -0.04);
      plume.scale.set(0.7, 1.4, 1.6);
      inner.add(plume);
      eyes.forEach(e => { e.position.y -= 0.02; });
      break;
    }
    case 'granny': {
      inner.add(mesh(new THREE.SphereGeometry(0.21, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.45), M('#ebe6ee'), 0, headY + 0.005, -0.01));
      inner.add(mesh(new THREE.SphereGeometry(0.08, 10, 8), M('#ebe6ee'), 0, headY + 0.2, -0.08));
      [-1, 1].forEach(s => inner.add(mesh(new THREE.TorusGeometry(0.04, 0.005, 5, 14), M('#9a7a5a'), 0.07 * s, headY + 0.02, 0.19)));
      const shawl = mesh(new THREE.TorusGeometry(0.16, 0.05, 8, 18), M(acc), 0, 0.66, 0);
      shawl.rotation.x = Math.PI / 2;
      inner.add(shawl);
      break;
    }
    case 'cat': {
      [-1, 1].forEach(s => {
        const ear = mesh(new THREE.ConeGeometry(0.065, 0.12, 4), M(V.skin), 0.12 * s, headY + 0.17, 0);
        ear.rotation.z = -0.35 * s;
        inner.add(ear);
        const inn = mesh(new THREE.ConeGeometry(0.035, 0.07, 4), M('#f6a5b8'), 0.12 * s, headY + 0.165, 0.025);
        inn.rotation.z = -0.35 * s;
        inner.add(inn);
        for (const dy of [0, -0.02]) {
          const wh = mesh(new THREE.BoxGeometry(0.11, 0.004, 0.004), M(INK), 0.15 * s, headY - 0.04 + dy, 0.15);
          wh.rotation.z = (dy ? -0.15 : 0.15) * s;
          inner.add(wh);
        }
      });
      inner.add(mesh(new THREE.SphereGeometry(0.018, 8, 6), M('#e88a9a'), 0, headY - 0.02, 0.2));
      const tail = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.15, -0.22), new THREE.Vector3(0.05, 0.25, -0.38), new THREE.Vector3(-0.02, 0.5, -0.42)]), 10, 0.03, 6), M(V.skin));
      inner.add(tail);
      // postal bag + cap
      inner.add(mesh(new THREE.BoxGeometry(0.16, 0.13, 0.06), M('#5a7bb5'), 0.2, 0.36, 0.08));
      break;
    }
    case 'frog': {
      [-1, 1].forEach(s => {
        inner.add(mesh(new THREE.SphereGeometry(0.075, 12, 10), M(V.skin), 0.095 * s, headY + 0.15, 0.06));
        inner.add(mesh(new THREE.SphereGeometry(0.05, 10, 8), M('#ffffff'), 0.095 * s, headY + 0.165, 0.11));
        inner.add(mesh(new THREE.SphereGeometry(0.026, 8, 6), M(INK), 0.095 * s, headY + 0.17, 0.15));
      });
      eyes.forEach(e => e.visible = false);
      const crown = mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.06, 10, 1, true), new THREE.MeshLambertMaterial({ color: acc, side: THREE.DoubleSide }), 0, headY + 0.22, -0.04);
      inner.add(crown);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        inner.add(mesh(new THREE.ConeGeometry(0.018, 0.05, 4), M(acc), Math.sin(a) * 0.08, headY + 0.27, Math.cos(a) * 0.08 - 0.04));
      }
      smile.scale.set(2.2, 1.2, 1);
      break;
    }
    case 'mushroom': {
      const cap = mesh(new THREE.SphereGeometry(0.3, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), M(acc), 0, headY + 0.06, 0);
      cap.scale.set(1, 0.75, 1);
      inner.add(cap);
      [[0.1, 0.2, 0.15], [-0.14, 0.17, 0.12], [0.02, 0.27, -0.05], [0.18, 0.12, -0.1], [-0.16, 0.13, -0.14], [-0.02, 0.18, 0.22]].forEach(([x, y, z]) => inner.add(mesh(new THREE.SphereGeometry(0.035, 8, 6), M('#ffffff'), x, headY + y, z)));
      break;
    }
  }
  mergeByMaterial(inner, new Set([...eyes, ...(g.userData.wings || [])]));
  g.userData.kind = kind;
  g.userData.t = Math.random() * 10;
  return g;
}

export function animateVillager(v, dt, { walking = false, happy = 0 } = {}) {
  const u = v.userData;
  u.t += dt;
  const inner = u.inner;
  if (walking) {
    inner.position.y = Math.abs(Math.sin(u.t * 9)) * 0.045;
    inner.rotation.z = Math.sin(u.t * 9) * 0.05;
  } else {
    inner.position.y = Math.sin(u.t * 2) * 0.012 + (happy ? Math.abs(Math.sin(u.t * 6)) * 0.06 * happy : 0);
    inner.rotation.z *= 0.9;
  }
  if (u.wings) u.wings.forEach((w, i) => { w.rotation.y = (i ? -1 : 1) * (0.6 + Math.sin(u.t * 6) * 0.25); });
  // blink every few seconds (eyes squash quickly — not a light flash)
  const blink = (u.t % 4.2) < 0.12;
  if (u.eyes) u.eyes.forEach(e => e.scale.y = blink ? 0.15 : 1);
}

// ---------------------------------------------------------------- moving along a path
export class Walker {
  constructor(obj, path, speed = 1.1, onDone = null) {
    this.obj = obj; this.path = path.map(p => p.clone()); this.speed = speed; this.onDone = onDone; this.i = 0; this.done = false;
  }
  update(dt) {
    if (this.done) return false;
    const target = this.path[this.i];
    const pos = this.obj.position;
    const d = new THREE.Vector3(target.x - pos.x, 0, target.z - pos.z);
    const len = d.length();
    const step = this.speed * dt;
    if (len <= step) {
      pos.set(target.x, pos.y, target.z);
      this.i++;
      if (this.i >= this.path.length) { this.done = true; this.onDone?.(); return false; }
    } else {
      d.multiplyScalar(step / len);
      pos.add(d);
      const ang = Math.atan2(d.x, d.z);
      this.obj.rotation.y = lerpAngle(this.obj.rotation.y, ang, Math.min(1, dt * 8));
    }
    return true;
  }
}
export function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

// ---------------------------------------------------------------- floating things (emoji, hearts)
const heartShape = (() => {
  const s = new THREE.Shape();
  s.moveTo(0, -0.5);
  s.bezierCurveTo(-0.15, -0.32, -0.55, -0.1, -0.5, 0.2);
  s.bezierCurveTo(-0.45, 0.5, -0.1, 0.55, 0, 0.25);
  s.bezierCurveTo(0.1, 0.55, 0.45, 0.5, 0.5, 0.2);
  s.bezierCurveTo(0.55, -0.1, 0.15, -0.32, 0, -0.5);
  return s;
})();
export const HEART_GEO = new THREE.ExtrudeGeometry(heartShape, { depth: 0.18, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 2, curveSegments: 10 });
HEART_GEO.center();
export const HEART_MAT = new THREE.MeshLambertMaterial({ color: '#f07c98', emissive: '#f07c98', emissiveIntensity: 0.25 });
export const HEART_EMPTY_MAT = new THREE.MeshLambertMaterial({ color: '#e6d8e0', transparent: true, opacity: 0.7 });

export class Floaters {
  constructor(scene) { this.scene = scene; this.items = []; }
  emoji(e, pos, { size = 0.22, rise = 0.5, life = 2.0 } = {}) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTexture(e), transparent: true, depthWrite: false }));
    s.scale.set(size, size, 1);
    s.position.copy(pos);
    this.scene.add(s);
    this.items.push({ obj: s, t: 0, life, rise, vx: (Math.random() - 0.5) * 0.15, base: pos.clone(), size });
  }
  add(obj, { life = 2, rise = 0.4, spin = 0 } = {}) {
    this.scene.add(obj);
    this.items.push({ obj, t: 0, life, rise, vx: 0, base: obj.position.clone(), spin, size: obj.scale.x });
  }
  update(dt) {
    this.items = this.items.filter(it => {
      it.t += dt;
      const k = it.t / it.life;
      if (k >= 1) { this.scene.remove(it.obj); it.obj.material?.dispose?.(); return false; }
      it.obj.position.set(it.base.x + it.vx * k, it.base.y + it.rise * Math.sin(k * Math.PI / 2), it.base.z);
      const pop = k < 0.15 ? k / 0.15 : 1;
      const fade = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      if (it.obj.isSprite) { it.obj.scale.set(it.size * pop, it.size * pop, 1); it.obj.material.opacity = fade; }
      else { it.obj.scale.setScalar(it.size * pop * (0.6 + 0.4 * fade)); if (it.spin) it.obj.rotation.y += it.spin * dt; }
      return true;
    });
  }
}

// ---------------------------------------------------------------- the customer at the counter
export const COUNTER_SPOT = new THREE.Vector3(0, 0, -1.3);

export class CustomerManager {
  constructor(scene, floaters) {
    this.scene = scene; this.floaters = floaters;
    this.current = null; // {model, info, walker, label}
    this.others = [];    // leaving villagers
    this.hearts = [];
  }
  arrive(info) {
    if (this.current && this.current.info.name === info.name && this.current.info.villager === info.villager) return;
    this.leave();
    const model = makeVillager(info.villager);
    model.position.set(DOOR.x, 0, DOOR.z + 0.2);
    model.scale.setScalar(0.01);
    const label = labelSprite(info.name, { size: 0.09 });
    label.position.set(0, 1.42, 0);
    model.add(label);
    this.scene.add(model);
    const c = { model, info, label, grow: 0 };
    c.walker = new Walker(model, [new THREE.Vector3(DOOR.x, 0, DOOR.z + 0.8), new THREE.Vector3(-0.9, 0, -1.9), COUNTER_SPOT], 1.15, () => { c.arrived = true; });
    this.current = c;
    return c;
  }
  leave() {
    const c = this.current;
    if (!c) return;
    this.current = null;
    c.leaving = true;
    c.walker = new Walker(c.model, [new THREE.Vector3(-0.9, 0, -1.9), new THREE.Vector3(DOOR.x, 0, DOOR.z + 0.8), new THREE.Vector3(DOOR.x, 0, DOOR.z + 0.1)], 1.2, () => { c.gone = true; });
    this.others.push(c);
    this.clearHearts();
  }
  holdPoint() { return this.current?.model.userData.hold || null; }
  headPos(c = this.current) {
    if (!c) return new THREE.Vector3(0, 1.5, -1.3);
    return c.model.localToWorld(new THREE.Vector3(0, 1.25, 0.1));
  }
  react(e) { if (this.current) this.floaters.emoji(e, this.headPos(), { size: 0.24, rise: 0.45 }); }
  showHearts(n) {
    this.clearHearts();
    if (!this.current) return;
    for (let i = 0; i < 5; i++) {
      const h = new THREE.Mesh(HEART_GEO, i < n ? HEART_MAT : HEART_EMPTY_MAT);
      h.scale.setScalar(0.001);
      h.userData.target = 0.1;
      h.userData.delay = i * 0.18;
      h.position.set((i - 2) * 0.13, 1.6, 0.05);
      this.current.model.add(h);
      this.hearts.push(h);
    }
    this.happy = n >= 4 ? 1 : n >= 3 ? 0.4 : 0;
  }
  clearHearts() { this.hearts.forEach(h => h.parent?.remove(h)); this.hearts = []; this.happy = 0; }
  update(dt, cameraPos) {
    const all = this.current ? [this.current, ...this.others] : this.others;
    for (const c of all) {
      c.grow = Math.min(1, c.grow + dt * 2.5);
      const walking = c.walker && !c.walker.done;
      if (walking) c.walker.update(dt);
      else if (c === this.current && cameraPos) {
        // face the florist
        const ang = Math.atan2(cameraPos.x - c.model.position.x, cameraPos.z - c.model.position.z);
        c.model.rotation.y = lerpAngle(c.model.rotation.y, ang, Math.min(1, dt * 4));
      }
      const s = c.leaving && c.gone ? Math.max(0, c.model.scale.x - dt * 3) : c.grow;
      c.model.scale.setScalar(Math.max(0.001, s));
      animateVillager(c.model, dt, { walking, happy: c === this.current ? this.happy : 0 });
    }
    this.others = this.others.filter(c => {
      if (c.gone && c.model.scale.x <= 0.002) { this.scene.remove(c.model); return false; }
      return true;
    });
    this.hearts.forEach((h, i) => {
      h.userData.delay -= dt;
      if (h.userData.delay > 0) return;
      const s = h.scale.x + (h.userData.target - h.scale.x) * Math.min(1, dt * 6);
      h.scale.setScalar(s);
      h.rotation.y = Math.sin(performance.now() / 600 + i) * 0.4;
      h.position.y = 1.6 + Math.sin(performance.now() / 500 + i) * 0.02;
    });
  }
}

// ---------------------------------------------------------------- crowd (lobby + finale)
export class Crowd {
  constructor(scene) { this.scene = scene; this.members = new Map(); this.group = new THREE.Group(); scene.add(this.group); }
  sync(players, { withScores = false } = {}) {
    const ids = new Set(players.map(p => p.id));
    for (const [id, m] of this.members) if (!ids.has(id)) { this.group.remove(m.model); this.members.delete(id); }
    const n = players.length;
    players.forEach((p, i) => {
      let m = this.members.get(p.id);
      if (!m) {
        const model = makeVillager(p.villager);
        model.position.set(DOOR.x, 0, DOOR.z + 0.3);
        const label = labelSprite(p.name, { size: 0.09 });
        label.position.set(0, 1.42, 0);
        model.add(label);
        this.group.add(model);
        m = { model, label, name: p.name, score: null, grow: 0 };
        this.members.set(p.id, m);
      }
      const spread = Math.min(1.25, 0.24 * Math.max(1, n - 1));
      const a = n === 1 ? 0 : -spread / 2 + (i / (n - 1)) * spread;
      const r = 2.05 + (i % 2) * 0.35;
      const target = new THREE.Vector3(Math.sin(a) * r, 0, -Math.cos(a) * r - 0.2);
      if (!m.target || m.target.distanceTo(target) > 0.01) {
        m.target = target;
        m.walker = new Walker(m.model, m.model.position.distanceTo(target) > 1.2 ? [new THREE.Vector3(DOOR.x, 0, DOOR.z + 0.8), target] : [target], 1.3);
      }
      const txt = withScores ? `${p.name} · ${p.score}` : p.name;
      if (m.text !== txt) { m.label.userData.redraw(txt); m.text = txt; }
      m.dim = !p.connected;
    });
  }
  clear() { for (const m of this.members.values()) this.group.remove(m.model); this.members.clear(); }
  update(dt, cameraPos) {
    for (const m of this.members.values()) {
      m.grow = Math.min(1, m.grow + dt * 2);
      m.model.scale.setScalar(m.grow * (m.dim ? 0.85 : 1));
      const walking = m.walker && !m.walker.done && m.walker.update(dt);
      if (!walking && cameraPos) {
        const ang = Math.atan2(cameraPos.x - m.model.position.x, cameraPos.z - m.model.position.z);
        m.model.rotation.y = lerpAngle(m.model.rotation.y, ang, Math.min(1, dt * 3));
      }
      animateVillager(m.model, dt, { walking, happy: this.cheer ? 0.6 : 0 });
    }
  }
}

// ---------------------------------------------------------------- Garden Sprite orbs (non-customer phones)
export class SpriteOrbs {
  constructor(scene) { this.scene = scene; this.orbs = new Map(); this.group = new THREE.Group(); scene.add(this.group); }
  sync(players, excludeId) {
    const list = players.filter(p => p.id !== excludeId);
    const ids = new Set(list.map(p => p.id));
    for (const [id, o] of this.orbs) if (!ids.has(id)) { this.group.remove(o.obj); this.orbs.delete(id); }
    const n = list.length;
    list.forEach((p, i) => {
      let o = this.orbs.get(p.id);
      if (!o) {
        const col = VILLAGERS[p.villager]?.body || '#f6c6d8';
        const obj = new THREE.Group();
        const core = new THREE.Mesh(new THREE.SphereGeometry(0.05, 14, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).lerp(new THREE.Color('#ffffff'), 0.4) }));
        const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: col, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }));
        halo.scale.set(0.32, 0.32, 1);
        const wingMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, side: THREE.DoubleSide });
        const wings = [-1, 1].map(s => { const w = new THREE.Mesh(new THREE.CircleGeometry(0.05, 10), wingMat); w.scale.set(0.6, 1, 1); w.position.set(0.05 * s, 0.03, -0.01); w.rotation.z = 0.6 * s; return w; });
        const label = labelSprite(p.name, { size: 0.07 });
        label.position.set(0, -0.13, 0);
        obj.add(core, halo, ...wings, label);
        this.group.add(obj);
        o = { obj, wings, home: new THREE.Vector3(), t: Math.random() * 10, fly: null, name: p.name, color: col };
        obj.position.set(DOOR.x, 2, DOOR.z + 0.5);
        this.orbs.set(p.id, o);
      }
      const a = n === 1 ? 0 : -0.95 + (i / Math.max(1, n - 1)) * 1.9;
      o.home.set(Math.sin(a) * 1.75, 2.0 + (i % 2) * 0.22, -Math.cos(a) * 1.75 - 0.1);
    });
  }
  get(id) { return this.orbs.get(id); }
  // fly to a world position, call cb, then return home
  visit(id, pos, cb) {
    const o = this.orbs.get(id);
    if (!o) { cb?.(); return; }
    o.fly = { from: o.obj.position.clone(), to: pos.clone(), t: 0, dur: 1.1, cb, back: false };
  }
  update(dt) {
    for (const o of this.orbs.values()) {
      o.t += dt;
      o.wings.forEach((w, i) => w.rotation.y = (i ? -1 : 1) * Math.sin(o.t * 14) * 0.6);
      if (o.fly) {
        const f = o.fly;
        f.t += dt / f.dur;
        const k = Math.min(1, f.t);
        const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        const target = f.back ? o.home : f.to;
        o.obj.position.lerpVectors(f.from, target, e);
        o.obj.position.y += Math.sin(k * Math.PI) * 0.25;
        if (k >= 1) {
          if (!f.back) { f.cb?.(); o.fly = { from: o.obj.position.clone(), t: 0, dur: 1.2, back: true }; }
          else o.fly = null;
        }
      } else {
        const tgt = o.home.clone(); tgt.y += Math.sin(o.t * 1.3) * 0.05; tgt.x += Math.sin(o.t * 0.7) * 0.04;
        o.obj.position.lerp(tgt, Math.min(1, dt * 1.5));
      }
    }
  }
  clear() { for (const o of this.orbs.values()) this.group.remove(o.obj); this.orbs.clear(); }
}

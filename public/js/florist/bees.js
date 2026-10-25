// Cheeky bees sent by Garden Sprites: they fly to the bouquet and try to steal a stem.
import * as THREE from 'three';
import { labelSprite } from './textures.js';
import { DOOR } from './world.js';

const ease = (k) => k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;

function makeBee() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.03, 14, 10), new THREE.MeshLambertMaterial({ color: '#f6cf4a' }));
  body.scale.set(0.85, 0.85, 1.25);
  g.add(body);
  const stripeMat = new THREE.MeshLambertMaterial({ color: '#4f4058' });
  [-0.012, 0.012].forEach(z => {
    const s = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.005, 5, 14), stripeMat);
    s.position.z = z; g.add(s);
  });
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.019, 10, 8), stripeMat);
  head.position.z = 0.038; g.add(head);
  const eyeMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  [-1, 1].forEach(s => { const e = new THREE.Mesh(new THREE.SphereGeometry(0.006, 6, 5), eyeMat); e.position.set(0.009 * s, 0.006, 0.052); g.add(e); });
  const wingMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.65, side: THREE.DoubleSide });
  const wings = [-1, 1].map(s => {
    const piv = new THREE.Group();
    piv.position.set(0.01 * s, 0.024, 0);
    const w = new THREE.Mesh(new THREE.CircleGeometry(0.026, 12), wingMat);
    w.scale.set(1, 0.6, 1); w.position.x = 0.022 * s; w.rotation.x = -Math.PI / 2;
    piv.add(w); g.add(piv);
    return piv;
  });
  g.userData.wings = wings;
  const carry = new THREE.Object3D(); carry.position.set(0, -0.03, 0); g.add(carry);
  g.userData.carry = carry;
  return g;
}

export class Bees {
  constructor(scene, atelier, sound, { onResult, camera }) {
    this.scene = scene; this.atelier = atelier; this.sound = sound; this.onResult = onResult; this.camera = camera;
    this.bees = new Map();
    this.colliders = [];
  }

  spawn(info, from) {
    if (this.bees.has(info.id)) return;
    const obj = makeBee();
    obj.position.copy(from || new THREE.Vector3(DOOR.x, 1.8, DOOR.z + 0.5));
    const tag = labelSprite(`${info.ownerName}'s bee`, { size: 0.035, font: 40 });
    tag.position.y = 0.07;
    obj.add(tag);
    const hit = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
    obj.add(hit);
    this.scene.add(obj);
    const bee = { id: info.id, info, obj, hit, state: 'approach', t: 0, from: obj.position.clone(), stem: null, buzz: this.sound.bee(), wob: Math.random() * 10 };
    hit.userData.bee = bee;
    this.colliders.push(hit);
    this.bees.set(info.id, bee);
  }

  cancel(id) {
    const b = this.bees.get(id);
    if (!b) return;
    if (b.state === 'approach' || b.state === 'grab') this.flyOff(b, false, 'cancel');
  }
  cancelAll() { for (const id of this.bees.keys()) this.cancel(id); }

  shoo(b) {
    if (!b || b.state === 'shooed' || b.state === 'leaving') return;
    this.sound.sfx('shoo');
    // give the stem back
    if (b.stem) {
      const stem = b.stem; b.stem = null;
      const form = b.stemForm || 'bouquet';
      if (this.atelier.canAdd(form)) { this.scene.attach(stem.obj); this.atelier.addStem(stem, form); }
      else this.atelier.poof(stem.obj);
    }
    this.flyOff(b, true, 'shooed');
    this.onResult({ id: b.id, outcome: 'shooed' });
  }

  flyOff(b, spin, why) {
    b.state = spin ? 'shooed' : 'leaving';
    b.t = 0;
    b.from = b.obj.position.clone();
    b.to = new THREE.Vector3(b.from.x + (Math.random() - 0.5) * 2, 3.2, b.from.z - 1.5);
    b.why = why;
  }

  update(dt, handPositions = []) {
    const anchor = this.atelier.anchorWorld();
    const camRight = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.getWorldQuaternion(new THREE.Quaternion()));
    const camPos = this.camera.getWorldPosition(new THREE.Vector3());
    for (const b of [...this.bees.values()]) {
      b.t += dt;
      b.wob += dt;
      b.obj.userData.wings.forEach((w, i) => w.rotation.z = (i ? -1 : 1) * (0.3 + Math.sin(b.wob * 50) * 0.5));
      const prev = b.obj.position.clone();
      const hover = new THREE.Vector3(anchor.x + Math.sin(b.wob * 2.3) * 0.05, anchor.y + 0.2 + Math.sin(b.wob * 3.1) * 0.03, anchor.z + Math.cos(b.wob * 1.7) * 0.05);
      if (b.state === 'approach') {
        const k = Math.min(1, b.t / 3.4);
        b.obj.position.lerpVectors(b.from, hover, ease(k));
        b.obj.position.y += Math.sin(k * Math.PI) * 0.3 + Math.sin(b.wob * 6) * 0.02;
        b.obj.position.x += Math.sin(b.wob * 4) * 0.03 * (1 - k);
        if (k >= 1) { b.state = 'grab'; b.t = 0; }
      } else if (b.state === 'grab') {
        b.obj.position.lerp(hover, Math.min(1, dt * 4));
        if (b.t > 1.5) {
          const stem = this.stealStem();
          if (stem) {
            b.stem = stem.stem; b.stemForm = stem.form;
            b.obj.userData.carry.attach(stem.stem.obj);
            stem.stem.obj.position.set(0, -0.12, 0);
            stem.stem.obj.quaternion.identity();
            stem.stem.obj.scale.setScalar(0.7);
            this.sound.sfx('pop');
            b.state = 'escape'; b.t = 0; b.from = b.obj.position.clone();
            b.to = new THREE.Vector3(DOOR.x + 0.3, 2.3, DOOR.z + 0.3);
          } else if (b.t > 7) {
            this.flyOff(b, false, 'nothing');
            this.onResult({ id: b.id, outcome: 'nothing' });
          }
        }
      } else if (b.state === 'escape') {
        const k = Math.min(1, b.t / 3.0);
        b.obj.position.lerpVectors(b.from, b.to, ease(k));
        b.obj.position.y += Math.sin(k * Math.PI) * 0.35;
        if (k >= 1) {
          const name = b.stem?.hybrid?.name || (b.stem ? undefined : '');
          this.onResult({ id: b.id, outcome: 'stole', name: name || this.stemName(b.stem) });
          this.remove(b);
          continue;
        }
      } else {
        const k = Math.min(1, b.t / (b.state === 'shooed' ? 1.1 : 2.0));
        b.obj.position.lerpVectors(b.from, b.to, ease(k));
        if (b.state === 'shooed') b.obj.rotation.y += dt * 14;
        if (k >= 1) { this.remove(b); continue; }
      }
      // face the movement direction
      const d = b.obj.position.clone().sub(prev);
      if (b.state !== 'shooed' && d.lengthSq() > 1e-8) b.obj.rotation.y = Math.atan2(d.x, d.z);
      // shooing by hand
      if (b.state === 'approach' || b.state === 'grab' || b.state === 'escape') {
        for (const hp of handPositions) {
          const d = hp.pos.distanceTo(b.obj.position);
          if (d < 0.075 || (d < 0.16 && hp.speed > 0.45)) { this.shoo(b); break; }
        }
      }
      // stereo position of the buzz
      const rel = b.obj.position.clone().sub(camPos);
      const dist = Math.max(0.3, rel.length());
      b.buzz.setPan(rel.normalize().dot(camRight));
      b.buzz.setGain(Math.min(1.4, 1 / dist));
    }
  }

  stemName(stem) {
    if (!stem) return 'flower';
    if (stem.hybrid) return stem.hybrid.name;
    return { rose: 'Red Rose', tulip: 'White Tulip', sunflower: 'Sunflower', lavender: 'Lavender', daisy: 'Daisy', forgetmenot: 'Forget-me-not', moonpetal: 'Moonpetal' }[stem.k] || 'flower';
  }

  stealStem() {
    const at = this.atelier;
    if (at.locked || !at.arr.stems.length) return null;
    const list = at.arr.stems;
    const stem = list[Math.floor(Math.random() * list.length)];
    const form = at.arr.form;
    at.removeStem(stem);
    return { stem, form };
  }

  remove(b) {
    b.buzz.stop();
    this.scene.remove(b.obj);
    this.colliders = this.colliders.filter(c => c !== b.hit);
    this.bees.delete(b.id);
  }
}

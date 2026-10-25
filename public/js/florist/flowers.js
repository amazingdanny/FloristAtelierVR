// Procedural low-poly flowers (shared geometry, per-colour materials).
import * as THREE from 'three';
import { mergeGeometries } from '/vendor/three/addons/BufferGeometryUtils.js';
import { FLOWERS } from '../shared/data.js';
import { glowTexture } from './textures.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const Q = new THREE.Quaternion();
const E = new THREE.Euler();
const M = new THREE.Matrix4();
const S = new THREE.Vector3();

let srandSeed = 99;
const rnd = () => { srandSeed = (srandSeed * 16807) % 2147483647; return srandSeed / 2147483647; };

function shade(geo, base = 1, jitter = 0.12) {
  // light grayscale vertex colours -> painterly variation once multiplied by material colour
  const n = geo.attributes.position.count;
  const c = new Float32Array(n * 3);
  const pos = geo.attributes.position;
  for (let i = 0; i < n; i++) {
    const y = pos.getY(i);
    const v = Math.min(1, base - jitter * 0.5 + rnd() * jitter + y * 0.6);
    c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = v;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return geo;
}

function ellipsoid(w, t, h, seg = 8) {
  const g = new THREE.SphereGeometry(1, seg, Math.max(5, seg - 2));
  g.scale(w, h, t);
  return g;
}
function place(geo, pos, rot, scale = 1) {
  E.set(rot[0], rot[1], rot[2], 'YXZ');
  Q.setFromEuler(E);
  S.set(scale, scale, scale);
  M.compose(pos, Q, S);
  geo.applyMatrix4(M);
  return geo;
}
// petal with base at origin, extending up (+Y), then tilted outward (around X) and spun (around Y)
function petal(w, t, h, tilt, spin, radius, y = 0, cup = 0) {
  const g = ellipsoid(w, t, h);
  g.translate(0, h * 0.85, cup);
  E.set(tilt, spin, 0, 'YXZ');
  Q.setFromEuler(E);
  M.compose(V(Math.sin(spin) * radius, y, Math.cos(spin) * radius), Q, V(1, 1, 1));
  g.applyMatrix4(M);
  return g;
}

const STEM_LEN = { rose: 0.34, tulip: 0.32, sunflower: 0.38, lavender: 0.36, daisy: 0.3, forgetmenot: 0.28, moonpetal: 0.33,
  lilyWhite: 0.38, lilyPink: 0.38, peony: 0.32, orchid: 0.34, carnation: 0.32, hydrangea: 0.3, poppy: 0.36 };

// Lily: six long pointed petals flaring out, with long stamens (shared by both lilies)
function lilyHead(petals, centers) {
  for (let i = 0; i < 6; i++) {
    const g = petal(0.011, 0.0025, 0.04, 0.95 + (i % 2) * 0.12, (i / 6) * Math.PI * 2 + (i % 2) * 0.1, 0.003, 0);
    petals.push(shade(g, 0.95, 0.1));
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.5;
    const st = new THREE.CylinderGeometry(0.0007, 0.0007, 0.032, 4).translate(0, 0.016, 0);
    place(st, V(0, 0.004, 0), [0.35, a, 0]);
    centers.push(shade(st, 0.9, 0.05));
    const tip = place(ellipsoid(0.0018, 0.0018, 0.0035, 5).translate(0, 0.034, 0), V(0, 0.004, 0), [0.35, a, 0]);
    centers.push(shade(tip, 0.95, 0.05));
  }
}
const headCache = new Map();

export function headGeoms(kind) {
  if (headCache.has(kind)) return headCache.get(kind);
  srandSeed = 1000 + kind.length * 77;
  const petals = [], centers = [];
  switch (kind) {
    case 'rose': {
      centers.push(shade(place(ellipsoid(0.014, 0.014, 0.018), V(0, 0.016, 0), [0, 0, 0]), 0.9));
      const rings = [[5, 0.25, 0.006, 0.014, 0.018], [6, 0.6, 0.012, 0.017, 0.021], [7, 1.0, 0.018, 0.019, 0.022]];
      rings.forEach(([n, tilt, r, w, h], ri) => {
        for (let i = 0; i < n; i++) petals.push(shade(petal(w, 0.004, h, tilt, (i / n) * Math.PI * 2 + ri * 0.5, r, 0.004 + (2 - ri) * 0.004), 0.85 + ri * 0.06));
      });
      break;
    }
    case 'tulip': {
      for (let i = 0; i < 6; i++) petals.push(shade(petal(0.016, 0.005, 0.03, 0.16 + (i % 2) * 0.08, (i / 6) * Math.PI * 2, 0.004, 0), 0.92));
      centers.push(shade(ellipsoid(0.006, 0.006, 0.01).translate(0, 0.012, 0), 0.9));
      break;
    }
    case 'sunflower': {
      const head = [];
      head.push(shade(new THREE.CylinderGeometry(0.03, 0.026, 0.012, 14).translate(0, 0.006, 0), 0.8));
      for (let i = 0; i < 18; i++) petals.push(shade(petal(0.008, 0.003, 0.026, 1.35 + (i % 2) * 0.12, (i / 18) * Math.PI * 2, 0.026, 0.004), 0.95));
      centers.push(...head);
      break;
    }
    case 'daisy': {
      centers.push(shade(ellipsoid(0.01, 0.01, 0.006).translate(0, 0.006, 0), 0.95));
      for (let i = 0; i < 14; i++) petals.push(shade(petal(0.0045, 0.002, 0.022, 1.3, (i / 14) * Math.PI * 2, 0.008, 0.003), 1.0, 0.05));
      break;
    }
    case 'lavender': {
      for (let i = 0; i < 18; i++) {
        const y = i * 0.0055, a = i * 2.2;
        petals.push(shade(place(ellipsoid(0.0045, 0.0045, 0.0065, 6), V(Math.sin(a) * 0.0045, y, Math.cos(a) * 0.0045), [0, a, 0]), 0.85 + (i / 18) * 0.15));
      }
      break;
    }
    case 'forgetmenot': {
      const spots = [[0, 0.012, 0], [0.018, 0.004, 0.006], [-0.016, 0.006, 0.01], [0.006, 0.002, -0.018], [-0.008, 0.016, -0.01], [0.012, 0.018, 0.012]];
      for (const [x, y, z] of spots) {
        for (let i = 0; i < 5; i++) {
          const g = petal(0.0045, 0.0015, 0.005, 1.35, (i / 5) * Math.PI * 2, 0.002, 0);
          g.translate(x, y, z);
          petals.push(shade(g, 0.95, 0.08));
        }
        centers.push(shade(ellipsoid(0.002, 0.002, 0.002, 5).translate(x, y + 0.002, z), 1));
      }
      break;
    }
    case 'lilyWhite':
    case 'lilyPink':
      lilyHead(petals, centers);
      break;
    case 'peony': {
      // big, round and ruffled: many cupped petals in rings
      centers.push(shade(ellipsoid(0.012, 0.012, 0.012).translate(0, 0.016, 0), 0.95));
      const rings = [[6, 0.2, 0.006, 0.015, 0.017], [8, 0.55, 0.013, 0.018, 0.02], [10, 0.95, 0.02, 0.021, 0.021], [11, 1.3, 0.026, 0.02, 0.018]];
      rings.forEach(([n, tilt, r, w, h], ri) => {
        for (let i = 0; i < n; i++) petals.push(shade(petal(w, 0.004, h, tilt + (rnd() - 0.5) * 0.15, (i / n) * Math.PI * 2 + ri * 0.4, r, 0.003 + (3 - ri) * 0.003, 0.004), 0.86 + ri * 0.05));
      });
      break;
    }
    case 'orchid': {
      // three narrow sepals, two wide petals and a frilly lip, facing forward
      const face = [];
      for (let i = 0; i < 3; i++) face.push(shade(petal(0.008, 0.002, 0.024, 1.45, (i / 3) * Math.PI * 2 + Math.PI, 0.003, 0), 0.95));
      for (const sp of [Math.PI * 0.5, Math.PI * 1.5]) face.push(shade(petal(0.014, 0.002, 0.022, 1.45, sp, 0.003, 0), 1.0, 0.06));
      face.push(shade(place(ellipsoid(0.01, 0.006, 0.012), V(0, -0.008, 0.008), [0.4, 0, 0]), 0.8));
      const tilt = new THREE.Matrix4().makeRotationX(-1.2); // turn the face to the front
      face.forEach(g => petals.push(g.applyMatrix4(tilt)));
      centers.push(shade(place(ellipsoid(0.003, 0.003, 0.006, 5), V(0, 0.004, 0.004), [0.4, 0, 0]), 1));
      break;
    }
    case 'carnation': {
      // tight frilly pom-pom of many small petals
      for (let i = 0; i < 22; i++) {
        const ring = i % 3;
        petals.push(shade(petal(0.009, 0.003, 0.014, 0.35 + ring * 0.42 + (rnd() - 0.5) * 0.2, i * 2.4, 0.004 + ring * 0.005, 0.006 - ring * 0.002), 0.85 + ring * 0.06, 0.18));
      }
      break;
    }
    case 'hydrangea': {
      // a dome of tiny four-petal florets
      for (let i = 0; i < 16; i++) {
        const y = 1 - (i / 15) * 0.85, r = Math.sqrt(1 - y * y), a = i * 2.4;
        const n = V(Math.sin(a) * r, y, Math.cos(a) * r);
        const c = n.clone().multiplyScalar(0.026).add(V(0, 0.012, 0));
        const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), n);
        for (let k = 0; k < 4; k++) {
          const g = petal(0.0048, 0.0015, 0.0055, 1.3, (k / 4) * Math.PI * 2 + a, 0.001, 0);
          g.applyQuaternion(q).translate(c.x, c.y, c.z);
          petals.push(shade(g, 0.9 + rnd() * 0.1, 0.06));
        }
        centers.push(shade(ellipsoid(0.0015, 0.0015, 0.0015, 4).translate(c.x + n.x * 0.002, c.y + n.y * 0.002, c.z + n.z * 0.002), 1));
      }
      break;
    }
    case 'poppy': {
      // four big crinkled cup petals and a dark seed head
      for (let i = 0; i < 4; i++) petals.push(shade(petal(0.022, 0.004, 0.024, 0.7 + (i % 2) * 0.15, (i / 4) * Math.PI * 2, 0.004, 0, 0.004), 0.9, 0.16));
      centers.push(shade(ellipsoid(0.008, 0.008, 0.007).translate(0, 0.01, 0), 0.9));
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        centers.push(shade(ellipsoid(0.0012, 0.0012, 0.003, 4).translate(Math.sin(a) * 0.009, 0.011, Math.cos(a) * 0.009), 0.8));
      }
      break;
    }
    case 'moonpetal': {
      const prof = [V(0.001, 0, 0), V(0.008, 0.004, 0), V(0.017, 0.016, 0), V(0.02, 0.032, 0), V(0.017, 0.044, 0), V(0.025, 0.05, 0), V(0.03, 0.052, 0)].map(v => new THREE.Vector2(v.x, v.y));
      const bell = new THREE.LatheGeometry(prof, 12);
      petals.push(shade(bell, 0.95, 0.08));
      centers.push(shade(ellipsoid(0.004, 0.004, 0.004, 6).translate(0, 0.036, 0), 1));
      centers.push(shade(new THREE.CylinderGeometry(0.0012, 0.0012, 0.03, 4).translate(0, 0.02, 0), 1));
      break;
    }
  }
  const out = {
    petals: mergeGeometries(petals),
    center: centers.length ? mergeGeometries(centers) : null,
    len: STEM_LEN[kind] || 0.32,
  };
  headCache.set(kind, out);
  return out;
}

const stemCache = new Map();
function stemGeoms(kind) {
  if (stemCache.has(kind)) return stemCache.get(kind);
  const L = STEM_LEN[kind] || 0.32;
  const r = kind === 'lavender' ? 0.0025 : 0.0038;
  const stem = new THREE.CylinderGeometry(r * 0.85, r, L, 6, 1).translate(0, L / 2, 0);
  srandSeed = 555 + L * 1000;
  const leaves = [];
  const lw = kind === 'lavender' ? 0.004 : 0.011;
  const lh = kind === 'lavender' ? 0.045 : 0.036;
  [[0.32, 0.4, 0], [0.5, 0.5, Math.PI]].forEach(([fy, tilt, spin]) => {
    const g = ellipsoid(lw, 0.0016, lh, 7);
    g.translate(0, lh * 0.9, 0);
    E.set(tilt + 0.5, spin + 0.6, 0, 'YXZ'); Q.setFromEuler(E);
    M.compose(V(0, L * fy, 0), Q, V(1, 1, 1));
    g.applyMatrix4(M);
    leaves.push(g);
  });
  const out = { stem, leaves: mergeGeometries(leaves) };
  stemCache.set(kind, out);
  return out;
}

const matCache = new Map();
export function mat(color, { emissive = null, emissiveIntensity = 0.6, vertexColors = true } = {}) {
  const key = color + '|' + emissive + '|' + emissiveIntensity + '|' + vertexColors;
  if (matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshLambertMaterial({ color, vertexColors, side: THREE.DoubleSide });
  if (emissive) { m.emissive = new THREE.Color(emissive); m.emissiveIntensity = emissiveIntensity; }
  matCache.set(key, m);
  return m;
}
export const STEM_MAT = new THREE.MeshLambertMaterial({ color: '#7fae6e' });
export const LEAF_MAT = new THREE.MeshLambertMaterial({ color: '#8cc07a', side: THREE.DoubleSide });

export const glowMats = []; // materials whose glow gently "breathes"

// opts: { petal, glowColor } for hybrids
export function createFlower(kind, opts = {}) {
  const F = FLOWERS[kind];
  const H = headGeoms(kind);
  const SG = stemGeoms(kind);
  const g = new THREE.Group();
  const stem = new THREE.Mesh(SG.stem, STEM_MAT);
  const leaves = new THREE.Mesh(SG.leaves, LEAF_MAT);
  const petalColor = opts.petal || F.petal;
  const glow = opts.glowColor || (F.glow ? F.petal : null);
  const petalMat = glow ? mat(petalColor, { emissive: glow, emissiveIntensity: opts.glowColor ? 0.55 : 0.75 }) : mat(petalColor);
  if (glow && !glowMats.includes(petalMat)) glowMats.push(petalMat);
  const head = new THREE.Mesh(H.petals, petalMat);
  head.position.y = H.len;
  g.add(stem, leaves, head);
  if (H.center) {
    const c = new THREE.Mesh(H.center, mat(F.center, glow ? { emissive: glow, emissiveIntensity: 0.4 } : {}));
    c.position.y = H.len;
    g.add(c);
  }
  if (kind === 'sunflower' || kind === 'daisy') { head.rotation.x = 0.5; g.children[g.children.length - 1].rotation.x = 0.5; }
  if (glow) {
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: glow, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.scale.set(0.13, 0.13, 1);
    halo.position.y = H.len + 0.02;
    g.add(halo);
    g.userData.halo = halo;
  }
  g.userData.kind = kind;
  g.userData.leaves = leaves;
  g.userData.len = H.len;
  return g;
}

// A merged bunch of decorative stems for a bucket (3 draw calls).
export function createBunch(kind, count = 6) {
  const F = FLOWERS[kind];
  const H = headGeoms(kind), SG = stemGeoms(kind);
  const pet = [], cen = [], stm = [];
  srandSeed = 4242 + kind.charCodeAt(0) * 13;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + rnd() * 0.6;
    const tilt = 0.12 + rnd() * 0.22;
    const lift = rnd() * 0.05;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.cos(a) * tilt, rnd() * 6, -Math.sin(a) * tilt));
    const base = V(Math.sin(a) * 0.02, lift, Math.cos(a) * 0.02);
    const mStem = new THREE.Matrix4().compose(base, q, V(1, 1, 1));
    const headOff = new THREE.Matrix4().makeTranslation(0, H.len, 0);
    if (kind === 'sunflower' || kind === 'daisy') headOff.multiply(new THREE.Matrix4().makeRotationX(0.5));
    const mHead = mStem.clone().multiply(headOff);
    stm.push(SG.stem.clone().applyMatrix4(mStem));
    stm.push(SG.leaves.clone().applyMatrix4(mStem));
    pet.push(H.petals.clone().applyMatrix4(mHead));
    if (H.center) cen.push(H.center.clone().applyMatrix4(mHead));
  }
  const g = new THREE.Group();
  const glow = F.glow ? F.petal : null;
  const strip = (arr) => arr.map(x => { const y = x.index ? x.toNonIndexed() : x; if (!y.attributes.color) shade(y, 0.9); for (const k of Object.keys(y.attributes)) if (!['position', 'normal', 'color'].includes(k)) y.deleteAttribute(k); return y; });
  const stemMesh = new THREE.Mesh(mergeGeometries(strip(stm)), new THREE.MeshLambertMaterial({ color: '#86b874', vertexColors: true, side: THREE.DoubleSide }));
  const pm = glow ? mat(F.petal, { emissive: glow, emissiveIntensity: 0.75 }) : mat(F.petal);
  if (glow && !glowMats.includes(pm)) glowMats.push(pm);
  g.add(stemMesh, new THREE.Mesh(mergeGeometries(strip(pet)), pm));
  if (cen.length) g.add(new THREE.Mesh(mergeGeometries(strip(cen)), mat(F.center, glow ? { emissive: glow, emissiveIntensity: 0.4 } : {})));
  return g;
}

// falling-leaf / petal particle for snips
export function leafBit(color = '#8cc07a') {
  const m = new THREE.Mesh(ellipsoid(0.008, 0.0012, 0.016, 6), new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }));
  return m;
}

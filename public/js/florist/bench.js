// The florist's workbench: buckets, tools, gift basket, bouquet + crown arrangements, and all interaction logic.
import * as THREE from 'three';
import { FLOWERS, TAGS, PAPERS, RIBBONS, MAX_STEMS, makeHybrid } from '../shared/data.js';
import { createFlower, createBunch, leafBit } from './flowers.js';
import { Panel, washTexture, makeCanvas, canvasTexture, paintWash, srand, FONT_HEAD, FONT_BODY, roundRect, labelSprite, rgba, glowTexture } from './textures.js';

const DEG = Math.PI / 180;
export const pol = (r, deg, y = 0) => new THREE.Vector3(r * Math.sin(deg * DEG), y, -r * Math.cos(deg * DEG));
const L = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, ...o });
const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), tmpQ = new THREE.Quaternion();
const ease = (k) => k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
const backOut = (k) => 1 + 2.7 * Math.pow(k - 1, 3) + 1.7 * Math.pow(k - 1, 2); // overshoots a little, then settles

// Paper cone around the bouquet; theta < 2π gives a partly wrapped cone (used by the wrap animation).
function coneGeometry(theta = Math.PI * 2) {
  const geo = new THREE.CylinderGeometry(0.1, 0.018, 0.2, 24, 1, true, Math.PI, theta);
  geo.translate(0, -0.03, 0);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    // scalloped / folded paper rim
    const x = pos.getX(i), z = pos.getZ(i), y = pos.getY(i);
    const a = Math.atan2(x, z);
    const fold = 1 + 0.06 * Math.sin(a * 6);
    pos.setXYZ(i, x * fold, y + (y > 0 ? 0.015 * Math.sin(a * 6 + 1) : 0), z * fold);
  }
  geo.computeVertexNormals();
  return geo;
}

function collider(r) { return new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), new THREE.MeshBasicMaterial({ visible: false })); }

const BUCKET_LAYOUT = [
  ['sunflower', -98], ['tulip', -82], ['rose', -66],
  ['lavender', 66], ['daisy', 82], ['forgetmenot', 98],
];
const MOON_POS = [0.66, -114];
// second row, further back and raised on little wooden risers so they show over the front row
const BACK_BUCKETS = [
  ['poppy', -106], ['carnation', -90], ['lilyPink', -74],
  ['lilyWhite', 74], ['peony', 90], ['hydrangea', 106],
];
const ORCHID_POS = [0.66, 114];

export class Atelier {
  constructor(scene, { sound, floaters, onChange, onDeliver, onBell, haptic }) {
    this.scene = scene;
    this.sound = sound;
    this.floaters = floaters;
    this.onChange = onChange || (() => {});
    this.onDeliver = onDeliver || (() => {});
    this.onBell = onBell || (() => {});
    this.haptic = haptic || (() => {});
    this.root = new THREE.Group();
    this.root.position.y = 0.92;
    scene.add(this.root);
    this.targets = [];
    this.colliders = [];
    this.tweens = [];
    this.particles = [];
    this.locked = false;       // no arrangement changes (judge/reveal)
    this.canDeliver = false;   // only during arrange phase
    this.arr = { form: null, stems: [], wrap: null, ribbon: null, snips: 0 };
    this.wireBend = 0;
    this.basket = [];
    this.build();
  }

  setHeight(h) { this.root.position.y = THREE.MathUtils.clamp(h, 0.55, 1.2); }

  addTarget(t) {
    t.collider = collider(t.radius || 0.07);
    (t.anchor || t.obj).add(t.collider);
    if (t.offset) t.collider.position.copy(t.offset);
    t.collider.userData.target = t;
    this.targets.push(t);
    this.colliders.push(t.collider);
    return t;
  }
  removeTarget(t) {
    this.targets = this.targets.filter(x => x !== t);
    this.colliders = this.colliders.filter(c => c !== t.collider);
    t.collider.parent?.remove(t.collider);
  }

  // ------------------------------------------------------------------ build
  build() {
    const R = this.root;
    srand(11);
    // counter top (ring sector) + cabinet
    const shape = new THREE.Shape();
    const a0 = -118 * DEG, a1 = 118 * DEG, ro = 0.88, ri = 0.36;
    shape.moveTo(ro * Math.sin(a0), ro * Math.cos(a0));
    for (let i = 1; i <= 40; i++) { const a = a0 + (a1 - a0) * i / 40; shape.lineTo(ro * Math.sin(a), ro * Math.cos(a)); }
    for (let i = 40; i >= 0; i--) { const a = a0 + (a1 - a0) * i / 40; shape.lineTo(ri * Math.sin(a), ri * Math.cos(a)); }
    const topGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.05, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.01, bevelSegments: 2, curveSegments: 4 });
    topGeo.rotateX(-Math.PI / 2);
    topGeo.translate(0, -0.05, 0);
    // planar UVs from x/z
    const uv = topGeo.attributes.uv, pos = topGeo.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) * 1.2 + 0.5, pos.getZ(i) * 1.2 + 0.5);
    const woodTex = washTexture('#ecd0ad', ['#e0bb92', '#f5e1c6', '#dcb48c', '#f0d6b8'], { w: 512, h: 512, blots: 40, alpha: 0.2 });
    const top = new THREE.Mesh(topGeo, L('#ffffff', { map: woodTex }));
    R.add(top);
    const cabTex = washTexture('#c7e3d6', ['#b5d8c8', '#dceee5', '#bfdcd6'], { w: 512, h: 256, blots: 24, alpha: 0.18, repeat: [4, 1] });
    const cab = new THREE.Mesh(new THREE.CylinderGeometry(0.84, 0.84, 1.0, 40, 1, true, Math.PI - 118 * DEG, 236 * DEG), L('#ffffff', { map: cabTex, side: THREE.DoubleSide }));
    cab.position.y = -0.56;
    R.add(cab);
    this.cabinet = cab;
    // trim
    const trim = new THREE.Mesh(new THREE.TorusGeometry(0.885, 0.012, 5, 40, 236 * DEG), L('#f2d7b0'));
    trim.rotation.set(Math.PI / 2, 0, Math.PI / 2 + 28 * DEG);
    trim.rotation.set(-Math.PI / 2, 0, -Math.PI / 2 - 118 * DEG + Math.PI);
    trim.position.y = -0.055;
    R.add(trim);

    // ---- flower buckets
    this.buckets = [];
    const bucketTints = ['#d9e2ea', '#e8dcea', '#e6ece0', '#f0e4da', '#dde6ef', '#ece2e8'];
    BUCKET_LAYOUT.forEach(([kind, deg], i) => this.makeBucket(kind, pol(0.64, deg), -deg, bucketTints[i % bucketTints.length]));
    this.makeBucket('moonpetal', pol(MOON_POS[0], MOON_POS[1]), -MOON_POS[1], '#e3ecf8', true);
    const backTints = ['#ffd6e4', '#ffe2c8', '#f6d0ff', '#e0f3ff', '#ffe0ef', '#d8e8ff'];
    // tall wooden pedestals lift the back row well above the front flowers
    const RISER_H = 0.34;
    const riser = L('#d9b48f'), riserTrim = L('#c9a27e');
    BACK_BUCKETS.forEach(([kind, deg], i) => {
      const pos = pol(0.8, deg);
      const column = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.085, RISER_H, 16), riser);
      column.position.copy(pos).setY(RISER_H / 2);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.02, 18), riserTrim);
      top.position.copy(pos).setY(RISER_H - 0.01);
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.092, 0.095, 0.02, 18), riserTrim);
      foot.position.copy(pos).setY(0.01);
      R.add(column, top, foot);
      this.makeBucket(kind, pos.setY(RISER_H), -deg, backTints[i]);
    });
    this.makeBucket('orchid', pol(ORCHID_POS[0], ORCHID_POS[1]), -ORCHID_POS[1], '#f3e2ff');

    // ---- bouquet stand
    const standPos = pol(0.5, 0);
    const stand = new THREE.Group();
    stand.position.copy(standPos);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.085, 0.025, 20), L('#d9b48f'));
    base.position.y = 0.012;
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.11, 16, 1, true), L('#c6dcef', { side: THREE.DoubleSide, transparent: true, opacity: 0.7 }));
    tube.position.y = 0.075;
    stand.add(base, tube);
    R.add(stand);
    this.stand = stand;
    this.bouquetRest = new THREE.Vector3(0, 0.15, 0);
    this.makeBouquetGroup();

    // ---- crown stand + bendable wire
    const cpos = pol(0.56, 30);
    const cstand = new THREE.Group();
    cstand.position.copy(cpos);
    cstand.rotation.y = -30 * DEG;
    const cushion = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.125, 0.03, 24), L('#f3c9d3'));
    cushion.position.y = 0.015;
    cstand.add(cushion);
    R.add(cstand);
    this.crownStand = cstand;
    this.crownRest = new THREE.Vector3(0, 0.045, 0);
    this.makeCrownGroup();

    // ---- scissors
    this.scissors = this.makeScissors();
    this.scissors.scale.setScalar(1.5);
    this.scissorsRest = { pos: pol(0.48, -22, 0.018), rot: new THREE.Euler(0, 22 * DEG, 0) };
    this.scissors.position.copy(this.scissorsRest.pos);
    this.scissors.rotation.copy(this.scissorsRest.rot);
    R.add(this.scissors);
    this.scissorsT = this.addTarget({ type: 'scissors', obj: this.scissors, radius: 0.06, offset: new THREE.Vector3(0, 0.0, 0), label: 'Scissors — trim leaves for neatness' });

    // ---- paper rack (3 rolls)
    const prack = new THREE.Group();
    prack.position.copy(pol(0.62, -43));
    prack.rotation.y = 43 * DEG;
    // four columns of four tiers, stepping up toward the back
    const rackBase = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.02, 0.25), L('#d9b48f'));
    const rackBack = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.22, 0.015), L('#d9b48f'));
    rackBack.position.set(0, 0.12, -0.125);
    rackBase.position.y = 0.01;
    prack.add(rackBase, rackBack);
    for (const x of [-0.149, 0.149]) {
      const side = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.2, 0.24), L('#c9a27e'));
      side.position.set(x, 0.11, 0);
      prack.add(side);
    }
    this.papers = [];
    Object.entries(PAPERS).forEach(([key, p], i) => {
      const col = i % 4, tier = Math.floor(i / 4);
      const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.064, 14), L(p.color));
      roll.rotation.z = Math.PI / 2;
      roll.position.set(-0.105 + col * 0.07, 0.033 + tier * 0.046, 0.085 - tier * 0.06);
      const sheet = new THREE.Mesh(new THREE.PlaneGeometry(0.058, 0.04), L(p.color, { side: THREE.DoubleSide }));
      sheet.position.set(roll.position.x, roll.position.y - 0.02, roll.position.z + 0.024); sheet.rotation.x = -1.2;
      prack.add(roll, sheet);
      this.papers.push(this.addTarget({ type: 'paper', key, obj: roll, anchor: prack, offset: roll.position.clone(), radius: 0.027, label: `${p.name} — wrap the bouquet`, hl: roll }));
    });
    R.add(prack);

    // ---- ribbon stand: four rows of four spools on stepped tiers (like bleachers)
    const rst = new THREE.Group();
    rst.position.copy(pol(0.63, 47));
    rst.rotation.y = -47 * DEG;
    const ROW_Z = [0.075, 0.02, -0.035, -0.09], ROW_Y = [0.02, 0.045, 0.07, 0.095];
    ROW_Z.forEach((z, r) => {
      const step = new THREE.Mesh(new THREE.BoxGeometry(0.27, ROW_Y[r], 0.055), L(r % 2 ? '#c9a27e' : '#d9b48f'));
      step.position.set(0, ROW_Y[r] / 2, z);
      rst.add(step);
    });
    this.ribbons = [];
    Object.entries(RIBBONS).forEach(([key, rb], i) => {
      const row = Math.floor(i / 4);
      const x = -0.096 + (i % 4) * 0.064, z = ROW_Z[row], y0 = ROW_Y[row];
      const peg = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.06, 6), L('#b48a6a'));
      peg.position.set(x, y0 + 0.03, z);
      const spool = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.026, 16), L(rb.color));
      spool.position.set(x, y0 + 0.016, z);
      const tail = new THREE.Mesh(new THREE.PlaneGeometry(0.013, 0.03), L(rb.color, { side: THREE.DoubleSide }));
      tail.position.set(x, y0 + 0.004, z + 0.0235);
      rst.add(peg, spool, tail);
      this.ribbons.push(this.addTarget({ type: 'ribbon', key, obj: spool, anchor: rst, offset: spool.position.clone(), radius: 0.028, label: `${rb.name} — tie a bow`, hl: spool }));
    });
    R.add(rst);

    // ---- bell
    const bell = new THREE.Group();
    bell.position.copy(pol(0.74, 17));
    const bbase = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.065, 0.02, 20), L('#b48a6a'));
    bbase.position.y = 0.01;
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.05, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), L('#f2d27a', { emissive: '#a07a20', emissiveIntensity: 0.15 }));
    dome.position.y = 0.02;
    const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.025, 8), L('#e8c060'));
    btn.position.y = 0.08;
    bell.add(bbase, dome, btn);
    R.add(bell);
    this.bell = bell; this.bellDome = dome;
    this.bellT = this.addTarget({ type: 'bell', obj: bell, radius: 0.07, offset: new THREE.Vector3(0, 0.06, 0), label: 'Bell — deliver the order', hl: dome });

    // ---- gift basket for sprite flowers
    const basket = new THREE.Group();
    basket.position.copy(pol(0.73, -10));
    basket.rotation.y = 10 * DEG;
    const wicker = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.13, 0.07, 24, 1, true), L('#d4a774', { side: THREE.DoubleSide }));
    wicker.scale.set(1, 1, 0.55);
    wicker.position.y = 0.035;
    const wfloor = new THREE.Mesh(new THREE.CircleGeometry(0.13, 20), L('#c49464'));
    wfloor.rotation.x = -Math.PI / 2; wfloor.scale.set(1, 0.55, 1); wfloor.position.y = 0.005;
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.01, 6, 20, Math.PI), L('#c49464'));
    handle.position.y = 0.06;
    const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.05), new THREE.MeshBasicMaterial({ map: this.textTex('✨ Sprite gifts', '#9b85dc', 256, 80), transparent: true }));
    tag.position.set(0, 0.03, 0.08); tag.rotation.x = -0.3;
    basket.add(wicker, wfloor, handle, tag);
    R.add(basket);
    this.basketObj = basket;

    // ---- countdown on the counter edge
    this.timerPanel = new Panel(256, 96, 0.17);
    this.timerPanel.mesh.position.copy(pol(0.385, 0, 0.003));
    this.timerPanel.mesh.rotation.set(-Math.PI / 2, 0, 0);
    R.add(this.timerPanel.mesh);
    this.setTimerText('');

    // hint text near bouquet (shows what to do)
    this.hint = labelSprite('', { size: 0.045, bg: 'rgba(255,250,242,0.9)' });
    this.hint.position.copy(pol(0.5, 0, 0.5));
    this.hint.visible = false;
    R.add(this.hint);
  }

  textTex(text, color, w = 256, h = 64) {
    const c = makeCanvas(w, h), ctx = c.getContext('2d');
    roundRect(ctx, 2, 2, w - 4, h - 4, h / 2 - 2); ctx.fillStyle = 'rgba(255,250,242,0.95)'; ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = 4; ctx.stroke();
    ctx.fillStyle = '#4f4058'; ctx.font = `600 ${Math.floor(h * 0.45)}px ${FONT_HEAD}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, h / 2 + 2);
    return canvasTexture(c);
  }

  makeBucket(kind, pos, rotY, tint, glass = false) {
    const F = FLOWERS[kind], T = TAGS[F.tag];
    const g = new THREE.Group();
    g.position.copy(pos);
    g.rotation.y = rotY * DEG;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.058, 0.17, 18, 1, true),
      glass ? L('#dff0fb', { transparent: true, opacity: 0.55, side: THREE.DoubleSide, emissive: '#9fd0ff', emissiveIntensity: 0.25 }) : L(tint, { side: THREE.DoubleSide }));
    body.position.y = 0.085;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.006, 5, 22), L(glass ? '#e9f6ff' : '#c4ccd6'));
    rim.rotation.x = Math.PI / 2; rim.position.y = 0.17;
    const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.058, 18), L('#9fb8c8'));
    bottom.rotation.x = -Math.PI / 2; bottom.position.y = 0.003;
    const bunch = createBunch(kind, kind === 'lavender' ? 8 : 6);
    bunch.position.y = 0.0;
    g.add(body, rim, bottom, bunch);
    // label: name + meaning, facing the florist, tilted up
    const c = makeCanvas(320, 150), ctx = c.getContext('2d');
    roundRect(ctx, 4, 4, 312, 142, 28); ctx.fillStyle = 'rgba(255,251,244,0.97)'; ctx.fill();
    ctx.strokeStyle = T.color; ctx.lineWidth = 7; ctx.stroke();
    ctx.fillStyle = '#4f4058'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `600 50px ${FONT_HEAD}`; ctx.fillText(F.name, 160, 52, 296);
    roundRect(ctx, 70, 88, 180, 46, 23); ctx.fillStyle = rgba(T.color, 0.45); ctx.fill();
    ctx.fillStyle = '#4f4058'; ctx.font = `700 34px ${FONT_BODY}`; ctx.fillText(T.label, 160, 112, 170);
    const labelTex = canvasTexture(c);
    const label = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.07), new THREE.MeshBasicMaterial({ map: labelTex, transparent: true, toneMapped: false }));
    label.position.set(0, 0.1, 0.078);
    label.rotation.x = -0.25;
    g.add(label);
    this.root.add(g);
    g.userData.labelCanvas = { c, ctx, tex: labelTex, kind };
    const t = this.addTarget({ type: 'bucket', kind, obj: g, radius: 0.068, offset: new THREE.Vector3(0, 0.25, 0), label: `${F.name} — ${T.label}`, hl: bunch });
    this.buckets.push({ kind, group: g, target: t, labelInfo: g.userData.labelCanvas });
  }

  redrawLabels() {
    for (const b of this.buckets) {
      const { ctx, tex, kind } = b.labelInfo;
      const F = FLOWERS[kind], T = TAGS[F.tag];
      ctx.clearRect(0, 0, 320, 150);
      roundRect(ctx, 4, 4, 312, 142, 28); ctx.fillStyle = 'rgba(255,251,244,0.97)'; ctx.fill();
      ctx.strokeStyle = T.color; ctx.lineWidth = 7; ctx.stroke();
      ctx.fillStyle = '#4f4058'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `600 50px ${FONT_HEAD}`; ctx.fillText(F.name, 160, 52, 296);
      roundRect(ctx, 70, 88, 180, 46, 23); ctx.fillStyle = rgba(T.color, 0.45); ctx.fill();
      ctx.fillStyle = '#4f4058'; ctx.font = `700 34px ${FONT_BODY}`; ctx.fillText(T.label, 160, 112, 170);
      tex.needsUpdate = true;
    }
  }

  makeScissors() {
    // Two halves crossing at a gold pivot screw. Each half: a tapered blade on one side,
    // and on the other side a shank that runs straight into its finger ring.
    const g = new THREE.Group();
    const steel = L('#dfe6ee', { emissive: '#606a78', emissiveIntensity: 0.2 });
    const handleMat = L('#ec8fa6');
    const half = (side) => {
      const h = new THREE.Group();
      // blade: wide at the pivot, narrowing to a point; cutting edge along the centre line
      const blade = new THREE.BoxGeometry(0.011, 0.0025, 0.085);
      blade.translate(0, 0, -0.0425);
      const bp = blade.attributes.position;
      for (let i = 0; i < bp.count; i++) {
        const tip = -bp.getZ(i) / 0.085; // 0 at pivot, 1 at tip
        if (bp.getX(i) > 0) bp.setX(i, -0.0055 + 0.011 * (1 - 0.85 * tip)); // back edge tapers in; cutting edge stays straight
      }
      blade.computeVertexNormals();
      const bm = new THREE.Mesh(blade, steel);
      bm.position.set(side * 0.0055, 0, 0);
      bm.scale.x = side;
      // shank from the pivot out to the ring on the opposite side
      const end = new THREE.Vector3(-side * 0.012, 0, 0.03);
      const len = end.length();
      const shank = new THREE.Mesh(new THREE.BoxGeometry(0.0065, 0.004, len), handleMat);
      shank.position.copy(end).multiplyScalar(0.5);
      shank.rotation.y = Math.atan2(end.x, end.z);
      // finger ring, touching the end of the shank
      const r = 0.013;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.0042, 8, 20), handleMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.copy(end).addScaledVector(end.clone().normalize(), r);
      h.add(bm, shank, ring);
      h.position.y = side * 0.0016; // the halves sit on top of each other
      return h;
    };
    const b1 = half(1), b2 = half(-1);
    const pivot = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.009, 10), L('#f2c14e'));
    g.add(b1, b2, pivot);
    g.userData.blades = [b1, b2];
    g.userData.tip = new THREE.Object3D(); g.userData.tip.position.set(0, 0, -0.07); g.add(g.userData.tip);
    g.userData.open = 1;
    return g;
  }

  makeBouquetGroup() {
    const bg = new THREE.Group();
    bg.position.copy(this.bouquetRest);
    this.stand.add(bg);
    this.bouquetGroup = bg;
    // twine band
    const twine = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.004, 6, 16), L('#c9a77f'));
    twine.rotation.x = Math.PI / 2;
    twine.visible = false;
    bg.add(twine);
    this.twine = twine;
    // paper cone (hidden until wrapped)
    const paperTex = washTexture('#ffffff', ['#f2e6e6', '#ffffff', '#eadfe8'], { w: 256, h: 256, blots: 14, alpha: 0.25 });
    this.cone = new THREE.Mesh(coneGeometry(), new THREE.MeshLambertMaterial({ color: '#ffffff', map: paperTex, side: THREE.DoubleSide }));
    this.cone.visible = false;
    bg.add(this.cone);
    // bow
    this.bow = this.makeBow();
    this.bow.position.set(0, -0.02, 0.06);
    this.bow.visible = false;
    bg.add(this.bow);
    this.stemsHolder = new THREE.Group();
    bg.add(this.stemsHolder);
    this.bouquetT = this.addTarget({ type: 'arrangement', form: 'bouquet', obj: bg, radius: 0.06, offset: new THREE.Vector3(0, -0.05, 0), label: 'Bouquet — grab & hand it to the customer' });
  }

  makeBow() {
    const g = new THREE.Group();
    const m = L('#ffffff', { side: THREE.DoubleSide });
    const loop = new THREE.TorusGeometry(0.022, 0.007, 6, 14);
    const l1 = new THREE.Mesh(loop, m); l1.position.x = -0.022; l1.scale.set(1, 0.6, 1);
    const l2 = new THREE.Mesh(loop, m); l2.position.x = 0.022; l2.scale.set(1, 0.6, 1);
    const knot = new THREE.Mesh(new THREE.SphereGeometry(0.01, 8, 6), m);
    const t1 = new THREE.Mesh(new THREE.PlaneGeometry(0.014, 0.07), m); t1.position.set(-0.012, -0.04, 0); t1.rotation.z = -0.3;
    const t2 = new THREE.Mesh(new THREE.PlaneGeometry(0.014, 0.07), m); t2.position.set(0.012, -0.04, 0); t2.rotation.z = 0.3;
    g.add(l1, l2, knot, t1, t2);
    g.userData.mat = m;
    return g;
  }

  makeCrownGroup() {
    const cg = new THREE.Group();
    cg.position.copy(this.crownRest);
    this.crownStand.add(cg);
    this.crownGroup = cg;
    this.wireMat = L('#6f8f6a', { emissive: '#2a3a2a', emissiveIntensity: 0.1 });
    this.wire = new THREE.Mesh(new THREE.BufferGeometry(), this.wireMat);
    cg.add(this.wire);
    this.crownStems = new THREE.Group();
    cg.add(this.crownStems);
    this.crownBow = this.makeBow();
    this.crownBow.position.set(0, 0.0, 0.1);
    this.crownBow.rotation.x = -0.8;
    this.crownBow.visible = false;
    cg.add(this.crownBow);
    this.setWireBend(0);
    this.crownT = this.addTarget({ type: 'wire', obj: cg, radius: 0.08, offset: new THREE.Vector3(0, 0.02, 0), label: 'Wire — bend it into a flower crown' });
  }

  setWireBend(p) {
    p = THREE.MathUtils.clamp(p, 0, 1);
    this.wireBend = p;
    const len = 0.22 + (2 * Math.PI * 0.1 - 0.22) * p;
    let curve;
    if (p < 0.02) {
      curve = new THREE.LineCurve3(new THREE.Vector3(-len / 2, 0.01, 0), new THREE.Vector3(len / 2, 0.01, 0));
    } else {
      const ang = Math.max(0.05, p * Math.PI * 2);
      const r = len / ang;
      const pts = [];
      for (let i = 0; i <= 32; i++) {
        const a = -ang / 2 + (i / 32) * ang;
        pts.push(new THREE.Vector3(Math.sin(a) * r, 0.01, -Math.cos(a) * r + r));
      }
      curve = new THREE.CatmullRomCurve3(pts);
      // recentre the arc
      const c = new THREE.Vector3(0, 0, p >= 0.98 ? r : r * 0.6);
      curve.points?.forEach(pt => pt.sub(new THREE.Vector3(0, 0, c.z)));
    }
    this.wire.geometry.dispose();
    this.wire.geometry = new THREE.TubeGeometry(curve, p < 0.02 ? 2 : 48, 0.0035, 5, p >= 0.98);
    if (this.crownT) this.crownT.label = p >= 0.98 ? 'Flower crown — add stems around the wire' : 'Wire — bend it into a flower crown';
  }
  get crownReady() { return this.wireBend >= 0.98; }

  // ------------------------------------------------------------------ arrangement
  activeGroup() { return this.arr.form === 'crown' ? this.crownGroup : this.bouquetGroup; }

  // world-space point where stems are inserted / tools act
  anchorWorld(form = this.arr.form || 'bouquet', out = new THREE.Vector3()) {
    if (form === 'crown') return this.crownGroup.localToWorld(out.set(0, 0.02, 0));
    return this.bouquetGroup.localToWorld(out.set(0, 0.06, 0));
  }

  canAdd(form) {
    if (this.locked) return false;
    if (this.arr.stems.length >= MAX_STEMS) return false;
    if (form === 'crown' && !this.crownReady) return false;
    return !this.arr.form || this.arr.form === form;
  }

  // stem = { obj (flower group), k, f?, hybrid? }
  addStem(stem, form) {
    if (!this.canAdd(form)) return false;
    this.arr.form = form;
    this.arr.stems.push(stem);
    const holder = form === 'crown' ? this.crownStems : this.stemsHolder;
    holder.attach(stem.obj);
    stem.target = this.addTarget({ type: 'arrStem', stem, obj: stem.obj, radius: 0.045, offset: new THREE.Vector3(0, stem.obj.userData.len || 0.3, 0), label: 'Pull the stem out' });
    if (stem.obj.userData.halo) stem.obj.userData.halo.scale.setScalar(0.09);
    this.layout(true, stem);
    this.changed();
    return true;
  }

  removeStem(stem) {
    const i = this.arr.stems.indexOf(stem);
    if (i < 0) return;
    this.arr.stems.splice(i, 1);
    if (stem.target) this.removeTarget(stem.target);
    stem.target = null;
    if (!this.arr.stems.length) { this.arr.form = null; }
    this.layout(true);
    this.changed();
  }

  layout(animate, fresh = null) {
    const n = this.arr.stems.length;
    const form = this.arr.form;
    this.twine.visible = form === 'bouquet' && n > 0 && !this.arr.wrap;
    this.cone.visible = form === 'bouquet' && !!this.arr.wrap;
    this.bow.visible = form === 'bouquet' && !!this.arr.ribbon;
    this.crownBow.visible = form === 'crown' && !!this.arr.ribbon;
    // dim the unused holder
    this.wireMat.opacity = 1;
    this.arr.stems.forEach((s, i) => {
      const target = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), scale: 1 };
      if (form === 'crown') {
        const slots = Math.max(8, n);
        const a = (i / slots) * Math.PI * 2;
        const r = 0.1;
        const p = new THREE.Vector3(Math.sin(a) * r, 0.015, Math.cos(a) * r);
        const tangent = new THREE.Vector3(Math.cos(a), 0.35, -Math.sin(a)).normalize();
        const outward = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
        const dir = tangent.clone().multiplyScalar(0.8).add(outward.multiplyScalar(0.4)).normalize();
        target.quat.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        target.scale = 0.62;
        const len = (s.obj.userData.len || 0.3) * target.scale;
        target.pos.copy(p).addScaledVector(dir, -len);
      } else {
        const ga = i * 2.39996;
        const tilt = i === 0 ? 0.04 : 0.12 + 0.36 * Math.sqrt(i / 12);
        const axis = new THREE.Vector3(Math.cos(ga), 0, -Math.sin(ga));
        target.quat.setFromAxisAngle(axis, tilt);
        const lenDiff = 0.34 - (s.obj.userData.len || 0.32);
        target.pos.set(0, -0.13 + lenDiff * 0.6 + (i % 3) * 0.008, 0);
      }
      if (animate && s === fresh) {
        // a new stem hops into place, and the arrangement gives a little bounce when it lands
        const hop = Math.min(0.14, s.obj.position.distanceTo(target.pos) * 0.5);
        const holder = form === 'crown' ? this.crownStems : this.stemsHolder;
        this.tweenTo(s.obj, target.pos, target.quat, target.scale, 0.45, { arc: hop, cb: () => this.bump(holder) });
      } else this.tweenTo(s.obj, target.pos, target.quat, target.scale, animate ? 0.25 : 0);
    });
  }

  changed() {
    this.onChange(this.netState());
    if (this.onUpdateHint) this.onUpdateHint();
  }
  netState() {
    return {
      stems: this.arr.stems.map(s => s.f ? { f: s.f } : { k: s.k }),
      wrap: this.arr.wrap, ribbon: this.arr.ribbon, snips: this.arr.snips,
      form: this.arr.form || 'bouquet',
    };
  }

  // from: world position to fly a sheet in from (mouse play); animate: false skips the wrap animation (restore)
  wrap(key, { from = null, animate = true } = {}) {
    if (this.locked || this.busy) return false;
    if (this.arr.form === 'crown') { this.sound.sfx('uh'); return false; }
    if (!this.arr.stems.length) { this.sound.sfx('uh'); return false; }
    if (from) {
      this.sound.sfx('grab');
      this.flyIn(paperSheet(PAPERS[key].color), from, () => this.wrap(key));
      return true;
    }
    this.arr.wrap = key;
    this.cone.material.color.set(PAPERS[key].color);
    this.layout(false);
    if (animate) {
      // the paper sweeps around the stems, then folds up into the cone
      this.tweens = this.tweens.filter(t => t.obj !== this.cone);
      this.tweens.push({ obj: this.cone, t: 0, dur: 0.6, fn: (k) => {
        const e = ease(k);
        this.cone.geometry.dispose();
        this.cone.geometry = coneGeometry(Math.max(0.05, Math.PI * 2 * e));
        this.cone.rotation.y = -1.5 * (1 - e);
        this.cone.scale.set(1.25 - 0.25 * e, 0.75 + 0.25 * backOut(k), 1.25 - 0.25 * e);
      }, cb: () => {
        this.cone.geometry.dispose();
        this.cone.geometry = coneGeometry();
        this.cone.rotation.y = 0;
        this.cone.scale.set(1, 1, 1);
        this.sparkle(this.anchorWorld('bouquet'), PAPERS[key].color);
        this.bump(this.bouquetGroup);
      } });
      this.sound.sfx('wrap');
    }
    this.changed();
    return true;
  }
  tie(key, { from = null, animate = true } = {}) {
    if (this.locked || this.busy || !this.arr.stems.length) { this.sound.sfx('uh'); return false; }
    if (from) {
      this.sound.sfx('grab');
      this.flyIn(ribbonCurl(RIBBONS[key].color), from, () => this.tie(key));
      return true;
    }
    this.arr.ribbon = key;
    this.bow.userData.mat.color.set(RIBBONS[key].color);
    this.crownBow.userData.mat.color.set(RIBBONS[key].color);
    this.layout(false);
    if (animate) {
      // the bow loops itself into a knot and pops into shape
      const bow = this.arr.form === 'crown' ? this.crownBow : this.bow;
      this.tweens = this.tweens.filter(t => t.obj !== bow);
      this.tweens.push({ obj: bow, t: 0, dur: 0.55, fn: (k) => {
        bow.scale.setScalar(Math.max(0.001, backOut(k)));
        bow.rotation.z = 2.5 * (1 - ease(k));
      }, cb: () => { bow.scale.setScalar(1); bow.rotation.z = 0; } });
      this.sound.sfx('ribbon');
      this.sparkle(this.anchorWorld(), RIBBONS[key].color);
    }
    this.changed();
    return true;
  }

  // Fly a prop (paper sheet, ribbon) from a tool to the arrangement, then run onArrive.
  flyIn(obj, from, onArrive) {
    this.busy = true;
    obj.position.copy(from);
    this.scene.add(obj);
    const to = this.anchorWorld();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.random() - 0.5, 0));
    this.tweenTo(obj, to, q, 0.6, 0.45, { arc: 0.12, spin: 1, cb: () => {
      this.busy = false;
      this.scene.remove(obj);
      onArrive();
    } });
  }

  // Mouse play: the scissors fly over, snip, and go back to their spot on the counter.
  useScissors() {
    if (this.locked || this.busy || !this.arr.stems.length) return false;
    this.busy = true;
    const sc = this.scissors;
    const anchor = this.root.worldToLocal(this.anchorWorld());
    const toward = new THREE.Vector3(-anchor.x, 0, -anchor.z).normalize(); // from the arrangement toward the florist
    const crown = this.arr.form === 'crown';
    const pos = anchor.clone().addScaledVector(toward, crown ? 0.13 : 0.08).add(new THREE.Vector3(0, crown ? 0.03 : -0.02, 0));
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.15, Math.atan2(toward.x, toward.z), 0, 'YXZ'));
    const restQ = new THREE.Quaternion().setFromEuler(this.scissorsRest.rot);
    const back = () => this.tweenTo(sc, this.scissorsRest.pos, restQ, 1.5, 0.4, { arc: 0.06, cb: () => { this.busy = false; } });
    this.sound.sfx('grab');
    this.tweenTo(sc, pos, q, 1.5, 0.35, { arc: 0.08, cb: () => {
      if (!this.snip()) return back();
      // a second quick clack for good measure, then put them down
      this.delay(0.22, () => { sc.userData.open = 0; this.sound.sfx('snip'); this.delay(0.25, back); });
    } });
    return true;
  }
  snip() {
    if (this.locked || !this.arr.stems.length) return false;
    this.arr.snips++;
    const leafy = this.arr.stems.filter(s => s.obj.userData.leaves.visible);
    const pickS = leafy[Math.floor(Math.random() * leafy.length)];
    const from = this.anchorWorld();
    if (pickS) {
      pickS.obj.userData.leaves.visible = false;
      pickS.obj.userData.leaves.getWorldPosition(from);
      from.y += 0.08;
    }
    this.bump(this.arr.form === 'crown' ? this.crownStems : this.stemsHolder, 0.03);
    for (let i = 0; i < 4; i++) this.fallingBit(from.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.06, 0, (Math.random() - 0.5) * 0.06)));
    this.sound.sfx('snip');
    this.scissors.userData.open = 0;
    this.changed();
    return true;
  }

  // ------------------------------------------------------------------ gift basket
  addGift(flower) {
    // flower: {f, a, b, name, petal, glowColor, ownerName, owner}
    if (this.basket.find(x => x.f === flower.f) || this.arr.stems.find(s => s.f === flower.f)) return;
    if (this.basket.length >= 8) {
      const old = this.basket.shift();
      this.removeTarget(old.target);
      old.obj.parent?.remove(old.obj);
    }
    const obj = createFlower(flower.a, { petal: flower.petal, glowColor: flower.glowColor });
    const tagText = `${flower.ownerName} · ${(flower.tags || []).map(t => TAGS[t].label).join(' + ')}`;
    const tag = labelSprite(tagText, { size: 0.026, font: 40 });
    tag.position.set(0, (obj.userData.len || 0.3) + 0.05, 0);
    obj.add(tag);
    obj.userData.tag = tag;
    const item = { obj, f: flower.f, k: flower.a, hybrid: flower, owner: flower.owner };
    this.basketObj.add(obj);
    obj.scale.setScalar(0.01);
    item.target = this.addTarget({ type: 'basketFlower', item, obj, radius: 0.05, offset: new THREE.Vector3(0, 0.25, 0), label: `${flower.name} (${flower.tags?.map(t => TAGS[t].label).join(' + ')}) from ${flower.ownerName}` });
    this.basket.push(item);
    this.layoutBasket();
    this.sound.sfx('sparkle');
    return item;
  }
  layoutBasket() {
    this.basket.forEach((it, i) => {
      const x = -0.11 + (i % 4) * 0.075 + (i >= 4 ? 0.035 : 0);
      const z = i >= 4 ? -0.06 : -0.02;
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(i >= 4 ? 0.3 : 0.55, 0, (i % 2 ? 0.12 : -0.12)));
      it.obj.userData.tag.visible = true;
      this.tweenTo(it.obj, new THREE.Vector3(x, 0.03, z), q, 0.8, 0.35, { arc: Math.min(0.12, it.obj.position.distanceTo(new THREE.Vector3(x, 0.03, z)) * 0.4) });
    });
  }
  takeFromBasket(item) {
    const i = this.basket.indexOf(item);
    if (i >= 0) this.basket.splice(i, 1);
    this.removeTarget(item.target);
    item.obj.userData.tag.visible = false;
    this.layoutBasket();
  }
  returnToBasket(item) {
    if (this.basket.length >= 8) { this.poof(item.obj); return; }
    this.basketObj.attach(item.obj);
    item.target = this.addTarget({ type: 'basketFlower', item, obj: item.obj, radius: 0.05, offset: new THREE.Vector3(0, 0.25, 0), label: `${item.hybrid.name} from ${item.hybrid.ownerName}` });
    this.basket.push(item);
    this.layoutBasket();
  }
  basketDropPoint() { return this.basketObj.localToWorld(new THREE.Vector3(0, 0.12, 0)); }

  // ------------------------------------------------------------------ resets
  clearArrangement() {
    for (const s of this.arr.stems) { if (s.target) this.removeTarget(s.target); this.poof(s.obj); }
    this.arr = { form: null, stems: [], wrap: null, ribbon: null, snips: 0 };
    this.layout(false);
  }
  clearBasket() {
    for (const it of this.basket) { this.removeTarget(it.target); this.poof(it.obj); }
    this.basket = [];
  }
  // Put fresh, empty holders back on the bench (after a bouquet was handed over)
  resetHolders() {
    const g = this.activeGroup();
    const left = g === this.bouquetGroup ? g.parent !== this.stand : g.parent !== this.crownStand;
    if (left) {
      for (const st of this.arr.stems) if (st.target) this.removeTarget(st.target);
      this.arr = { form: null, stems: [], wrap: null, ribbon: null, snips: 0 };
    } else this.clearArrangement();
    if (this.bouquetGroup.parent !== this.stand) { this.removeTarget(this.bouquetT); this.makeBouquetGroup(); }
    if (this.crownGroup.parent !== this.crownStand) { this.removeTarget(this.crownT); this.makeCrownGroup(); }
    else this.setWireBend(0);
    this.layout(false);
  }

  // detach the finished arrangement (for handing to the customer)
  takeFinished() {
    const g = this.activeGroup();
    for (const s of this.arr.stems) if (s.target) { this.removeTarget(s.target); s.target = null; }
    if (g === this.bouquetGroup) this.removeTarget(this.bouquetT); else this.removeTarget(this.crownT);
    return g;
  }

  // restore arrangement from server state (florist page reload)
  restore(b, flowersById) {
    this.clearArrangement();
    if (!b || !b.stems?.length) return;
    if (b.form === 'crown') this.setWireBend(1);
    for (const s of b.stems) {
      let stem;
      if (s.hybrid) stem = { obj: createFlower(s.k, { petal: s.petal, glowColor: s.glowColor }), k: s.k, f: s.f, hybrid: s, owner: s.owner };
      else stem = { obj: createFlower(s.k), k: s.k };
      this.scene.add(stem.obj);
      this.anchorWorld(b.form, stem.obj.position);
      this.addStem(stem, b.form);
    }
    if (b.wrap) this.wrap(b.wrap, { animate: false });
    if (b.ribbon) this.tie(b.ribbon, { animate: false });
    this.arr.snips = b.snips || 0;
  }

  // ------------------------------------------------------------------ effects + tweens
  // opts: arc (height of a hop along the way), spin (turns around Y while flying), cb (on arrival)
  tweenTo(obj, pos, quat, scale, dur, { arc = 0, spin = 0, cb = null } = {}) {
    this.tweens = this.tweens.filter(t => t.obj !== obj);
    if (!dur) { obj.position.copy(pos); obj.quaternion.copy(quat); obj.scale.setScalar(scale); cb?.(); return; }
    this.tweens.push({ obj, t: 0, dur, p0: obj.position.clone(), p1: pos.clone(), q0: obj.quaternion.clone(), q1: quat.clone(), s0: obj.scale.x, s1: scale, arc, spin, cb });
  }
  poof(obj, cb) {
    this.tweens.push({ obj, t: 0, dur: 0.35, poof: true, s0: obj.scale.x, cb });
  }
  delay(dur, cb) { this.tweens.push({ t: 0, dur, fn: () => {}, cb }); }
  // a quick squash-and-stretch so the arrangement reacts to being touched
  bump(obj, amount = 0.06) {
    if (this.tweens.some(t => t.obj === obj && t.bump)) return;
    this.tweens.push({ obj, t: 0, dur: 0.3, bump: true, fn: (k) => {
      const w = Math.sin(Math.PI * k) * amount;
      obj.scale.set(1 + w, 1 - w * 0.6, 1 + w);
    }, cb: () => obj.scale.set(1, 1, 1) });
  }
  sparkle(pos, color = '#fff6c4') {
    for (let i = 0; i < 8; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      s.scale.setScalar(0.03);
      s.position.copy(pos);
      this.scene.add(s);
      const v = new THREE.Vector3((Math.random() - 0.5), Math.random() * 0.8 + 0.2, (Math.random() - 0.5)).multiplyScalar(0.35);
      this.particles.push({ obj: s, v, t: 0, life: 0.9, g: -0.1 });
    }
  }
  fallingBit(pos) {
    const m = leafBit();
    m.position.copy(pos);
    m.rotation.set(Math.random() * 3, Math.random() * 3, 0);
    this.scene.add(m);
    this.particles.push({ obj: m, v: new THREE.Vector3((Math.random() - 0.5) * 0.2, 0.1, (Math.random() - 0.5) * 0.2), t: 0, life: 1.4, g: -0.6, spin: 4 });
  }

  setTimerText(text, urgent = false) {
    if (this._timerText === text + urgent) return;
    this._timerText = text + urgent;
    this.timerPanel.draw((ctx, w, h) => {
      if (!text) return;
      roundRect(ctx, 4, 4, w - 8, h - 8, 40);
      ctx.fillStyle = urgent ? 'rgba(253,226,232,0.95)' : 'rgba(255,250,242,0.92)'; ctx.fill();
      ctx.strokeStyle = urgent ? '#ec7c95' : '#b9a6ea'; ctx.lineWidth = 5; ctx.stroke();
      ctx.fillStyle = '#4f4058'; ctx.font = `700 58px ${FONT_HEAD}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(text, w / 2, h / 2 + 3);
    });
  }

  setHint(text) {
    if (this._hint === text) return;
    this._hint = text;
    this.hint.visible = !!text;
    if (text) this.hint.userData.redraw(text);
  }

  update(dt) {
    // callbacks may start new tweens (chained animations): collect them separately so they aren't lost
    const running = this.tweens;
    this.tweens = [];
    const kept = running.filter(tw => {
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.dur);
      const e = ease(k);
      if (tw.fn) {
        tw.fn(k);
        if (k >= 1) { tw.cb?.(); return false; }
        return true;
      }
      if (tw.poof) {
        // shrink away while drifting up and twirling
        tw.obj.scale.setScalar(Math.max(0.001, tw.s0 * (1 - e)));
        tw.obj.position.y += dt * 0.15;
        tw.obj.rotation.y += dt * 8;
        if (k >= 1) { tw.obj.parent?.remove(tw.obj); tw.cb?.(); return false; }
        return true;
      }
      tw.obj.position.lerpVectors(tw.p0, tw.p1, e);
      if (tw.arc) tw.obj.position.y += Math.sin(Math.PI * k) * tw.arc;
      tw.obj.quaternion.slerpQuaternions(tw.q0, tw.q1, e);
      if (tw.spin) tw.obj.rotateY(Math.PI * 2 * tw.spin * (1 - e));
      tw.obj.scale.setScalar(tw.s0 + (tw.s1 - tw.s0) * e);
      if (k >= 1) { tw.cb?.(); return false; }
      return true;
    });
    // a tween started during this frame replaces any older one on the same object
    const fresh = this.tweens;
    this.tweens = kept.filter(tw => !fresh.some(n => n.obj && n.obj === tw.obj)).concat(fresh);
    this.particles = this.particles.filter(p => {
      p.t += dt;
      p.v.y += p.g * dt;
      p.obj.position.addScaledVector(p.v, dt);
      if (p.spin) { p.obj.rotation.x += p.spin * dt; p.obj.rotation.z += p.spin * 0.7 * dt; }
      if (p.obj.isSprite) p.obj.material.opacity = 1 - p.t / p.life;
      if (p.t >= p.life) { this.scene.remove(p.obj); return false; }
      return true;
    });
    // scissors blades spring open again
    const sc = this.scissors.userData;
    sc.open = Math.min(1, sc.open + dt * 5);
    sc.blades[0].rotation.y = -0.2 * sc.open; // blade on the +x side swings out to +x
    sc.blades[1].rotation.y = 0.2 * sc.open;
    // bell dome bob
    if (this.bellBob > 0) { this.bellBob = Math.max(0, this.bellBob - dt * 3); this.bellDome.position.y = 0.02 - Math.sin(this.bellBob * Math.PI) * 0.01; }
    // gift basket flowers arrive with a small grow
    for (const it of this.basket) if (it.obj.scale.x < 0.79 && !this.tweens.find(t => t.obj === it.obj)) it.obj.scale.setScalar(Math.min(0.8, it.obj.scale.x + dt * 2));
  }

  ringBell() {
    if (this.bellCooldown && performance.now() < this.bellCooldown) return;
    this.bellCooldown = performance.now() + 900;
    this.bellBob = 1;
    this.sound.sfx('bell');
    this.onBell();
  }
}

// Props that fly from the tool racks to the arrangement in mouse play.
export function paperSheet(color) {
  const geo = new THREE.PlaneGeometry(0.18, 0.18, 6, 1);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, Math.pow(p.getX(i) * 6, 2) * 0.012);
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, L(color, { side: THREE.DoubleSide }));
  m.rotation.x = -0.6;
  const g = new THREE.Group();
  g.add(m);
  return g;
}
export function ribbonCurl(color) {
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.06, 0), new THREE.Vector3(0.025, 0.02, 0.01), new THREE.Vector3(-0.015, -0.02, -0.01), new THREE.Vector3(0.02, -0.06, 0)]);
  const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.006, 4, false), L(color));
  m.scale.set(2, 1, 0.4);
  const g = new THREE.Group();
  g.add(m);
  return g;
}

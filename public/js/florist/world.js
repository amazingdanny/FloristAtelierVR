// The greenhouse atelier environment: painted village backdrop, iron-and-glass greenhouse, decor, lights.
import * as THREE from 'three';
import { mergeGeometries } from '/vendor/three/addons/BufferGeometryUtils.js';
import { makeCanvas, canvasTexture, paintWash, addGrain, rnd, srand, rgba, washTexture, glowTexture, blobShadow, FONT_HEAD, roundRect } from './textures.js';
import { createBunch, glowMats } from './flowers.js';

// ---- colourful blossoms, merged into one vertex-coloured mesh so hundreds cost a single draw call
const BLOSSOM_COLORS = ['#f58fb0', '#ffd25e', '#a98be8', '#ff9b6a', '#7fc4f0', '#f26d7d', '#fff4f8', '#ff7fc8', '#ffb3c7', '#c39bff', '#ffe08a'];
const CENTER_COLORS = ['#ffd84d', '#fff3b0', '#f2a33a'];
const UP = new THREE.Vector3(0, 1, 0);
function tint(geo, color) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  const c = new THREE.Color(color), n = g.attributes.position.count, arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}
// a five-petal blossom of size s at p, facing direction `normal`
function blossom(out, p, s, color = BLOSSOM_COLORS[Math.floor(rnd() * BLOSSOM_COLORS.length)], normal = UP) {
  const m = new THREE.Matrix4().compose(p, new THREE.Quaternion().setFromUnitVectors(UP, normal.clone().normalize()), new THREE.Vector3(s, s, s));
  const spin = rnd() * 6;
  for (let i = 0; i < 5; i++) {
    const a = spin + (i / 5) * Math.PI * 2;
    // flat petal (cheap: 6 triangles), cupped slightly upward
    const pg = new THREE.CircleGeometry(1, 6);
    pg.rotateX(-Math.PI / 2); pg.scale(0.36, 1, 0.22); pg.translate(0.32, 0, 0); pg.rotateZ(0.35); pg.rotateY(-a);
    out.push(tint(pg.applyMatrix4(m), color));
  }
  const cg = new THREE.SphereGeometry(0.17, 5, 3);
  cg.translate(0, 0.06, 0);
  out.push(tint(cg.applyMatrix4(m), CENTER_COLORS[Math.floor(rnd() * CENTER_COLORS.length)]));
}

export const ROOM = { x: 3.4, zFront: -3.4, zBack: 1.8, wall: 0.95, top: 2.95, ridge: 4.4 };
export const DOOR = new THREE.Vector3(-2.2, 0, -3.25);

function drawPanorama(night) {
  srand(night ? 777 : 555);
  const W = 2048, H = 768;
  const c = makeCanvas(W, H), ctx = c.getContext('2d');
  // sky
  const sky = ctx.createLinearGradient(0, 0, 0, H * 0.66);
  if (night) { sky.addColorStop(0, '#272a57'); sky.addColorStop(0.55, '#5b4a8c'); sky.addColorStop(1, '#a77ea7'); }
  else { sky.addColorStop(0, '#a9cdee'); sky.addColorStop(0.55, '#d9e4f3'); sky.addColorStop(1, '#fbe3d6'); }
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
  if (night) {
    for (let i = 0; i < 260; i++) {
      const x = rnd() * W, y = rnd() * H * 0.5, r = rnd() * 1.6 + 0.4;
      ctx.fillStyle = `rgba(255,250,230,${0.4 + rnd() * 0.6})`; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    }
    // moon
    const mg = ctx.createRadialGradient(1500, 150, 10, 1500, 150, 120);
    mg.addColorStop(0, 'rgba(255,248,220,1)'); mg.addColorStop(0.35, 'rgba(255,248,220,0.9)'); mg.addColorStop(0.36, 'rgba(255,240,220,0.25)'); mg.addColorStop(1, 'rgba(255,240,220,0)');
    ctx.fillStyle = mg; ctx.beginPath(); ctx.arc(1500, 150, 120, 0, 7); ctx.fill();
  } else {
    // sun glow
    const sg = ctx.createRadialGradient(600, 200, 10, 600, 200, 260);
    sg.addColorStop(0, 'rgba(255,246,214,0.9)'); sg.addColorStop(1, 'rgba(255,246,214,0)');
    ctx.fillStyle = sg; ctx.fillRect(300, 0, 600, 480);
  }
  // clouds
  for (let i = 0; i < 16; i++) {
    const x = rnd() * W, y = 60 + rnd() * 250, s = 40 + rnd() * 70;
    for (let k = 0; k < 6; k++) {
      const g = ctx.createRadialGradient(x + k * s * 0.6, y + Math.sin(k) * 10, 0, x + k * s * 0.6, y, s);
      const col = night ? '170,150,200' : '255,255,255';
      g.addColorStop(0, `rgba(${col},${night ? 0.18 : 0.6})`); g.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x + k * s * 0.6, y, s, 0, 7); ctx.fill();
    }
  }
  const horizon = 484;
  // far hills
  const hill = (y0, amp, col, a) => {
    ctx.fillStyle = rgba(col, a);
    ctx.beginPath(); ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 16) ctx.lineTo(x, y0 - amp * (0.5 + 0.5 * Math.sin(x * 0.004 + y0) * Math.cos(x * 0.0017 + 1.3)));
    ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
  };
  hill(horizon - 40, 70, night ? '#6a6aa0' : '#b7cfe0', 0.8);
  hill(horizon - 10, 50, night ? '#5a6a8a' : '#b9d8c1', 0.9);
  // village
  const facades = night ? ['#8d7fa8', '#9a88a6', '#7f8aa6', '#a08aa0', '#8a96a0'] : ['#f6d3c4', '#f9e7b8', '#cde3d0', '#d9cdee', '#f4c6cf', '#fbe3d0', '#e0eef6'];
  const roofs = night ? ['#6a4a6a', '#5a4a7a', '#7a5a6a'] : ['#d9826b', '#c86f5e', '#9fb2d4', '#e39a7a'];
  let x = -30;
  while (x < W + 40) {
    const w = 60 + rnd() * 70, h = 70 + rnd() * 90;
    const base = horizon + 36;
    const top = base - h;
    if (rnd() < 0.18) {
      // tree
      ctx.fillStyle = night ? '#4d6a62' : '#9cc79a';
      for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.arc(x + w * 0.5 + (rnd() - 0.5) * 30, base - 50 - rnd() * 40, 24 + rnd() * 16, 0, 7); ctx.fill(); }
      x += w * 0.7; continue;
    }
    ctx.fillStyle = facades[Math.floor(rnd() * facades.length)];
    ctx.fillRect(x, top, w, h);
    // roof
    ctx.fillStyle = roofs[Math.floor(rnd() * roofs.length)];
    ctx.beginPath(); ctx.moveTo(x - 6, top + 2); ctx.lineTo(x + w / 2, top - 30 - rnd() * 30); ctx.lineTo(x + w + 6, top + 2); ctx.closePath(); ctx.fill();
    // chimney
    if (rnd() < 0.5) { ctx.fillRect(x + w * 0.7, top - 34, 9, 24); }
    // windows
    const rows = Math.max(1, Math.floor(h / 40)), cols = Math.max(1, Math.floor(w / 28));
    for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
      const lit = night ? rnd() < 0.6 : false;
      ctx.fillStyle = night ? (lit ? '#ffe7a3' : '#5a5a7a') : '#fffaf0';
      ctx.fillRect(x + 8 + k * (w - 16) / cols, top + 12 + r * 38, 12, 16);
      if (!night) { ctx.fillStyle = 'rgba(120,150,180,0.45)'; ctx.fillRect(x + 10 + k * (w - 16) / cols, top + 14 + r * 38, 8, 12); }
    }
    x += w + rnd() * 10;
  }
  // church spire
  ctx.fillStyle = night ? '#8a7fa6' : '#f2e6d8';
  ctx.fillRect(1200, horizon - 170, 50, 206);
  ctx.fillStyle = night ? '#5a4a7a' : '#8fa7c9';
  ctx.beginPath(); ctx.moveTo(1190, horizon - 168); ctx.lineTo(1225, horizon - 290); ctx.lineTo(1260, horizon - 168); ctx.fill();
  ctx.fillStyle = night ? '#ffe7a3' : '#f2c14e'; ctx.beginPath(); ctx.arc(1225, horizon - 130, 12, 0, 7); ctx.fill();
  // meadow foreground
  const mead = ctx.createLinearGradient(0, horizon + 30, 0, H);
  if (night) { mead.addColorStop(0, '#4f6a6a'); mead.addColorStop(1, '#3a4a5a'); } else { mead.addColorStop(0, '#bfe0b0'); mead.addColorStop(1, '#a6d09a'); }
  ctx.fillStyle = mead;
  ctx.beginPath(); ctx.moveTo(0, H);
  for (let xx = 0; xx <= W; xx += 20) ctx.lineTo(xx, horizon + 30 + Math.sin(xx * 0.01) * 6);
  ctx.lineTo(W, H); ctx.fill();
  for (let i = 0; i < 500; i++) {
    const fx = rnd() * W, fy = horizon + 40 + rnd() * (H - horizon - 40);
    ctx.fillStyle = ['#f6c6d8', '#fff6c4', '#ffffff', '#c9b6f2', '#f7a8a0'][Math.floor(rnd() * 5)];
    ctx.globalAlpha = night ? 0.25 : 0.8;
    ctx.beginPath(); ctx.arc(fx, fy, 1.5 + rnd() * 2.5, 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1;
  // watercolour wash over everything
  for (let i = 0; i < 60; i++) {
    const bx = rnd() * W, by = rnd() * H, br = 60 + rnd() * 220;
    const g = ctx.createRadialGradient(bx, by, 0, bx, by, br);
    const col = night ? ['#8a6aa8', '#5a6aa8'][i % 2] : ['#f6c6d8', '#fff1d0', '#c9e4f6', '#d6f0d8'][i % 4];
    g.addColorStop(0, rgba(col, 0.12)); g.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = g; ctx.fillRect(bx - br, by - br, br * 2, br * 2);
  }
  addGrain(ctx, W, H, 0.04);
  const t = canvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

function tileTexture() {
  srand(31);
  const c = makeCanvas(512, 512), ctx = c.getContext('2d');
  paintWash(ctx, 512, 512, '#efd2bd', ['#e3b9a0', '#f4dccb', '#e8c4b4', '#f1d9c0'], { blots: 30, alpha: 0.18, grain: 0 });
  const n = 4, s = 512 / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    if ((i + j) % 2) { ctx.fillStyle = 'rgba(255,248,240,0.35)'; ctx.fillRect(i * s, j * s, s, s); }
    ctx.strokeStyle = 'rgba(160,110,100,0.35)'; ctx.lineWidth = 3;
    ctx.strokeRect(i * s + 2, j * s + 2, s - 4, s - 4);
  }
  addGrain(ctx, 512, 512, 0.05);
  return canvasTexture(c, { repeat: [5, 4] });
}

function plankTexture(base, tint) {
  srand(77);
  const c = makeCanvas(512, 512), ctx = c.getContext('2d');
  paintWash(ctx, 512, 512, base, tint, { blots: 26, alpha: 0.16, grain: 0 });
  for (let x = 0; x < 512; x += 64) { ctx.strokeStyle = 'rgba(90,110,100,0.22)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 512); ctx.stroke(); }
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(0, 0, 512, 18);
  addGrain(ctx, 512, 512, 0.04);
  return canvasTexture(c, { repeat: [6, 1] });
}

function signTexture() {
  const c = makeCanvas(1024, 256), ctx = c.getContext('2d');
  srand(5);
  paintWash(ctx, 1024, 256, '#fff6ea', ['#f6c6d8', '#c9e4d6', '#efe0b8'], { blots: 20, alpha: 0.2, grain: 0.03 });
  ctx.strokeStyle = '#b48a6a'; ctx.lineWidth = 10; roundRect(ctx, 8, 8, 1008, 240, 40); ctx.stroke();
  ctx.fillStyle = '#6b4f6e'; ctx.font = `700 110px ${FONT_HEAD}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('Atelier & Bloom', 512, 120);
  ctx.font = `500 34px ${FONT_HEAD}`; ctx.fillStyle = '#9a7a8a'; ctx.fillText('~ florals for every feeling ~', 512, 200);
  return canvasTexture(c);
}

export class World {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.shell = new THREE.Group(); // hidden in AR passthrough mode
    this.root.add(this.shell);
    scene.add(this.root);
    this.time = 0;
    this.build();
    this.setMood('morning');
  }

  build() {
    const { x: RX, zFront, zBack, wall, top, ridge } = ROOM;
    // ---- sky + village
    this.panoDay = drawPanorama(false);
    this.panoNight = drawPanorama(true);
    this.panoMat = new THREE.MeshBasicMaterial({ map: this.panoDay, side: THREE.BackSide, toneMapped: false, fog: false });
    const pano = new THREE.Mesh(new THREE.CylinderGeometry(14, 14, 10, 48, 1, true), this.panoMat);
    pano.position.y = 3.3; pano.rotation.y = Math.PI * 0.62;
    this.shell.add(pano);
    this.skyMat = new THREE.MeshBasicMaterial({ color: '#a9cdee', side: THREE.BackSide, fog: false });
    const cap = new THREE.Mesh(new THREE.SphereGeometry(13.9, 24, 8, 0, Math.PI * 2, 0, Math.PI * 0.3), this.skyMat);
    cap.position.y = 5;
    this.shell.add(cap);

    // ---- floor
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(RX * 2, zBack - zFront), new THREE.MeshLambertMaterial({ map: tileTexture() }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, (zBack + zFront) / 2);
    this.shell.add(floor);

    // ---- lower walls (painted mint wainscot)
    const plank = new THREE.MeshLambertMaterial({ map: plankTexture('#cfe8dc', ['#b9dccb', '#e3f2ea', '#c6e0e8']) });
    const wallGeo = [];
    const addBox = (arr, w, h, d, x, y, z, ry = 0) => { const g = new THREE.BoxGeometry(w, h, d); if (ry) g.rotateY(ry); g.translate(x, y, z); arr.push(g); };
    addBox(wallGeo, RX * 2, wall, 0.08, 0, wall / 2, zFront);           // front
    addBox(wallGeo, 0.08, wall, zBack - zFront, -RX, wall / 2, (zBack + zFront) / 2);
    addBox(wallGeo, 0.08, wall, zBack - zFront, RX, wall / 2, (zBack + zFront) / 2);
    const walls = new THREE.Mesh(mergeGeometries(wallGeo), plank);
    this.shell.add(walls);
    // back wall (solid, cosy) behind the florist
    const backMat = new THREE.MeshLambertMaterial({ map: washTexture('#f6dcd6', ['#efc9c4', '#fbe9e2', '#f3d4cf'], { repeat: [2, 1] }) });
    const back = new THREE.Mesh(new THREE.PlaneGeometry(RX * 2, top + 0.3), backMat);
    back.position.set(0, (top + 0.3) / 2, zBack); back.rotation.y = Math.PI;
    this.shell.add(back);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.55), new THREE.MeshBasicMaterial({ map: signTexture(), toneMapped: false }));
    sign.position.set(0, 2.45, zBack - 0.02); sign.rotation.y = Math.PI;
    this.shell.add(sign);

    // ---- iron greenhouse frame
    const frame = [];
    const bar = (w, h, d, x, y, z) => addBox(frame, w, h, d, x, y, z);
    for (let xx = -RX; xx <= RX + 0.01; xx += RX / 4) bar(0.05, top - wall, 0.05, xx, (top + wall) / 2, zFront);
    for (let zz = zFront; zz <= zBack + 0.01; zz += (zBack - zFront) / 6) { bar(0.05, top - wall, 0.05, -RX, (top + wall) / 2, zz); bar(0.05, top - wall, 0.05, RX, (top + wall) / 2, zz); }
    [wall, 1.95, top].forEach(y => {
      bar(RX * 2, 0.05, 0.05, 0, y, zFront);
      bar(0.05, 0.05, zBack - zFront, -RX, y, (zBack + zFront) / 2);
      bar(0.05, 0.05, zBack - zFront, RX, y, (zBack + zFront) / 2);
    });
    // arches
    const archCurve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-RX, top, 0), new THREE.Vector3(0, ridge + 1.3, 0), new THREE.Vector3(RX, top, 0));
    this.archCurve = archCurve;
    for (let zz = zFront; zz <= zBack + 0.01; zz += (zBack - zFront) / 6) {
      const g = new THREE.TubeGeometry(archCurve, 24, 0.03, 5, false);
      g.translate(0, 0, zz);
      frame.push(g);
    }
    for (const t of [0.2, 0.35, 0.5, 0.65, 0.8]) {
      const p = archCurve.getPoint(t);
      bar(0.04, 0.04, zBack - zFront, p.x, p.y, (zBack + zFront) / 2);
    }
    const strip = (arr) => arr.map(g => { const n = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal') n.deleteAttribute(k); return n; });
    this.frameMat = new THREE.MeshLambertMaterial({ color: '#eef6f0', emissive: '#55706a', emissiveIntensity: 0.15 });
    this.shell.add(new THREE.Mesh(mergeGeometries(strip(frame)), this.frameMat));


    // ---- shop door + window display in front wall
    const door = new THREE.Group();
    const dframe = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.3, 0.1), new THREE.MeshLambertMaterial({ color: '#b8d8c8' }));
    dframe.position.y = 1.15;
    const dpanel = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.1, 0.06), new THREE.MeshLambertMaterial({ color: '#9fcab6' }));
    dpanel.position.set(0, 1.05, 0.03);
    const dglass = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.9), new THREE.MeshBasicMaterial({ color: '#e6f4fb', transparent: true, opacity: 0.6 }));
    dglass.position.set(0, 1.45, 0.07);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), new THREE.MeshLambertMaterial({ color: '#f2c14e' }));
    knob.position.set(0.32, 1.0, 0.09);
    // open/closed sign
    this.openSign = this.makeOpenSign();
    this.openSign.position.set(0, 1.62, 0.1);
    door.add(dframe, dpanel, dglass, knob, this.openSign);
    door.position.set(DOOR.x, 0, zFront + 0.02);
    this.shell.add(door);

    // ---- decor
    this.decor = new THREE.Group();
    this.shell.add(this.decor);
    this.buildDecor();

    // ---- lights
    this.hemi = new THREE.HemisphereLight('#fff6ec', '#e8cbb8', 1.2);
    this.sun = new THREE.DirectionalLight('#fff1dc', 1.1);
    this.sun.position.set(-3, 6, 2);
    this.ambient = new THREE.AmbientLight('#ffffff', 0.25);
    this.root.add(this.hemi, this.sun, this.ambient);

    // ---- floating pollen
    const N = 140;
    const pos = new Float32Array(N * 3);
    this.pollenSeeds = [];
    for (let i = 0; i < N; i++) {
      const p = [(rnd() - 0.5) * 6, 0.4 + rnd() * 3, -3 + rnd() * 4.5];
      pos.set(p, i * 3);
      this.pollenSeeds.push({ base: p, ph: rnd() * 10, sp: 0.15 + rnd() * 0.25 });
    }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.pollen = new THREE.Points(pg, new THREE.PointsMaterial({ map: glowTexture(), size: 0.035, color: '#fff3c8', transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.root.add(this.pollen);
  }

  makeOpenSign() {
    const c = makeCanvas(256, 128), ctx = c.getContext('2d');
    const tex = canvasTexture(c);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.18), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false }));
    m.userData.set = (open) => {
      ctx.clearRect(0, 0, 256, 128);
      roundRect(ctx, 6, 6, 244, 116, 24); ctx.fillStyle = open ? '#fff6e0' : '#efe6f0'; ctx.fill();
      ctx.strokeStyle = open ? '#e8738a' : '#9a8aa6'; ctx.lineWidth = 6; ctx.stroke();
      ctx.fillStyle = open ? '#d4607b' : '#7a6a86'; ctx.font = `700 60px ${FONT_HEAD}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(open ? 'OPEN' : 'CLOSED', 128, 68);
      tex.needsUpdate = true;
    };
    m.userData.set(false);
    // the sign faces the street; from inside we see its back -> rotate to face inside
    return m;
  }

  buildDecor() {
    const { x: RX, zFront, zBack } = ROOM;
    const potMat = new THREE.MeshLambertMaterial({ color: '#ffffff', vertexColors: true });
    const POT_COLORS = ['#e7a57f', '#f3b6c4', '#a9d4ea', '#f6d58a', '#c7b5ec', '#a8dcc0', '#f7c3a1'];
    const blooms = []; // every blossom in the room ends up in this one mesh
    let potN = 0;
    const leafy = new THREE.MeshLambertMaterial({ color: '#9fcf8f' });
    const leafy2 = new THREE.MeshLambertMaterial({ color: '#86bd84' });
    const pots = [], bushes = [], bushes2 = [];
    const pot = (x, z, s = 1, y = 0) => {
      const pc = POT_COLORS[potN++ % POT_COLORS.length];
      const g = new THREE.CylinderGeometry(0.2 * s, 0.15 * s, 0.32 * s, 12); g.translate(x, y + 0.16 * s, z); pots.push(tint(g, pc));
      const rim = new THREE.CylinderGeometry(0.22 * s, 0.22 * s, 0.05 * s, 12); rim.translate(x, y + 0.32 * s, z); pots.push(tint(rim, new THREE.Color(pc).multiplyScalar(0.9)));
      // each pot blooms in one or two colours, like a real plant
      const c1 = BLOSSOM_COLORS[Math.floor(rnd() * BLOSSOM_COLORS.length)], c2 = BLOSSOM_COLORS[Math.floor(rnd() * BLOSSOM_COLORS.length)];
      for (let i = 0; i < 6; i++) {
        const r = (0.13 + rnd() * 0.1) * s;
        const c = new THREE.Vector3(x + (rnd() - 0.5) * 0.3 * s, y + (0.42 + rnd() * 0.35) * s, z + (rnd() - 0.5) * 0.3 * s);
        const b = new THREE.IcosahedronGeometry(r, 1);
        b.translate(c.x, c.y, c.z);
        (i % 2 ? bushes : bushes2).push(b);
        for (let k = 0; k < (s < 0.5 ? 3 : 7); k++) {
          const n = new THREE.Vector3(rnd() - 0.5, rnd() * 0.9 + 0.2, rnd() - 0.5).normalize();
          blossom(blooms, c.clone().addScaledVector(n, r * 0.97), 0.1 * Math.max(s, 0.4), rnd() < 0.6 ? c1 : c2, n);
        }
      }
    };
    srand(91);
    // floor planters along the side walls
    [[-3.0, -2.8], [-3.0, -1.3], [-3.0, 0.3], [3.0, -2.8], [3.0, -1.3], [3.0, 0.3], [-1.2, -3.05], [1.4, -3.05], [2.4, -3.05], [-3.0, 1.4], [3.0, 1.4]].forEach(([x, z], i) => pot(x, z, 1 + (i % 3) * 0.2));
    // back shelves with small pots
    const wood = new THREE.MeshLambertMaterial({ color: '#d9b48f' });
    const shelves = [];
    [1.0, 1.5].forEach(y => { const g = new THREE.BoxGeometry(2.6, 0.04, 0.28); g.translate(0, y, zBack - 0.15); shelves.push(g); });
    [-2.4, 2.4].forEach(x => [0.7, 1.3, 1.9].forEach(y => { const g = new THREE.BoxGeometry(0.9, 0.04, 0.28); g.translate(x, y, zBack - 0.15); shelves.push(g); }));
    this.decor.add(new THREE.Mesh(mergeGeometries(shelves), wood));
    for (let i = 0; i < 9; i++) pot(-1.15 + i * 0.29, zBack - 0.15, 0.3, 1.02);
    for (let i = 0; i < 9; i++) pot(-1.15 + i * 0.29, zBack - 0.15, 0.28, 1.52);
    [-2.4, 2.4].forEach(x => [0.72, 1.32, 1.92].forEach(y => { pot(x - 0.25, zBack - 0.15, 0.3, y); pot(x + 0.22, zBack - 0.15, 0.26, y); }));
    const strip = (arr) => arr.map(g => { const n = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal') n.deleteAttribute(k); return n; });
    this.decor.add(new THREE.Mesh(mergeGeometries(pots), potMat));
    this.decor.add(new THREE.Mesh(mergeGeometries(strip(bushes)), leafy));
    this.decor.add(new THREE.Mesh(mergeGeometries(strip(bushes2)), leafy2));

    // a few real flowers poking out of planters (glowing magical ones too)
    const fl = [['moonpetal', -3.0, -2.8], ['rose', -3.0, -1.3], ['sunflower', 3.0, -2.8], ['moonpetal', 3.0, -1.3], ['lavender', -3.0, 0.3], ['moonpetal', 3.0, 0.3], ['tulip', 1.4, -3.05], ['moonpetal', -1.2, -3.05],
      ['sunflower', 2.4, -3.05], ['daisy', -3.0, 1.4], ['rose', 3.0, 1.4], ['forgetmenot', -3.0, -2.1], ['tulip', 3.0, -2.1], ['daisy', 3.0, -0.5], ['lavender', -3.0, -0.5]];
    for (const [k, x, z] of fl) {
      const f = createBunch(k, 3);
      f.scale.setScalar(1.8);
      f.position.set(x, 0.32, z);
      f.rotation.y = rnd() * 6;
      this.decor.add(f);
    }

    // hanging baskets with trailing vines
    const ropeMat = new THREE.MeshLambertMaterial({ color: '#c9a77f' });
    const vines = [], ropes = [], baskets = [];
    [[-1.6, -1.6], [1.6, -1.6], [-1.7, 0.6], [1.7, 0.6], [0, -2.6]].forEach(([x, z]) => {
      const hy = 2.6;
      const r = new THREE.CylinderGeometry(0.006, 0.006, 1.2, 4); r.translate(x, hy + 0.6, z); ropes.push(r);
      const b = new THREE.SphereGeometry(0.22, 12, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2); b.translate(x, hy, z); baskets.push(b);
      for (let i = 0; i < 9; i++) {
        const a = rnd() * Math.PI * 2;
        const start = new THREE.Vector3(x + Math.cos(a) * 0.18, hy, z + Math.sin(a) * 0.18);
        const len = 0.5 + rnd() * 0.8;
        const curve = new THREE.CatmullRomCurve3([start, start.clone().add(new THREE.Vector3(Math.cos(a) * 0.12, -len * 0.4, Math.sin(a) * 0.12)), start.clone().add(new THREE.Vector3(Math.cos(a) * 0.1, -len, Math.sin(a) * 0.1))]);
        vines.push(new THREE.TubeGeometry(curve, 8, 0.008, 4, false));
        for (let k = 1; k < 6; k++) {
          const p = curve.getPoint(k / 6);
          const lf = new THREE.SphereGeometry(0.03, 5, 4); lf.scale(1, 0.4, 0.6); lf.rotateY(rnd() * 6); lf.translate(p.x, p.y, p.z);
          vines.push(lf);
          if (k % 2 === 0) blossom(blooms, p.clone().add(new THREE.Vector3(Math.cos(a) * 0.03, 0, Math.sin(a) * 0.03)), 0.045, undefined, new THREE.Vector3(Math.cos(a), 0.3, Math.sin(a)));
        }
      }
      const tuft = new THREE.IcosahedronGeometry(0.2, 1); tuft.scale(1, 0.5, 1); tuft.translate(x, hy + 0.04, z); vines.push(tuft);
      for (let i = 0; i < 8; i++) {
        const a = rnd() * Math.PI * 2, rr = rnd() * 0.17;
        blossom(blooms, new THREE.Vector3(x + Math.cos(a) * rr, hy + 0.1 - rr * 0.35, z + Math.sin(a) * rr), 0.055, undefined, new THREE.Vector3(Math.cos(a) * rr * 4, 1, Math.sin(a) * rr * 4));
      }
    });
    this.decor.add(new THREE.Mesh(mergeGeometries(strip(ropes)), ropeMat));
    this.decor.add(new THREE.Mesh(mergeGeometries(strip(baskets)), new THREE.MeshLambertMaterial({ color: '#c99a6a' })));
    this.decor.add(new THREE.Mesh(mergeGeometries(strip(vines)), new THREE.MeshLambertMaterial({ color: '#8cc07a' })));

    // string lights along two arches (steady, no flicker)
    const bulbs = [];
    for (const zz of [-1.9, 0.4]) {
      for (let i = 1; i < 24; i++) {
        const p = this.archCurve.getPoint(i / 24);
        const g = new THREE.SphereGeometry(0.028, 6, 5);
        g.translate(p.x, p.y - 0.12 - Math.sin((i / 24) * Math.PI * 6) * 0.03, zz);
        bulbs.push(g);
      }
    }
    this.bulbMat = new THREE.MeshBasicMaterial({ color: '#fff0c2', toneMapped: false });
    this.decor.add(new THREE.Mesh(mergeGeometries(strip(bulbs)), this.bulbMat));

    // watering can + crates near the back
    const can = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, 0.2, 14), new THREE.MeshLambertMaterial({ color: '#9ccbe8' }));
    body.position.y = 0.1;
    const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.02, 0.26, 6), body.material);
    spout.position.set(0.15, 0.17, 0); spout.rotation.z = -0.9;
    can.add(body, spout);
    can.position.set(-1.9, 0, 1.2);
    this.decor.add(can);
    const crateMat = new THREE.MeshLambertMaterial({ color: '#e2c29a' });
    [[2.0, 0.15, 1.3], [2.3, 0.15, 1.0], [2.15, 0.45, 1.15]].forEach(([x, y, z]) => {
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.3), crateMat);
      c.position.set(x, y, z); c.rotation.y = rnd();
      this.decor.add(c);
    });
    // flower boxes along the top of both side walls
    const boxes = [], boxGreens = [];
    for (const side of [-1, 1]) {
      for (let z = zFront + 0.6; z < zBack - 0.3; z += 0.85) {
        const x = side * (RX - 0.13);
        const b = new THREE.BoxGeometry(0.16, 0.13, 0.62); b.translate(x, 1.02, z); boxes.push(tint(b, POT_COLORS[Math.floor(rnd() * POT_COLORS.length)]));
        const c1 = BLOSSOM_COLORS[Math.floor(rnd() * BLOSSOM_COLORS.length)], c2 = BLOSSOM_COLORS[Math.floor(rnd() * BLOSSOM_COLORS.length)];
        for (let i = 0; i < 5; i++) {
          const c = new THREE.Vector3(x + (rnd() - 0.5) * 0.06, 1.13 + rnd() * 0.04, z - 0.24 + i * 0.12);
          const gg = new THREE.IcosahedronGeometry(0.075, 1); gg.scale(1, 0.8, 1); gg.translate(c.x, c.y, c.z); boxGreens.push(gg);
          for (let k = 0; k < 3; k++) {
            const n = new THREE.Vector3(rnd() - 0.5 - side * 0.4, rnd() + 0.3, rnd() - 0.5).normalize();
            blossom(blooms, c.clone().addScaledVector(n, 0.07), 0.04, k % 2 ? c1 : c2, n);
          }
        }
      }
    }
    this.decor.add(new THREE.Mesh(mergeGeometries(boxes), potMat));
    this.decor.add(new THREE.Mesh(mergeGeometries(strip(boxGreens)), leafy));

    // flower garland swagged under the shop sign on the back wall
    const garland = [];
    for (const [x0, x1] of [[-1.25, 0], [0, 1.25]]) {
      const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(x0, 2.17, zBack - 0.06), new THREE.Vector3((x0 + x1) / 2, 1.9, zBack - 0.1), new THREE.Vector3(x1, 2.17, zBack - 0.06));
      garland.push(new THREE.TubeGeometry(curve, 20, 0.025, 5, false));
      for (let i = 0; i <= 14; i++) {
        const p = curve.getPoint(i / 14);
        const lf = new THREE.SphereGeometry(0.045, 5, 4); lf.scale(1, 0.5, 0.7); lf.rotateZ(rnd() * 3); lf.translate(p.x, p.y, p.z - 0.02); garland.push(lf);
        blossom(blooms, p.clone().add(new THREE.Vector3(0, 0.01, -0.05)), 0.05, undefined, new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, -2));
      }
    }
    this.decor.add(new THREE.Mesh(mergeGeometries(strip(garland)), leafy2));

    // colourful bunting strung across the glasshouse
    const flags = [], cords = [];
    for (const zz of [-2.7, -0.6, 1.0]) {
      const cord = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-RX, 2.92, zz), new THREE.Vector3(0, 2.45, zz), new THREE.Vector3(RX, 2.92, zz));
      cords.push(new THREE.TubeGeometry(cord, 24, 0.006, 4, false));
      const n = 22;
      for (let i = 1; i < n; i++) {
        const p = cord.getPoint(i / n);
        const f = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.09, 0, 0), new THREE.Vector3(0.09, 0, 0), new THREE.Vector3(0, -0.2, 0)]);
        f.computeVertexNormals();
        f.translate(p.x, p.y, p.z);
        flags.push(tint(f, BLOSSOM_COLORS[i % BLOSSOM_COLORS.length]));
      }
    }
    this.decor.add(new THREE.Mesh(mergeGeometries(strip(cords)), ropeMat));
    this.decor.add(new THREE.Mesh(mergeGeometries(flags), new THREE.MeshLambertMaterial({ color: '#ffffff', vertexColors: true, side: THREE.DoubleSide })));

    // vase of mixed flowers on the crates, and a bucket of sunflowers by the watering can
    const vase = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.05, 0.2, 14), new THREE.MeshLambertMaterial({ color: '#9fd3e8', transparent: true, opacity: 0.8 }));
    vase.position.set(2.15, 0.7, 1.15);
    this.decor.add(vase);
    for (const [k, rot] of [['rose', 0], ['daisy', 2], ['tulip', 4]]) {
      const b = createBunch(k, 3); b.scale.setScalar(1.2); b.position.set(2.15, 0.62, 1.15); b.rotation.y = rot; this.decor.add(b);
    }
    const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.11, 0.25, 14), new THREE.MeshLambertMaterial({ color: '#c7b5ec' }));
    bucket.position.set(-1.55, 0.125, 1.3);
    this.decor.add(bucket);
    const sun = createBunch('sunflower', 5); sun.scale.setScalar(1.6); sun.position.set(-1.55, 0.2, 1.3); this.decor.add(sun);

    // petals scattered on the floor around the shop
    const petals = [];
    for (let i = 0; i < 90; i++) {
      const a = rnd() * Math.PI * 2, r = 1.3 + rnd() * 1.6;
      const x = Math.cos(a) * r * 1.2, z = -1.0 + Math.sin(a) * r;
      if (Math.abs(x) > RX - 0.2 || z < zFront + 0.2 || z > zBack - 0.2) continue;
      const pg = new THREE.CircleGeometry(0.022, 6); pg.scale(1, 0.6, 1); pg.rotateX(-Math.PI / 2); pg.rotateY(rnd() * 6); pg.translate(x, 0.004, z);
      petals.push(tint(pg, BLOSSOM_COLORS[Math.floor(rnd() * BLOSSOM_COLORS.length)]));
    }
    this.decor.add(new THREE.Mesh(mergeGeometries(petals), new THREE.MeshLambertMaterial({ color: '#ffffff', vertexColors: true })));

    // all the blossoms: one mesh
    this.decor.add(new THREE.Mesh(mergeGeometries(blooms), new THREE.MeshLambertMaterial({ color: '#ffffff', vertexColors: true, side: THREE.DoubleSide })));

    // shop floor rug in front of the counter
    const rugTex = washTexture('#f3c9d3', ['#eab0c0', '#fbe0e6', '#e8c0d8'], { w: 256, h: 256, blots: 20, alpha: 0.2 });
    const rug = new THREE.Mesh(new THREE.CircleGeometry(1.0, 40), new THREE.MeshLambertMaterial({ map: rugTex }));
    rug.rotation.x = -Math.PI / 2; rug.position.set(0, 0.005, -1.5); rug.scale.set(1.3, 0.8, 1);
    this.decor.add(rug);
  }

  setMood(mood) {
    this.mood = mood;
    const night = mood === 'evening';
    this.panoMat.map = night ? this.panoNight : this.panoDay;
    this.panoMat.needsUpdate = true;
    this.skyMat.color.set(night ? '#272a57' : '#a9cdee');
    if (night) {
      this.hemi.color.set('#b5aee8'); this.hemi.groundColor.set('#6a5a7a'); this.hemi.intensity = 0.85;
      this.sun.color.set('#ffc49a'); this.sun.intensity = 0.55;
      this.ambient.intensity = 0.2;
      this.bulbMat.color.set('#ffe3a0');
    } else {
      this.hemi.color.set(mood === 'morning' ? '#fff3ea' : '#fffaf0'); this.hemi.groundColor.set('#e8cbb8');
      this.hemi.intensity = mood === 'morning' ? 1.15 : 1.25;
      this.sun.color.set('#fff1dc'); this.sun.intensity = mood === 'morning' ? 1.0 : 1.15;
      this.ambient.intensity = 0.25;
      this.bulbMat.color.set('#fff6dc');
    }
    this.glowBoost = night ? 1.6 : 1.0;
    this.openSign.userData.set(mood !== 'morning');
  }

  update(dt) {
    this.time += dt;
    // pollen drifts slowly
    const arr = this.pollen.geometry.attributes.position.array;
    for (let i = 0; i < this.pollenSeeds.length; i++) {
      const s = this.pollenSeeds[i];
      const t = this.time * s.sp + s.ph;
      arr[i * 3] = s.base[0] + Math.sin(t) * 0.25;
      arr[i * 3 + 1] = s.base[1] + Math.sin(t * 0.7) * 0.15;
      arr[i * 3 + 2] = s.base[2] + Math.cos(t * 0.8) * 0.25;
    }
    this.pollen.geometry.attributes.position.needsUpdate = true;
    // magical flowers breathe slowly (0.25 Hz — gentle, no flashing)
    const breathe = 0.75 + 0.25 * Math.sin(this.time * 1.6);
    for (const m of glowMats) {
      if (m.userData.base === undefined) m.userData.base = m.emissiveIntensity;
      m.emissiveIntensity = m.userData.base * breathe * this.glowBoost;
    }
  }

  setAR(on) { this.shell.visible = !on; }
}

// Watercolour canvas textures + text panels (rendered with Canvas2D, used as THREE textures).
import * as THREE from 'three';

export const FONT_HEAD = "'Fredoka', 'Nunito', sans-serif";
export const FONT_BODY = "'Nunito', 'Fredoka', sans-serif";

let seed = 1234567;
export function srand(s) { seed = s >>> 0; }
export function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }

function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
export function rgba(hex, a) { const [r, g, b] = hexToRgb(hex); return `rgba(${r},${g},${b},${a})`; }

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

export function canvasTexture(canvas, { repeat = null, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}

// Soft watercolour blotches + granulation + paper grain.
export function paintWash(ctx, w, h, base, tints, { blots = 36, minR = 30, maxR = 180, alpha = 0.12, edges = true, grain = 0.05 } = {}) {
  ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < blots; i++) {
    const x = rnd() * w, y = rnd() * h, r = minR + rnd() * (maxR - minR);
    const col = tints[Math.floor(rnd() * tints.length)];
    const a = alpha * (0.5 + rnd());
    const g = ctx.createRadialGradient(x, y, r * 0.1, x, y, r);
    g.addColorStop(0, rgba(col, a * 0.7));
    g.addColorStop(0.75, rgba(col, a));
    g.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    // wobbly blob
    const pts = 12;
    for (let k = 0; k <= pts; k++) {
      const ang = (k / pts) * Math.PI * 2;
      const rr = r * (0.8 + rnd() * 0.3);
      const px = x + Math.cos(ang) * rr, py = y + Math.sin(ang) * rr;
      k ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath(); ctx.fill();
    if (edges && rnd() < 0.5) { ctx.strokeStyle = rgba(col, a * 0.9); ctx.lineWidth = 1 + rnd() * 2; ctx.stroke(); }
  }
  addGrain(ctx, w, h, grain);
}

export function addGrain(ctx, w, h, amount = 0.05) {
  if (amount <= 0) return;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rnd() - 0.5) * 255 * amount;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

export function washTexture(base, tints, opts = {}) {
  const { w = 512, h = 512, repeat = null } = opts;
  const c = makeCanvas(w, h);
  paintWash(c.getContext('2d'), w, h, base, tints, opts);
  return canvasTexture(c, { repeat });
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function wrapLines(ctx, text, maxW) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; }
    else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

// A plane mesh with its own canvas. draw(ctx, w, h) repaints it.
export class Panel {
  constructor(pxW, pxH, worldW, { transparent = true, depthTest = true, doubleSide = false } = {}) {
    this.canvas = makeCanvas(pxW, pxH);
    this.ctx = this.canvas.getContext('2d');
    this.w = pxW; this.h = pxH;
    this.texture = canvasTexture(this.canvas);
    this.texture.anisotropy = 8;
    this.material = new THREE.MeshBasicMaterial({ map: this.texture, transparent, depthTest, side: doubleSide ? THREE.DoubleSide : THREE.FrontSide, toneMapped: false });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(worldW, worldW * pxH / pxW), this.material);
    this.drawFn = null;
  }
  draw(fn) {
    if (fn) this.drawFn = fn;
    if (!this.drawFn) return;
    this.ctx.clearRect(0, 0, this.w, this.h);
    this.drawFn(this.ctx, this.w, this.h);
    this.texture.needsUpdate = true;
  }
}

// Paper card background (soft watercolour edges)
export function paperCard(ctx, x, y, w, h, { fill = '#fffaf2', tint = '#f6c6d8', radius = 40, border = 'rgba(120,90,120,0.18)' } = {}) {
  ctx.save();
  ctx.shadowColor = 'rgba(90,60,90,0.18)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 6;
  roundRect(ctx, x, y, w, h, radius); ctx.fillStyle = fill; ctx.fill();
  ctx.restore();
  ctx.save();
  roundRect(ctx, x, y, w, h, radius); ctx.clip();
  for (let i = 0; i < 10; i++) {
    const cx = x + rnd() * w, cy = y + rnd() * h, r = 60 + rnd() * 200;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, rgba(tint, 0.14)); g.addColorStop(1, rgba(tint, 0));
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  }
  ctx.restore();
  roundRect(ctx, x + 3, y + 3, w - 6, h - 6, radius - 3);
  ctx.strokeStyle = border; ctx.lineWidth = 4; ctx.stroke();
}

// small round soft dot sprite texture (for glows, pollen)
let _glowTex = null;
export function glowTexture() {
  if (_glowTex) return _glowTex;
  const c = makeCanvas(128, 128), ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.12)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  _glowTex = canvasTexture(c);
  return _glowTex;
}

let _shadowTex = null;
export function blobShadowTexture() {
  if (_shadowTex) return _shadowTex;
  const c = makeCanvas(128, 128), ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(80,50,80,0.35)');
  g.addColorStop(0.6, 'rgba(80,50,80,0.15)');
  g.addColorStop(1, 'rgba(80,50,80,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  _shadowTex = canvasTexture(c);
  return _shadowTex;
}
export function blobShadow(size = 0.4, opacity = 1) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: blobShadowTexture(), transparent: true, depthWrite: false, opacity }));
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = -1;
  return m;
}

const emojiCache = new Map();
export function emojiTexture(e) {
  if (emojiCache.has(e)) return emojiCache.get(e);
  const c = makeCanvas(128, 128), ctx = c.getContext('2d');
  ctx.font = '96px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(e, 64, 72);
  const t = canvasTexture(c);
  emojiCache.set(e, t);
  return t;
}

// a label sprite (always faces camera); canvas is sized to the text so it never squashes
export function labelSprite(text, { color = '#4f4058', bg = 'rgba(255,250,242,0.92)', size = 0.12, font = 44 } = {}) {
  const H = 128;
  const c = makeCanvas(256, H), ctx = c.getContext('2d');
  const tex = canvasTexture(c);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
  const draw = (t) => {
    ctx.font = `600 ${font}px ${FONT_HEAD}`;
    const tw = Math.ceil(ctx.measureText(t || ' ').width) + 64;
    const W = Math.min(2048, Math.max(128, tw + 8));
    if (c.width !== W) { c.width = W; tex.dispose(); }
    ctx.clearRect(0, 0, W, H);
    ctx.font = `600 ${font}px ${FONT_HEAD}`;
    if (t) {
      roundRect(ctx, 4, 64 - 36, W - 8, 72, 36);
      ctx.fillStyle = bg; ctx.fill();
      ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(t, W / 2, 66);
    }
    tex.needsUpdate = true;
    s.scale.set(size * W / H, size, 1);
  };
  draw(text);
  s.userData.redraw = draw;
  return s;
}

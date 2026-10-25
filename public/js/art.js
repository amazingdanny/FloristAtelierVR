// Little watercolour-ish SVG illustrations for the 2D screens (phones / TV).
import { FLOWERS, VILLAGERS } from './shared/data.js';

let uid = 0;
const id = () => 'g' + (++uid);

function petalsRing(cx, cy, n, rx, ry, dist, fill, stroke = 'none', rot0 = 0) {
  let s = '';
  for (let i = 0; i < n; i++) {
    const a = rot0 + (i / n) * 360;
    s += `<ellipse cx="${cx}" cy="${cy - dist}" rx="${rx}" ry="${ry}" fill="${fill}" stroke="${stroke}" stroke-width="0.8" transform="rotate(${a} ${cx} ${cy})"/>`;
  }
  return s;
}

// kind = base flower shape; petal/glow optional overrides (for hybrids)
export function flowerSVG(kind, { petal, center, glow, size = 64, stem = true } = {}) {
  const F = FLOWERS[kind] || FLOWERS.daisy;
  petal = petal || F.petal; center = center || F.center;
  const gid = id();
  const glowOn = glow || F.glow;
  const glowCol = typeof glow === 'string' ? glow : F.petal;
  let head = '';
  const cx = 32, cy = 24;
  switch (kind) {
    case 'rose':
      head = `<circle cx="${cx}" cy="${cy}" r="13" fill="${petal}"/>
        <path d="M${cx - 9} ${cy + 2} q9 9 18 0" fill="none" stroke="${center}" stroke-width="2" stroke-linecap="round" opacity=".7"/>
        <path d="M${cx - 6} ${cy - 3} q6 -7 12 0 q-4 6 -9 3" fill="none" stroke="${center}" stroke-width="2" stroke-linecap="round" opacity=".8"/>
        <circle cx="${cx + 1}" cy="${cy - 1}" r="3" fill="${center}" opacity=".75"/>`;
      break;
    case 'tulip':
      head = `<path d="M${cx - 11} ${cy - 8} q-2 18 11 20 q13 -2 11 -20 l-6 6 l-5 -9 l-5 9 z" fill="${petal}" stroke="${center}" stroke-width="1.2"/>
        <path d="M${cx} ${cy - 11} l0 18" stroke="${center}" stroke-width="1" opacity=".6"/>`;
      break;
    case 'sunflower':
      head = petalsRing(cx, cy, 14, 3.4, 7, 10, petal) + `<circle cx="${cx}" cy="${cy}" r="8" fill="${center}"/>
        <circle cx="${cx - 2}" cy="${cy - 2}" r="2" fill="#a06a40" opacity=".6"/>`;
      break;
    case 'lavender': {
      let buds = '';
      for (let i = 0; i < 9; i++) {
        const y = cy + 12 - i * 3.2, off = (i % 2 ? 2.6 : -2.6);
        buds += `<ellipse cx="${cx + off}" cy="${y}" rx="2.8" ry="3.4" fill="${petal}"/>`;
      }
      head = buds + `<ellipse cx="${cx}" cy="${cy - 18}" rx="2" ry="2.6" fill="${petal}"/>`;
      break;
    }
    case 'daisy':
      head = petalsRing(cx, cy, 13, 2.6, 8, 9, petal, '#e6dccb') + `<circle cx="${cx}" cy="${cy}" r="5.5" fill="${center}"/>`;
      break;
    case 'forgetmenot': {
      const spots = [[0, 0], [-9, 4], [9, 4], [-5, -8], [6, -8]];
      head = spots.map(([x, y]) => petalsRing(cx + x, cy + y, 5, 2.4, 2.8, 2.8, petal) + `<circle cx="${cx + x}" cy="${cy + y}" r="1.4" fill="${center}"/>`).join('');
      break;
    }
    case 'lilyWhite':
    case 'lilyPink': {
      const edge = kind === 'lilyWhite' ? '#e6dccb' : '#e2588f';
      head = petalsRing(cx, cy, 6, 3.6, 11, 10, petal, edge, 30);
      let st = '';
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2, x = cx + Math.sin(a) * 8, y = cy - Math.cos(a) * 8;
        st += `<path d="M${cx} ${cy} L${x.toFixed(1)} ${y.toFixed(1)}" stroke="#7fae7a" stroke-width="0.9"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="1.5" fill="${center}"/>`;
      }
      head += st;
      break;
    }
    case 'peony':
      head = petalsRing(cx, cy, 9, 6, 8, 8, petal, center, 10) + petalsRing(cx, cy, 7, 4.5, 6, 4.5, petal, center, 30)
        + `<circle cx="${cx}" cy="${cy}" r="4.5" fill="${center}"/>`;
      break;
    case 'orchid':
      head = petalsRing(cx, cy, 3, 3, 10, 9, petal, 'none', 180)
        + `<ellipse cx="${cx - 9}" cy="${cy - 2}" rx="8" ry="6" fill="${petal}" stroke="#a84fd6" stroke-width=".8"/>
        <ellipse cx="${cx + 9}" cy="${cy - 2}" rx="8" ry="6" fill="${petal}" stroke="#a84fd6" stroke-width=".8"/>
        <path d="M${cx - 6} ${cy + 3} q6 13 12 0 q-6 3 -12 0z" fill="#9b3fd0"/>
        <circle cx="${cx}" cy="${cy}" r="2.6" fill="${center}"/>`;
      break;
    case 'carnation':
      head = petalsRing(cx, cy, 16, 3.4, 5.5, 9.5, petal, center, 0) + petalsRing(cx, cy, 11, 3, 4.5, 5, petal, center, 12)
        + `<circle cx="${cx}" cy="${cy}" r="3.5" fill="${petal}" stroke="${center}" stroke-width="1"/>`;
      break;
    case 'hydrangea': {
      const spots = [[0, 0], [-8, 3], [8, 3], [-4, -7], [5, -7], [-10, -5], [10, -5], [0, 9], [-6, 10], [7, 10], [0, -12]];
      head = `<circle cx="${cx}" cy="${cy}" r="14" fill="${center}"/>` + spots.map(([x, y]) => petalsRing(cx + x, cy + y, 4, 2.4, 2.6, 2.4, petal, '#4f86e0', 45)).join('');
      break;
    }
    case 'poppy':
      head = petalsRing(cx, cy, 4, 9, 10, 7, petal, '#c4231b', 45)
        + `<circle cx="${cx}" cy="${cy}" r="5" fill="${center}"/>`
        + petalsRing(cx, cy, 8, 0.8, 1.6, 6, center, 'none', 0);
      break;
    case 'moonpetal':
      head = `<path d="M${cx - 12} ${cy + 6} q0 -20 12 -20 q12 0 12 20 q-4 -3 -6 1 q-3 -4 -6 0 q-3 -4 -6 0 q-2 -4 -6 -1z" fill="${petal}" stroke="#ffffff" stroke-width="1"/>
        <circle cx="${cx}" cy="${cy + 9}" r="2" fill="#fff"/>`;
      break;
  }
  const stemSvg = stem ? `<path d="M32 ${cy + 8} C 30 44, 34 52, 32 62" stroke="#7fae7a" stroke-width="2.6" fill="none" stroke-linecap="round"/>
    <path d="M32 48 q-10 -6 -14 0 q6 5 14 0z" fill="#9cc98f"/>` : '';
  const glowSvg = glowOn ? `<defs><radialGradient id="${gid}"><stop offset="0" stop-color="${glowCol}" stop-opacity=".9"/><stop offset="1" stop-color="${glowCol}" stop-opacity="0"/></radialGradient></defs>
    <circle cx="${cx}" cy="${cy}" r="24" fill="url(#${gid})"/>` : '';
  return `<svg viewBox="0 0 64 64" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">${glowSvg}${stemSvg}${head}</svg>`;
}

export function villagerSVG(kind, size = 72) {
  const V = VILLAGERS[kind] || VILLAGERS.fairy;
  const { body, accent, skin } = V;
  let back = '', hat = '', face = '';
  const eyes = (y = 36, c = '#4a3b52') => `<circle cx="29" cy="${y}" r="2.2" fill="${c}"/><circle cx="43" cy="${y}" r="2.2" fill="${c}"/>`;
  const blush = `<ellipse cx="25" cy="41" rx="3.2" ry="2" fill="#f29bb0" opacity=".6"/><ellipse cx="47" cy="41" rx="3.2" ry="2" fill="#f29bb0" opacity=".6"/>`;
  const smile = `<path d="M32 42 q4 3 8 0" stroke="#4a3b52" stroke-width="1.6" fill="none" stroke-linecap="round"/>`;
  switch (kind) {
    case 'fairy':
      back = `<ellipse cx="16" cy="50" rx="12" ry="16" fill="${accent}" opacity=".55" transform="rotate(-25 16 50)"/><ellipse cx="56" cy="50" rx="12" ry="16" fill="${accent}" opacity=".55" transform="rotate(25 56 50)"/>`;
      hat = `<path d="M22 28 q14 -16 28 0" fill="#f9d978" opacity=".0"/><circle cx="36" cy="16" r="3" fill="#fff6b0"/><path d="M36 19 l0 6" stroke="#e6c46a" stroke-width="1.4"/>`;
      face = eyes() + blush + `<path d="M33 43 q3 1.6 6 0" stroke="#4a3b52" stroke-width="1.4" fill="none" stroke-linecap="round"/>`;
      break;
    case 'baker':
      hat = `<rect x="24" y="16" width="24" height="10" rx="2" fill="#fff"/><circle cx="27" cy="15" r="7" fill="#fff"/><circle cx="36" cy="11" r="8" fill="#fff"/><circle cx="45" cy="15" r="7" fill="#fff"/>`;
      face = eyes() + blush + smile + `<path d="M28 46 q4 -2 8 0 q4 -2 8 0" stroke="#8a5a3a" stroke-width="2" fill="none"/>`;
      break;
    case 'witch':
      hat = `<path d="M14 26 l44 0 q-6 -3 -12 -4 l-6 -20 q-2 4 -6 6 l-6 14 q-8 1 -14 4z" fill="${accent}"/><rect x="26" y="20" width="20" height="3" fill="#f2c14e"/>`;
      face = `<rect x="24" y="33" width="10" height="6" rx="2" fill="#3e3357"/><rect x="38" y="33" width="10" height="6" rx="2" fill="#3e3357"/><path d="M34 35 h4" stroke="#3e3357" stroke-width="1.5"/>` + smile;
      break;
    case 'knight':
      hat = `<path d="M18 36 q0 -22 18 -22 q18 0 18 22 l0 4 l-36 0z" fill="#d7dee8" stroke="#9aa7b8" stroke-width="1.2"/><path d="M36 14 q4 -8 10 -6 q-4 2 -6 8" fill="${accent}"/><rect x="22" y="32" width="28" height="4" rx="2" fill="#5b6778"/>`;
      face = `<circle cx="29" cy="40" r="1.8" fill="#4a3b52"/><circle cx="43" cy="40" r="1.8" fill="#4a3b52"/>`;
      break;
    case 'granny':
      hat = `<circle cx="36" cy="16" r="7" fill="#e9e4ea"/><path d="M20 30 q16 -14 32 0" fill="#e9e4ea"/>`;
      face = `<circle cx="29" cy="36" r="4.5" fill="none" stroke="#7a6a5a" stroke-width="1.4"/><circle cx="43" cy="36" r="4.5" fill="none" stroke="#7a6a5a" stroke-width="1.4"/><path d="M33.5 36 h5" stroke="#7a6a5a" stroke-width="1.2"/>` + eyes(36) + blush + smile;
      break;
    case 'cat':
      hat = `<path d="M20 30 l2 -16 l10 9z" fill="${skin}"/><path d="M52 30 l-2 -16 l-10 9z" fill="${skin}"/><path d="M23 26 l1 -8 l5 5z" fill="#f6a5b8"/><path d="M49 26 l-1 -8 l-5 5z" fill="#f6a5b8"/><rect x="24" y="20" width="24" height="5" rx="2" fill="${accent}" opacity=".0"/>`;
      face = eyes() + `<path d="M34 40 l2 2 l2 -2" fill="#e88a9a"/><path d="M36 42 q-3 3 -6 1 M36 42 q3 3 6 1" stroke="#4a3b52" stroke-width="1.3" fill="none"/>
        <path d="M22 40 h-8 M22 43 h-7 M50 40 h8 M50 43 h7" stroke="#4a3b52" stroke-width="0.9"/>`;
      break;
    case 'frog':
      hat = `<circle cx="26" cy="24" r="7" fill="${skin}"/><circle cx="46" cy="24" r="7" fill="${skin}"/><path d="M28 14 l4 5 l4 -7 l4 7 l4 -5 l-1 7 l-14 0z" fill="${accent}"/>`;
      face = `<circle cx="26" cy="24" r="3.4" fill="#fff"/><circle cx="46" cy="24" r="3.4" fill="#fff"/><circle cx="26" cy="24.6" r="1.8" fill="#3a4a3a"/><circle cx="46" cy="24.6" r="1.8" fill="#3a4a3a"/>
        <path d="M24 41 q12 8 24 0" stroke="#3a6a3a" stroke-width="1.8" fill="none" stroke-linecap="round"/>` + blush;
      break;
    case 'mushroom':
      hat = `<path d="M12 32 q2 -22 24 -22 q22 0 24 22 z" fill="${accent}"/><circle cx="26" cy="20" r="3.4" fill="#fff"/><circle cx="42" cy="17" r="4" fill="#fff"/><circle cx="51" cy="26" r="2.6" fill="#fff"/><circle cx="20" cy="28" r="2.2" fill="#fff"/>`;
      face = eyes(38) + blush + smile;
      break;
  }
  return `<svg viewBox="0 0 72 72" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    ${back}
    <path d="M14 72 q2 -20 22 -20 q20 0 22 20z" fill="${body}" stroke="rgba(90,70,100,.25)"/>
    <circle cx="36" cy="37" r="16" fill="${skin}" stroke="rgba(90,70,100,.2)"/>
    ${hat}${face}
  </svg>`;
}

export function heartsSVG(n, max = 5, size = 22) {
  let s = '';
  for (let i = 0; i < max; i++) {
    s += `<svg viewBox="0 0 24 24" width="${size}" height="${size}"><path d="M12 21s-7.5-4.6-9.6-9.3C.9 8.3 3 4.5 6.6 4.5c2.2 0 3.8 1.3 5.4 3.1 1.6-1.8 3.2-3.1 5.4-3.1 3.6 0 5.7 3.8 4.2 7.2C19.5 16.4 12 21 12 21z" fill="${i < n ? '#ec7c95' : '#eadde3'}"/></svg>`;
  }
  return `<span class="hearts">${s}</span>`;
}

export function starsSVG(n, max = 5, size = 30) {
  let s = '';
  for (let i = 0; i < max; i++) {
    s += `<svg viewBox="0 0 24 24" width="${size}" height="${size}"><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.5 1.3 6.6L12 17.2l-5.9 3.3 1.3-6.6L2.5 9.4l6.6-.8z" fill="${i < n ? '#f2c14e' : '#ece4d4'}" stroke="#d9a93a" stroke-width="${i < n ? 0.8 : 0}"/></svg>`;
  }
  return `<span class="stars">${s}</span>`;
}

export function stemIcon(stem, size = 40) {
  if (stem.hybrid) return flowerSVG(stem.k, { petal: stem.petal, glow: stem.glowColor, size });
  return flowerSVG(stem.k, { size });
}

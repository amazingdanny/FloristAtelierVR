// In-world readable panels: customer speech bubble, flower-language chalkboard, status board, lobby/results sign.
import * as THREE from 'three';
import { FLOWERS, FLOWER_KINDS, TAGS, VILLAGERS } from '../shared/data.js';
import { Panel, paperCard, roundRect, wrapLines, FONT_HEAD, FONT_BODY, rgba, srand, paintWash, makeCanvas } from './textures.js';

const INK = '#4f4058', SOFT = '#85738c', ROSE = '#d4607b';

function faceOrigin(mesh) {
  const p = mesh.position;
  mesh.rotation.y = Math.atan2(-p.x, -p.z);
}

function stars(ctx, x, y, n, size = 46) {
  for (let i = 0; i < 5; i++) {
    const cx = x + i * size * 1.15, cy = y;
    ctx.beginPath();
    for (let k = 0; k < 10; k++) {
      const r = k % 2 ? size * 0.22 : size * 0.5;
      const a = -Math.PI / 2 + (k / 10) * Math.PI * 2;
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fillStyle = i < n ? '#f2c14e' : '#ece4d4'; ctx.fill();
  }
}
function heart(ctx, x, y, s, fill) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s / 24, s / 24);
  ctx.beginPath();
  ctx.moveTo(12, 21);
  ctx.bezierCurveTo(4, 16, 0.5, 11.5, 2.4, 7.5); ctx.bezierCurveTo(4, 4, 9, 3.5, 12, 7.6);
  ctx.bezierCurveTo(15, 3.5, 20, 4, 21.6, 7.5); ctx.bezierCurveTo(23.5, 11.5, 20, 16, 12, 21);
  ctx.fillStyle = fill; ctx.fill(); ctx.restore();
}

export class Panels {
  constructor(scene) {
    this.scene = scene;
    // speech bubble above the customer
    this.bubble = new Panel(1024, 560, 1.05);
    this.bubble.mesh.position.set(0, 2.02, -1.34);
    scene.add(this.bubble.mesh);
    this.bubble.mesh.visible = false;

    // chalkboard: language of flowers
    this.chalk = new Panel(800, 940, 0.78);
    this.chalk.mesh.position.set(-1.12, 1.62, -1.02);
    faceOrigin(this.chalk.mesh);
    scene.add(this.chalk.mesh);
    this.addFrame(this.chalk.mesh, 0.78, 0.78 * 940 / 800);

    // status board
    this.status = new Panel(800, 760, 0.78);
    this.status.mesh.position.set(1.12, 1.62, -1.02);
    faceOrigin(this.status.mesh);
    scene.add(this.status.mesh);
    this.addFrame(this.status.mesh, 0.78, 0.78 * 760 / 800);

    // big sign (lobby / results)
    this.sign = new Panel(1400, 900, 1.45);
    this.sign.mesh.position.set(0, 1.78, -1.75);
    scene.add(this.sign.mesh);

    this.qrImg = null;
    this.status.draw(() => {});
  }

  addFrame(mesh, w, h) {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.05, h + 0.05, 0.03), new THREE.MeshLambertMaterial({ color: '#d9b48f' }));
    frame.position.z = -0.02;
    mesh.add(frame);
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 1.2, 4), new THREE.MeshLambertMaterial({ color: '#c9a77f' }));
    rope.position.set(0, h / 2 + 0.6, -0.02);
    mesh.add(rope);
  }

  loadQR(url) {
    const img = new Image();
    img.onload = () => { this.qrImg = img; this.lobbyArgs && this.drawLobby(...this.lobbyArgs); };
    img.src = '/qr.svg?d=' + encodeURIComponent(url);
  }

  drawChalk() {
    this.chalk.draw((ctx, w, h) => {
      srand(3);
      roundRect(ctx, 0, 0, w, h, 26);
      ctx.fillStyle = '#56705f'; ctx.fill();
      // chalk dust wash
      ctx.save(); roundRect(ctx, 0, 0, w, h, 26); ctx.clip();
      paintWash(ctx, w, h, '#56705f', ['#5f7a68', '#4d6656', '#6a8572'], { blots: 30, alpha: 0.35, grain: 0.04 });
      ctx.restore();
      ctx.fillStyle = '#fdf6e8'; ctx.textAlign = 'center';
      ctx.font = `600 62px ${FONT_HEAD}`; ctx.fillText('Language of Flowers', w / 2, 92);
      ctx.strokeStyle = 'rgba(253,246,232,0.5)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(90, 122); ctx.lineTo(w - 90, 122); ctx.stroke();
      ctx.textAlign = 'left';
      // two columns: flower name with its meaning underneath
      const rows = Math.ceil(FLOWER_KINDS.length / 2);
      const rowH = Math.min(96, 660 / rows);
      FLOWER_KINDS.forEach((k, i) => {
        const F = FLOWERS[k], T = TAGS[F.tag];
        const x = i < rows ? 40 : w / 2 + 10;
        const y = 175 + (i % rows) * rowH;
        ctx.beginPath(); ctx.arc(x + 26, y + 6, 22, 0, 7); ctx.fillStyle = F.petal; ctx.fill();
        ctx.strokeStyle = 'rgba(253,246,232,0.6)'; ctx.lineWidth = 2; ctx.stroke();
        ctx.beginPath(); ctx.arc(x + 26, y + 6, 8, 0, 7); ctx.fillStyle = F.center; ctx.fill();
        ctx.fillStyle = '#fdf6e8'; ctx.font = `600 34px ${FONT_HEAD}`; ctx.fillText(F.name, x + 60, y + 2, w / 2 - 110);
        ctx.font = `700 24px ${FONT_BODY}`;
        const tw = ctx.measureText(T.label).width;
        roundRect(ctx, x + 60, y + 12, tw + 22, 32, 16); ctx.fillStyle = rgba(T.color, 0.9); ctx.fill();
        ctx.fillStyle = INK; ctx.fillText(T.label, x + 71, y + 36);
      });
      ctx.fillStyle = '#fdf6e8'; ctx.textAlign = 'center';
      ctx.font = `600 34px ${FONT_BODY}`;
      ctx.fillText('✨ Sprite-grown flowers carry TWO meanings', w / 2, h - 66);
      ctx.fillStyle = 'rgba(253,246,232,0.75)';
      ctx.font = `600 28px ${FONT_BODY}`;
      ctx.fillText('Read the request · pick the feeling · hand it over', w / 2, h - 24);
    });
  }

  // ---- speech bubble
  say(text, { name = '', sub = '', crown = false, mood = 'talk', hearts = null } = {}) {
    this.bubble.mesh.visible = !!(text || hearts !== null);
    if (!this.bubble.mesh.visible) return;
    this.bubble.draw((ctx, w, h) => {
      const bh = h - 70;
      ctx.save();
      ctx.shadowColor = 'rgba(90,60,90,0.25)'; ctx.shadowBlur = 20; ctx.shadowOffsetY = 6;
      roundRect(ctx, 14, 14, w - 28, bh - 14, 70); ctx.fillStyle = '#fffaf3'; ctx.fill();
      ctx.beginPath(); ctx.moveTo(w / 2 - 40, bh - 2); ctx.lineTo(w / 2, h - 14); ctx.lineTo(w / 2 + 40, bh - 2); ctx.closePath(); ctx.fill();
      ctx.restore();
      roundRect(ctx, 20, 20, w - 40, bh - 26, 64); ctx.strokeStyle = mood === 'think' ? '#b9a6ea' : '#f2a7b8'; ctx.lineWidth = 6; ctx.stroke();
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      if (name) { ctx.fillStyle = SOFT; ctx.font = `700 34px ${FONT_BODY}`; ctx.fillText(name + (sub ? ' · ' + sub : ''), w / 2, 76); }
      let y0 = name ? 150 : 120;
      if (hearts !== null) {
        for (let i = 0; i < 5; i++) heart(ctx, w / 2 - 230 + i * 92, y0 - 46, 80, i < hearts ? '#ec7c95' : '#eadde3');
        y0 += 80;
      }
      if (text) {
        ctx.fillStyle = INK;
        let size = 64;
        ctx.font = `600 ${size}px ${FONT_HEAD}`;
        let lines = wrapLines(ctx, text, w - 140);
        if (lines.length > 3) { size = 52; ctx.font = `600 ${size}px ${FONT_HEAD}`; lines = wrapLines(ctx, text, w - 120); }
        const lh = size * 1.18;
        const avail = bh - y0 - (crown ? 70 : 20);
        const startY = y0 + Math.max(0, (avail - lines.length * lh) / 2) + size * 0.4;
        lines.forEach((l, i) => ctx.fillText(l, w / 2, startY + i * lh));
      }
      if (crown) {
        ctx.font = `700 36px ${FONT_BODY}`;
        const t = '👑 A flower crown, please!';
        const tw = ctx.measureText(t).width;
        roundRect(ctx, w / 2 - tw / 2 - 24, bh - 82, tw + 48, 56, 28); ctx.fillStyle = '#fff1c2'; ctx.fill();
        ctx.fillStyle = INK; ctx.fillText(t, w / 2, bh - 42);
      }
    });
  }

  // ---- status board
  drawStatus(s) {
    this.statusArgs = s;
    this.status.draw((ctx, w, h) => {
      srand(8);
      paperCard(ctx, 6, 6, w - 12, h - 12, { tint: '#c9b6f2', radius: 34 });
      ctx.textAlign = 'center'; ctx.fillStyle = INK;
      ctx.font = `600 50px ${FONT_HEAD}`;
      ctx.fillText(s.title || '', w / 2, 82);
      if (s.timer) {
        ctx.font = `700 120px ${FONT_HEAD}`;
        ctx.fillStyle = s.urgent ? ROSE : INK;
        ctx.fillText(s.timer, w / 2, 228);
      }
      ctx.fillStyle = SOFT; ctx.font = `700 34px ${FONT_BODY}`;
      let y = s.timer ? 290 : 150;
      (s.lines || []).forEach(l => {
        if (l.big) { ctx.fillStyle = INK; ctx.font = `600 44px ${FONT_HEAD}`; }
        else if (l.row) {
          ctx.textAlign = 'left'; ctx.fillStyle = INK; ctx.font = `600 36px ${FONT_BODY}`; ctx.fillText(l.row[0], 80, y);
          ctx.textAlign = 'right'; ctx.fillText(l.row[1], w - 80, y); ctx.textAlign = 'center';
          y += 50; return;
        } else { ctx.fillStyle = l.color || SOFT; ctx.font = `700 34px ${FONT_BODY}`; }
        const lines = wrapLines(ctx, l.text, w - 120);
        lines.forEach(t => { ctx.fillText(t, w / 2, y); y += l.big ? 56 : 46; });
        y += 8;
      });
      if (s.score !== undefined) {
        ctx.fillStyle = SOFT; ctx.font = `700 32px ${FONT_BODY}`;
        ctx.fillText(`Atelier score: ${s.score}`, w / 2, h - 40);
      }
    });
  }

  // ---- lobby sign
  drawLobby(code, url, players, hostReady) {
    this.lobbyArgs = [code, url, players, hostReady];
    this.sign.mesh.visible = true;
    this.sign.draw((ctx, w, h) => {
      srand(21);
      paperCard(ctx, 8, 8, w - 16, h - 16, { tint: '#f6c6d8', radius: 50 });
      ctx.textAlign = 'center'; ctx.fillStyle = INK;
      ctx.font = `700 92px ${FONT_HEAD}`; ctx.fillText('Atelier & Bloom', w / 2 - 150, 120);
      ctx.font = `600 38px ${FONT_BODY}`; ctx.fillStyle = SOFT; ctx.fillText('Villagers, join on your phone:', w / 2 - 150, 190);
      ctx.font = `700 46px ${FONT_BODY}`; ctx.fillStyle = INK; ctx.fillText(url, w / 2 - 150, 252);
      ctx.font = `600 40px ${FONT_BODY}`; ctx.fillStyle = SOFT; ctx.fillText('Atelier code', w / 2 - 150, 330);
      ctx.font = `700 150px ${FONT_HEAD}`; ctx.fillStyle = ROSE;
      ctx.fillText(code ? code.split('').join(' ') : '· · · ·', w / 2 - 150, 470);
      if (this.qrImg) {
        roundRect(ctx, w - 360, 70, 300, 300, 30); ctx.fillStyle = '#fff'; ctx.fill();
        ctx.drawImage(this.qrImg, w - 345, 85, 270, 270);
      }
      // players
      ctx.font = `700 36px ${FONT_BODY}`; ctx.fillStyle = SOFT;
      ctx.fillText(players.length ? `${players.length} villager${players.length > 1 ? 's' : ''} in the shop` : 'No villagers yet — you can also play solo!', w / 2, 560);
      const names = players.map(p => p.name);
      ctx.font = `600 44px ${FONT_HEAD}`; ctx.fillStyle = INK;
      const rows = [names.slice(0, 4).join('   ·   '), names.slice(4).join('   ·   ')].filter(Boolean);
      rows.forEach((r, i) => ctx.fillText(r, w / 2, 625 + i * 58));
      roundRect(ctx, w / 2 - 420, h - 150, 840, 96, 48); ctx.fillStyle = '#fde2e8'; ctx.fill();
      ctx.font = `700 50px ${FONT_HEAD}`; ctx.fillStyle = ROSE;
      ctx.fillText('🔔 Ring the bell to open the shop!', w / 2, h - 86);
    });
  }

  drawFinal(f, code) {
    this.sign.mesh.visible = true;
    this.sign.draw((ctx, w, h) => {
      srand(33);
      paperCard(ctx, 8, 8, w - 16, h - 16, { tint: '#c9b6f2', radius: 50, fill: '#fffaf2' });
      ctx.textAlign = 'center'; ctx.fillStyle = SOFT;
      ctx.font = `700 40px ${FONT_BODY}`; ctx.fillText('Closing time at the atelier', w / 2, 80);
      ctx.fillStyle = INK; ctx.font = `700 84px ${FONT_HEAD}`; ctx.fillText(f.title, w / 2, 170);
      stars(ctx, w / 2 - 2.3 * 58, 235, f.stars, 58);
      ctx.fillStyle = SOFT; ctx.font = `600 36px ${FONT_BODY}`;
      ctx.fillText(`Florist score ${f.floristScore} · ${f.avg} points per order`, w / 2, 320);
      // leaderboard
      ctx.textAlign = 'left';
      ctx.fillStyle = INK; ctx.font = `600 46px ${FONT_HEAD}`; ctx.fillText('Villagers of the day', 90, 400);
      f.ranked.slice(0, 5).forEach((p, i) => {
        const y = 462 + i * 62;
        ctx.font = `700 40px ${FONT_BODY}`; ctx.fillStyle = i === 0 ? ROSE : INK;
        ctx.fillText(`${i === 0 ? '🏆' : (i + 1) + '.'}  ${p.name}`, 100, y);
        ctx.textAlign = 'right'; ctx.fillText(String(p.score), 640, y); ctx.textAlign = 'left';
      });
      if (!f.ranked.length) { ctx.font = `600 36px ${FONT_BODY}`; ctx.fillStyle = SOFT; ctx.fillText('A quiet day with village regulars.', 100, 462); }
      ctx.fillStyle = INK; ctx.font = `600 46px ${FONT_HEAD}`; ctx.fillText('Awards', 760, 400);
      f.awards.slice(0, 4).forEach((a, i) => {
        const y = 462 + i * 84;
        ctx.font = `700 38px ${FONT_BODY}`; ctx.fillStyle = INK; ctx.fillText(`🏅 ${a.title}: ${a.who}`, 770, y);
        ctx.font = `600 30px ${FONT_BODY}`; ctx.fillStyle = SOFT; ctx.fillText(a.why, 820, y + 36);
      });
      ctx.textAlign = 'center';
      roundRect(ctx, w / 2 - 380, h - 130, 760, 86, 43); ctx.fillStyle = '#e6f4ec'; ctx.fill();
      ctx.font = `700 46px ${FONT_HEAD}`; ctx.fillStyle = '#4a967d';
      ctx.fillText('🔔 Ring the bell to play again', w / 2, h - 72);
    });
  }

  hideSign() { this.sign.mesh.visible = false; }

  redrawAll() {
    this.drawChalk();
    if (this.statusArgs) this.drawStatus(this.statusArgs);
    if (this.lobbyArgs && this.sign.mesh.visible) this.drawLobby(...this.lobbyArgs);
  }
}

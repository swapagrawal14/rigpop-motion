// rigpop-motion v2 · props and FX: pan + noodles, gas flame, steam, packet, sachet,
// spatula, spoon, fork, masala particles. All flat vector with the same ink.
import { INK, LW, cel, limb, ellipse, stroke, fill } from './ink.mjs';
import { clamp, lerp, noise, hash, TAU } from './util.mjs';

/* ---------------------------------------------------------------- packet */
export const PACKET = { w: 92, h: 120 };
export function packet(g, x, y, rot = 0, { s = 1, empty = 0, torn = 0 } = {}) {
  const w = PACKET.w * s, h = PACKET.h * s;
  g.save(); g.translate(x, y); g.rotate(rot);
  const body = (q) => {
    q.moveTo(-w / 2, -h / 2 + 8 * s);
    // crimped top edge
    for (let i = 0; i <= 8; i++) q.lineTo(lerp(-w / 2, w / 2, i / 8), -h / 2 + (i % 2 ? 0 : 8 * s) - (torn && i > 5 ? 6 * s : 0));
    q.quadraticCurveTo(w / 2 + 6 * s * (1 - empty), 0, w / 2, h / 2 - 8 * s);
    for (let i = 8; i >= 0; i--) q.lineTo(lerp(-w / 2, w / 2, i / 8), h / 2 - (i % 2 ? 0 : 8 * s));
    q.quadraticCurveTo(-w / 2 - 6 * s * (1 - empty), 0, -w / 2, -h / 2 + 8 * s);
    q.closePath();
  };
  cel(g, body, '#f7c51e', '#d79b0c', (q) => { q.moveTo(w * 0.2, -h); q.lineTo(w, -h); q.lineTo(w, h); q.lineTo(w * 0.05, h); q.quadraticCurveTo(w * 0.32, 0, w * 0.2, -h); q.closePath(); }, LW * s);
  g.save(); g.beginPath(); body(g); g.clip();
  // red band + bowl art + badge (a generic 2-minute noodles pack, no real logo)
  g.beginPath(); g.rect(-w, -h * 0.36, w * 2, h * 0.24); fill(g, '#d8262c');
  g.font = `${Math.round(22 * s)}px Lucky`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 4 * s; g.strokeStyle = INK; g.strokeText('NOODLES', 0, -h * 0.24); g.fillStyle = '#fff6d8'; g.fillText('NOODLES', 0, -h * 0.24);
  g.beginPath(); ellipse(g, -w * 0.05, h * 0.2, w * 0.3, h * 0.12); fill(g, '#fff4e0'); stroke(g, LW * 0.6 * s);
  g.beginPath(); for (let i = 0; i < 4; i++) { g.moveTo(-w * 0.28, h * (0.16 + i * 0.03)); g.bezierCurveTo(-w * 0.1, h * (0.1 + i * 0.03), w * 0.05, h * (0.24 + i * 0.02), w * 0.2, h * (0.15 + i * 0.03)); }
  stroke(g, 3 * s, '#e3a514');
  g.beginPath(); ellipse(g, w * 0.3, -h * 0.02, 15 * s, 15 * s); fill(g, '#2f8f3b'); stroke(g, 2.5 * s);
  g.font = `${Math.round(11 * s)}px Lucky`; g.fillStyle = '#fff'; g.fillText('2MIN', w * 0.3, -h * 0.015);
  g.restore();
  g.beginPath(); body(g); stroke(g, LW * s);
  g.restore();
}

export function sachet(g, x, y, rot = 0, s = 1) {
  g.save(); g.translate(x, y); g.rotate(rot);
  cel(g, (q) => { q.moveTo(-17 * s, -24 * s); q.lineTo(10 * s, -24 * s); q.lineTo(17 * s, -16 * s); q.lineTo(17 * s, 24 * s); q.lineTo(-17 * s, 24 * s); q.closePath(); },
    '#f0782a', '#c25516', (q) => q.rect(4 * s, -30 * s, 30 * s, 60 * s), LW * 0.8 * s);
  g.beginPath(); g.rect(-17 * s, -4 * s, 34 * s, 9 * s); fill(g, '#d8262c');
  g.restore();
}

function spatula(g, hx, hy, ang, len = 74) {
  const dx = Math.cos(ang), dy = Math.sin(ang);
  const back = { x: hx - dx * 34, y: hy - dy * 34 };
  const tip = { x: hx + dx * len, y: hy + dy * len };
  limb(g, [back, { x: hx + dx * (len - 16), y: hy + dy * (len - 16) }], 9, '#a8622b', '#7a4319', LW * 0.8);
  g.save(); g.translate(tip.x, tip.y); g.rotate(ang);
  cel(g, (q) => q.roundRect(-16, -13, 28, 26, 6), '#c9ccd6', '#8f93a3', (q) => q.rect(-20, 3, 40, 20), LW * 0.85);
  g.restore();
}
function spoon(g, hx, hy, ang, len = 72, bite = 0) {
  const dx = Math.cos(ang), dy = Math.sin(ang);
  limb(g, [{ x: hx - dx * 26, y: hy - dy * 26 }, { x: hx + dx * (len - 12), y: hy + dy * (len - 12) }], 7, '#cfd3dd', '#9095a6', LW * 0.75);
  g.save(); g.translate(hx + dx * len, hy + dy * len); g.rotate(ang);
  cel(g, (q) => ellipse(q, 0, 0, 15, 11), '#d9dce5', '#9a9fb0', (q) => ellipse(q, 4, 5, 14, 7), LW * 0.8);
  if (bite > 0.01) { g.globalAlpha = clamp(bite, 0, 1); noodleTangle(g, 0, -4, 13, 7, 0, 3); g.globalAlpha = 1; }
  g.restore();
}
function fork(g, hx, hy, ang, len = 66, t = 0, strands = 1) {
  const dx = Math.cos(ang), dy = Math.sin(ang);
  limb(g, [{ x: hx - dx * 24, y: hy - dy * 24 }, { x: hx + dx * len, y: hy + dy * len }], 7, '#cfd3dd', '#9095a6', LW * 0.75);
  g.save(); g.translate(hx + dx * len, hy + dy * len); g.rotate(ang);
  g.beginPath(); for (const o of [-6, -2, 2, 6]) { g.moveTo(0, o); g.lineTo(16, o); } stroke(g, 3.2);
  g.restore();
  if (strands > 0.01) {
    // noodles dangling from the fork, swinging
    const tx = hx + dx * (len + 12), ty = hy + dy * (len + 12);
    g.globalAlpha = clamp(strands, 0, 1);
    for (let i = 0; i < 3; i++) {
      const sw = Math.sin(t * 7 + i) * 8;
      g.beginPath(); g.moveTo(tx - 4 + i * 4, ty);
      g.bezierCurveTo(tx + sw - 8, ty + 18, tx - sw + 8, ty + 30, tx + sw * 0.5 + i * 3, ty + 44 + i * 6);
      stroke(g, 7, INK); stroke(g, 3.6, '#f6cf5a');
    }
    g.globalAlpha = 1;
  }
}

// Held props are drawn at the hand. hold = { type, rot (absolute) | null, ... }
export function drawHeld(g, hold, hand, handAng, side, t) {
  const rot = hold.rot ?? handAng;
  switch (hold.type) {
    case 'packet': {
      const ax = hold.ax ?? (side === 'R' ? -30 : 30), ay = hold.ay ?? -44;
      const c = Math.cos(rot), s = Math.sin(rot);
      packet(g, hand.x + ax * c - ay * s, hand.y + ax * s + ay * c, rot, { empty: hold.empty || 0, torn: hold.torn || 0 });
      break;
    }
    case 'sachet': sachet(g, hand.x + Math.cos(rot) * 26, hand.y + Math.sin(rot) * 26, rot + Math.PI / 2); break;
    case 'spatula': spatula(g, hand.x, hand.y, rot); break;
    case 'spoon': spoon(g, hand.x, hand.y, rot, 72, hold.bite || 0); break;
    case 'fork': fork(g, hand.x, hand.y, rot, 66, t, hold.strands ?? 1); break;
  }
}

/* --------------------------------------------------------------- noodles */
function noodleTangle(g, cx, cy, rx, ry, t, n = 9, wig = 1) {
  for (let i = 0; i < n; i++) {
    const a0 = hash(i * 3.1) * TAU, r0 = hash(i * 7.7);
    const x0 = cx + Math.cos(a0) * rx * 0.75 * r0, y0 = cy + Math.sin(a0) * ry * 0.7 * r0;
    g.beginPath(); g.moveTo(x0 - rx * 0.4, y0);
    for (let k = 1; k <= 6; k++) {
      const px = x0 - rx * 0.4 + (rx * 0.8 * k) / 6;
      const py = y0 + Math.sin(k * 2.2 + t * 6 * wig + i) * ry * 0.18 * (1 + wig * 0.5);
      g.lineTo(px, py);
    }
    stroke(g, 7.5, '#8a5a12'); stroke(g, 4.4, i % 3 ? '#f6cf5a' : '#ffe08a');
  }
}

/* ------------------------------------------------------------ stove + pan */
export function stove(g, x, y, w = 280) {
  // x,y = left end of the hob top surface
  cel(g, (q) => q.roundRect(x, y, w, 46, 8), '#5b5f73', '#43465a', (q) => q.rect(x, y + 26, w, 30));
  cel(g, (q) => q.roundRect(x + 6, y - 10, w - 12, 16, 6), '#2c2d3a', null, null);
  for (const k of [0.18, 0.82]) {
    cel(g, (q) => ellipse(q, x + w * k, y + 30, 9, 9), '#e8e8ee', '#b5b5c4', (q) => q.rect(x + w * k, y + 30, 20, 20), LW * 0.8);
  }
  g.beginPath(); ellipse(g, x + w * 0.5, y + 30, 6, 6); fill(g, '#e2433f'); stroke(g, LW * 0.6);
}

export function flame(g, cx, cy, t, on = 1, size = 1) {
  if (on <= 0.01) return;
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const x = cx + Math.cos(a) * 44 * size, y = cy + Math.sin(a) * 9 * size;
    const fl = (0.75 + 0.45 * (noise(t * 9 + i * 3.3) * 0.5 + 0.5)) * on * size;
    const h = 30 * fl, w = 9 * size;
    const back = Math.sin(a) < 0;
    g.globalAlpha = back ? 0.7 : 1;
    g.beginPath(); g.moveTo(x - w, y); g.quadraticCurveTo(x - w * 0.6, y - h * 0.6, x + noise(t * 5 + i) * 3, y - h); g.quadraticCurveTo(x + w * 0.6, y - h * 0.6, x + w, y); g.closePath();
    fill(g, '#3d8bff');
    g.beginPath(); g.moveTo(x - w * 0.45, y); g.quadraticCurveTo(x - w * 0.2, y - h * 0.35, x, y - h * 0.55); g.quadraticCurveTo(x + w * 0.2, y - h * 0.35, x + w * 0.45, y); g.closePath();
    fill(g, '#bfe2ff');
    g.globalAlpha = 1;
  }
}

export const PAN = { rx: 92, ry: 26, depth: 34 };
// cx, cy = rim centre. content: 'empty' | 'water' | 'noodles'; stir = 0..1 activity
export function pan(g, cx, cy, t, { content = 'noodles', stir = 0, handleAng = -0.06, jiggle = 0 } = {}) {
  const { rx, ry, depth } = PAN;
  g.save(); g.translate(cx + jiggle, cy);
  // handle (to the right)
  const hx = rx - 6, hl = 112;
  g.save(); g.rotate(handleAng);
  cel(g, (q) => q.roundRect(hx, -9, hl, 18, 9), '#2e2a35', '#1d1a22', (q) => q.rect(hx, 2, hl, 12));
  g.beginPath(); ellipse(g, hx + hl - 14, 0, 5, 5); fill(g, '#5c5668');
  g.restore();
  // body
  const body = (q) => { q.moveTo(-rx, 0); q.bezierCurveTo(-rx * 0.96, depth * 1.3, rx * 0.96, depth * 1.3, rx, 0); q.ellipse(0, 0, rx, ry, 0, 0, Math.PI, true); q.closePath(); };
  cel(g, body, '#3a3746', '#28252f', (q) => q.rect(rx * 0.25, -10, rx, depth * 2));
  // inside
  g.beginPath(); ellipse(g, 0, 0, rx, ry); fill(g, '#24212b');
  g.save(); g.beginPath(); ellipse(g, 0, 2, rx - 9, ry - 5); g.clip();
  if (content === 'water' || content === 'noodles') {
    g.beginPath(); ellipse(g, 0, 4, rx - 9, ry - 5); fill(g, content === 'water' ? '#8fb7c8' : '#d9a640');
    // bubbles
    for (let i = 0; i < 7; i++) {
      const ph = (t * 1.3 + hash(i * 5.3)) % 1;
      const bx = (hash(i * 9.1) - 0.5) * rx * 1.4, by = (hash(i * 2.7) - 0.5) * ry;
      g.globalAlpha = 1 - ph; g.beginPath(); ellipse(g, bx, by, 3 + ph * 5, 2 + ph * 3); stroke(g, 2, '#fff7d6'); g.globalAlpha = 1;
    }
  }
  if (content === 'noodles') {
    g.save(); g.rotate(Math.sin(t * 7) * 0.08 * stir);
    noodleTangle(g, Math.sin(t * 7) * 10 * stir, 0, rx * 1.05, ry * 1.25, t, 13, 1 + stir * 2.5);
    g.restore();
    // a few masala flecks + peas
    for (let i = 0; i < 8; i++) { g.beginPath(); ellipse(g, (hash(i * 4.4) - 0.5) * rx * 1.4 + Math.sin(t * 7) * 8 * stir, (hash(i * 8.8) - 0.5) * ry * 1.1, 3.5, 3); fill(g, i % 2 ? '#5aa83c' : '#c2411f'); }
  }
  g.restore();
  g.beginPath(); ellipse(g, 0, 0, rx, ry); stroke(g, LW * 1.1);
  g.beginPath(); g.ellipse(0, 0, rx - 4, ry - 3, 0, Math.PI * 1.1, Math.PI * 1.6); stroke(g, 2.5, 'rgba(255,255,255,0.25)');
  g.restore();
}
export const panHandleEnd = (cx, cy, jiggle = 0, handleAng = -0.06, along = 0.7) =>
  ({ x: cx + jiggle + Math.cos(handleAng) * (PAN.rx - 6 + 112 * along), y: cy + Math.sin(handleAng) * (PAN.rx - 6 + 112 * along) });

/* ---------------------------------------------------------------- steam */
export function steam(g, x, y, t, amount = 1, spread = 60, n = 6) {
  if (amount <= 0.01) return;
  g.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const ph = (t * 0.42 + i / n) % 1;
    const bx = x + (hash(i * 3.7) - 0.5) * spread * 1.4;
    const rise = ph * 190;
    const a = Math.sin(Math.PI * ph) * 0.55 * amount;
    g.beginPath();
    for (let k = 0; k <= 10; k++) {
      const u = k / 10;
      const yy = y - rise - u * 70;
      const xx = bx + Math.sin(u * 4.5 + t * 2.2 + i * 1.7) * (10 + ph * 22) + noise(t * 0.7 + i) * 10;
      k === 0 ? g.moveTo(xx, yy) : g.lineTo(xx, yy);
    }
    g.globalAlpha = a; g.lineWidth = 9 + ph * 10; g.strokeStyle = '#f4f1ff'; g.stroke();
    g.globalAlpha = a * 0.5; g.lineWidth = 3; g.strokeStyle = '#ffffff'; g.stroke();
  }
  g.globalAlpha = 1;
}

/* ----------------------------------------------------- particles (closed form) */
// events: [{ t, x, y, floor, n, seed, kind }]. Each particle is a pure function of time.
export function particles(g, events, t) {
  for (const e of events) {
    const dt = t - e.t;
    if (dt < 0 || dt > 1.6) continue;
    for (let i = 0; i < e.n; i++) {
      const r1 = hash(e.seed * 17 + i), r2 = hash(e.seed * 31 + i * 1.7), r3 = hash(e.seed * 5 + i * 2.3);
      const delay = r3 * 0.18; const d = dt - delay; if (d < 0) continue;
      const vx = (r1 - 0.5) * (e.kind === 'burst' ? 260 : 70), vy = e.kind === 'burst' ? -120 - r2 * 160 : 40 + r2 * 80;
      let x = e.x + vx * d, y = e.y + vy * d + 0.5 * 900 * d * d;
      if (y > e.floor) { y = e.floor; x = e.x + vx * Math.sqrt(Math.max(0, (e.floor - e.y) / 450)); }
      const life = 1 - clamp((d - 0.5) / 0.5, 0, 1);
      if (life <= 0) continue;
      g.globalAlpha = life;
      g.beginPath(); ellipse(g, x, y, 3.2 + r2 * 2.5, 2.6 + r1 * 2); fill(g, e.col || (i % 3 ? '#e2541f' : '#f4a12a'));
    }
  }
  g.globalAlpha = 1;
}

// noodle block falling into the pan
export function block(g, x, y, rot = 0) {
  g.save(); g.translate(x, y); g.rotate(rot);
  cel(g, (q) => q.roundRect(-34, -22, 68, 44, 10), '#f3cf6e', '#d4a43c', (q) => q.rect(0, -30, 50, 70));
  g.save(); g.beginPath(); g.roundRect(-34, -22, 68, 44, 10); g.clip(); noodleTangle(g, 0, 0, 34, 22, 0, 6, 0); g.restore();
  g.beginPath(); g.roundRect(-34, -22, 68, 44, 10); stroke(g, LW);
  g.restore();
}

// comic impact marks: "!" pop and speed lines
export function exclaim(g, x, y, s = 1, rot = 0.12) {
  g.save(); g.translate(x, y); g.rotate(rot); g.scale(s, s);
  g.font = '86px Lucky'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 12; g.strokeStyle = INK; g.strokeText('!', 0, 0); g.fillStyle = '#ffd83a'; g.fillText('!', 0, 0);
  g.restore();
}

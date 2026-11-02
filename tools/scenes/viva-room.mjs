// A college viva room drawn in code for the new cast (Chintu the final-year student, Prof. Shukla).
// Morning light, a green chalkboard, a ticking wall clock and a slow ceiling fan — the fan matters:
// it keeps the wide shots alive without moving a single character.
//
//   meta:  scene: viva-room
//   hooks: { scene: { sky, hallway, wall, counter, foreground, lights }, drawHeld }
//
// It keeps the v2 world (900 x 1700) and the v2 SET landmarks, so every camera mark still works:
// the examiner's table sits exactly where the v2 counter is, which is why the cast can stand
// behind it on the `counter` marks and be cut off at the waist for free.
import { SET, archPath } from '../../src/v2/scene.mjs';
import { INK, LW, cel, ellipse, stroke, fill } from '../../src/v2/ink.mjs';
import { clamp, lerp, noise, hash, TAU } from '../../src/v2/util.mjs';
import { drawHeld as drawHeldV2 } from '../../src/v2/props.mjs';

const S = SET;
const PLASTER = '#e6e2ce', PLASTER_L = '#f2eeda', PLASTER_D = '#cdc7ae';
const DADO = '#7c9a86', DADO_D = '#647f6d', DADO_L = '#93ae9b';
const WOOD = '#9a6a3c', WOOD_D = '#734b28', WOOD_L = '#bb8b57';
const BOARD = '#2f4b3d', CHALK = '#eaf0e2';
const FLOOR = '#918b7e', FLOOR_D = '#787264';
const STEEL = '#cdd8de', STEEL_D = '#9fb0ba';

/* ---------------------------------------------------------------- far plates */
export function sky(g, t) {
  const W = S.window;
  g.save(); g.beginPath(); g.rect(W.x - 40, W.y - 40, W.w + 80, W.h + 80); g.clip();
  const gr = g.createLinearGradient(0, W.y - 40, 0, W.y + W.h + 40);
  gr.addColorStop(0, '#8fc7ee'); gr.addColorStop(0.62, '#cde8f7'); gr.addColorStop(1, '#eef7ec');
  g.fillStyle = gr; g.fillRect(W.x - 40, W.y - 40, W.w + 80, W.h + 80);
  // the sun, low and hot behind a haze
  g.beginPath(); ellipse(g, W.x + W.w * 0.72, W.y + 52, 34, 34); fill(g, '#fff6d8');
  g.globalAlpha = 0.35; g.beginPath(); ellipse(g, W.x + W.w * 0.72, W.y + 52, 62, 62); fill(g, '#fff3c8'); g.globalAlpha = 1;
  // clouds, drifting far too slowly to notice — which is the point
  for (let i = 0; i < 3; i++) {
    const cx = W.x - 60 + ((hash(i * 5.1) * (W.w + 140) + t * 4) % (W.w + 160));
    const cy = W.y + 40 + hash(i * 2.7) * 120;
    g.globalAlpha = 0.7;
    for (const [dx, dy, r] of [[0, 0, 26], [26, 6, 20], [-24, 8, 18]]) { g.beginPath(); ellipse(g, cx + dx, cy + dy, r, r * 0.62); fill(g, '#ffffff'); }
    g.globalAlpha = 1;
  }
  // the courtyard wall, a neem tree, a strip of hot tarmac
  g.beginPath(); g.rect(W.x - 40, W.y + W.h * 0.72, W.w + 120, W.h); fill(g, '#cfd6bd');
  g.beginPath(); g.rect(W.x - 40, W.y + W.h * 0.72, W.w + 120, 8); fill(g, '#b9c1a8');
  g.beginPath(); g.moveTo(W.x + 26, W.y + W.h * 0.74); g.lineTo(W.x + 34, W.y + W.h * 0.42); stroke(g, 9, INK); stroke(g, 5, '#6b5138');
  for (let i = 0; i < 7; i++) {
    const a = -0.4 + i * 0.45, len = 30 + hash(i * 3.3) * 26;
    const bx = W.x + 30 + Math.cos(a) * len, by = W.y + W.h * 0.42 - Math.abs(Math.sin(a)) * len * 0.7;
    g.globalAlpha = 0.9; g.beginPath(); ellipse(g, bx, by - 8, 26, 17, a * 0.4); fill(g, i % 2 ? '#77a35f' : '#5f8c4d'); g.globalAlpha = 1;
  }
  g.beginPath(); g.rect(W.x - 40, W.y + W.h * 0.86, W.w + 120, 60); fill(g, '#8e8b83');
  g.restore();
}

export function hallway(g, t) {
  const A = S.arch;
  // the corridor beyond the viva room: a cooler wall, a shut door, one tube light
  g.beginPath(); g.rect(A.cx - 300, A.top - 300, 600, 900); fill(g, '#bcc7bd');
  g.beginPath(); g.rect(A.cx - 300, A.top - 300, 600, 900); g.fillStyle = 'rgba(120,150,150,0.18)'; g.fill();
  // door
  cel(g, (q) => q.rect(A.cx - 62, 640, 124, 268), '#8a6a48', '#6d5136', (q) => q.rect(A.cx + 8, 640, 60, 280), LW * 0.9);
  cel(g, (q) => q.rect(A.cx + 34, 760, 12, 12), '#e2c14a', '#b4933a', null, LW * 0.6);
  g.beginPath(); g.rect(A.cx - 62, 640, 124, 268); stroke(g, LW * 0.9);
  // the far wall base line
  g.beginPath(); g.moveTo(A.cx - 300, 908); g.lineTo(A.cx + 300, 908); stroke(g, LW * 0.8);
  g.beginPath(); g.rect(A.cx - 300, 908, 600, 200); fill(g, '#9a978d');
  // tube light glow on the ceiling of the corridor
  g.save(); g.globalAlpha = 0.5; g.beginPath(); ellipse(g, A.cx, 560, 120, 34); fill(g, '#f4ffe8'); g.restore();
}

/* --------------------------------------------------------------------- wall */
export function wall(g, t, st) {
  const Wn = S.window;
  // plaster, with holes for the window and the arch so the far plates show through
  g.save();
  g.beginPath(); g.rect(-400, -400, S.w + 800, 2400);
  g.rect(Wn.x, Wn.y, Wn.w, Wn.h);
  archPath(g);
  g.clip('evenodd');
  g.beginPath(); g.rect(-400, S.ceil, S.w + 800, S.floor - S.ceil); fill(g, PLASTER);
  for (let i = 0; i < 40; i++) {
    const x = -60 + hash(i * 3.7) * (S.w + 120), y = S.ceil + hash(i * 1.9) * (S.floor - S.ceil);
    g.globalAlpha = 0.3;
    g.beginPath(); ellipse(g, x, y, 30 + hash(i * 5.5) * 60, 16 + hash(i * 2.2) * 30); fill(g, hash(i * 8.8) > 0.5 ? PLASTER_L : PLASTER_D);
  }
  g.globalAlpha = 1;
  // ceiling
  g.beginPath(); g.rect(-400, -400, S.w + 800, S.ceil + 400); fill(g, '#d6d2c0');
  g.beginPath(); g.rect(-400, S.ceil - 26, S.w + 800, 26); fill(g, '#bfbaa6');
  g.beginPath(); g.moveTo(-400, S.ceil); g.lineTo(S.w + 400, S.ceil); stroke(g, LW);
  const sg = g.createLinearGradient(0, S.ceil, 0, S.ceil + 120);
  sg.addColorStop(0, 'rgba(60,60,50,0.16)'); sg.addColorStop(1, 'rgba(60,60,50,0)');
  g.fillStyle = sg; g.fillRect(-400, S.ceil, S.w + 800, 120);
  // green dado band with a painted line on top
  g.beginPath(); g.rect(-400, 726, S.w + 800, S.floor - 726); fill(g, DADO);
  g.beginPath(); g.rect(-400, 726, S.w + 800, 12); fill(g, DADO_L);
  g.beginPath(); g.moveTo(-400, 726); g.lineTo(S.w + 400, 726); g.moveTo(-400, S.floor); g.lineTo(S.w + 400, S.floor); stroke(g, LW);
  // floor: tiles running to the wall
  g.beginPath(); g.rect(-400, S.floor, S.w + 800, 340); fill(g, FLOOR);
  for (let i = -9; i < 24; i++) {
    g.beginPath(); g.moveTo(i * 58, S.floor); g.lineTo(i * 58 + (i * 58 - 430) * 0.42, S.counterTop + 60); stroke(g, 2.2, FLOOR_D);
  }
  g.beginPath(); g.moveTo(-400, S.floor + 36); g.lineTo(S.w + 400, S.floor + 36); stroke(g, 2.2, FLOOR_D);
  g.beginPath(); g.rect(-400, S.floor, S.w + 800, 18); fill(g, '#7d776a');
  g.restore();

  // window frame + a tilted louvre, sun on the sill
  g.beginPath(); g.rect(Wn.x, Wn.y, Wn.w, Wn.h); stroke(g, LW * 3.4, INK); stroke(g, LW * 2.2, '#f4efdd');
  g.beginPath(); g.moveTo(Wn.x + Wn.w / 2, Wn.y); g.lineTo(Wn.x + Wn.w / 2, Wn.y + Wn.h * 0.55);
  g.moveTo(Wn.x, Wn.y + Wn.h * 0.55); g.lineTo(Wn.x + Wn.w, Wn.y + Wn.h * 0.55); stroke(g, LW * 2.0, INK); stroke(g, LW * 0.9, '#f4efdd');
  cel(g, (q) => q.roundRect(Wn.x - 14, Wn.y + Wn.h, Wn.w + 28, 16, 4), '#f4efdd', '#d3ccb4', (q) => q.rect(Wn.x, Wn.y + Wn.h + 8, Wn.w + 30, 20));
  for (let i = 0; i < 4; i++) {
    g.save(); g.globalAlpha = 0.22; g.beginPath();
    g.moveTo(Wn.x + 4, Wn.y + 30 + i * 46); g.lineTo(Wn.x + Wn.w - 4, Wn.y + 20 + i * 46); g.lineTo(Wn.x + Wn.w - 4, Wn.y + 32 + i * 46); g.lineTo(Wn.x + 4, Wn.y + 42 + i * 46); g.closePath(); fill(g, '#ffffff');
    g.restore();
  }

  // arch frame
  g.beginPath(); archPath(g, -18); archPath(g); g.fillStyle = DADO_D; g.fill('evenodd');
  g.save(); g.beginPath(); archPath(g, -18); archPath(g); g.clip('evenodd');
  g.beginPath(); g.rect(S.arch.cx + 24, S.arch.top - 200, 140, 800); fill(g, '#6d8a76');
  g.beginPath(); g.rect(S.arch.cx - 240, S.arch.top - 200, 90, 800); fill(g, '#8aa694'); g.restore();
  g.beginPath(); archPath(g, -18); stroke(g, LW);
  g.beginPath(); archPath(g); stroke(g, LW);

  drawBoard(g, t);
  drawNotice(g, t);
  drawClock(g, t);
  drawFan(g, t);
  drawCalendar(g, t);
}

// the ceiling fan: three blades, always turning, the cheapest life 60 rupees of electricity can buy
function drawFan(g, t) {
  const cx = 742, cy = 262;
  g.beginPath(); g.moveTo(cx, S.ceil); g.lineTo(cx, cy - 10); stroke(g, LW * 1.6, INK); stroke(g, 5, '#8d8778');
  const a0 = t * 2.4;
  for (let i = 0; i < 3; i++) {
    const a = a0 + (i * TAU) / 3;
    const ex = cx + Math.cos(a) * 108, ey = cy + Math.sin(a) * 22;
    const w = 0.34;
    cel(g, (q) => {
      q.moveTo(cx, cy);
      q.quadraticCurveTo(cx + Math.cos(a - w) * 74, cy + Math.sin(a - w) * 74 * 0.22 - 9, ex, ey);
      q.quadraticCurveTo(cx + Math.cos(a + w) * 74, cy + Math.sin(a + w) * 74 * 0.22 + 9, cx, cy);
      q.closePath();
    }, '#b9c3c6', '#94a0a4', null, LW * 0.8);
  }
  cel(g, (q) => ellipse(q, cx, cy, 20, 15), '#8f9a9d', '#6f7a7d', null, LW);
  g.beginPath(); ellipse(g, cx, cy, 20, 15); stroke(g, LW);
}

function drawBoard(g, t) {
  const x = 596, y = 300, w = 268, h = 236;
  cel(g, (q) => q.roundRect(x - 12, y - 12, w + 24, h + 24, 10), WOOD, WOOD_D, (q) => q.rect(x + w, y - 20, 40, h + 40));
  g.beginPath(); g.roundRect(x, y, w, h, 5); fill(g, BOARD);
  g.save(); g.beginPath(); g.roundRect(x, y, w, h, 5); g.clip();
  g.textAlign = 'center';
  g.fillStyle = CHALK; g.font = '23px Lucky';
  g.fillText('FINAL YEAR VIVA', x + w / 2, y + 44);
  g.font = '16px Baloo'; g.fillStyle = '#bcd2c0';
  g.fillText('SEM 7  ·  PROJECT', x + w / 2, y + 74);
  g.fillStyle = '#d7e4d0';
  g.font = '15px Baloo';
  g.fillText('1. hardware?', x + 40, y + 116);
  g.fillText('2. use case?', x + 40, y + 144);
  g.fillText('3. bar bar?', x + 40, y + 172);
  // a chalk circle round item 2, drawn over time
  const k = clamp((Math.sin(t * 0.7) + 1) / 2, 0.35, 1);
  g.beginPath(); g.strokeStyle = '#f2d98a'; g.lineWidth = LW * 1.2;
  g.ellipse(x + 108, y + 138, 96 * k, 20, -0.03, 0, TAU * k); g.stroke();
  g.restore();
  g.beginPath(); g.roundRect(x, y, w, h, 5); stroke(g, LW * 0.8);
  // the peg tray and a duster
  cel(g, (q) => q.roundRect(x + 12, y + h + 14, w - 24, 12, 4), WOOD_L, WOOD, null, LW * 0.7);
  cel(g, (q) => q.roundRect(x + w - 84, y + h + 10, 58, 16, 5), '#4a4a52', '#33333a', null, LW * 0.7);
}

function drawNotice(g, t) {
  // a cork board of pinned sheets, one of them always about to fall
  const x = 40, y = 560, w = 232, h = 132;
  cel(g, (q) => q.roundRect(x, y, w, h, 6), '#c9a878', '#ac8c5f', (q) => q.rect(x, y + 8, w, h), LW * 0.9);
  for (let i = 0; i < 4; i++) {
    const px = x + 14 + (i % 2) * 108, py = y + 12 + Math.floor(i / 2) * 58;
    const wob = Math.sin(t * 0.9 + i) * 0.02;
    g.save(); g.translate(px + 46, py + 24); g.rotate(wob * (i === 3 ? 1 : 0.2)); g.translate(-46, -24);
    cel(g, (q) => q.rect(0, 0, 92, 46), '#f6f3e4', '#dedac6', (q) => q.rect(0, 38, 92, 10), LW * 0.6);
    g.beginPath(); g.moveTo(8, 14); g.lineTo(80, 14); g.moveTo(8, 24); g.lineTo(66, 24); stroke(g, 2.6, '#9a968a');
    g.beginPath(); ellipse(g, 46, 4, 4.5, 4.5); fill(g, i % 2 ? '#d8452f' : '#3f6ec4');
    g.restore();
  }
}

function drawClock(g, t) {
  const { x, y, r } = S.clock;
  g.beginPath(); ellipse(g, x, y, r, r); fill(g, '#f7f4e8');
  g.beginPath(); ellipse(g, x, y, r, r); stroke(g, LW * 2.2, INK);
  g.beginPath(); ellipse(g, x, y, r - 5, r - 5); stroke(g, LW * 0.8, '#c9c4b0');
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    g.beginPath(); g.moveTo(x + Math.cos(a) * (r - 8), y + Math.sin(a) * (r - 8)); g.lineTo(x + Math.cos(a) * (r - 14), y + Math.sin(a) * (r - 14)); stroke(g, 2.4, INK);
  }
  // 11:58 — four minutes to the viva of a lifetime
  const am = ((-58 / 60) * TAU) + Math.PI / 2, hr = ((-2 / 12) * TAU) + Math.PI / 2 - 0.1;
  g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(hr) * r * 0.5, y + Math.sin(hr) * r * 0.5); stroke(g, 5, INK);
  const tick = Math.sin(t * 3.1) * 0.01;
  g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(am + tick) * r * 0.78, y + Math.sin(am + tick) * r * 0.78); stroke(g, 3.2, '#b23a2a');
  g.beginPath(); ellipse(g, x, y, 4.5, 4.5); fill(g, INK);
}

function drawCalendar(g, t) {
  const x = 700, y = 574, w = 150, h = 118;
  g.beginPath(); g.moveTo(x + w / 2, y - 26); g.lineTo(x + w / 2, y); stroke(g, 2.6, INK);
  cel(g, (q) => q.rect(x, y, w, h), '#faf7ea', '#e0dcc8', (q) => q.rect(x, y + h - 8, w, 8), LW * 0.8);
  g.beginPath(); g.rect(x, y, w, 26); fill(g, '#c4443a');
  g.textAlign = 'center'; g.fillStyle = '#fff3e2'; g.font = '16px Baloo';
  g.fillText('NOVEMBER', x + w / 2, y + 19);
  g.fillStyle = '#5c5a52'; g.font = '13px Baloo';
  for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) g.fillText(String(2 + i + j * 5 > 30 ? '' : 2 + i + j * 5), x + 18 + i * 26, y + 50 + j * 15);
  g.beginPath(); g.rect(x, y, w, h); stroke(g, LW * 0.8);
  // the day of the viva, circled in red
  g.beginPath(); g.ellipse(x + 44, y + 61, 13, 9, 0, 0, TAU); stroke(g, LW * 1.2, '#c4443a');
}

/* ------------------------------------------------------------------- counter */
export function counter(g, t, st) {
  // the examiner's table: a stone-grey top, a green rexine modesty panel
  cel(g, (q) => q.rect(-400, S.counterTop, S.w + 800, S.counterFront - S.counterTop), '#c9c2ad', '#a9a28d', (q) => q.rect(-400, S.counterTop + 24, S.w + 800, 18));
  g.beginPath(); g.rect(-400, S.counterFront, S.w + 800, S.cabinet - S.counterFront); fill(g, WOOD_D);
  g.beginPath(); g.rect(-400, S.cabinet, S.w + 800, 900); fill(g, DADO_D);
  for (let i = -6; i < 22; i++) { g.beginPath(); g.moveTo(i * 86, S.cabinet); g.lineTo(i * 86, S.cabinet + 320); stroke(g, 2.2, '#57705f'); }
  g.beginPath(); g.rect(-400, S.cabinet + 84, S.w + 800, 16); fill(g, '#4d6455');
  g.beginPath(); g.moveTo(-400, S.counterTop); g.lineTo(S.w + 400, S.counterTop); g.moveTo(-400, S.counterFront); g.lineTo(S.w + 400, S.counterFront); g.moveTo(-400, S.cabinet); g.lineTo(S.w + 400, S.cabinet); stroke(g, LW);
  g.save(); g.textAlign = 'center'; g.font = '30px Lucky';
  g.fillStyle = 'rgba(255,255,255,0.10)'; g.fillText('EXAMINATION  CELL  04', S.w / 2, S.cabinet + 54);
  g.restore();

  // papers, a register, a steel glass, a pen and — the star of the viva — one chappal
  const T = S.counterTop;
  for (let i = 0; i < 3; i++) {
    g.save(); g.translate(150 + i * 5, T - 4 - i * 5); g.rotate(-0.04 + i * 0.03);
    cel(g, (q) => q.rect(0, -20, 108, 22), '#f7f4e6', '#ddd8c4', (q) => q.rect(0, -6, 108, 8), LW * 0.6);
    g.restore();
  }
  cel(g, (q) => q.roundRect(286, T - 16, 116, 18, 3), '#8d3a34', '#6b2a26', (q) => q.rect(286, T - 8, 116, 10), LW * 0.7);
  g.beginPath(); g.moveTo(300, T - 7); g.lineTo(390, T - 7); stroke(g, 2.2, '#d8cfc0');
  // water glass
  cel(g, (q) => { q.moveTo(524, T); q.lineTo(528, T - 44); q.lineTo(556, T - 44); q.lineTo(560, T); q.quadraticCurveTo(542, T + 5, 524, T); q.closePath(); }, 'rgba(240,248,252,0.9)', '#d2dee4', (q) => q.rect(546, T - 50, 22, 60), LW * 0.8);
  g.save(); g.beginPath(); g.moveTo(524, T); g.lineTo(528, T - 44); g.lineTo(556, T - 44); g.lineTo(560, T); g.closePath(); g.clip();
  g.beginPath(); g.rect(522, T - 26, 44, 30); fill(g, '#cfe4ee'); g.restore();
  g.beginPath(); g.moveTo(524, T); g.lineTo(528, T - 44); g.lineTo(556, T - 44); g.lineTo(560, T); g.quadraticCurveTo(542, T + 5, 524, T); g.closePath(); stroke(g, LW * 0.8);
  // pen
  g.save(); g.translate(596, T - 4); g.rotate(0.12);
  cel(g, (q) => q.roundRect(0, -5, 62, 8, 4), '#2b3f8f', '#1e2f6b', null, LW * 0.6);
  g.beginPath(); g.moveTo(62, -5); g.lineTo(72, -1); g.lineTo(62, 3); g.closePath(); fill(g, '#c9c2ad');
  g.restore();
  // the chappal, lying on the table like an exhibit
  if (!st.chappalTaken) { // until the candidate picks it up for the pitch
    g.save(); g.translate(322, T - 6); g.rotate(-0.05);
    chappal(g, 0, 0, 0.9, 0, t);
    g.restore();
  }
}

// one rubber chappal, seen from above: footprint, a thick V thong, a buckle. Drawn once on the
// table and again in the candidate's hand for the pitch, so it has to read at both sizes.
export function chappalSide(g, x, y, sc = 1, rot = 0, t = 0) {
  g.save(); g.translate(x, y); g.rotate(rot); g.scale(sc, sc);
  const wob = Math.sin(t * 1.7) * 1.2;
  // sole: a flat bar with a heel and a toe you could swat a fly with
  cel(g, (q) => {
    q.moveTo(-50, 2); q.quadraticCurveTo(-60, -6, -50, -12);
    q.quadraticCurveTo(-10, -18, 34, -16); q.quadraticCurveTo(56, -14, 58, -5);
    q.quadraticCurveTo(58, 3, 40, 6); q.quadraticCurveTo(-14, 12, -50, 2); q.closePath();
  }, '#3e6fa8', '#2b5180', (q) => q.rect(-90, -2, 200, 40), LW * 1.05);
  g.beginPath(); g.moveTo(-48, 2); g.quadraticCurveTo(0, 11, 46, 4); stroke(g, 3, '#24506f');
  // the V strap: one bold arch over the middle of the sole
  g.beginPath(); g.moveTo(-16, -12 - wob); g.quadraticCurveTo(-4, -38 - wob, 14, -13 - wob);
  stroke(g, 15, INK); stroke(g, 9, '#f0c33c');
  // the plug and the heel tab
  cel(g, (q) => ellipse(q, 14, -13 - wob, 6, 5), '#e8e2cf', '#c2bba6', null, LW * 0.7);
  cel(g, (q) => q.roundRect(-56, -14, 12, 16, 3), '#f0c33c', '#c99c22', null, LW * 0.7);
  g.restore();
  return 0;
}

export function chappal(g, x, y, sc = 1, rot = 0, t = 0) {
  g.save(); g.translate(x, y); g.rotate(rot); g.scale(sc, sc);
  const wob = Math.sin(t * 1.6) * 0.8;
  const sole = (q) => {
    q.moveTo(-46, -19);
    q.quadraticCurveTo(-58, -6, -47, 9);
    q.quadraticCurveTo(-6, 21, 40, 17);
    q.quadraticCurveTo(55, 14, 54, -1);
    q.quadraticCurveTo(53, -16, 39, -18);
    q.quadraticCurveTo(-8, -26, -46, -19);
    q.closePath();
  };
  // the sole, with its edge showing under the toe
  cel(g, (q) => { sole(q); }, '#3e6fa8', '#2b5180', (q) => { q.rect(-90, 4, 190, 40); }, LW * 1.05);
  g.beginPath(); sole(g); stroke(g, LW * 1.0);
  // grip treads
  for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(-30 + i * 15, 12); g.lineTo(-24 + i * 15, 17); stroke(g, 2.6, '#24506f'); }
  // the V thong: thick bands from the sides meeting at the toe, ink under, rubber over
  const band = (a, b, c) => { g.beginPath(); g.moveTo(a[0], a[1] - wob); g.quadraticCurveTo(b[0], b[1] - wob, c[0], c[1] - wob); stroke(g, 13, INK); stroke(g, 8, '#f0c33c'); };
  band([-30, -20], [-14, -30], [2, -12]);
  band([-30, 6], [-10, 14], [2, -12]);
  // the little stud where the thong plugs into the sole
  cel(g, (q) => ellipse(q, 2, -12, 6, 5), '#e8e2cf', '#c2bba6', null, LW * 0.7);
  // buckle tab on the heel
  cel(g, (q) => q.roundRect(-56, -12, 12, 20, 4), '#f0c33c', '#c99c22', null, LW * 0.7);
  g.restore();
  return 0;
}

/* ---------------------------------------------------------------- foreground */
export function foreground(g, t) {
  // the back of the candidate's chair, bottom left, and a stack of answer sheets bottom right —
  // both nearer to the lens than the table, so they slide faster than the camera
  g.save();
  cel(g, (q) => q.roundRect(-40, 1218, 320, 200, 14), WOOD, WOOD_D, (q) => q.rect(-40, 1268, 320, 150), LW * 1.4);
  g.beginPath(); g.roundRect(-40, 1218, 320, 200, 14); stroke(g, LW * 1.2);
  for (let i = 0; i < 2; i++) { cel(g, (q) => q.roundRect(-10 + i * 210, 1180, 26, 120, 8), WOOD_L, WOOD, null, LW); }
  for (let i = 0; i < 7; i++) {
    g.save(); g.translate(760 + i * 3, 1290 - i * 9); g.rotate(-0.05 + i * 0.012);
    cel(g, (q) => q.rect(-120, 0, 300, 16), '#f8f5e8', '#ded9c5', (q) => q.rect(-120, 10, 300, 8), LW * 0.8);
    g.restore();
  }
  g.restore();
}

/* -------------------------------------------------------------------- lights */
export function lights(g, t, st) {
  g.save();
  g.globalCompositeOperation = 'lighter';
  // morning sun through the window: a warm wedge across the room
  const Wn = S.window;
  const sg = g.createLinearGradient(Wn.x, Wn.y, Wn.x + 520, Wn.y + 620);
  sg.addColorStop(0, 'rgba(255,232,170,0.30)');
  sg.addColorStop(0.55, 'rgba(255,226,160,0.10)');
  sg.addColorStop(1, 'rgba(255,226,160,0)');
  g.fillStyle = sg; g.beginPath(); g.moveTo(Wn.x - 40, Wn.y - 40); g.lineTo(Wn.x + Wn.w + 40, Wn.y - 40);
  g.lineTo(Wn.x + Wn.w + 320, S.counterTop); g.lineTo(Wn.x - 120, S.counterTop); g.closePath(); g.fill();
  // the tube light on the ceiling
  const fl = 0.9 + 0.1 * Math.sin(t * 21.7) * (hash(Math.floor(t * 3)) > 0.86 ? 1 : 0.12);
  g.globalAlpha = 0.5 * fl;
  g.beginPath(); ellipse(g, 640, S.ceil + 26, 300, 90); fill(g, '#eaf6ff');
  g.globalAlpha = 1;
  g.restore();
  // overhead cool wash so the room reads as a room, not a wall
  const hz = g.createLinearGradient(0, 0, 0, 500);
  hz.addColorStop(0, 'rgba(70,90,110,0.14)'); hz.addColorStop(1, 'rgba(70,90,110,0)');
  g.fillStyle = hz; g.fillRect(0, 0, S.w, 500);
}

/* --------------------------------------------------------------- held props */
export function drawHeld(g, hold, hand, handAng, side, t) {
  if (hold.type === 'papers') {
    const rot = (hold.rot ?? 0) + handAng * 0.2;
    g.save(); g.translate(hand.x, hand.y); g.rotate(rot);
    for (let i = 3; i >= 0; i--) {
      g.save(); g.translate(i * 1.6, -i * 2.2); g.rotate(-0.03 * i);
      cel(g, (q) => q.rect(-50, -20, 100, 40), i ? '#f7f4e6' : '#fdfbf2', '#ddd8c4', (q) => q.rect(-50, 4, 100, 16), LW * 0.6);
      g.restore();
    }
    for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(-38, -11 + i * 10); g.lineTo(32, -11 + i * 10); stroke(g, 2.2, '#a9a493'); }
    g.restore();
    return;
  }
  if (hold.type !== 'chappal') return drawHeldV2(g, hold, hand, handAng, side, t);
  const rot = (hold.rot ?? 0) + handAng * 0.25;
  g.save(); g.translate(hand.x, hand.y - 6); g.rotate(rot);
  chappalSide(g, 0, 0, 1.15, 0.3, t);
  g.restore();
}

export const scene = { sky, hallway, wall, counter, foreground, lights };

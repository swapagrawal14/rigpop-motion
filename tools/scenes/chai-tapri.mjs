// A night chai tapri drawn in code for Bunty & Chotu, in the same marker-doodle language as the
// character rigs: cobalt ink lines, cream plaster, orange + hot pink accents, one warm bulb.
//
//   meta:  scene: chai-tapri
//   hooks: { scene: { sky, hallway, wall, counter, foreground, lights } }
//
// The stall keeps the v2 world (900 x 1700) and the v2 SET landmarks, so every camera mark and
// the [shot insert pan] zoom still line up: the chai patili sits exactly where the v2 pan lives,
// and the engine's own steam rises off it.
import { SET, archPath } from '../../src/v2/scene.mjs';
import { INK, LW, cel, ellipse, stroke, fill } from '../../src/v2/ink.mjs';
import { clamp, lerp, noise, hash, TAU } from '../../src/v2/util.mjs';
import { drawHeld as drawHeldV2 } from '../../src/v2/props.mjs';

const CREAM = '#d8c8a6', CREAM_D = '#c2b08d', PLASTER = '#e3d3b0';
const COBALT = '#2a3f8f', COBALT_L = '#37509f';
const WOOD = '#96602f', WOOD_D = '#6f4522', WOOD_L = '#b57a41';
const STEEL = '#cdd8de', STEEL_D = '#9fb0ba';
const PINK = '#ff4d93', ORANGE = '#f2601f', BULB = '#ffe6a8';
const S = SET;

/* ---------------------------------------------------------------- far plates */
export function sky(g, t) {
  const W = S.window;
  g.save(); g.beginPath(); g.rect(W.x - 40, W.y - 40, W.w + 80, W.h + 80); g.clip();
  const gr = g.createLinearGradient(0, W.y - 40, 0, W.y + W.h + 40);
  gr.addColorStop(0, '#131a3e'); gr.addColorStop(1, '#2b3a6b');
  g.fillStyle = gr; g.fillRect(W.x - 40, W.y - 40, W.w + 80, W.h + 80);
  for (let i = 0; i < 22; i++) {
    const x = W.x - 30 + hash(i * 4.7) * (W.w + 60), y = W.y - 20 + hash(i * 2.3) * W.h * 0.7;
    const tw = 0.45 + 0.55 * Math.sin(t * (1.2 + hash(i) * 2.4) + i * 2);
    g.globalAlpha = tw; g.beginPath(); ellipse(g, x, y, 1.4 + tw, 1.4 + tw); fill(g, '#fff6d8');
  }
  g.globalAlpha = 1;
  // moon, low and cool
  const mx = W.x + W.w * 0.72, my = W.y + 62;
  const rg = g.createRadialGradient(mx, my, 6, mx, my, 74);
  rg.addColorStop(0, 'rgba(226,236,255,0.35)'); rg.addColorStop(1, 'rgba(226,236,255,0)');
  g.fillStyle = rg; g.fillRect(mx - 90, my - 90, 180, 180);
  g.beginPath(); g.arc(mx, my, 26, 0, TAU); fill(g, '#eef2ff');
  g.beginPath(); g.arc(mx + 11, my - 7, 23, 0, TAU, true); fill(g, '#2b3a6b');
  // the street: rooftops, a water tank, a fluttering banner
  const base = W.y + W.h + 40;
  g.beginPath(); g.moveTo(W.x - 40, base);
  const sky = [[0, 88], [46, 92], [70, 58], [104, 58], [120, 104], [170, 104], [186, 70], [222, 70], [244, 118]];
  for (const [dx, h] of sky) g.lineTo(W.x + dx, base - h);
  g.lineTo(W.x + W.w + 40, base); g.closePath(); fill(g, '#111735');
  g.fillStyle = '#ffd06a';
  for (let i = 0; i < 9; i++) {
    const x = W.x + 12 + hash(i * 7.7) * (W.w - 24), y = base - 26 - hash(i * 3.1) * 46;
    if (hash(i * 9.1) > 0.45) { g.globalAlpha = 0.75 + 0.25 * Math.sin(t * 3 + i); g.fillRect(x, y, 7, 9); }
  }
  g.globalAlpha = 1;
  // a wire with three tiny bulbs strung across the street
  g.beginPath(); g.moveTo(W.x - 30, W.y + 40); g.quadraticCurveTo(W.x + W.w / 2, W.y + 92, W.x + W.w + 30, W.y + 46); stroke(g, 2, '#0d1230');
  for (let i = 1; i < 5; i++) {
    const u = i / 5, x = W.x - 30 + u * (W.w + 60), y = W.y + 40 + Math.sin(u * Math.PI) * 50;
    const tw = 0.6 + 0.4 * Math.sin(t * 2.4 + i * 1.7);
    g.globalAlpha = 0.9; g.beginPath(); g.arc(x, y, 3.4, 0, TAU); fill(g, '#fff2c0'); g.globalAlpha = 0.4 * tw;
    g.beginPath(); g.arc(x, y, 11, 0, TAU); fill(g, BULB); g.globalAlpha = 1;
  }
  g.restore();
}

export function hallway(g, t) {
  const A = S.arch;
  g.save(); g.beginPath(); archPath(g); g.clip();
  // the back lane behind the stall
  g.beginPath(); g.rect(A.cx - 200, A.top - 60, 460, 700); fill(g, '#1b1f42');
  const gr = g.createLinearGradient(0, A.top, 0, A.bottom);
  gr.addColorStop(0, '#262a55'); gr.addColorStop(1, '#171a38');
  g.fillStyle = gr; g.fillRect(A.cx - 200, A.top - 60, 460, 700);
  // brick lane wall
  for (let y = A.top + 10; y < A.bottom; y += 26) {
    for (let x = A.cx - 200 + ((y / 26) % 2) * 30; x < A.cx + 260; x += 60) {
      g.globalAlpha = 0.5; g.beginPath(); g.rect(x, y, 54, 20); fill(g, hash(x + y) > 0.5 ? '#2f3563' : '#2a2f59');
    }
  }
  g.globalAlpha = 1;
  // a lone bulb on a wire, swaying
  const sw = Math.sin(t * 1.1) * 0.12;
  const bx = A.cx + 30 + Math.sin(sw) * 90, by = A.top + 130;
  g.beginPath(); g.moveTo(A.cx + 30, A.top - 40); g.quadraticCurveTo(A.cx + 34, by - 60, bx, by); stroke(g, 2.4, '#0e1130');
  const gl = g.createRadialGradient(bx, by + 8, 2, bx, by + 8, 130);
  gl.addColorStop(0, 'rgba(255,226,150,0.55)'); gl.addColorStop(1, 'rgba(255,226,150,0)');
  g.fillStyle = gl; g.fillRect(bx - 140, by - 120, 280, 280);
  g.beginPath(); g.arc(bx, by, 7, 0, TAU); fill(g, '#fff6d0');
  // crates and a sleeping dog
  cel(g, (q) => q.rect(A.cx - 120, A.bottom - 90, 70, 60), '#7d4b26', '#5c351a', (q) => q.rect(A.cx - 120, A.bottom - 60, 70, 30), LW * 0.8);
  cel(g, (q) => q.rect(A.cx - 116, A.bottom - 130, 62, 44), '#8d5729', '#6a3f1d', (q) => q.rect(A.cx - 116, A.bottom - 108, 62, 22), LW * 0.8);
  cel(g, (q) => { q.moveTo(A.cx + 70, A.bottom); q.lineTo(A.cx + 70, A.bottom - 20); q.quadraticCurveTo(A.cx + 96, A.bottom - 34, A.cx + 130, A.bottom - 26); q.quadraticCurveTo(A.cx + 150, A.bottom - 22, A.cx + 146, A.bottom - 8); q.lineTo(A.cx + 146, A.bottom); q.closePath(); }, '#c9b28e', '#a8916f', (q) => q.rect(A.cx + 70, A.bottom - 12, 90, 16), LW * 0.8);
  g.beginPath(); g.arc(A.cx + 74, A.bottom - 24, 11, 0, TAU); fill(g, '#c9b28e'); g.beginPath(); g.arc(A.cx + 74, A.bottom - 24, 11, 0, TAU); stroke(g, LW * 0.7);
  g.beginPath(); g.moveTo(A.cx + 64, A.bottom - 30); g.lineTo(A.cx + 58, A.bottom - 42); g.moveTo(A.cx + 76, A.bottom - 33); g.lineTo(A.cx + 78, A.bottom - 45); stroke(g, LW * 0.6, '#a8916f');
  g.restore();
}

/* ------------------------------------------------------------------- the wall */
export function wall(g, t, st) {
  const Wn = S.window, A = S.arch;
  // plaster, with a hole for the window and the arch so the far plates show through
  g.save();
  g.beginPath(); g.rect(-400, -400, S.w + 800, 2400);
  g.rect(Wn.x, Wn.y, Wn.w, Wn.h);
  archPath(g);
  g.clip('evenodd');
  g.beginPath(); g.rect(-400, S.ceil, S.w + 800, S.floor - S.ceil); fill(g, PLASTER);
  // hand-daubed plaster: soft blotches
  for (let i = 0; i < 46; i++) {
    const x = -60 + hash(i * 3.7) * (S.w + 120), y = S.ceil + hash(i * 1.9) * (S.floor - S.ceil);
    g.globalAlpha = 0.35; g.beginPath(); ellipse(g, x, y, 30 + hash(i * 5.5) * 60, 18 + hash(i * 2.2) * 34); fill(g, hash(i * 8.8) > 0.5 ? CREAM : '#eddfbd');
  }
  g.globalAlpha = 1;
  // ceiling and its shadow
  g.beginPath(); g.rect(-400, -400, S.w + 800, S.ceil + 400); fill(g, '#241d34');
  g.beginPath(); g.rect(-400, S.ceil - 24, S.w + 800, 24); fill(g, '#3b2f4e');
  g.beginPath(); g.moveTo(-400, S.ceil); g.lineTo(S.w + 400, S.ceil); stroke(g, LW);
  const sg = g.createLinearGradient(0, S.ceil, 0, S.ceil + 110);
  sg.addColorStop(0, 'rgba(30,18,44,0.42)'); sg.addColorStop(1, 'rgba(30,18,44,0)');
  g.fillStyle = sg; g.fillRect(-400, S.ceil, S.w + 800, 110);
  // cobalt dado band + a painted line
  g.beginPath(); g.rect(-400, 700, S.w + 800, S.floor - 700); fill(g, COBALT);
  g.beginPath(); g.rect(-400, 700, S.w + 800, 14); fill(g, COBALT_L);
  g.beginPath(); g.moveTo(-400, 700); g.lineTo(S.w + 400, 700); g.moveTo(-400, S.floor); g.lineTo(S.w + 400, S.floor); stroke(g, LW);
  // floor
  g.beginPath(); g.rect(-400, S.floor, S.w + 800, 300); fill(g, '#5d5470');
  for (let i = -8; i < 22; i++) { g.beginPath(); g.moveTo(i * 62, S.floor); g.lineTo(i * 62 + (i * 62 - 420) * 0.4, S.counterTop + 80); stroke(g, 2.4, '#4e4660'); }
  g.beginPath(); g.moveTo(-400, S.floor + 34); g.lineTo(S.w + 400, S.floor + 34); stroke(g, 2.4, '#4e4660');
  g.restore();

  // window frame (the street shows through the hole)
  g.beginPath(); g.rect(Wn.x, Wn.y, Wn.w, Wn.h); stroke(g, LW * 3.6, INK); stroke(g, LW * 2.3, '#f0e4c8');
  g.beginPath(); g.moveTo(Wn.x + Wn.w / 2, Wn.y); g.lineTo(Wn.x + Wn.w / 2, Wn.y + Wn.h * 0.62);
  g.moveTo(Wn.x, Wn.y + Wn.h * 0.62); g.lineTo(Wn.x + Wn.w, Wn.y + Wn.h * 0.62); stroke(g, LW * 2.3, INK); stroke(g, LW * 1.0, '#f0e4c8');
  cel(g, (q) => q.roundRect(Wn.x - 14, Wn.y + Wn.h, Wn.w + 28, 16, 4), '#f0e4c8', '#cdbf9f', (q) => q.rect(Wn.x, Wn.y + Wn.h + 8, Wn.w + 30, 20));
  // a half-pulled shutter with an orange awning above it
  cel(g, (q) => { q.moveTo(Wn.x - 26, Wn.y - 34); q.lineTo(Wn.x + Wn.w + 26, Wn.y - 34); q.lineTo(Wn.x + Wn.w + 10, Wn.y - 4); q.lineTo(Wn.x - 10, Wn.y - 4); q.closePath(); }, ORANGE, '#c34412', (q) => q.rect(Wn.x - 30, Wn.y - 12, Wn.w + 70, 12));
  for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(Wn.x + 6 + i * 38, Wn.y - 34); g.lineTo(Wn.x + 14 + i * 38, Wn.y - 4); stroke(g, 2.6, '#c34412'); }

  // arch frame: a band between the outer and inner arch (even-odd, so the lane stays visible)
  g.beginPath(); archPath(g, -18); archPath(g); g.fillStyle = COBALT_L; g.fill('evenodd');
  g.save(); g.beginPath(); archPath(g, -18); archPath(g); g.clip('evenodd');
  g.beginPath(); g.rect(A.cx + 24, A.top - 200, 140, 800); fill(g, '#2f4699');
  g.beginPath(); g.rect(A.cx - 240, A.top - 200, 90, 800); fill(g, '#42579f'); g.restore();
  g.beginPath(); archPath(g, -18); stroke(g, LW); g.beginPath(); archPath(g); stroke(g, LW);

  drawCounterClutter(g, t);
  drawChalkboard(g, t);
  drawShelves(g, t, st);
  drawPoster(g, t);
  drawClock(g, t);
  drawBulbsOnString(g, t);
}

// the small things standing on the counter: drawn with the wall so the cast is in front of them
function drawCounterClutter(g, t) {
  for (const [cx, cy, sc] of [[396, S.counterTop + 4, 1], [446, S.counterTop + 16, 0.86]]) cuttingGlass(g, cx, cy, sc, t);
  cel(g, (q) => q.roundRect(470, S.counterTop + 26, 92, 22, 6), STEEL, STEEL_D, (q) => q.rect(470, S.counterTop + 38, 92, 12), LW * 0.7);
  cel(g, (q) => q.roundRect(586, S.counterTop + 12, 78, 42, 6), COBALT, '#22347a', (q) => q.rect(624, S.counterTop + 8, 40, 50), LW * 0.8);
  g.beginPath(); g.moveTo(608, S.counterTop + 28); g.lineTo(644, S.counterTop + 28); stroke(g, 3, '#c9d3f5');
  // a tea strainer and a spent matchbox
  cel(g, (q) => q.roundRect(330, S.counterTop + 30, 54, 18, 9), STEEL, STEEL_D, null, LW * 0.6);
  g.beginPath(); g.moveTo(384, S.counterTop + 39); g.lineTo(420, S.counterTop + 20); stroke(g, 4, INK);
  cel(g, (q) => q.roundRect(676, S.counterTop + 30, 46, 24, 4), '#e8dfc6', '#c9bd9d', (q) => q.rect(676, S.counterTop + 44, 46, 12), LW * 0.6);
}

// the menu board: real type, because the code can turn on a font
function drawChalkboard(g, t) {
  const x = 96, y = 214, w = 232, h = 250;
  cel(g, (q) => q.roundRect(x - 12, y - 12, w + 24, h + 24, 12), WOOD, WOOD_D, (q) => q.rect(x + w, y - 20, 40, h + 40));
  g.beginPath(); g.roundRect(x, y, w, h, 6); fill(g, '#26332f');
  g.beginPath(); g.roundRect(x, y, w, h, 6); stroke(g, LW * 0.8);
  g.save(); g.beginPath(); g.roundRect(x, y, w, h, 6); g.clip();
  g.textAlign = 'center'; g.fillStyle = '#f4efe0';
  g.font = '26px Lucky'; g.fillText('CHAI', x + w / 2, y + 56);
  g.font = '15px Baloo'; g.fillStyle = '#a9c0b4';
  g.fillText('- - - - - - - - - - -', x + w / 2, y + 78);
  const rows = [['CUTTING', '₹7'], ['FULL', '₹10'], ['EXTRA SUGAR', 'FREE'], ['GOSSIP', 'FREE']];
  rows.forEach(([a, b], i) => {
    const ry = y + 112 + i * 34;
    g.textAlign = 'left'; g.font = '17px Baloo'; g.fillStyle = '#eae3cf'; g.fillText(a, x + 18, ry);
    g.textAlign = 'right'; g.font = '17px Lucky'; g.fillStyle = i === 3 ? PINK : '#ffd36a'; g.fillText(b, x + w - 18, ry);
  });
  // chalk dust and a doodle cup
  g.globalAlpha = 0.18; g.fillStyle = '#fff';
  for (let i = 0; i < 40; i++) g.fillRect(x + hash(i * 3.1) * w, y + hash(i * 7.3) * h, 2, 2);
  g.globalAlpha = 1;
  g.beginPath(); g.moveTo(x + 196, y + 200); g.lineTo(x + 214, y + 200); g.lineTo(x + 210, y + 226); g.lineTo(x + 200, y + 226); g.closePath(); stroke(g, 2, '#ffd36a');
  g.restore();
  // the chalk tray
  cel(g, (q) => q.rect(x - 8, y + h + 6, w + 16, 12), WOOD_L, WOOD_D, (q) => q.rect(x - 8, y + h + 13, w + 16, 6), LW * 0.7);
}

// where the fridge used to be: a steel shelf of kettles, jars and a stack of cutting glasses
function drawShelves(g, t, st) {
  const x = 636, w = 232;
  for (const [yy, hh] of [[392, 168], [566, 168], [740, 150]]) {
    cel(g, (q) => q.rect(x - 6, yy, w + 12, 12), '#b9c4cc', '#8e9aa3', (q) => q.rect(x - 6, yy + 6, w + 12, 8), LW * 0.7);
    g.beginPath(); g.rect(x - 6, yy, w + 12, 12); stroke(g, LW * 0.7);
    // brackets
    g.beginPath(); g.moveTo(x + 16, yy + 12); g.lineTo(x + 16, yy + 40); g.moveTo(x + w - 16, yy + 12); g.lineTo(x + w - 16, yy + 40); stroke(g, LW * 0.6, '#7d8992');
  }
  // kettle on the top shelf
  cel(g, (q) => { q.moveTo(x + 40, 392); q.lineTo(x + 44, 330); q.lineTo(x + 118, 330); q.lineTo(x + 122, 392); q.closePath(); }, STEEL, STEEL_D, (q) => q.rect(x + 96, 320, 40, 90), LW * 0.9);
  cel(g, (q) => q.roundRect(x + 48, 316, 66, 18, 8), '#dfe8ec', STEEL_D, (q) => q.rect(x + 90, 312, 30, 30), LW * 0.7);
  g.beginPath(); g.moveTo(x + 44, 344); g.quadraticCurveTo(x + 18, 350, x + 34, 372); stroke(g, LW * 0.8); // spout
  g.beginPath(); g.arc(x + 82, 330, 26, Math.PI * 1.15, Math.PI * 1.85); stroke(g, LW * 0.9); // handle
  // glass jars of tea, sugar, masala
  const jars = [[x + 150, '#7a4a1f', 'TEA'], [x + 196, '#f3ecdc', 'SUGAR'], [x + 240, '#a8402c', 'MASALA']];
  for (const [jx, c] of jars) {
    cel(g, (q) => q.roundRect(jx - 20, 322, 40, 70, 8), 'rgba(226,238,244,0.85)', '#b6c6ce', (q) => q.rect(jx + 2, 312, 30, 90), LW * 0.7);
    g.beginPath(); g.rect(jx - 17, 344, 34, 45); fill(g, c);
    cel(g, (q) => q.roundRect(jx - 22, 312, 44, 12, 4), '#d8434e', '#a8323b', (q) => q.rect(jx, 308, 30, 24), LW * 0.6);
  }
  // second shelf: a stack of steel katoris and a row of cutting glasses
  for (let i = 0; i < 3; i++) {
    const yy = 566 - i * 15;
    cel(g, (q) => { q.moveTo(x + 30, yy); q.lineTo(x + 104, yy); q.lineTo(x + 96, yy - 14); q.lineTo(x + 38, yy - 14); q.closePath(); }, i % 2 ? '#dfe8ec' : STEEL, STEEL_D, (q) => q.rect(x + 84, yy - 20, 30, 24), LW * 0.7);
  }
  for (let i = 0; i < 4; i++) {
    const gx = x + 138 + i * 26;
    cel(g, (q) => { q.moveTo(gx - 11, 566); q.lineTo(gx - 9, 520); q.lineTo(gx + 9, 520); q.lineTo(gx + 11, 566); q.closePath(); }, 'rgba(240,248,250,0.9)', '#c3d2d9', (q) => q.rect(gx + 2, 514, 12, 60), LW * 0.6);
    g.beginPath(); g.rect(gx - 9, 540, 18, 18); fill(g, '#c98a4b');
  }
  // third shelf: biscuit tins and a radio
  cel(g, (q) => q.roundRect(x + 26, 660, 80, 80, 8), '#e0b23c', '#b8892a', (q) => q.rect(x + 78, 652, 40, 96), LW * 0.8);
  g.beginPath(); g.roundRect(x + 26, 660, 80, 80, 8); stroke(g, LW * 0.8);
  cel(g, (q) => q.roundRect(x + 124, 662, 96, 74, 10), '#b2462f', '#8c3221', (q) => q.rect(x + 190, 654, 40, 90), LW * 0.8);
  for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(x + 136, 676 + i * 11); g.lineTo(x + 176, 676 + i * 11); stroke(g, 3, '#e6cbb6'); }
  g.beginPath(); g.arc(x + 200, 696, 20, 0, TAU); stroke(g, LW * 0.8); g.beginPath(); g.arc(x + 200, 696, 18, 0, TAU); fill(g, '#3a2a25');
  g.beginPath(); g.moveTo(x + 200, 696); g.lineTo(x + 200 + Math.cos(t * 0.7) * 12, 696 + Math.sin(t * 0.7) * 12); stroke(g, 2.4, '#e6cbb6');
}

function drawPoster(g, t) {
  const x = 700, y = 190, w = 150, h = 116;
  g.save(); g.translate(x + w / 2, y + h / 2); g.rotate(0.03);
  cel(g, (q) => q.rect(-w / 2, -h / 2, w, h), '#f2e7cc', '#d9cbab', (q) => q.rect(w / 2 - 22, -h / 2, 30, h), LW * 0.8);
  g.textAlign = 'center';
  g.font = '20px Lucky'; g.fillStyle = COBALT; g.fillText('BUNTY', 0, -24);
  g.font = '17px Lucky'; g.fillStyle = PINK; g.fillText('CHAI', 0, -4);
  g.font = '13px Baloo'; g.fillStyle = INK; g.fillText('CORNER', 0, 14);
  g.beginPath(); g.moveTo(-46, 26); g.lineTo(46, 26); stroke(g, 2, '#c9b48c');
  g.font = '11px Baloo'; g.fillStyle = '#6b5a3d'; g.fillText('since 2 a.m.', 0, 44);
  // tape
  g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(-w / 2 - 4, -h / 2 - 6, 34, 12); g.fillRect(w / 2 - 30, -h / 2 - 6, 34, 12);
  g.restore();
}

function drawClock(g, t) {
  const C = S.clock;
  cel(g, (q) => ellipse(q, C.x, C.y, C.r, C.r), '#fbf4e2', '#e2d6bb', (q) => ellipse(q, C.x + 8, C.y + 8, C.r, C.r), LW * 1.2);
  for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; g.beginPath(); g.moveTo(C.x + Math.cos(a) * C.r * 0.76, C.y + Math.sin(a) * C.r * 0.76); g.lineTo(C.x + Math.cos(a) * C.r * 0.9, C.y + Math.sin(a) * C.r * 0.9); stroke(g, 2.4); }
  const hand = (a, l, w, c = INK) => { g.beginPath(); g.moveTo(C.x, C.y); g.lineTo(C.x + Math.sin(a) * l, C.y - Math.cos(a) * l); stroke(g, w, c); };
  hand((2 / 12) * TAU + 0.05, C.r * 0.48, 5); hand(TAU * (10 / 60), C.r * 0.74, 3.6); hand((Math.floor(t) / 60) * TAU, C.r * 0.8, 2, PINK);
}

// a sagging wire of warm bulbs across the stall (sockets here, glow in lights())
const BULBS = [[120, 208], [250, 236], [380, 250], [510, 240], [640, 214], [760, 186]];
function drawBulbsOnString(g, t) {
  g.beginPath(); g.moveTo(-40, 150);
  for (let i = 0; i < BULBS.length; i++) { const [x, y] = BULBS[i]; g.lineTo(x, y); }
  g.lineTo(S.w + 40, 140); stroke(g, 3, INK);
  for (const [x, y] of BULBS) {
    g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 14); stroke(g, 2.4, INK);
    cel(g, (q) => { q.moveTo(x - 9, y + 14); q.lineTo(x + 9, y + 14); q.quadraticCurveTo(x + 11, y + 34, x, y + 38); q.quadraticCurveTo(x - 11, y + 34, x - 9, y + 14); q.closePath(); }, '#ffe9b6', '#e6c777', null, 3);
  }
}

/* ---------------------------------------------------------------- the counter */
export function counter(g, t, st) {
  // stone top + wooden front
  cel(g, (q) => q.rect(-400, S.counterTop, S.w + 800, S.counterFront - S.counterTop), '#c9bda4', '#ab9f88', (q) => q.rect(-400, S.counterTop + 24, S.w + 800, 18));
  g.beginPath(); g.rect(-400, S.counterFront, S.w + 800, S.cabinet - S.counterFront); fill(g, WOOD_D);
  g.beginPath(); g.moveTo(-400, S.counterTop); g.lineTo(S.w + 400, S.counterTop); g.moveTo(-400, S.counterFront); g.lineTo(S.w + 400, S.counterFront); g.moveTo(-400, S.cabinet); g.lineTo(S.w + 400, S.cabinet); stroke(g, LW);
  // the front panel: planks with cobalt battens
  g.beginPath(); g.rect(-400, S.cabinet, S.w + 800, 900); fill(g, WOOD);
  for (let i = -6; i < 22; i++) { g.beginPath(); g.moveTo(i * 74, S.cabinet); g.lineTo(i * 74, S.cabinet + 300); stroke(g, 2.6, '#7f5128'); }
  g.beginPath(); g.rect(-400, S.cabinet + 96, S.w + 800, 20); fill(g, COBALT);
  g.beginPath(); g.moveTo(-400, S.cabinet + 96); g.lineTo(S.w + 400, S.cabinet + 96); g.moveTo(-400, S.cabinet + 116); g.lineTo(S.w + 400, S.cabinet + 116); stroke(g, 3);
  // painted wordmark on the front panel
  g.save(); g.textAlign = 'center'; g.font = '34px Lucky';
  g.fillStyle = 'rgba(255,255,255,0.14)'; g.fillText('CUTTING  CHAI  CORNER', S.w / 2, S.cabinet + 62);
  g.restore();

  // the chai patili: a big steel kettle sitting exactly where the v2 pan lives (steam comes free)
  const P = S.pans.home;
  chaiPatili(g, P.x, P.y, t, st);
  // gas stove body under it
  cel(g, (q) => q.roundRect(40, 946, 290, 48, 8), '#3b3b46', '#2b2b34', (q) => q.rect(40, 970, 290, 24));
  for (const bx of [88, 232]) { g.beginPath(); g.arc(bx, 962, 16, 0, TAU); fill(g, '#20202a'); g.beginPath(); g.arc(bx, 962, 16, 0, TAU); stroke(g, 2.4, '#55556a'); }
  if (st.stoveOn) for (const bx of [88, 232]) {
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU, r = 13, h = 10 + 6 * Math.sin(t * 14 + i);
      g.beginPath(); g.moveTo(bx + Math.cos(a) * r, 954 + Math.sin(a) * 4); g.lineTo(bx + Math.cos(a) * r * 0.7, 954 - h); g.lineTo(bx + Math.cos(a + 0.4) * r, 954 + Math.sin(a + 0.4) * 4); g.closePath();
      fill(g, i % 2 ? '#ffb03a' : '#ffe08a');
    }
  }
  g.beginPath(); g.roundRect(40, 946, 290, 48, 8); stroke(g, LW);

  // glass display box of biscuits at the right end
  const gx = 640, gy = S.counterTop - 96;
  cel(g, (q) => q.roundRect(gx, gy, 210, 96, 8), 'rgba(200,232,238,0.55)', '#a8c6ce', (q) => q.rect(gx + 150, gy - 10, 70, 116), LW);
  for (let i = 0; i < 3; i++) {
    cel(g, (q) => q.roundRect(gx + 12 + i * 66, gy + 34, 54, 52, 6), ['#e8b93c', '#d8543c', '#f0a5c0'][i], '#00000022', null, LW * 0.7);
    g.beginPath(); g.roundRect(gx + 12 + i * 66, gy + 34, 54, 52, 6); stroke(g, LW * 0.7);
  }
  g.beginPath(); g.roundRect(gx, gy, 210, 96, 8); stroke(g, LW);
  g.beginPath(); g.moveTo(gx, gy + 26); g.lineTo(gx + 210, gy + 26); stroke(g, 2.4, '#7fa5ad');

  drawCounterClutter(g, t);
}

// the big steel chai pot: lid, handle, a spout of steam is drawn by the engine
function chaiPatili(g, x, y, t, st) {
  const bob = st.stoveOn ? Math.sin(t * 9) * 0.7 : 0;
  cel(g, (q) => { q.moveTo(x - 74, y); q.lineTo(x - 66, y - 96 + bob); q.lineTo(x + 66, y - 96 + bob); q.lineTo(x + 74, y); q.quadraticCurveTo(x, y + 14, x - 74, y); q.closePath(); }, STEEL, STEEL_D, (q) => q.rect(x + 24, y - 110, 60, 140));
  // tea inside showing through? no: a rolled rim and a lid
  cel(g, (q) => q.roundRect(x - 70, y - 108 + bob, 140, 16, 7), '#e2ebef', STEEL_D, (q) => q.rect(x + 20, y - 116, 60, 30), LW * 0.8);
  g.beginPath(); g.roundRect(x - 70, y - 108 + bob, 140, 16, 7); stroke(g, LW * 0.8);
  g.beginPath(); g.arc(x, y - 116 + bob, 8, 0, TAU); stroke(g, LW * 0.8);
  g.beginPath(); g.moveTo(x - 74, y - 74 + bob); g.quadraticCurveTo(x - 118, y - 66 + bob, x - 96, y - 22 + bob); stroke(g, 9, INK);
  g.beginPath(); g.moveTo(x - 74, y - 74 + bob); g.quadraticCurveTo(x - 112, y - 66 + bob, x - 92, y - 26 + bob); stroke(g, 5, STEEL);
  g.beginPath(); g.moveTo(x + 70, y - 80 + bob); g.lineTo(x + 96, y - 96 + bob); stroke(g, LW * 0.9);
  // ladle
  g.beginPath(); g.moveTo(x + 40, y - 108 + bob); g.lineTo(x + 62, y - 156 + bob); stroke(g, 4, INK);
  cel(g, (q) => ellipse(q, x + 64, y - 160 + bob, 13, 9), STEEL, STEEL_D, null, LW * 0.7);
}

function cuttingGlass(g, x, y, s = 1, t = 0) {
  g.save(); g.translate(x, y); g.scale(s, s);
  const h = 46 * s;
  cel(g, (q) => { q.moveTo(-15, 0); q.lineTo(-11, -h); q.lineTo(11, -h); q.lineTo(15, 0); q.quadraticCurveTo(0, 6, -15, 0); q.closePath(); }, 'rgba(246,236,220,0.92)', '#d9c9ad', (q) => q.rect(4, -h - 6, 20, h + 16), LW * 0.8);
  // the chai inside, at half glass (it is a cutting, after all)
  g.save(); g.beginPath(); g.moveTo(-15, 0); g.lineTo(-11, -h); g.lineTo(11, -h); g.lineTo(15, 0); g.quadraticCurveTo(0, 6, -15, 0); g.closePath(); g.clip();
  g.beginPath(); g.rect(-16, -h * 0.52, 34, h); fill(g, '#c98a4b');
  g.globalAlpha = 0.5; g.beginPath(); g.rect(-16, -h * 0.56, 34, 4); fill(g, '#f0dcbc'); g.globalAlpha = 1;
  g.restore();
  g.beginPath(); g.moveTo(-15, 0); g.lineTo(-11, -h); g.lineTo(11, -h); g.lineTo(15, 0); g.quadraticCurveTo(0, 6, -15, 0); g.closePath(); stroke(g, LW * 0.8);
  g.restore();
}

/* --------------------------------------------------------------- foreground */
export function foreground(g, t) {
  // marigold bunting on a slack string, closer to the lens than the stall
  const y0 = 236, amp = 34;
  g.beginPath(); g.moveTo(-120, y0);
  g.quadraticCurveTo(S.w / 2, y0 + amp * 2.4, S.w + 120, y0 - 6); stroke(g, 3.4, INK);
  for (let i = 0; i <= 10; i++) {
    const u = i / 10;
    const x = -120 + u * (S.w + 240);
    const y = y0 + Math.sin(u * Math.PI) * amp * 1.2 + Math.cos(u * Math.PI) * 0;
    const sw = Math.sin(t * 1.6 + i) * 0.09;
    g.save(); g.translate(x, y + 6); g.rotate(sw);
    cel(g, (q) => { q.moveTo(-13, 0); q.lineTo(13, 0); q.lineTo(0, 26); q.closePath(); }, i % 3 === 0 ? PINK : (i % 3 === 1 ? ORANGE : '#f2c14b'), '#00000022', null, LW * 0.7);
    g.restore();
  }
}

/* ------------------------------------------------------------------- lights */
export function lights(g, t, st) {
  g.save();
  g.globalCompositeOperation = 'lighter';
  const flick = 0.92 + 0.08 * Math.sin(t * 13.3) * Math.sin(t * 4.1 + 1.2);
  for (const [x, y] of BULBS) {
    const r = 190;
    const rg = g.createRadialGradient(x, y + 30, 4, x, y + 30, r);
    rg.addColorStop(0, `rgba(255,206,120,${0.42 * flick})`);
    rg.addColorStop(0.45, `rgba(255,170,90,${0.13 * flick})`);
    rg.addColorStop(1, 'rgba(255,150,80,0)');
    g.fillStyle = rg; g.fillRect(x - r, y - r + 30, r * 2, r * 2);
  }
  // the stove's warm pool and the patili's glow
  if (st.stoveOn) {
    const P = S.pans.home, rg = g.createRadialGradient(P.x, P.y - 10, 6, P.x, P.y - 10, 150);
    rg.addColorStop(0, 'rgba(255,150,60,0.35)'); rg.addColorStop(1, 'rgba(255,120,40,0)');
    g.fillStyle = rg; g.fillRect(P.x - 160, P.y - 170, 320, 320);
  }
  // cool moonlight from the window side, so the night reads
  const mg = g.createLinearGradient(0, 240, 420, 900);
  mg.addColorStop(0, 'rgba(120,160,255,0.12)'); mg.addColorStop(1, 'rgba(120,160,255,0)');
  g.fillStyle = mg; g.fillRect(-100, 200, 560, 760);
  g.restore();
  // warm lamp haze at the very top
  const hz = g.createLinearGradient(0, 0, 0, 420);
  hz.addColorStop(0, 'rgba(255,190,120,0.10)'); hz.addColorStop(1, 'rgba(255,190,120,0)');
  g.fillStyle = hz; g.fillRect(0, 0, S.w, 420);
}

/* --------------------------------------------------------------- held props */
// a cutting glass in the hand (the v2 props are the fallback for everything else)
export function drawHeld(g, hold, hand, handAng, side, t) {
  if (hold.type !== 'glass') return drawHeldV2(g, hold, hand, handAng, side, t);
  const tilt = (hold.tilt ?? 0) + 0.04 * Math.sin(t * 2.2);
  // the fist grips the glass around its middle: the glass sticks out above and below the hand
  g.save(); g.translate(hand.x, hand.y + 6); g.rotate(tilt); g.scale(1.45, 1.45);
  cuttingGlass(g, 0, 16, 1, t);
  g.restore();
}

export const scene = { sky, hallway, wall, counter, foreground, lights };

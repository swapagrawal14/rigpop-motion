// rigpop-motion v2 · "night-kitchen": a flat-vector set drawn in code.
// World space is 900 x 1700 units. Three parallax planes: sky/hallway (far), the set,
// and a foreground plane that slides faster than the camera.
import { INK, LW, cel, ellipse, stroke, fill } from './ink.mjs';
import { clamp, lerp, noise, hash, TAU } from './util.mjs';
import { stove, flame, pan, packet } from './props.mjs';

export const SET = {
  w: 900, h: 1700,
  ceil: 170, floor: 905, counterTop: 990, counterFront: 1030, cabinet: 1046,
  window: { x: 70, y: 300, w: 200, h: 260 },
  arch: { cx: 470, hw: 108, top: 560, bottom: 905 },
  fridge: { x: 650, y: 360, w: 210, h: 545, split: 505 },
  stove: { x: 40, y: 962, w: 280 },
  clock: { x: 470, y: 330, r: 40 },
  pans: { home: { x: 180, y: 936 }, right: { x: 650, y: 972 } },
  center: { x: 450, y: 800 },
};

export const MARKS = {
  hall: { x: 470, z: 1.25 },
  'arch-peek': { x: 618, z: 1.12 },
  arch: { x: 470, z: 1.06 },
  back: { x: 470, z: 0.95 },
  'back-left': { x: 250, z: 0.95 },
  fridge: { x: 590, z: 0.78 },
  counter: { x: 345, z: 0 },
  'counter-mid': { x: 470, z: 0.04 },
  'counter-right': { x: 650, z: 0.42 },
  'off-left': { x: -220, z: 0.95 },
  'off-right': { x: 1120, z: 0.95 },
};

// depth z: 0 at the counter, 1 at the back wall, >1 inside the hallway beyond the arch
export const depthScale = (z) => (z <= 1 ? lerp(1, 0.62, z) : 0.62 - (z - 1) * 0.35);
export const groundY = (z) => (z <= 1 ? lerp(1270, SET.floor, z) : SET.floor - (z - 1) * 150);

export function archPath(q, inset = 0) {
  const A = SET.arch;
  q.moveTo(A.cx - A.hw + inset, A.bottom);
  q.lineTo(A.cx - A.hw + inset, A.top);
  q.arc(A.cx, A.top, A.hw - inset, Math.PI, 0);
  q.lineTo(A.cx + A.hw - inset, A.bottom);
  q.closePath();
}

/* ------------------------------------------------------------- far plane */
export function drawSky(g, t) {
  const W = SET.window;
  g.save(); g.beginPath(); g.rect(W.x, W.y, W.w, W.h); g.clip();
  const gr = g.createLinearGradient(0, W.y, 0, W.y + W.h);
  gr.addColorStop(0, '#16163a'); gr.addColorStop(1, '#2b2c63');
  g.fillStyle = gr; g.fillRect(W.x - 100, W.y - 100, W.w + 200, W.h + 200);
  for (let i = 0; i < 18; i++) {
    const x = W.x - 40 + hash(i * 3.3) * (W.w + 80), y = W.y + hash(i * 7.1) * W.h * 0.8;
    const tw = 0.5 + 0.5 * Math.sin(t * (1.5 + hash(i) * 2) + i);
    g.globalAlpha = 0.4 + tw * 0.6; g.beginPath(); ellipse(g, x, y, 1.6 + tw, 1.6 + tw); fill(g, '#fff8d6');
  }
  g.globalAlpha = 1;
  // moon: glow + crescent
  const mx = W.x + W.w * 0.62, my = W.y + 78;
  const rg = g.createRadialGradient(mx, my, 10, mx, my, 90);
  rg.addColorStop(0, 'rgba(255,246,200,0.45)'); rg.addColorStop(1, 'rgba(255,246,200,0)');
  g.fillStyle = rg; g.fillRect(mx - 100, my - 100, 200, 200);
  g.beginPath(); g.arc(mx, my, 34, 0, TAU); g.arc(mx + 15, my - 9, 30, 0, TAU, true); fill(g, '#fff3c2');
  // rooftops silhouette
  g.beginPath(); g.moveTo(W.x - 60, W.y + W.h);
  for (let i = 0; i <= 8; i++) { const x = W.x - 60 + i * 50; const hh = 40 + hash(i * 9.9) * 60; g.lineTo(x, W.y + W.h - hh); g.lineTo(x + 50, W.y + W.h - hh); }
  g.lineTo(W.x + W.w + 80, W.y + W.h); fill(g, '#121233');
  for (let i = 0; i < 5; i++) { if (hash(i * 4.4) < 0.5) continue; g.beginPath(); g.rect(W.x - 30 + i * 50, W.y + W.h - 30, 10, 12); fill(g, '#ffd36b'); }
  g.restore();
}

export function drawHallway(g, t) {
  const A = SET.arch;
  g.save(); g.beginPath(); archPath(g); g.clip();
  const gr = g.createLinearGradient(0, A.top - A.hw, 0, A.bottom);
  gr.addColorStop(0, '#1a1424'); gr.addColorStop(1, '#2a2136');
  g.fillStyle = gr; g.fillRect(A.cx - 200, A.top - 200, 400, 600);
  // far wall + a bedroom door with light under it
  g.beginPath(); g.rect(A.cx - 160, A.bottom - 190, 320, 150); fill(g, '#2d2540');
  cel(g, (q) => q.rect(A.cx - 34, A.bottom - 168, 68, 128), '#3b2f4f', '#30263f', (q) => q.rect(A.cx + 10, A.bottom - 170, 30, 140), LW * 0.7);
  g.globalAlpha = 0.7 + 0.2 * Math.sin(t * 3); g.beginPath(); g.rect(A.cx - 30, A.bottom - 44, 60, 4); fill(g, '#ffd27a'); g.globalAlpha = 1;
  g.beginPath(); g.moveTo(A.cx - 200, A.bottom); g.lineTo(A.cx - 160, A.bottom - 40); g.lineTo(A.cx + 160, A.bottom - 40); g.lineTo(A.cx + 200, A.bottom); fill(g, '#3a3046');
  g.restore();
}

/* ------------------------------------------------------------- set plane */
export function drawWall(g, t, st) {
  const S = SET;
  // ceiling
  g.beginPath(); g.rect(-400, -400, S.w + 800, S.ceil + 400); fill(g, '#2a2433');
  g.beginPath(); g.rect(-400, S.ceil - 26, S.w + 800, 26); fill(g, '#3a3245');
  g.beginPath(); g.moveTo(-400, S.ceil); g.lineTo(S.w + 400, S.ceil); stroke(g, LW);
  // tiled wall
  g.beginPath(); g.rect(-400, S.ceil, S.w + 800, S.floor - S.ceil); fill(g, '#e2d4b3');
  for (let i = 0; i < 60; i++) {
    const cx = Math.floor(hash(i * 2.2) * 22) - 4, cy = Math.floor(hash(i * 5.1) * 13);
    g.beginPath(); g.rect(cx * 56, S.ceil + cy * 56, 56, 56); fill(g, i % 2 ? '#ead9b9' : '#d9caa8');
  }
  g.beginPath();
  for (let x = -392; x < S.w + 400; x += 56) { g.moveTo(x, S.ceil); g.lineTo(x, S.floor); }
  for (let y = S.ceil + 56; y < S.floor; y += 56) { g.moveTo(-400, y); g.lineTo(S.w + 400, y); }
  stroke(g, 3, '#bfae8b');
  // soft shadow under the ceiling
  const sg = g.createLinearGradient(0, S.ceil, 0, S.ceil + 90);
  sg.addColorStop(0, 'rgba(60,40,60,0.35)'); sg.addColorStop(1, 'rgba(60,40,60,0)');
  g.fillStyle = sg; g.fillRect(-400, S.ceil, S.w + 800, 90);
  // back floor strip
  g.beginPath(); g.rect(-400, S.floor, S.w + 800, S.counterTop - S.floor + 60); fill(g, '#6c5b72');
  g.beginPath(); for (let i = -10; i < 30; i++) { g.moveTo(i * 60, S.floor); g.lineTo(i * 60 + (i * 60 - 450) * 0.35, S.counterTop + 60); } stroke(g, 2.5, '#5a4a60');
  g.beginPath(); g.moveTo(-400, S.floor + 38); g.lineTo(S.w + 400, S.floor + 38); stroke(g, 2.5, '#5a4a60');
  g.beginPath(); g.rect(-400, S.floor - 14, S.w + 800, 14); fill(g, '#cbb995');
  g.beginPath(); g.moveTo(-400, S.floor); g.lineTo(S.w + 400, S.floor); stroke(g, LW * 0.8);

  // window frame + curtain
  const Wn = S.window;
  g.beginPath(); g.rect(Wn.x, Wn.y, Wn.w, Wn.h); stroke(g, LW * 3.4, INK); stroke(g, LW * 2.2, '#f2ead6');
  g.beginPath(); g.moveTo(Wn.x + Wn.w / 2, Wn.y); g.lineTo(Wn.x + Wn.w / 2, Wn.y + Wn.h); g.moveTo(Wn.x, Wn.y + Wn.h * 0.5); g.lineTo(Wn.x + Wn.w, Wn.y + Wn.h * 0.5); stroke(g, LW * 2.2, INK); stroke(g, LW * 1.0, '#f2ead6');
  cel(g, (q) => q.roundRect(Wn.x - 12, Wn.y + Wn.h, Wn.w + 24, 18, 4), '#f2ead6', '#cfc4aa', (q) => q.rect(Wn.x, Wn.y + Wn.h + 9, Wn.w + 40, 20));
  const sw = noise(t * 0.6) * 6;
  cel(g, (q) => { q.moveTo(Wn.x - 22, Wn.y - 20); q.lineTo(Wn.x + 62, Wn.y - 20); q.quadraticCurveTo(Wn.x + 40 + sw, Wn.y + 120, Wn.x + 26 + sw * 1.5, Wn.y + Wn.h + 40); q.lineTo(Wn.x - 22, Wn.y + Wn.h + 40); q.closePath(); },
    '#3f7f8c', '#2e5f69', (q) => { for (let i = 0; i < 3; i++) q.rect(Wn.x - 10 + i * 22 + sw * 0.3 * i, Wn.y - 20, 8, Wn.h + 60); });
  g.beginPath(); g.moveTo(Wn.x - 40, Wn.y - 22); g.lineTo(Wn.x + Wn.w + 40, Wn.y - 22); stroke(g, LW * 1.6, INK);

  // shelf with jars above the stove
  cel(g, (q) => q.rect(40, 690, 290, 16), '#a26a3d', '#7d4e2b', (q) => q.rect(40, 700, 290, 10));
  const jars = [[70, '#d8402c'], [120, '#e7b52c'], [168, '#5a9a3f'], [230, '#c0703a'], [282, '#7b4fa0']];
  for (const [x, c] of jars) {
    cel(g, (q) => q.roundRect(x - 18, 640, 36, 50, 7), '#cfe4e8', '#a8c2c8', (q) => q.rect(x + 4, 630, 30, 70), LW * 0.8);
    g.beginPath(); g.rect(x - 14, 660, 28, 28); fill(g, c);
    cel(g, (q) => q.roundRect(x - 20, 632, 40, 12, 4), '#d8434e', '#a8323b', (q) => q.rect(x, 632, 30, 20), LW * 0.8);
  }
  // clock (it ticks)
  const C = S.clock;
  cel(g, (q) => ellipse(q, C.x, C.y, C.r, C.r), '#fbf4e2', '#e2d6bb', (q) => ellipse(q, C.x + 8, C.y + 8, C.r, C.r), LW * 1.2);
  for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; g.beginPath(); g.moveTo(C.x + Math.cos(a) * C.r * 0.78, C.y + Math.sin(a) * C.r * 0.78); g.lineTo(C.x + Math.cos(a) * C.r * 0.9, C.y + Math.sin(a) * C.r * 0.9); stroke(g, 2.5); }
  const hand = (a, l, w, c = INK) => { g.beginPath(); g.moveTo(C.x, C.y); g.lineTo(C.x + Math.sin(a) * l, C.y - Math.cos(a) * l); stroke(g, w, c); };
  hand((2 / 12) * TAU + 0.05, C.r * 0.5, 5); hand(TAU * (2 / 60), C.r * 0.75, 4); hand((Math.floor(t) / 60) * TAU + 0.8, C.r * 0.8, 2, '#d8262c');

  // arch doorway (opening is drawn by drawHallway underneath)
  g.beginPath(); archPath(g, -16); archPath(g); fill(g, '#cdbb98');
  g.save(); g.beginPath(); archPath(g, -16); archPath(g); g.clip('evenodd');
  g.beginPath(); g.rect(SET.arch.cx + 30, 300, 200, 700); fill(g, '#b5a27f'); g.restore();
  g.beginPath(); archPath(g, -16); stroke(g, LW); g.beginPath(); archPath(g); stroke(g, LW);

  drawFridge(g, t, st);
}

function drawFridge(g, t, st) {
  const F = SET.fridge;
  const open = clamp(st.fridgeOpen || 0, 0, 1);
  // body
  cel(g, (q) => q.roundRect(F.x, F.y, F.w, F.h, 18), '#86c3b3', '#5f9e8f', (q) => q.rect(F.x + F.w * 0.78, F.y - 10, 60, F.h + 20));
  // freezer door + handle
  g.beginPath(); g.moveTo(F.x, F.split); g.lineTo(F.x + F.w, F.split); stroke(g, LW);
  cel(g, (q) => q.roundRect(F.x + 18, F.y + 70, 14, 60, 7), '#d7ece6', '#a9cbc1', (q) => q.rect(F.x + 26, F.y + 60, 20, 80), LW * 0.8);
  // interior (lit when open)
  const ix = F.x + 10, iy = F.split + 10, iw = F.w - 20, ih = F.h - (F.split - F.y) - 20;
  if (open > 0.01) {
    g.beginPath(); g.rect(ix, iy, iw, ih); fill(g, '#f4fbff');
    for (const y of [0.32, 0.62]) { g.beginPath(); g.moveTo(ix, iy + ih * y); g.lineTo(ix + iw, iy + ih * y); stroke(g, 4, '#9fb9c4'); }
    cel(g, (q) => q.roundRect(ix + 20, iy + ih * 0.32 - 70, 34, 70, 8), '#ffffff', '#d5e2ea', (q) => q.rect(ix + 40, iy, 30, 200), LW * 0.7);
    cel(g, (q) => ellipse(q, ix + 90, iy + ih * 0.32 - 16, 16, 15), '#e04636', '#b2301f', (q) => ellipse(q, ix + 96, iy + ih * 0.32 - 10, 12, 10), LW * 0.7);
    for (let i = 0; i < 3; i++) cel(g, (q) => ellipse(q, ix + 40 + i * 26, iy + ih * 0.62 - 14, 11, 14), '#fbf3e6', '#e0d4bf', null, LW * 0.6);
    if (!st.stashTaken) packet(g, ix + iw * 0.6, iy + ih * 0.82, 0.2, { s: 0.7 });
    g.beginPath(); g.rect(ix, iy, iw, ih); stroke(g, LW * 0.8);
  }
  // fridge door (hinged on the right edge, swings toward camera)
  const dw = F.w * Math.cos(open * Math.PI * 0.62);
  const skew = Math.sin(open * Math.PI * 0.62) * 34;
  const hx = F.x + F.w;
  const door = (q) => { q.moveTo(hx, F.split + 2); q.lineTo(hx - dw, F.split + 2 - skew * 0.4); q.lineTo(hx - dw, F.y + F.h + skew * 0.4); q.lineTo(hx, F.y + F.h); q.closePath(); };
  if (Math.abs(dw) > 2) {
    cel(g, door, dw > 0 ? '#86c3b3' : '#cfe9e2', '#5f9e8f', (q) => q.rect(hx - 40, F.split, 40, F.h), LW);
    if (dw > 30) {
      cel(g, (q) => q.roundRect(hx - dw + 18, F.split + 40, 14, 120, 7), '#d7ece6', '#a9cbc1', (q) => q.rect(hx - dw + 26, F.split + 30, 20, 150), LW * 0.8);
      // the sticky note: house rules
      g.save(); g.translate(hx - dw * 0.55, F.split + 150); g.rotate(-0.08); g.scale(Math.max(0.05, dw / F.w), 1);
      cel(g, (q) => q.rect(-58, -40, 116, 80), '#fff0a8', '#e8d77e', (q) => q.rect(-58, 26, 116, 20), LW * 0.7);
      g.font = '17px Lucky'; g.textAlign = 'center'; g.fillStyle = '#c0262c';
      g.fillText('NO MAGGI', 0, -10); g.fillText('AFTER 12!', 0, 10); g.font = '12px Lucky'; g.fillStyle = INK; g.fillText('- MUMMY', 14, 30);
      g.restore();
      // magnets on the freezer
    }
  }
  g.beginPath(); g.roundRect(F.x, F.y, F.w, F.h, 18); stroke(g, LW);
  cel(g, (q) => q.rect(F.x + 120, F.y + 34, 52, 36), '#e9a0c4', '#c97ea3', (q) => q.rect(F.x + 150, F.y + 30, 30, 50), LW * 0.7);
  cel(g, (q) => ellipse(q, F.x + 70, F.y + 46, 14, 14), '#f2c14b', null, null, LW * 0.7);
}

// counter, stove, flame, pan, jars
export function drawCounter(g, t, st) {
  const S = SET;
  // top surface + front edge
  cel(g, (q) => q.rect(-400, S.counterTop, S.w + 800, S.counterFront - S.counterTop), '#9a97ad', '#86839a', (q) => q.rect(-400, S.counterTop + 26, S.w + 800, 20));
  g.beginPath(); g.rect(-400, S.counterFront, S.w + 800, S.cabinet - S.counterFront); fill(g, '#6e6b82');
  g.beginPath(); g.moveTo(-400, S.counterTop); g.lineTo(S.w + 400, S.counterTop); g.moveTo(-400, S.counterFront); g.lineTo(S.w + 400, S.counterFront); g.moveTo(-400, S.cabinet); g.lineTo(S.w + 400, S.cabinet); stroke(g, LW);
  // cabinets
  g.beginPath(); g.rect(-400, S.cabinet, S.w + 800, 900); fill(g, '#7a5a8a');
  for (let i = -2; i < 7; i++) {
    const x = i * 180 + 10;
    cel(g, (q) => q.roundRect(x, S.cabinet + 26, 160, 520, 12), '#8b6a9b', '#745683', (q) => q.rect(x + 110, S.cabinet, 60, 600), LW);
    cel(g, (q) => q.roundRect(x + (i % 2 ? 18 : 128), S.cabinet + 90, 14, 70, 7), '#e7d9b8', '#c2b28c', (q) => q.rect(x + 140, S.cabinet + 80, 40, 100), LW * 0.8);
  }
  const sg = g.createLinearGradient(0, S.cabinet, 0, S.cabinet + 70);
  sg.addColorStop(0, 'rgba(20,10,30,0.45)'); sg.addColorStop(1, 'rgba(20,10,30,0)');
  g.fillStyle = sg; g.fillRect(-400, S.cabinet, S.w + 800, 70);

  // chopping board + masala dabba + jar on the right
  cel(g, (q) => { q.moveTo(470, 1000); q.lineTo(610, 1000); q.lineTo(624, 1022); q.lineTo(456, 1022); q.closePath(); }, '#d9a868', '#b98648', (q) => q.rect(540, 990, 100, 40));
  cel(g, (q) => q.roundRect(770, 940, 70, 70, 10), '#e2c4c4', '#c09e9e', (q) => q.rect(810, 930, 40, 90));
  g.beginPath(); g.rect(774, 960, 62, 40); fill(g, '#c53b3b'); stroke(g, LW * 0.7);
  cel(g, (q) => q.roundRect(764, 930, 82, 16, 5), '#3b3446', null, null);

  // stove + flame + pan
  stove(g, S.stove.x, S.stove.y, S.stove.w);
  const P = st.pan;
  const onStove = Math.abs(P.x - S.pans.home.x) < 5;
  if (onStove) {
    flame(g, P.x, S.stove.y - 4, t, st.stoveOn || 0, 0.95);
    // pan supports
    g.beginPath(); for (const dx of [-70, -24, 24, 70]) { g.moveTo(P.x + dx, S.stove.y - 2); g.lineTo(P.x + dx * 0.9, S.stove.y - 14); } stroke(g, 7, INK); stroke(g, 3, '#4a4a58');
  }
  pan(g, P.x, P.y, t, { content: P.content, stir: P.stir || 0, jiggle: P.jiggle || 0 });
}

// fast foreground plane (parallax 1.35): hanging ladles + a big jar
export function drawForeground(g, t) {
  g.save();
  const sw = noise(t * 0.8, 3) * 0.04;
  for (let i = 0; i < 3; i++) {
    const x = 790 + i * 34, y0 = 150;
    g.save(); g.translate(x, y0); g.rotate(sw + i * 0.03);
    g.beginPath(); g.moveTo(0, 0); g.lineTo(0, 140 + i * 16); stroke(g, 14, INK); stroke(g, 7, '#9ba0b4');
    cel(g, (q) => ellipse(q, 0, 160 + i * 16, 22, 15), '#aeb3c6', '#80859a', (q) => ellipse(q, 6, 166 + i * 16, 18, 10));
    g.restore();
  }
  g.beginPath(); g.moveTo(760, 150); g.lineTo(900, 150); stroke(g, 12, INK); stroke(g, 6, '#6b6f80');
  g.restore();
}

// Night grade + light sources, drawn in world space after everything else.
export function drawLights(g, t, st) {
  const S = SET;
  g.save();
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = '#aeacd6'; g.fillRect(-500, -500, S.w + 1000, S.h + 1000);
  g.globalCompositeOperation = 'lighter';
  // moon shaft through the window
  const Wn = S.window;
  g.globalAlpha = 0.07;
  g.beginPath(); g.moveTo(Wn.x, Wn.y); g.lineTo(Wn.x + Wn.w, Wn.y); g.lineTo(Wn.x + Wn.w + 380, S.counterTop + 40); g.lineTo(Wn.x + 120, S.counterTop + 40); g.closePath(); fill(g, '#9fb4ff');
  g.globalAlpha = 1;
  // warm stove glow
  const on = st.stoveOn || 0;
  if (on > 0.01) {
    const P = st.pan;
    const k = on * (0.85 + 0.15 * noise(t * 8));
    const rg = g.createRadialGradient(P.x, S.stove.y - 10, 10, P.x, S.stove.y - 10, 330);
    rg.addColorStop(0, `rgba(255,150,60,${0.38 * k})`); rg.addColorStop(1, 'rgba(255,120,40,0)');
    g.fillStyle = rg; g.fillRect(P.x - 340, S.stove.y - 340, 680, 680);
  }
  const fo = clamp(st.fridgeOpen || 0, 0, 1);
  if (fo > 0.01) {
    const F = S.fridge;
    const cx = F.x + F.w / 2, cy = F.split + 160;
    const rg = g.createRadialGradient(cx, cy, 20, cx, cy, 480);
    rg.addColorStop(0, `rgba(150,200,255,${0.32 * fo})`); rg.addColorStop(0.5, `rgba(120,170,240,${0.12 * fo})`); rg.addColorStop(1, 'rgba(150,200,255,0)');
    g.fillStyle = rg; g.fillRect(cx - 500, cy - 500, 1000, 1000);
  }
  g.restore();
}

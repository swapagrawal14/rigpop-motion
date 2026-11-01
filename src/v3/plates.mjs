// rigpop-motion v3 · painted set: AI background plates split into parallax layers, plus
// image props, drawn through the v2 engine's scene hooks.
//
//   assets/v3/night-kitchen/src/*.png   raw image-model output (layout-guided repaint etc.)
//   rigpop-motion set                   -> assets/v3/night-kitchen/*.png + set.json
//
// Layers, far to near (parallax factor vs the camera):
//   sky (0.55, seen through the window glass) · hallway (0.82, through the arch)
//   back wall (1.0) · [cast] · counter + stove (1.0, masked from the same painting)
//   foreground hanging utensils (1.35)
import fs from 'node:fs';
import path from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { readRGBA, writePNG, chromaKey, components, groupComponents, readingOrder, extract, cleanAndInk, alphaBox, crop, boxOf } from './imgops.mjs';
import { PLATE_BOX } from './set-guide.mjs';
import { SET, archPath, drawLights as v2Lights } from '../v2/scene.mjs';
import { flame, steam, PAN, drawHeld as v2Held, packet as v2Packet } from '../v2/props.mjs';
import { INK, LW, stroke, fill, ellipse } from '../v2/ink.mjs';
import { clamp, lerp, noise, hash, TAU } from '../v2/util.mjs';
import { P as RP } from '../paths.mjs';

const DIR = RP('assets/v3/night-kitchen');
const PROPS = RP('assets/v3/props');

/* ------------------------------------------------------------------ build */
const toPx = (im) => ({ x: (wx) => ((wx - PLATE_BOX.x) / PLATE_BOX.w) * im.w, y: (wy) => ((wy - PLATE_BOX.y) / PLATE_BOX.h) * im.h });

export async function buildSet({ log = console.error } = {}) {
  const back = await readRGBA(path.join(DIR, 'src/back-plate.png'));
  const M = toPx(back);
  // back wall: punch the arch opening (hallway plate shows through) and thin the window glass
  // (sky plate shows through, a little frosted reflection kept)
  const wall = { ...back, px: new Uint8ClampedArray(back.px) };
  const c = createCanvas(back.w, back.h), g = c.getContext('2d');
  g.scale(back.w / PLATE_BOX.w, back.h / PLATE_BOX.h); g.translate(-PLATE_BOX.x, -PLATE_BOX.y);
  g.beginPath(); archPath(g, 2); g.fillStyle = '#fff'; g.fill();
  const archMask = g.getImageData(0, 0, back.w, back.h).data;
  const Wn = { x0: M.x(112), x1: M.x(274), y0: M.y(296), y1: M.y(572) };
  let glassN = 0;
  for (let y = 0; y < back.h; y++) for (let x = 0; x < back.w; x++) {
    const i = (y * back.w + x) * 4;
    if (archMask[i + 3] > 128) { wall.px[i + 3] = 255 - archMask[i + 3]; continue; }
    if (x > Wn.x0 && x < Wn.x1 && y > Wn.y0 && y < Wn.y1) {
      const r = back.px[i], gg = back.px[i + 1], b = back.px[i + 2];
      const sum = r + gg + b, sat = Math.max(r, gg, b) - Math.min(r, gg, b);
      // frosted glass: mid-bright, low-saturation blue-grey (frame is brighter, curtain is saturated)
      if (sum > 260 && sum < 600 && sat < 70 && b >= r) { wall.px[i + 3] = 70; glassN++; }
    }
  }
  writePNG(path.join(DIR, 'wall.png'), wall);
  // counter + stove + jar: the near band of the same painting, drawn over the cast
  const ctr = { ...back, px: new Uint8ClampedArray(back.px) };
  for (let y = 0; y < back.h; y++) for (let x = 0; x < back.w; x++) {
    const wx = PLATE_BOX.x + (x / back.w) * PLATE_BOX.w, wy = PLATE_BOX.y + (y / back.h) * PLATE_BOX.h;
    let edge = SET.counterTop - 6;
    if (wx > 28 && wx < 334) edge = 944;
    if (wx > 756 && wx < 858) edge = 922;
    const a = clamp((wy - edge) / 3, 0, 1);
    ctr.px[(y * back.w + x) * 4 + 3] = Math.round(a * 255);
  }
  writePNG(path.join(DIR, 'counter.png'), ctr);
  // fridge open: only the fridge region of the open repaint, feathered, cross-faded by state
  const open = await readRGBA(path.join(DIR, 'src/back-plate-open.png'));
  const fo = { ...open, px: new Uint8ClampedArray(open.px) };
  const MO = toPx(open);
  const fx0 = MO.x(628), fx1 = MO.x(985), fy0 = MO.y(340), fy1 = MO.y(925), fe = 14;
  for (let y = 0; y < open.h; y++) for (let x = 0; x < open.w; x++) {
    const a = clamp(Math.min(x - fx0, fx1 - x, y - fy0, fy1 - y) / fe, 0, 1);
    fo.px[(y * open.w + x) * 4 + 3] = Math.round(a * 255);
  }
  writePNG(path.join(DIR, 'fridge-open.png'), fo);
  // ...and the same with the stash gone (painted packet covered by the shelf's own light)
  {
    const c2 = createCanvas(open.w, open.h), q = c2.getContext('2d');
    const d = q.createImageData(open.w, open.h); d.data.set(fo.px); q.putImageData(d, 0, 0);
    q.scale(open.w / PLATE_BOX.w, open.h / PLATE_BOX.h); q.translate(-PLATE_BOX.x, -PLATE_BOX.y);
    const cg = q.createLinearGradient(0, 774, 0, 878); cg.addColorStop(0, '#e2eefa'); cg.addColorStop(1, '#cbdff2');
    q.beginPath(); q.roundRect(733, 774, 94, 104, 8); q.fillStyle = cg; q.fill();
    fs.writeFileSync(path.join(DIR, 'fridge-empty.png'), c2.toBuffer('image/png'));
  }
  // foreground utensils on chroma
  const fg = chromaKey(await readRGBA(path.join(DIR, 'src/fg-ladles.png')));
  const fb = alphaBox(fg);
  writePNG(path.join(DIR, 'fg.png'), cleanAndInk(crop(fg, fb.x0 - 4, fb.y0 - 4, fb.w + 8, fb.h + 8), { erode: 1, ink: 0.4 }));
  // sky: the part of the wide plate with the moon; hallway as is
  const sky = await readRGBA(path.join(DIR, 'src/sky-plate.png'));
  writePNG(path.join(DIR, 'sky.png'), crop(sky, Math.round(sky.w * 0.55), 0, Math.round(sky.w * 0.3), sky.h));
  fs.copyFileSync(path.join(DIR, 'src/hallway-plate.png'), path.join(DIR, 'hallway.png'));
  const set = { box: PLATE_BOX, plates: ['sky.png', 'hallway.png', 'wall.png', 'fridge-open.png', 'fridge-empty.png', 'counter.png', 'fg.png'], glassPixels: glassN };
  fs.writeFileSync(path.join(DIR, 'set.json'), JSON.stringify(set, null, 1));
  log(`  set: wall (arch cut, ${glassN} glass px thinned), counter band, fridge-open region, fg, sky, hallway`);
  await buildProps({ log });
}

export async function buildProps({ log = console.error } = {}) {
  const im = chromaKey(await readRGBA(path.join(PROPS, 'sheet.png')));
  const { comps, lab } = components(im);
  const items = groupComponents(comps.filter((c) => c.area > 1500), 10);
  const rows = readingOrder(items);
  const names = ['pan', 'packet', 'spatula', 'bowl'];
  const flat = rows.flat();
  if (flat.length !== names.length) throw new Error(`props sheet: found ${flat.length} items, expected ${names.length}`);
  const meta = {};
  flat.forEach((it, i) => {
    const part = cleanAndInk(extract(im, lab, it, 8), { erode: 1, ink: 0.5 });
    const b = alphaBox(part);
    const out = crop(part, b.x0 - 4, b.y0 - 4, b.w + 8, b.h + 8);
    writePNG(path.join(PROPS, names[i] + '.png'), out);
    meta[names[i]] = { file: names[i] + '.png', w: out.w, h: out.h };
  });
  // pan anchors: the round body is everything left of where the handle narrows
  const pan = await readRGBA(path.join(PROPS, 'pan.png'));
  let best = 0, bodyR = 0; const colH = [];
  for (let x = 0; x < pan.w; x++) { let n = 0; for (let y = 0; y < pan.h; y++) if (pan.px[(y * pan.w + x) * 4 + 3] > 128) n++; colH.push(n); if (n > best) best = n; }
  for (let x = 0; x < pan.w; x++) if (colH[x] > best * 0.42) bodyR = x;
  let x0 = 0; while (colH[x0] < 4) x0++;
  let top = pan.h; for (let y = 0; y < pan.h; y++) for (let x = x0; x <= bodyR; x++) if (pan.px[(y * pan.w + x) * 4 + 3] > 128) { top = Math.min(top, y); break; }
  const rx = (bodyR - x0) / 2;
  meta.pan.rim = { cx: x0 + rx, cy: top + rx * 0.3, rx, ry: rx * 0.3 }; // 3/4 view rim ellipse
  meta.pan.handle = { x: pan.w - 10, y: (meta.pan.rim.cy) };
  fs.writeFileSync(path.join(PROPS, 'props.json'), JSON.stringify(meta, null, 1));
  log(`  props: ${names.join(', ')} (pan rim rx ${rx.toFixed(0)} px)`);
}

/* ------------------------------------------------------------------- draw */
export async function loadSet() {
  const L = async (f) => loadImage(fs.readFileSync(f));
  const S = {};
  for (const k of ['sky', 'hallway', 'wall', 'fridge-open', 'fridge-empty', 'counter', 'fg']) S[k] = await L(path.join(DIR, k + '.png'));
  const props = JSON.parse(fs.readFileSync(path.join(PROPS, 'props.json'), 'utf8'));
  for (const k of Object.keys(props)) props[k].img = await L(path.join(PROPS, props[k].file));
  S.props = props;
  return makeSceneHooks(S);
}

function makeSceneHooks(S) {
  const B = PLATE_BOX;
  const plate = (g, img, extend = false) => {
    g.drawImage(img, B.x, B.y, B.w, B.h);
    if (!extend) return;
    // wide or shaking cameras can see past the painting: mirror its edges outward
    const E = 320, sw = (E / B.w) * img.width;
    g.save(); g.translate(B.x, 0); g.scale(-1, 1); g.drawImage(img, 0, 0, sw, img.height, 0, B.y, E, B.h); g.restore();
    g.save(); g.translate(B.x + B.w, 0); g.scale(-1, 1); g.drawImage(img, img.width - sw, 0, sw, img.height, -E, B.y, E, B.h); g.restore();
    g.drawImage(img, 0, img.height - 2, img.width, 2, B.x, B.y + B.h - 1, B.w, 400);
  };
  const pr = S.props;

  function sky(g, t) {
    const Wn = SET.window;
    g.drawImage(S.sky, Wn.x - 80, Wn.y - 60, 360, 360 * S.sky.height / S.sky.width);
    // a few twinkles on top of the painting
    for (let i = 0; i < 10; i++) {
      const x = Wn.x + hash(i * 3.3) * Wn.w, y = Wn.y + hash(i * 7.1) * Wn.h * 0.5;
      const tw = 0.5 + 0.5 * Math.sin(t * (1.5 + hash(i) * 2) + i);
      g.globalAlpha = 0.25 + tw * 0.55; g.beginPath(); ellipse(g, x, y, 1.3 + tw, 1.3 + tw); fill(g, '#fff8d6');
    }
    g.globalAlpha = 1;
  }
  function hallway(g, t) {
    const A = SET.arch, w = 320, h = (w * S.hallway.height) / S.hallway.width;
    g.drawImage(S.hallway, A.cx - w / 2, A.bottom - 30 - h * 0.86, w, h);
    // the strip of light under the bedroom door breathes a little
    g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.12 + 0.08 * Math.sin(t * 2.4);
    const rg = g.createRadialGradient(A.cx, A.bottom - 60, 4, A.cx, A.bottom - 60, 90);
    rg.addColorStop(0, '#ffcf7a'); rg.addColorStop(1, 'rgba(255,200,120,0)'); g.fillStyle = rg; g.fillRect(A.cx - 100, A.bottom - 150, 200, 180);
    g.restore();
  }
  function wall(g, t, st) {
    g.fillStyle = '#1b1526'; g.fillRect(B.x - 400, B.y - 400, B.w + 800, 420);
    plate(g, S.wall, true);
    const fo = clamp(st.fridgeOpen || 0, 0, 1);
    if (fo > 0.01) {
      g.save(); g.globalAlpha = clamp(fo * 1.6, 0, 1); plate(g, S[st.stashTaken ? 'fridge-empty' : 'fridge-open']); g.restore();
    } else {
      // house rules on the painted (blank) sticky note
      g.save(); g.translate(745, 655); g.rotate(-0.07);
      g.font = '19px Lucky'; g.textAlign = 'center'; g.fillStyle = '#c0262c';
      g.fillText('NO MAGGI', 0, -12); g.fillText('AFTER 12!', 0, 10); g.font = '13px Lucky'; g.fillStyle = INK; g.fillText('- MUMMY', 18, 32);
      g.restore();
    }
  }
  function counter(g, t, st) {
    plate(g, S.counter, true);
    const P = st.pan;
    const onStove = Math.abs(P.x - SET.pans.home.x) < 5;
    if (onStove) flame(g, P.x, SET.stove.y - 6, t, st.stoveOn || 0, 0.95);
    drawPan(g, P, t);
    // a bowl waiting by the chopping board
    const bw = pr.bowl; g.drawImage(bw.img, 482, 1004 - 66 * bw.h / bw.w, 74, 74 * bw.h / bw.w);
  }
  function drawPan(g, P, t) {
    const p = pr.pan, k = PAN.rx / p.rim.rx;
    const jig = P.jiggle || 0;
    g.save(); g.translate(P.x + jig, P.y);
    g.save(); g.scale(k, k); g.drawImage(p.img, -p.rim.cx, -p.rim.cy); g.restore();
    // contents, clipped to the inside of the rim
    const rx = PAN.rx * 0.86, ry = p.rim.ry * k * 0.95;
    g.save(); g.beginPath(); ellipse(g, 0, ry * 0.25, rx, ry); g.clip();
    if (P.content === 'water' || P.content === 'noodles') {
      g.beginPath(); ellipse(g, 0, ry * 0.3, rx, ry); fill(g, P.content === 'water' ? '#8fb7c8' : '#d9a640');
      for (let i = 0; i < 7; i++) {
        const ph = (t * 1.3 + hash(i * 5.3)) % 1, bx = (hash(i * 9.1) - 0.5) * rx * 1.4, by = (hash(i * 2.7) - 0.5) * ry;
        g.globalAlpha = 1 - ph; g.beginPath(); ellipse(g, bx, by, 3 + ph * 5, 2 + ph * 3); stroke(g, 2, '#fff7d6'); g.globalAlpha = 1;
      }
    }
    if (P.content === 'noodles') {
      const stir = P.stir || 0;
      for (let i = 0; i < 13; i++) {
        const a0 = hash(i * 3.1) * TAU, r0 = hash(i * 7.7);
        const x0 = Math.cos(a0) * rx * 0.7 * r0 + Math.sin(t * 7) * 10 * stir, y0 = Math.sin(a0) * ry * 0.6 * r0;
        g.beginPath(); g.moveTo(x0 - rx * 0.45, y0);
        for (let q = 1; q <= 6; q++) g.lineTo(x0 - rx * 0.45 + (rx * 0.9 * q) / 6, y0 + Math.sin(q * 2.2 + t * 6 * (1 + stir * 2.5) + i) * ry * 0.2 * (1 + stir));
        stroke(g, 7.5, '#8a5a12'); stroke(g, 4.4, i % 3 ? '#f6cf5a' : '#ffe08a');
      }
      for (let i = 0; i < 8; i++) { g.beginPath(); ellipse(g, (hash(i * 4.4) - 0.5) * rx * 1.3 + Math.sin(t * 7) * 8 * stir, (hash(i * 8.8) - 0.5) * ry, 3.5, 3); fill(g, i % 2 ? '#5aa83c' : '#c2411f'); }
    }
    g.restore();
    g.restore();
  }
  function foreground(g, t) {
    const sw = noise(t * 0.8, 3) * 0.025;
    const w = 190, h = (w * S.fg.height) / S.fg.width;
    g.save(); g.translate(845, 120); g.rotate(sw); g.drawImage(S.fg, -w / 2, 0, w, h); g.restore();
  }
  // night grade for painted plates: they already carry their moonlight, so only a light
  // multiply plus the two story lights (stove flame, fridge)
  function lights(g, t, st) {
    g.save();
    g.globalCompositeOperation = 'multiply'; g.fillStyle = '#c9c7e6'; g.fillRect(-500, -500, SET.w + 1000, SET.h + 1000);
    g.globalCompositeOperation = 'lighter';
    const on = st.stoveOn || 0;
    if (on > 0.01) {
      const P = st.pan, k = on * (0.85 + 0.15 * noise(t * 8));
      const rg = g.createRadialGradient(P.x, SET.stove.y - 10, 10, P.x, SET.stove.y - 10, 330);
      rg.addColorStop(0, `rgba(255,150,60,${0.34 * k})`); rg.addColorStop(1, 'rgba(255,120,40,0)');
      g.fillStyle = rg; g.fillRect(P.x - 340, SET.stove.y - 340, 680, 680);
    }
    const fo = clamp(st.fridgeOpen || 0, 0, 1);
    if (fo > 0.01) {
      const F = SET.fridge, cx = F.x + F.w / 2, cy = F.split + 160;
      const rg = g.createRadialGradient(cx, cy, 20, cx, cy, 480);
      rg.addColorStop(0, `rgba(150,200,255,${0.26 * fo})`); rg.addColorStop(0.5, `rgba(120,170,240,${0.1 * fo})`); rg.addColorStop(1, 'rgba(150,200,255,0)');
      g.fillStyle = rg; g.fillRect(cx - 500, cy - 500, 1000, 1000);
    }
    g.restore();
  }

  // held props: the painted packet and spatula, vector for the small ones
  function drawHeld(g, hold, hand, handAng, side, t, A, over) {
    const rot = hold.rot ?? handAng;
    if (hold.type === 'packet' && pr.packet) {
      const ax = hold.ax ?? (side === 'R' ? -30 : 30), ay = hold.ay ?? -44;
      const c = Math.cos(rot), s = Math.sin(rot);
      const x = hand.x + ax * c - ay * s, y = hand.y + ax * s + ay * c;
      const p = pr.packet, w = 96, h = (w * p.h) / p.w;
      g.save(); g.translate(x, y); g.rotate(rot); if (hold.empty) g.scale(1, 1 - 0.25 * hold.empty);
      g.drawImage(p.img, -w / 2, -h / 2, w, h); g.restore();
      return;
    }
    if (hold.type === 'spatula' && pr.spatula) {
      const p = pr.spatula, len = 128, w = (len * p.w) / p.h;
      // image is vertical with the handle at the top; the blade points along the hand angle
      g.save(); g.translate(hand.x, hand.y); g.rotate(rot - Math.PI / 2);
      g.drawImage(p.img, -w / 2, -len * 0.3, w, len); g.restore();
      return;
    }
    v2Held(g, hold, hand, handAng, side, t);
  }
  return { scene: { sky, hallway, wall, counter, foreground, lights }, drawHeld };
}

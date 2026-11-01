// Bunty rig fix-up: rebuild the torso from a purpose-drawn sweater sheet, and give the rig a
// single continuous sweater tube for each arm (so there is no shoulder seam to break).
import fs from 'node:fs';
import path from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import {
  readRGBA, writePNG, chromaKey, components, extract, cleanAndInk, alphaBox, rowSpan,
} from '../src/v3/imgops.mjs';
import { RIGS } from '../src/v2/rig.mjs';

const dir = 'characters/bunty';
const rigFile = path.join(dir, 'rig.json');
const rig = JSON.parse(fs.readFileSync(rigFile, 'utf8'));
rig.armShadow = false; // long sweater sleeves: cloth all the way to the wrist
const base = RIGS[rig.base];

// 1 · the torso
const keyed = chromaKey(await readRGBA(path.join(dir, 'sheets/torso.png')));
const { comps, lab } = components(keyed);
const big = comps.filter((c) => c.area > 2000).sort((a, b) => b.area - a.area);
const top = { ids: big.map((c) => c.id), x0: Math.min(...big.map((c) => c.x0)), y0: Math.min(...big.map((c) => c.y0)), x1: Math.max(...big.map((c) => c.x1)), y1: Math.max(...big.map((c) => c.y1)) };
let im = cleanAndInk(extract(keyed, lab, top, 12), { erode: 1, ink: 0.6 });
writePNG(path.join(dir, 'parts/torso.png'), im);

// slim the sweater horizontally: the drawn torso is far wider than the skeleton's shoulders, which
// buries the arms. Squeeze x only, keeping the height (so kT, and every rig unit, is unchanged).
const SX = 0.72;
if (SX !== 1) {
  const { createCanvas, ImageData } = await import('@napi-rs/canvas');
  const srcC = createCanvas(im.w, im.h);
  const sg = srcC.getContext('2d');
  sg.putImageData(new ImageData(im.px, im.w, im.h), 0, 0);
  const nw = Math.round(im.w * SX);
  const dst = createCanvas(nw, im.h);
  const dg = dst.getContext('2d');
  dg.drawImage(srcC, 0, 0, im.w, im.h, 0, 0, nw, im.h);
  const d = dg.getImageData(0, 0, nw, im.h);
  im = { w: nw, h: im.h, px: new Uint8ClampedArray(d.data) };
  writePNG(path.join(dir, 'parts/torso.png'), im);
}

// Kill the painted-in sleeves: the sheet shows two sleeve lobes with inked seams running down the
// body. Those seams read as a second pair of arms laid on top of the IK arms ("extra arms"), so
// every non-fill pixel strictly inside the silhouette — seams and their anti-aliased edges — is
// repainted in the sweater colour. The outer outline stays (it is the alpha boundary), and the
// collar/hem bands are left alone so the neck stub and hem keep their ink.
{
  const orange = (() => { // the sweater fill: the most common colour just inside the hem
    let best = [242, 96, 31], n = -1;
    const hist = new Map();
    for (let y = Math.round(im.h * 0.55); y < im.h * 0.85; y++) for (let x = 0; x < im.w; x++) {
      const i = (y * im.w + x) * 4; if (im.px[i + 3] < 250) continue;
      const k = `${im.px[i] >> 4},${im.px[i + 1] >> 4},${im.px[i + 2] >> 4}`; const v = (hist.get(k) || 0) + 1; hist.set(k, v);
      if (v > n) { n = v; best = [im.px[i], im.px[i + 1], im.px[i + 2]]; }
    }
    return best;
  })();
  const skin = [222, 155, 99];
  const d2 = (r, g, b, c) => (r - c[0]) ** 2 + (g - c[1]) ** 2 + (b - c[2]) ** 2;
  const W = im.w, H = im.h;
  // 1 · anything that is neither sweater nor skin, and has alpha
  let m = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const r = im.px[i * 4], g = im.px[i * 4 + 1], b = im.px[i * 4 + 2], a = im.px[i * 4 + 3];
    if (a < 128) continue;
    if (d2(r, g, b, orange) > 55 ** 2 && d2(r, g, b, skin) > 75 ** 2) m[i] = 1;
  }
  // 2 · distance from the silhouette edge (the outer outline must survive)
  const near = (dist) => {
    const out = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let touch = false;
      for (let dy = -dist; dy <= dist && !touch; dy++) for (let dx = -dist; dx <= dist && !touch; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) { touch = true; break; }
        if (im.px[(ny * W + nx) * 4 + 3] < 128) touch = true;
      }
      if (touch) out[y * W + x] = 1;
    }
    return out;
  };
  const border = near(4);
  // 3 · dilate the mask so the seams' soft edges go too
  const repaint = new Uint8Array(W * H);
  const D = 3;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (border[y * W + x]) continue;
    if (y < Math.round(H * 0.17) || y > Math.round(H * 0.93)) continue; // collar + hem bands
    let hit = false;
    for (let dy = -D; dy <= D && !hit; dy++) for (let dx = -D; dx <= D && !hit; dx++) {
      const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      if (m[ny * W + nx]) hit = true;
    }
    if (hit) repaint[y * W + x] = 1;
  }
  const px = new Uint8ClampedArray(im.px);
  let changed = 0;
  for (let i = 0; i < W * H; i++) if (repaint[i]) { px[i * 4] = orange[0]; px[i * 4 + 1] = orange[1]; px[i * 4 + 2] = orange[2]; changed++; }
  im = { w: W, h: H, px };
  writePNG(path.join(dir, 'parts/torso.png'), im);
  console.log(`torso: ${changed} pixels repainted (painted-in sleeve seams removed), fill #${orange.map((v) => v.toString(16).padStart(2, '0')).join('')}`);
}

const bb = alphaBox(im);
let maxW = 0, maxY = bb.y0;
for (let y = bb.y0; y <= bb.y1; y++) { const s = rowSpan(im, y); if (s && s.w > maxW) { maxW = s.w; maxY = y; } }
let shirtTop = bb.y0;
for (let y = bb.y0; y <= bb.y1; y++) { const s = rowSpan(im, y); if (s && s.w > maxW * 0.55) { shirtTop = y; break; } }
const neckSpan = rowSpan(im, bb.y0 + 2) || { a: bb.x0, b: bb.x1, w: bb.w };
const shY = shirtTop + Math.round((bb.y1 - shirtTop) * 0.1);
const sh = rowSpan(im, shY);
const inset = sh.w * 0.13;
const T = {
  file: 'parts/torso.png', w: im.w, h: im.h,
  neckTop: { x: (neckSpan.a + neckSpan.b) / 2, y: bb.y0 }, neckW: neckSpan.w,
  shirtTop, hem: bb.y1, hip: { x: (bb.x0 + bb.x1) / 2, y: bb.y1 - (bb.y1 - shirtTop) * 0.07 },
  shoulderL: { x: sh.a + inset, y: shY }, shoulderR: { x: sh.b - inset, y: shY }, width: maxW,
};
rig.parts.torso = T;
rig.parts.torso.base = { ...T, file: 'parts/torso.base.png' };

// 2 · an empty "sleeves" overlay: the sweater already has its sleeves painted in, so the rig
//     must not paint a second pair over it. Kept so the loader builds a one-piece arm tube.
const empty = { w: im.w, h: im.h, px: new Uint8ClampedArray(im.w * im.h * 4) };
writePNG(path.join(dir, 'parts/sleeves.png'), empty);
const kT = (base.torsoH + 10) / (T.hem - T.shirtTop);
const armRoot = 40;
const jx = (edge, sgn) => edge - sgn * (armRoot / kT) * 0.32;
const joint = { L: { x: jx(T.shoulderL.x, -1), y: T.shoulderL.y }, R: { x: jx(T.shoulderR.x, 1), y: T.shoulderR.y } };
T.sleeves = {
  file: 'parts/sleeves.png', body: 'parts/torso.png',
  L: { joint: joint.L }, R: { joint: joint.R },
  lengthPx: base.upper * 0.5 / kT, armRoot, theta: 0.32, flapsTrimmed: false,
};
// the hand colours come from the skin samples the auto-rig already took
fs.writeFileSync(rigFile, JSON.stringify(rig, null, 1));
console.log('torso', JSON.stringify({ shirtTop, hem: T.hem, maxW, shoulderL: T.shoulderL, shoulderR: T.shoulderR, kT: +kT.toFixed(3), joints: joint }));

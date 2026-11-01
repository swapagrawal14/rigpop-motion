// rigpop-motion v3 · pose packs: full-body key poses for the big actions a puppet can't sell
// (a startled jump, a fall, a dance), played as flip-book keys inside a normal v2 shot.
//
//   characters/<name>/poses/<action>/sheet.png   4-8 poses on a chroma background (image model)
//   rigpop-motion poses <name> <action>          -> key PNGs + pack.json (cut, same scale,
//                                                   feet on one floor line, timing + lift arc)
//   script:  [K pose-pack jump 1s &]
import fs from 'node:fs';
import path from 'node:path';
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { P as RP } from '../paths.mjs';
import { readRGBA, writePNG, toCanvas, chromaKey, components, groupComponents, readingOrder, extract, cleanAndInk, alphaBox, crop } from './imgops.mjs';
import { CLIPS } from '../v2/motion.mjs';
import { packState } from './imagerig.mjs';
import { clamp } from '../v2/util.mjs';

GlobalFonts.registerFromPath(RP('assets/fonts/LuckiestGuy-Regular.ttf'), 'Lucky');

// What to ask the image model for, and how to play what comes back.
//   keys: pose index, relative duration, lift (rig units above the floor at the key's start),
//   ease of the lift toward the next key, optional squash.
export const ACTIONS = {
  jump: {
    poses: [
      'standing relaxed, happy, about to be surprised',
      'anticipation: knees bent deep, shoulders hunched up, body squashed down, eyebrows shooting up',
      'take-off: body stretched tall and thin, legs straight, arms shooting up, mouth opening',
      'mid-air fright: arms flung up and out with fingers spread, knees tucked up, hair standing on end, mouth wide open screaming, sweat drops',
      'landing squash: crouched low with knees bent and arms out for balance, eyes wide',
      'recovered: standing stiff and scared, shoulders up, hands raised near the chest, nervous wobbly mouth',
    ],
    keys: [
      { pose: 0, t: 0.06, lift: 0 },
      { pose: 1, t: 0.14, lift: 0, ease: 'in', sy: 0.94 },
      { pose: 2, t: 0.08, lift: 30, ease: 'out', sy: 1.08 },
      { pose: 3, t: 0.17, lift: 150, ease: 'out' },
      { pose: 3, t: 0.13, lift: 165, ease: 'in' },
      { pose: 4, t: 0.14, lift: 0, ease: 'out', sy: 0.92 },
      { pose: 5, t: 0.28, lift: 0 },
    ],
    sfx: [{ at: 0.2, name: 'whoosh', gain: 0.6 }, { at: 0.22, name: 'sting', gain: 0.35 }, { at: 0.62, name: 'step', gain: 0.55 }],
  },
};

export function posePrompt(about, action) {
  const A = ACTIONS[action];
  return `POSE PACK sheet for 2D animation: ${A.poses.length} full-body key poses of ${about} (same character, same design, same art style as the reference images). ` +
    `Poses, same scale, facing the viewer, in reading order, wide green gaps, never touching: ${A.poses.map((p, i) => `${i + 1}) ${p}`).join('; ')}. ` +
    'Flat solid pure chroma-green #00FF00 background, no ground shadows, no text, no labels, no numbers, no watermark.';
}

export async function cutPack(charDir, action, { log = console.error } = {}) {
  const A = ACTIONS[action]; if (!A) throw new Error(`unknown action "${action}" (have: ${Object.keys(ACTIONS).join(', ')})`);
  const dir = path.join(charDir, 'poses', action);
  const rig = JSON.parse(fs.readFileSync(path.join(charDir, 'rig.json'), 'utf8'));
  const src = JSON.parse(fs.readFileSync(path.join(charDir, 'rig-src.json'), 'utf8'));
  const keyed = chromaKey(await readRGBA(path.join(dir, 'sheet.png')));
  const { comps, lab } = components(keyed);
  const big = comps.filter((c) => c.area > 2500);
  // small bits (sweat drops, a hair spike) join the pose they sit next to
  const items = groupComponents(comps.filter((c) => c.area > 120), 14).filter((it) => it.area > 2500);
  const poses = readingOrder(items).flat();
  log(`  ${action}: ${comps.length} components, ${big.length} large, ${poses.length} poses (expected ${A.poses.length})`);
  if (poses.length !== A.poses.length) throw new Error(`pose sheet has ${poses.length} poses, the "${action}" pack expects ${A.poses.length}`);
  const skin = hexRGB(rig.skin);
  const cut = poses.map((it) => cleanAndInk(extract(keyed, lab, it, 8), { erode: 1, ink: 0.55 }));
  // same scale: measure each pose's face (largest skin blob in the top half) and normalise
  const faces = cut.map((im) => faceWidth(im, skin));
  const med = [...faces].sort((a, b) => a - b)[faces.length >> 1];
  const keysOut = [];
  const files = [];
  cut.forEach((im0, i) => {
    let im = im0;
    const k = clamp(med / faces[i], 0.92, 1.08); // the model's size drift, bounded
    if (Math.abs(k - 1) > 0.02) im = scaleRGBA(im, k);
    if (src.torsoText) im = shirtText(im, src.torsoText);
    const b = alphaBox(im);
    im = crop(im, b.x0 - 4, b.y0 - 4, b.w + 8, b.h + 8);
    const b2 = alphaBox(im);
    // floor line = lowest opaque row; anchor x = middle of the feet
    let sx = 0, n = 0; for (let y = b2.y1 - Math.round(b2.h * 0.08); y <= b2.y1; y++) for (let x = 0; x < im.w; x++) if (im.px[(y * im.w + x) * 4 + 3] > 128) { sx += x; n++; }
    const f = `key${i}.png`; writePNG(path.join(dir, f), im);
    files.push({ file: f, foot: { x: sx / n, y: b2.y1 }, w: im.w, h: im.h, face: faces[i] * k });
  });
  const pack = {
    action, from: 'sheet.png', headRx: med / 2, scale: 1.0,
    standPx: files[A.keys[0].pose].foot.y - 4, // the first key is a standing pose: its height = the rig's standing height
    width: Math.max(...files.map((f) => f.w)), height: Math.max(...files.map((f) => f.h)),
    keys: A.keys.map((K) => ({ ...files[K.pose], pose: K.pose, t: K.t, lift: K.lift, ease: K.ease || null, sx: K.sx, sy: K.sy })),
    sfx: A.sfx || [],
  };
  fs.writeFileSync(path.join(dir, 'pack.json'), JSON.stringify(pack, null, 1));
  log(`  pack.json: ${pack.keys.length} keys from ${files.length} poses, face width ${med.toFixed(0)} px (size drift ${faces.map((x) => (x / med).toFixed(2)).join(' ')})`);
  return pack;
}

function hexRGB(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function faceWidth(im, skin) {
  const b = alphaBox(im);
  const m = { w: im.w, h: im.h, px: new Uint8ClampedArray(im.w * im.h * 4) };
  for (let y = b.y0; y < b.y0 + b.h * 0.5; y++) for (let x = 0; x < im.w; x++) {
    const i = (y * im.w + x) * 4;
    if (im.px[i + 3] > 128 && Math.hypot(im.px[i] - skin[0], im.px[i + 1] - skin[1], im.px[i + 2] - skin[2]) < 55) m.px[i + 3] = 255;
  }
  const { comps } = components(m);
  const c = comps.sort((p, q) => q.area - p.area)[0];
  return c ? c.x1 - c.x0 : b.w * 0.5;
}
function scaleRGBA(im, k) {
  const W = Math.round(im.w * k), H = Math.round(im.h * k);
  const c = createCanvas(W, H), g = c.getContext('2d'); g.drawImage(toCanvas(im), 0, 0, W, H);
  return { w: W, h: H, px: new Uint8ClampedArray(g.getImageData(0, 0, W, H).data) };
}
// The image model draws no text: put the tee print back, clipped to the red of the shirt.
function shirtText(im, T) {
  const red = (i) => im.px[i] > 140 && im.px[i + 1] < 80 && im.px[i + 2] < 80 && im.px[i + 3] > 200;
  const m = { w: im.w, h: im.h, px: new Uint8ClampedArray(im.w * im.h * 4) };
  for (let i = 0; i < im.w * im.h; i++) if (red(i * 4)) m.px[i * 4 + 3] = 255;
  const { comps } = components(m); const c = comps.sort((a, b) => b.area - a.area)[0];
  if (!c || c.area < 800) return im;
  const cv = toCanvas(im), g = cv.getContext('2d');
  const mask = toCanvas(m), size = Math.round((c.x1 - c.x0) * 0.2);
  const tc = createCanvas(im.w, im.h), tg = tc.getContext('2d');
  tg.translate(c.cx, c.y0 + (c.y1 - c.y0) * 0.45); tg.rotate(T.rot ?? -0.06);
  tg.font = `${size}px Lucky`; tg.textAlign = 'center'; tg.textBaseline = 'middle'; tg.fillStyle = T.color || '#f3cdbd';
  const w = T.text.split(' ');
  tg.fillText(w[0], 0, -size * 0.55); if (w.length > 1) tg.fillText(w.slice(1).join(' '), size * 0.25, size * 0.55);
  tg.setTransform(1, 0, 0, 1, 0, 0); tg.globalCompositeOperation = 'destination-in'; tg.drawImage(mask, 0, 0);
  g.globalAlpha = T.alpha ?? 0.9; g.drawImage(tc, 0, 0);
  return { ...im, px: new Uint8ClampedArray(g.getImageData(0, 0, im.w, im.h).data) };
}

// The script verb. The puppet keeps solving underneath (camera framing, FX anchors), the
// drawer swaps in the pack's keys while the clip's weight is up.
CLIPS['pose-pack'] = {
  dur: 1.0, rin: 0.01, rout: 0.01, linear: true,
  f(c) {
    const name = c.args[0];
    return { pack: { name, u: c.u, d: c.d }, face: { sweat: 0 } };
  },
  fx: (t0, t1, a, ctx) => (a[0] === 'jump' ? [{ kind: 'exclaim', t: t0 + 0.25, t1: t0 + 0.95, actor: ctx.actorId }] : []),
  sfx: (t0, t1, a) => {
    const d = t1 - t0;
    const spec = ACTIONS[a[0]]; if (!spec || !spec.sfx) return [];
    const tot = spec.keys.reduce((p, k) => p + k.t, 0);
    return spec.sfx.map((s) => ({ t: t0 + (s.at / tot) * d, name: s.name, gain: s.gain }));
  },
};
export { packState };

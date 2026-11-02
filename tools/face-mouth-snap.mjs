// Snap a mouth rect onto the nearest drawn mouth opening. The opening is a dark maroon blob; search a
// window around the current rect, keep the blob whose centre is CLOSEST to the current centre (a bindi
// or a sari fold may be maroon too, but it is further away), and move the rect onto it.
//   node tools/face-mouth-snap.mjs kaushalya talk [--write]
import fs from 'node:fs';
import path from 'node:path';
import { readRGBA, components } from '../src/v3/imgops.mjs';
import { isSkinPx } from '../src/v3/facepatch.mjs';

const args = process.argv.slice(2);
const write = args.includes('--write');
const [char, pose] = args.filter((a) => a !== '--write');
const dir = path.join('characters', char, 'poses', pose);
const cfgFile = path.join(dir, 'pose.config.json');
const pack = JSON.parse(fs.readFileSync(path.join(dir, 'pack.json'), 'utf8'));
const cfg = JSON.parse(fs.readFileSync(cfgFile, 'utf8'));
for (const K of pack.keys) {
  const hand = cfg.face && cfg.face[`key${K.pose}`] && cfg.face[`key${K.pose}`].mouth;
  const cur = Array.isArray(hand) ? hand : (K.face.mouth ? [K.face.mouth.x, K.face.mouth.y, K.face.mouth.w, K.face.mouth.h] : null);
  if (!cur) { console.log(`${pose}/${K.file}: no mouth rect`); continue; }
  const im = await readRGBA(path.join(dir, K.file));
  const [mx, my, mw, mh] = cur;
  const cx = mx + mw / 2, cy = my + mh / 2;
  const wx = Math.round(mw * 1.4), wy = Math.round(mh * 1.4);
  const x0 = Math.max(0, mx - wx), x1 = Math.min(im.w, mx + mw + wx);
  const y0 = Math.max(0, my - wy), y1 = Math.min(im.h, my + mh + wy);
  const mask = { w: im.w, h: im.h, px: new Uint8ClampedArray(im.w * im.h * 4) };
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = (y * im.w + x) * 4;
    if (im.px[i + 3] < 128) continue;
    const r = im.px[i], g = im.px[i + 1], b = im.px[i + 2];
    if (isSkinPx(r, g, b)) continue;
    const dark = r < 130 && g < 80 && b < 105 && r > 45;      // mouth interior in shadow
    const maroon = r > 120 && r < 215 && g < 105 && b < 135 && r > g + 50;
    if (dark || maroon) mask.px[i + 3] = 255;
  }
  const { comps } = components(mask);
  const cand = comps.filter((c) => c.area > 25).map((c) => ({ ...c, d: Math.hypot(c.cx - cx, c.cy - cy) })).sort((a, b) => a.d - b.d);
  if (!cand.length) { console.log(`${pose}/${K.file}: nothing found (closed mouth), keep [${cur}]`); continue; }
  const c = cand[0];
  const pad = 3;
  const box = [Math.max(0, c.x0 - pad), Math.max(0, c.y0 - pad), c.x1 - c.x0 + 1 + pad * 2, c.y1 - c.y0 + 1 + pad * 2];
  console.log(`${pose}/${K.file} [${cur}] -> [${box}]  (${c.area}px, moved ${c.d.toFixed(1)})`);
  if (write) {
    cfg.face = { ...(cfg.face || {}) };
    cfg.face[`key${K.pose}`] = { ...(cfg.face[`key${K.pose}`] || {}), mouth: box };
  }
}
if (write) fs.writeFileSync(cfgFile, JSON.stringify(cfg, null, 1) + '\n');

// Nudge a hand-set mouth rect onto the drawn mouth. The rect in pose.config.json is a good starting
// point; the mouth itself is the dark maroon interior (and the pink tongue) inside a small window
// around it, which no other part of the face uses below the eye line. Prints the fitted rect and, with
// --write, stores it back in pose.config.json.
//   node tools/face-mouth-fit.mjs kaushalya listen think explain [--write]
import fs from 'node:fs';
import path from 'node:path';
import { readRGBA } from '../src/v3/imgops.mjs';
import { isSkinPx } from '../src/v3/facepatch.mjs';

const args = process.argv.slice(2);
const write = args.includes('--write');
const [char, ...poses] = args.filter((a) => a !== '--write');
for (const pose of poses) {
  const dir = path.join('characters', char, 'poses', pose);
  const cfgFile = path.join(dir, 'pose.config.json');
  const packFile = path.join(dir, 'pack.json');
  if (!fs.existsSync(cfgFile) || !fs.existsSync(packFile)) { console.log(`${char}/${pose}: skip`); continue; }
  const cfg = JSON.parse(fs.readFileSync(cfgFile, 'utf8'));
  const pack = JSON.parse(fs.readFileSync(packFile, 'utf8'));
  for (const K of pack.keys) {
    const hand = (cfg.face && cfg.face[`key${K.pose}`] && cfg.face[`key${K.pose}`].mouth) || null;
    if (!Array.isArray(hand) || hand.length !== 4) continue;
    const im = await readRGBA(path.join(dir, K.file));
    const [mx, my, mw, mh] = hand;
    const wx = Math.round(mw * 0.75), wy = Math.round(mh * 0.75);
    const x0 = Math.max(0, Math.round(mx - wx)), x1 = Math.min(im.w, Math.round(mx + mw + wx));
    const y0 = Math.max(0, Math.round(my - wy)), y1 = Math.min(im.h, Math.round(my + mh + wy));
    let bx0 = 1e9, by0 = 1e9, bx1 = -1, by1 = -1, n = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = (y * im.w + x) * 4;
      if (im.px[i + 3] < 128) continue;
      const r = im.px[i], g = im.px[i + 1], b = im.px[i + 2];
      if (isSkinPx(r, g, b)) continue;
      const interior = (r > 70 && r < 215 && g < 110 && b < 135 && r > g + 45) || (r > 175 && g < 175 && b > 100 && b < 210 && r > g + 35);
      if (!interior) continue;
      n++;
      if (x < bx0) bx0 = x; if (y < by0) by0 = y; if (x > bx1) bx1 = x; if (y > by1) by1 = y;
    }
    const cur = `[${mx},${my},${mw},${mh}]`;
    if (n < 40) { console.log(`${char}/${pose}/${K.file} ${cur}: closed mouth, keep`); continue; }
    const pad = 3;
    const box = [Math.max(0, bx0 - pad), Math.max(0, by0 - pad), bx1 - bx0 + 1 + pad * 2, by1 - by0 + 1 + pad * 2];
    console.log(`${char}/${pose}/${K.file} ${cur} -> [${box.join(',')}]  (${n}px)`);
    if (write) { cfg.face[`key${K.pose}`] = { ...cfg.face[`key${K.pose}`], mouth: box }; }
  }
  if (write) fs.writeFileSync(cfgFile, JSON.stringify(cfg, null, 1) + '\n');
}

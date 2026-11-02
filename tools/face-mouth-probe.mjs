// Where is the drawn mouth, really? The mouth interior on these drawings is a DARK MAROON that nothing
// else on the face uses (skin is warm and light, the sari is a different hue entirely), so the biggest
// maroon blob inside a window around the current rect is the mouth. Prints the box to put in
// pose.config.json. A closed mouth (a thin line) has no interior and is reported as such — those keep
// their hand-set box.
//   node tools/face-mouth-probe.mjs kaushalya listen think explain
import fs from 'node:fs';
import path from 'node:path';
import { readRGBA, components } from '../src/v3/imgops.mjs';
import { isSkinPx } from '../src/v3/facepatch.mjs';

const [char, ...poses] = process.argv.slice(2);
for (const pose of poses) {
  const dir = path.join('characters', char, 'poses', pose);
  const packFile = path.join(dir, 'pack.json');
  if (!fs.existsSync(packFile)) { console.log(`${char}/${pose}: no pack`); continue; }
  const pack = JSON.parse(fs.readFileSync(packFile, 'utf8'));
  for (const K of pack.keys) {
    const m = K.face && K.face.mouth;
    if (!m) { console.log(`${char}/${pose}/${K.file}: no mouth patch`); continue; }
    const im = await readRGBA(path.join(dir, K.file));
    // search BELOW the eyes and around the current box: the bindi is the same maroon as a mouth, and
    // the only thing that reliably separates them is that it sits above the eye line
    const b = K.face.blink;
    const wx = Math.round(m.w * 1.6), wy = Math.round(m.h * 1.6);
    const x0 = Math.max(0, m.x - wx), x1 = Math.min(im.w, m.x + m.w + wx);
    const y0 = Math.max(b ? b.y + b.h : 0, m.y - wy), y1 = Math.min(im.h, m.y + m.h + wy);
    const mask = { w: im.w, h: im.h, px: new Uint8ClampedArray(im.w * im.h * 4) };
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = (y * im.w + x) * 4;
      if (im.px[i + 3] < 128) continue;
      const r = im.px[i], g = im.px[i + 1], b2 = im.px[i + 2];
      if (isSkinPx(r, g, b2)) continue;                    // skin is the big warm area around the mouth
      const maroon = r > 80 && r < 205 && g < 90 && b2 < 115 && r > g + 60;    // mouth interior / shadow
      const tongue = r > 185 && g < 160 && b2 > 110 && b2 < 200 && r > g + 45; // tongue / inner lip
      if (maroon || tongue) mask.px[i + 3] = 255;
    }
    const { comps } = components(mask);
    const best = comps.filter((c) => c.area > 40).sort((a, b) => b.area - a.area)[0];
    const cur = `[${m.x},${m.y},${m.w},${m.h}]`;
    if (!best) { console.log(`${char}/${pose}/${K.file} cur ${cur}  closed mouth (no interior found)`); continue; }
    const pad = 2;
    const bx = Math.max(0, best.x0 - pad), by = Math.max(0, best.y0 - pad);
    const bw = Math.min(im.w - bx, best.x1 - best.x0 + 1 + pad * 2);
    const bh = Math.min(im.h - by, best.y1 - best.y0 + 1 + pad * 2);
    console.log(`${char}/${pose}/${K.file} cur ${cur} -> [${bx},${by},${bw},${bh}]  (${best.area}px)`);
  }
}

// Build pose packs from INDIVIDUAL pose images.
//
//   characters/<c>/poses/<pack>/key*.png      several drawings = several keys
//   characters/<c>/poses/<pack>.png           one drawing  = one pose
//   characters/<c>/poses/<pack>/pose.config.json   optional { "mode": "full" | "bust" }
//
// Each drawing is cut on its own and becomes one key. A full-body key is scaled so the drawn figure
// is exactly the rig's standing height and its feet sit on the floor line; a bust key is scaled by
// head width and stands on the skinned legs instead.
import fs from 'node:fs';
import path from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { readRGBA, writePNG, chromaKey, components, cleanAndInk, alphaBox, crop, toCanvas } from '../src/v3/imgops.mjs';
import { RIGS } from '../src/v2/rig.mjs';

const only = process.argv[2];
const packKeyTiming = (n, i) => (i === n - 1 ? 0.4 : 0.6 / Math.max(1, n - 1));

for (const ch of fs.readdirSync('characters')) {
  if (only && ch !== only) continue;
  const dir = path.join('characters', ch);
  const rigFile = path.join(dir, 'rig.json');
  if (!fs.existsSync(rigFile)) continue;
  const rig = JSON.parse(fs.readFileSync(rigFile, 'utf8'));
  const base = RIGS[rig.base] || RIGS.kabir;
  const posesRoot = path.join(dir, 'poses');
  if (!fs.existsSync(posesRoot)) continue;

  const jobs = [];
  for (const e of fs.readdirSync(posesRoot)) {
    const full = path.join(posesRoot, e);
    if (fs.statSync(full).isDirectory()) {
      if (e.startsWith('_')) continue;
      const cf = path.join(full, 'pose.config.json');
      const cfg = fs.existsSync(cf) ? JSON.parse(fs.readFileSync(cf, 'utf8')) : {};
      const imgs = fs.readdirSync(full).filter((x) => x.endsWith('.png') && !x.startsWith('key')).sort();
      if (imgs.length) jobs.push({ name: e, dir: full, out: full, imgs, cfg });
    } else if (e.endsWith('.png') && !e.startsWith('_')) {
      const nm = e.replace(/\.png$/, '');
      jobs.push({ name: nm, dir: posesRoot, out: path.join(posesRoot, nm), imgs: [e], cfg: {} });
    }
  }

  for (const job of jobs) {
    const out = job.out;
    fs.mkdirSync(out, { recursive: true });
    const cut = [];
    for (const img of job.imgs) {
      const raw = await readRGBA(path.join(job.dir, img));
      // an image that is already cut (lots of fully transparent pixels) must NOT be keyed again
      let clear = 0; for (let i = 0; i < raw.w * raw.h; i++) if (raw.px[i * 4 + 3] === 0) clear++;
      const keyed = clear / (raw.w * raw.h) > 0.05 ? raw : chromaKey(raw, { bg: [0, 255, 0] });
      const { comps, lab } = components(keyed);
      const big = comps.filter((c) => c.area > 2500).sort((a, b) => b.area - a.area);
      if (!big.length) { console.log(`  ! ${ch}/${job.name}/${img}: nothing found`); continue; }
      const main = big[0];
      const diag = Math.hypot(main.x1 - main.x0, main.y1 - main.y0);
      // the drawing itself, plus anything close to it (a glass, a raised hand that got its own blob)
      const keep = big.filter((c) => Math.hypot(c.cx - main.cx, c.cy - main.cy) < diag * 0.55 && c.area > main.area * 0.01);
      const ids = new Set(keep.map((c) => c.id));
      const box = { ids, x0: Math.min(...keep.map((c) => c.x0)), y0: Math.min(...keep.map((c) => c.y0)), x1: Math.max(...keep.map((c) => c.x1)), y1: Math.max(...keep.map((c) => c.y1)) };
      const im0 = cleanAndInk(extract(keyed, lab, box, 6), { erode: 1, ink: 0.55 });
      const b = alphaBox(im0);
      cut.push({ source: img, im: crop(im0, b.x0 - 4, b.y0 - 4, b.w + 8, b.h + 8) });
    }
    if (!cut.length) continue;

    const mode = job.cfg.mode || 'full';
    const keys = cut.map((c, i) => {
      const b = alphaBox(c.im);
      const name = `key${i}.png`;
      writePNG(path.join(out, name), c.im);
      return { file: name, source: c.source, foot: { x: bottomCentre(c.im, b), y: b.y1 }, w: c.im.w, h: c.im.h };
    });
    const standPx = job.cfg.standPx || Math.min(...keys.map((k) => k.h));
    const pack = {
      action: job.name, mode,
      from: keys.map((k) => k.source).join(', '),
      scale: 1,
      standPx,
      bustScale: mode === 'bust' ? (base.headRx * 1.15) / (job.cfg.headPx || standPx * 0.16) : 1,
      width: Math.max(...keys.map((k) => k.w)), height: Math.max(...keys.map((k) => k.h)),
      keys: keys.map((k, i) => ({ ...k, pose: i, t: packKeyTiming(keys.length, i), lift: 0 })),
    };
    fs.writeFileSync(path.join(out, 'pack.json'), JSON.stringify(pack, null, 1));
    console.log(`${ch}/${job.name}: ${keys.length} key(s), mode ${mode}, standPx ${standPx} [${keys.map((k) => k.source).join(', ')}]`);
  }
}

function extract(im, lab, item, pad) {
  const ids = new Set(item.ids);
  const x0 = Math.max(0, item.x0 - pad), y0 = Math.max(0, item.y0 - pad);
  const x1 = Math.min(im.w - 1, item.x1 + pad), y1 = Math.min(im.h - 1, item.y1 + pad);
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const si = (y + y0) * im.w + (x + x0), di = y * w + x;
    // component id 0 is also the 'no component' label, so require real alpha too
    if (ids.has(lab[si]) && im.px[si * 4 + 3] > 8) for (let k = 0; k < 4; k++) px[di * 4 + k] = im.px[si * 4 + k];
  }
  return { w, h, px };
}
function bottomCentre(im, b) {
  let s = 0, n = 0;
  for (let y = b.y1 - Math.round(b.h * 0.05); y <= b.y1; y++) for (let x = 0; x < im.w; x++) if (im.px[(y * im.w + x) * 4 + 3] > 128) { s += x; n++; }
  return n ? s / n : (b.x0 + b.x1) / 2;
}

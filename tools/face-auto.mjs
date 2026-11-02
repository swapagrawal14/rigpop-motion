// Measure face rects on a flat cartoon pose key without hand work.
//
// These poses are flat marker art: the eyes are two small dark blobs, the mouth is the next dark
// blob below them. So: find every dark blob, take the topmost pair of similar small blobs as the
// eyes, and the blob under them, near the eye midline, as the mouth. Then draw the result into a
// check sheet so a human can see at a glance whether it is right.
//
//   node tools/face-auto.mjs pihu [pose ...] [--write]
//   node tools/face-auto.mjs pihu --sheet out/pihu-faces.png
import fs from 'node:fs';
import path from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { readRGBA, components } from '../src/v3/imgops.mjs';

const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const write = args.includes('--write');
const sheetOut = flag('--sheet');
const only = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1] === '--sheet'));
const char = only.shift();

const mask = (im, fn) => {
  const m = { w: im.w, h: im.h, px: new Uint8ClampedArray(im.w * im.h * 4) };
  for (let i = 0; i < im.w * im.h; i++) {
    if (im.px[i * 4 + 3] < 200) continue;
    if (fn(im.px[i * 4], im.px[i * 4 + 1], im.px[i * 4 + 2])) m.px[i * 4 + 3] = 255;
  }
  return m;
};
const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

function measure(im) {
  const dark = components(mask(im, (r, g, b) => lum(r, g, b) < 85)).comps
    .map((c) => ({ ...c, w: c.x1 - c.x0 + 1, h: c.y1 - c.y0 + 1 }))
    .filter((c) => c.area > 12 && c.area < 4000 && c.w < im.w * 0.3);
  const small = dark.filter((c) => c.w < 30 && c.h < 34 && c.w > 4 && c.h > 4 && c.w < c.h * 2.6);
  // the eyes: the highest pair of small blobs that sit side by side at the same height
  let pair = null;
  for (let i = 0; i < small.length; i++) for (let j = i + 1; j < small.length; j++) {
    const a = small[i], b = small[j];
    if (Math.abs(a.cy - b.cy) > Math.max(a.h, b.h) * 0.7) continue;
    const sep = Math.abs(a.cx - b.cx);
    if (sep < Math.max(a.w, b.w) * 1.2 || sep > 150) continue;
    const area = a.area / b.area; if (area < 0.45 || area > 2.2) continue;
    const cy = (a.cy + b.cy) / 2;
    if (!pair || cy < pair.cy) pair = { a, b, cy };
  }
  if (!pair) return {};
  const ex0 = Math.min(pair.a.x0, pair.b.x0), ex1 = Math.max(pair.a.x1, pair.b.x1);
  const ey0 = Math.min(pair.a.y0, pair.b.y0), ey1 = Math.max(pair.a.y1, pair.b.y1);
  const eyes = [ex0 - 7, ey0 - 9, ex1 - ex0 + 15, ey1 - ey0 + 18];
  const mid = (ex0 + ex1) / 2;
  // the mouth: the nearest dark blob below the eyes, on the midline
  // a mouth is wider than it is tall; the nose line is the tall narrow thing we must skip
  const below = dark.filter((c) => c.y0 > ey1 + 2 && c.cy < ey1 + 130 && Math.abs(c.cx - mid) < (ex1 - ex0) * 0.8 + 16 && c.area > 18 && c.w >= c.h * 0.7);
  if (!below.length) return { eyes };
  const m = below.sort((a, b) => b.cy - a.cy)[0];
  return { eyes, mouth: [m.x0 - 4, m.y0 - 4, m.x1 - m.x0 + 9, m.y1 - m.y0 + 9] };
}

const root = path.join('characters', char, 'poses');
const rows = [];
for (const e of fs.readdirSync(root).sort()) {
  const full = path.join(root, e);
  if (!fs.statSync(full).isDirectory() || e.startsWith('_')) continue;
  if (only.length && !only.includes(e)) continue;
  const cfgFile = path.join(full, 'pose.config.json');
  const cfg = fs.existsSync(cfgFile) ? JSON.parse(fs.readFileSync(cfgFile, 'utf8')) : { mode: 'full' };
  cfg.face = cfg.face || {};
  let touched = false;
  for (const k of fs.readdirSync(full).filter((f) => /^key\d+\.png$/.test(f)).sort()) {
    const kn = k.replace('.png', '');
    const im = await readRGBA(path.join(full, k));
    const m = measure(im);
    console.log(`${char}/${e}/${k}: ${m.eyes ? 'eyes ' + JSON.stringify(m.eyes) : 'eyes MISS'}  ${m.mouth ? 'mouth ' + JSON.stringify(m.mouth) : 'mouth MISS'}`);
    if (write && m.eyes && m.mouth) { cfg.face[kn] = { eyes: m.eyes, mouth: m.mouth }; touched = true; }
    rows.push({ name: `${e}/${k}`, file: path.join(full, k), ...m });
  }
  if (write && touched) fs.writeFileSync(cfgFile, JSON.stringify(cfg, null, 1) + '\n');
}

if (sheetOut && rows.length) {
  const S = 3, cols = 4, cw = 220, ch = 260;
  const c = createCanvas(cols * cw, Math.ceil(rows.length / cols) * ch);
  const g = c.getContext('2d');
  g.fillStyle = '#1b1b22'; g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const img = await loadImage(r.file);
    const x = (i % cols) * cw, y = Math.floor(i / cols) * ch;
    g.drawImage(img, x + 4, y + 4, cw - 8, ch - 24);
    g.fillStyle = '#fff'; g.font = '12px sans-serif'; g.fillText(r.name, x + 4, y + ch - 8);
    // zoom the face into the same cell with the rects drawn
    if (r.eyes) {
      const [ex, ey, ew, eh] = r.eyes;
      const z0x = Math.max(0, ex - ew), z0y = Math.max(0, ey - eh), zw = ew * 3, zh = eh * 4;
      g.save(); g.beginPath(); g.rect(x + 4, y + 4, cw - 8, ch - 24); g.clip();
      g.drawImage(img, z0x, z0y, zw, zh, x + 4, y + 4, cw - 8, ch - 24);
      const kx = (cw - 8) / zw, ky = (ch - 24) / zh;
      g.strokeStyle = '#39ff6a'; g.lineWidth = 2; g.strokeRect(x + 4 + (ex - z0x) * kx, y + 4 + (ey - z0y) * ky, ew * kx, eh * ky);
      if (r.mouth) { const [mx, my, mw, mh] = r.mouth; g.strokeStyle = '#ff39c8'; g.strokeRect(x + 4 + (mx - z0x) * kx, y + 4 + (my - z0y) * ky, mw * kx, mh * ky); }
      g.restore();
    }
  }
  fs.writeFileSync(sheetOut, c.toBuffer('image/png'));
  console.log(`sheet -> ${sheetOut}`);
}

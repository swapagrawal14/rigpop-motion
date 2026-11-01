// Clean + normalise the 6 individually generated poses into aligned frames.
import fs from 'node:fs';
import { P } from './paths.mjs';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const SRC = (i) => P(`characters/kabir-side/pose${i}.png`);
const OUTDIR = P('characters/kabir-side/poses');

async function cut(img) {
  const w = img.width, h = img.height;
  const c = createCanvas(w, h); const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  const fd = g.getImageData(0, 0, w, h); const d = fd.data;
  const bg = [d[(10 * w + 10) * 4], d[(10 * w + 10) * 4 + 1], d[(10 * w + 10) * 4 + 2]];
  // NOTE: we clear EVERY background-coloured pixel, not just the flood-filled ring,
  // so enclosed pockets (e.g. the gap between a lifted leg and the trousers) vanish too.
  const isBg = new Uint8Array(w * h);
  for (let i0 = 0; i0 < w * h; i0++) {
    const i = i0 * 4;
    if (Math.hypot(d[i] - bg[0], d[i + 1] - bg[1], d[i + 2] - bg[2]) < 34) isBg[i0] = 1;
  }
  const kill = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i0 = y * w + x;
    if (isBg[i0]) { kill[i0] = 1; continue; }
    let t = false;
    for (let dy = -1; dy <= 1 && !t; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && nx < w && ny >= 0 && ny < h && isBg[ny * w + nx]) { t = true; break; }
    }
    if (t) kill[i0] = 1;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i0 = y * w + x, i = i0 * 4;
    if (kill[i0]) { d[i + 3] = 0; continue; }
    let near = false;
    for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && nx < w && ny >= 0 && ny < h && kill[ny * w + nx]) { near = true; break; }
    }
    if (near) { d[i] = 26; d[i + 1] = 22; d[i + 2] = 20; d[i + 3] = 180; }
  }
  g.putImageData(fd, 0, 0);
  // bbox + head axis
  let minX = w, maxX = 0, minY = h, maxY = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (d[(y * w + x) * 4 + 3] > 30) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  // head axis = horizontal centre of the top 15% of the figure
  const band = minY + Math.round((maxY - minY) * 0.15);
  let hl = w, hr = 0;
  for (let y = minY; y <= band; y++) for (let x = minX; x <= maxX; x++) {
    if (d[(y * w + x) * 4 + 3] > 30) { if (x < hl) hl = x; if (x > hr) hr = x; }
  }
  return { canvas: c, minX, maxX, minY, maxY, headCx: (hl + hr) / 2, w: maxX - minX + 1, h: maxY - minY + 1 };
}

const cuts = [];
for (let i = 1; i <= 6; i++) cuts.push(await cut(await loadImage(SRC(i))));

const H = Math.max(...cuts.map((c) => c.h));
const Wd = Math.max(...cuts.map((c) => c.w));
const PAD = 30;
const cw = Wd + PAD * 2, ch = H + PAD * 2;
fs.mkdirSync(OUTDIR, { recursive: true });

const meta = [];
for (const [i, c] of cuts.entries()) {
  const out = createCanvas(cw, ch);
  const g = out.getContext('2d');
  const s = H / c.h;                       // scale each pose to the same body height
  const dw = c.w * s, dh = H;
  const dx = cw / 2 - (c.headCx - c.minX) * s;   // head axis at canvas centre
  const dy = ch - PAD - dh;                       // soles on one baseline
  g.drawImage(c.canvas, c.minX, c.minY, c.w, c.h, dx, dy, dw, dh);
  fs.writeFileSync(`${OUTDIR}/pose_${i}.png`, await out.encode('png'));
  meta.push({ pose: i, srcH: c.h, srcW: c.w, scale: +s.toFixed(3), canvas: [cw, ch] });
  console.log(`pose ${i}: src ${c.w}x${c.h} scale ${s.toFixed(3)}`);
}
fs.writeFileSync(`${OUTDIR}/poses.json`, JSON.stringify({ canvas: [cw, ch], baseline: ch - PAD, poses: meta }, null, 2));
console.log('frame size', cw, ch);

// contact strip
const strip = createCanvas(cw * 6, ch);
const sg = strip.getContext('2d');
for (let i = 0; i < 6; i++) sg.drawImage(await loadImage(`${OUTDIR}/pose_${i}.png`), i * cw, 0);
fs.writeFileSync(P('characters/kabir-side/poses-strip.png'), await strip.encode('png'));

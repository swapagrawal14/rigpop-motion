// Zoomed crop of one pose key with a labelled PIXEL GRID (10 key px per cell), so a face rect can be
// read off by eye and written into that pose's pose.config.json as {"face":{"key0":{"eyes":[...],
// "mouth":[...]}}}. Used when the detectors cannot read a drawing (a white moustache hides the mouth,
// a spectacle frame hides the eyes) and the rects have to be measured once and checked by a human.
import fs from 'node:fs';
import path from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const [char, pose, key = 'key0.png', zoom = '8', argCx, argCy, argW] = process.argv.slice(2);
const dir = path.join('characters', char, 'poses', pose);
const img = await loadImage(fs.readFileSync(path.join(dir, key)));
const K = +zoom;
// crop: the head is in the top 30% of a standing pose, centred horizontally
const cw = Math.min(img.width, +(argW || 190)), ch = Math.min(img.height, Math.round(cw * 0.9));
const cx = Math.round(+(argCx || img.width / 2) - cw / 2), cy = Math.round(+(argCy || Math.min(img.height * 0.06, 40)));
const can = createCanvas(cw * K, ch * K), g = can.getContext('2d');
g.imageSmoothingEnabled = false;
g.fillStyle = '#fff'; g.fillRect(0, 0, can.width, can.height);
g.drawImage(img, cx, cy, cw, ch, 0, 0, cw * K, ch * K);
g.font = '13px monospace'; g.textBaseline = 'top';
for (let x = Math.ceil(cx / 10) * 10; x < cx + cw; x += 10) {
  const sx = (x - cx) * K;
  g.strokeStyle = x % 50 === 0 ? 'rgba(255,0,0,0.75)' : 'rgba(0,120,255,0.28)';
  g.lineWidth = x % 50 === 0 ? 1.6 : 1;
  g.beginPath(); g.moveTo(sx, 0); g.lineTo(sx, can.height); g.stroke();
  if (x % 20 === 0) { g.fillStyle = '#c00'; g.fillText(String(x), sx + 2, 2); }
}
for (let y = Math.ceil(cy / 10) * 10; y < cy + ch; y += 10) {
  const sy = (y - cy) * K;
  g.strokeStyle = y % 50 === 0 ? 'rgba(255,0,0,0.75)' : 'rgba(0,120,255,0.28)';
  g.lineWidth = y % 50 === 0 ? 1.6 : 1;
  g.beginPath(); g.moveTo(0, sy); g.lineTo(can.width, sy); g.stroke();
  if (y % 20 === 0) { g.fillStyle = '#c00'; g.fillText(String(y), 2, sy + 1); }
}
const out = path.join('out', `grid-${char}-${pose}-${key.replace('.png', '')}.png`);
fs.writeFileSync(out, can.toBuffer('image/png'));
console.log(`-> ${out}   crop ${cw}x${ch} at ${cx},${cy}  zoom ${K}   (labels are KEY pixels)`);

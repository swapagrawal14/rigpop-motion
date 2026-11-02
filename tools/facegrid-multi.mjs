// several keys in one grid sheet, so a batch of rects can be read off in a single look
import fs from 'node:fs';
import path from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
const [char, zoomArg, ...poses] = process.argv.slice(2);
const K = +(zoomArg || 6);
const cells = [];
for (const pose of poses) {
  const f = path.join('characters', char, 'poses', pose, 'key0.png');
  if (!fs.existsSync(f)) { console.log('missing', f); continue; }
  const img = await loadImage(fs.readFileSync(f));
  const cw = Math.min(img.width, 200), ch = Math.min(img.height, 190);
  const cx = Math.round(img.width / 2 - cw / 2), cy = Math.round(Math.min(img.height * 0.04, 40));
  const c = createCanvas(cw * K, ch * K + 18), g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  g.drawImage(img, cx, cy, cw, ch, 0, 0, cw * K, ch * K);
  g.font = '12px monospace'; g.textBaseline = 'top';
  for (let x = Math.ceil(cx / 10) * 10; x < cx + cw; x += 10) {
    const sx = (x - cx) * K;
    g.strokeStyle = x % 50 === 0 ? 'rgba(220,0,0,0.75)' : 'rgba(0,110,255,0.22)';
    g.lineWidth = x % 50 === 0 ? 1.4 : 1;
    g.beginPath(); g.moveTo(sx, 0); g.lineTo(sx, c.height); g.stroke();
    if (x % 20 === 0) { g.fillStyle = '#c00'; g.fillText(String(x), sx + 2, 2); }
  }
  for (let y = Math.ceil(cy / 10) * 10; y < cy + ch; y += 10) {
    const sy = (y - cy) * K;
    g.strokeStyle = y % 50 === 0 ? 'rgba(220,0,0,0.75)' : 'rgba(0,110,255,0.22)';
    g.lineWidth = y % 50 === 0 ? 1.4 : 1;
    g.beginPath(); g.moveTo(0, sy); g.lineTo(c.width, sy); g.stroke();
    if (y % 20 === 0) { g.fillStyle = '#c00'; g.fillText(String(y), 2, sy + 1); }
  }
  g.fillStyle = '#000'; g.fillText(pose, 4, c.height - 15);
  cells.push(c);
}
const W = cells.reduce((a, c) => a + c.width + 6, 0), H = Math.max(...cells.map((c) => c.height));
const can = createCanvas(W, H), g = can.getContext('2d');
g.fillStyle = '#333'; g.fillRect(0, 0, W, H);
let x = 0; for (const c of cells) { g.drawImage(c, x, 0); x += c.width + 6; }
const out = `out/grid-${char}-${poses.join('_')}.png`;
fs.writeFileSync(out, can.toBuffer('image/png'));
console.log('->', out);

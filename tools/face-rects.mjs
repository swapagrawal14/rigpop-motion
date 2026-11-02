// draws the rects that pack.json actually ended up with, on each key, at 5x — the check that closes the
// loop between a hand-written number and the pixel it lands on
import fs from 'node:fs';
import path from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
const [char, pose, out] = process.argv.slice(2);
const dir = path.join('characters', char, 'poses', pose);
const pack = JSON.parse(fs.readFileSync(path.join(dir, 'pack.json'), 'utf8'));
const S = 5;
const crops = [];
for (const K of pack.keys) {
  const img = await loadImage(path.join(dir, K.file));
  const m = K.face && K.face.mouth, b = K.face && K.face.blink;
  const boxes = [K.faceBox, m, b].filter(Boolean);
  const x0 = Math.max(0, Math.floor(Math.min(...boxes.map((r) => r.x)) - 25));
  const y0 = Math.max(0, Math.floor(Math.min(...boxes.map((r) => r.y)) - 25));
  const x1 = Math.min(img.width, Math.ceil(Math.max(...boxes.map((r) => r.x + r.w)) + 25));
  const y1 = Math.min(img.height, Math.ceil(Math.max(...boxes.map((r) => r.y + r.h)) + 25));
  const cw = x1 - x0, ch = y1 - y0;
  const c = createCanvas(cw * S, ch * S), g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  g.drawImage(img, -x0 * S, -y0 * S, img.width * S, img.height * S);
  const R = (r, col, w = 2) => { if (!r) return; g.strokeStyle = col; g.lineWidth = w;
    g.strokeRect((r.x - x0) * S, (r.y - y0) * S, r.w * S, r.h * S); };
  R(K.faceBox, '#00a000'); R(m, '#ff00ff', 3); R(b, '#00b8ff');
  g.fillStyle = '#000'; g.font = '16px monospace';
  g.fillText(`${pose}/${K.file}  mouth ${m ? `${m.x},${m.y},${m.w},${m.h}` : 'none'}`, 4, 16);
  crops.push(c);
}
const W = Math.max(...crops.map((c) => c.width)), H = crops.reduce((a, c) => a + c.height + 6, 0);
const can = createCanvas(W, H), g = can.getContext('2d');
g.fillStyle = '#222'; g.fillRect(0, 0, W, H);
let y = 0;
for (const c of crops) { g.drawImage(c, 0, y); y += c.height + 6; }
fs.writeFileSync(out, can.toBuffer('image/png'));
console.log('->', out, `${W}x${H}`);
